import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import {
	splitWhitespace,
	docsI18nModel,
} from "./util.ts";

const execAsync = promisify(exec);
const TRANSLATE_MAX_ATTEMPTS = 3;
const TRANSLATE_BASE_DELAY = 15_000;
const DEFAULT_PROMPT_TIMEOUT = 2 * 60_000;
const ENV_DOCS_I18N_PROMPT_TIMEOUT = 'OPENCLAW_DOCS_I18N_PROMPT_TIMEOUT';
const ENV_DOCS_I18N_CODEX_EXECUTABLE = 'OPENCLAW_DOCS_I18N_CODEX_EXECUTABLE';

export interface GlossaryEntry {
	source: string;
	target: string;
}

export interface CodexPromptRequest {
	systemPrompt: string;
	message: string;
	model: string;
	thinking: string;
}

export type CodexPromptRunner = (ctx: AbortController, req: CodexPromptRequest) => Promise<string>;

export interface DocsTranslator {
	translate(text: string, ctx?: AbortController): Promise<string>;
	translateRaw(text: string, ctx?: AbortController): Promise<string>;
}

export type DocsTranslatorFactory = (
	srcLang: string,
	tgtLang: string,
	glossary: GlossaryEntry[],
	thinking: string
) => Promise<DocsTranslator>;

class EmptyTranslationError extends Error {
	constructor() {
		super('empty translation');
		this.name = 'EmptyTranslationError';
	}
}

class PlaceholderMissingError extends Error {
	constructor(placeholder: string) {
		super(`placeholder missing: ${placeholder}`);
		this.name = 'PlaceholderMissingError';
	}
}

export function docsI18nPromptTimeout(): number {
	const value = process.env[ENV_DOCS_I18N_PROMPT_TIMEOUT]?.trim();
	if (!value) return DEFAULT_PROMPT_TIMEOUT;
	const parsed = parseInt(value, 10);
	return parsed > 0 ? parsed : DEFAULT_PROMPT_TIMEOUT;
}

export function docsI18nCommandWaitDelay(): number {
	const value = process.env.OPENCLAW_DOCS_I18N_COMMAND_WAIT_DELAY?.trim();
	if (!value) return 15000;
	const parsed = parseInt(value, 10);
	return parsed > 0 ? parsed : 15000;
}

function docsCodexExecutable(): string {
	return process.env[ENV_DOCS_I18N_CODEX_EXECUTABLE]?.trim() || 'codex';
}

function normalizeThinking(value: string): string {
	const normalized = value.toLowerCase().trim();
	if (['low', 'medium', 'high', 'xhigh'].includes(normalized)) {
		return normalized;
	}
	return 'high';
}

function translateRetryDelay(attempt: number): number {
	return TRANSLATE_BASE_DELAY * attempt;
}

function exactGlossaryMappings(glossary: GlossaryEntry[]): Map<string, string> {
	const mappings = new Map<string, string>();
	for (const entry of glossary) {
		const source = entry.source.trim();
		const target = entry.target.trim();
		if (source && target) {
			mappings.set(source, target);
		}
	}
	return mappings;
}

export function isRetryableTranslateError(err: Error): boolean {
	if (!err) return false;
	const message = err.message.toLowerCase();
	
	if (err.name === 'AbortError' || message.includes('abort')) {
		return false;
	}
	
	if (
		message.includes('authentication failed') ||
		message.includes('invalid_api_key') ||
		message.includes('api key')
	) {
		return false;
	}
	
	if (err instanceof EmptyTranslationError || err instanceof PlaceholderMissingError) {
		return true;
	}
	
	return (
		message.includes('rate limit') ||
		message.includes('429') ||
		message.includes('500') ||
		message.includes('502') ||
		message.includes('503') ||
		message.includes('504') ||
		message.includes('temporarily unavailable') ||
		message.includes('connection reset') ||
		message.includes('stream') ||
		message.includes('timeout')
	);
}

function stripCodexI18nInputWrappers(text: string): string {
	return text
		.replace(/<openclaw_docs_i18n_input>/g, '')
		.replace(/<\/openclaw_docs_i18n_input>/g, '')
		.trim();
}

export function buildCodexTranslationPrompt(systemPrompt: string, message: string): string {
	return (
		systemPrompt.trim() +
		'\n\n' +
		'Translate the exact input below. Return only the translated text, with no code fences, no tool calls, no reasoning, and no commentary.\n\n' +
		'<openclaw_docs_i18n_input>\n' +
		message +
		'\n</openclaw_docs_i18n_input>\n'
	);
}

function previewCommandOutput(stdout: string, stderr: string): string {
	let combined = [stdout, stderr].filter(Boolean).join('\n').trim();
	if (!combined) return 'no output';
	combined = combined.replace(/\s+/g, ' ');

	const limit = 1200;
	const headLength = 300;
	const tailLength = 800;

	if (combined.length <= limit) return combined;
	return combined.slice(0, headLength) + ' ... [truncated] ... ' + combined.slice(-tailLength);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PlaceholderState {
	counter: number;
}

const FENCED_BACKTICK_RE = /(^|\n)[ \t]*```[^\n]*\n.*?\n[ \t]*```[ \t]*(?:\n|$)/gs;
const FENCED_TILDE_RE = /(^|\n)[ \t]*~~~[^\n]*\n.*?\n[ \t]*~~~[ \t]*(?:\n|$)/gs;
const INLINE_CODE_RE = /`[^`]*`/g;

function maskMatches(
	text: string,
	re: RegExp,
	next: () => string,
	mapping: Record<string, string>
): string {
	const matches = [...text.matchAll(re)];
	if (matches.length === 0) return text;

	let result = '';
	let pos = 0;
	const regex = new RegExp(re.source, re.flags);
	let match: RegExpExecArray | null;
	
	while ((match = regex.exec(text)) !== null) {
		const fullMatch = match[0];
		const start = match.index;
		const end = start + fullMatch.length;
		result += text.slice(pos, start);
		const placeholder = next();
		mapping[placeholder] = fullMatch;
		result += placeholder;
		pos = end;
	}
	result += text.slice(pos);
	return result;
}

function maskMarkdown(
	text: string,
	next: () => string,
	mapping: Record<string, string>
): string {
	let masked = text;
	masked = maskMatches(masked, FENCED_BACKTICK_RE, next, mapping);
	masked = maskMatches(masked, FENCED_TILDE_RE, next, mapping);
	masked = maskMatches(masked, INLINE_CODE_RE, next, mapping);
	return masked;
}

function unmaskMarkdown(text: string, mapping: Record<string, string>): string {
	let result = text;
	for (const [placeholder, original] of Object.entries(mapping)) {
		result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
	}
	return result;
}

function validatePlaceholders(translated: string, placeholders: string[]): void {
	for (const placeholder of placeholders) {
		if (!translated.includes(placeholder)) {
			throw new PlaceholderMissingError(placeholder);
		}
	}
}

async function isolatedCodexHomeBase(): Promise<string> {
	const cacheDir = process.env.XDG_CACHE_HOME || join(os.homedir(), '.cache');
	const base = join(cacheDir, 'openclaw-docs-i18n');
	await mkdir(base, { recursive: true });
	return base;
}

async function writeCodexAuthFile(codexHome: string): Promise<void> {
	const apiKey = process.env.OPENAI_API_KEY?.trim();
	if (!apiKey) return;

	const data = {
		auth_mode: 'apikey',
		OPENAI_API_KEY: apiKey,
	};

	const authPath = join(codexHome, 'auth.json');
	await writeFile(authPath, JSON.stringify(data) + '\n', { mode: 0o600 });
}

async function readCodexOutputLastMessage(outputPath: string): Promise<string> {
	try {
		const data = await readFile(outputPath, 'utf-8');
		const translated = data.trim();
		if (!translated) {
			throw new EmptyTranslationError();
		}
		return translated;
	} catch (err) {
		if (err instanceof EmptyTranslationError) throw err;
		throw new Error(`Failed to read codex output: ${err}`);
	}
}

async function runCodexExecPrompt(ctx: AbortController, req: CodexPromptRequest): Promise<string> {
	const tmpDir = os.tmpdir();
	const outputPath = join(tmpDir, `openclaw-docs-i18n-codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);

	try {
		const codexHomeBase = await isolatedCodexHomeBase();
		const codexHome = join(codexHomeBase, `codex-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
		await mkdir(codexHome, { recursive: true });
		await writeCodexAuthFile(codexHome);

		const args = [
			'exec',
			'--model', req.model,
			'-c', `model_reasoning_effort="${normalizeThinking(req.thinking)}"`,
			'-c', `service_tier="fast"`,
			'--sandbox', 'read-only',
			'--ignore-rules',
			'--skip-git-repo-check',
			'--output-last-message', outputPath,
			'-',
		];

		const command = docsCodexExecutable();
		const prompt = buildCodexTranslationPrompt(req.systemPrompt, req.message);

		try {
			const { stdout, stderr } = await execAsync(
				`"${command}" ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`,
				{
				env: { ...process.env, CODEX_HOME: codexHome },
				timeout: docsI18nPromptTimeout(),
				signal: ctx.signal,
				maxBuffer: 10 * 1024 * 1024,
				}
			);

			const translated = await readCodexOutputLastMessage(outputPath);
			if (translated) return translated;

			throw new Error(`Codex exec failed: ${previewCommandOutput(stdout, stderr)}`);
		} catch (err: any) {
			try {
				const translated = await readCodexOutputLastMessage(outputPath);
				if (translated) return translated;
				} catch (err: any) {
					try {
						const translated = await readCodexOutputLastMessage(outputPath);
						if (translated) return translated;
					} catch (readErr) {
						console.warn('[Codex] Failed to read output file after exec error:', readErr);
					}

					if (err instanceof Error) {
						throw err;
					}
					throw new Error(`Codex exec failed: ${String(err)}`);
				}

			if (err instanceof Error) {
				throw err;
			}
			throw new Error(`Codex exec failed: ${String(err)}`);
		}
	} finally {
		try {
			await unlink(outputPath).catch(() => {});
		} catch {
			
		}
	}
}

function translationPrompt(srcLang: string, tgtLang: string, glossary: GlossaryEntry[]): string {
	let prompt = `You are a translator from ${srcLang} to ${tgtLang}.`;

	if (glossary.length > 0) {
		prompt += '\n\nUse these exact translations for specific terms:';
		for (const entry of glossary) {
		prompt += `\n- "${entry.source}" → "${entry.target}"`;
		}
	}

	prompt += `
	
		Rules:
		1. Translate only the provided text.
		2. Preserve all formatting, links, and code blocks.
		3. Do not add any extra text, commentary, or reasoning.
		4. If a term is in the glossary, use the exact translation provided.
		5. Return only the translated text, with no wrappers or explanations.`;

	return prompt;
}

export class CodexTranslator implements DocsTranslator {
	private systemPrompt: string;
	private exactGlossaryMappings: Map<string, string>;
	private thinking: string;
	private runPrompt: CodexPromptRunner;

	constructor(
		srcLang: string,
		tgtLang: string,
		glossary: GlossaryEntry[],
		thinking: string,
		runPrompt?: CodexPromptRunner
	) {
		this.systemPrompt = translationPrompt(srcLang, tgtLang, glossary);
		this.exactGlossaryMappings = exactGlossaryMappings(glossary);
		this.thinking = normalizeThinking(thinking);
		this.runPrompt = runPrompt || runCodexExecPrompt;
	}

	async translate(text: string, ctx?: AbortController): Promise<string> {
		const controller = ctx || new AbortController();
		return this._translate(controller, text, this.translateMasked.bind(this));
	}

	async translateRaw(text: string, ctx?: AbortController): Promise<string> {
		const controller = ctx || new AbortController();
		return this._translate(controller, text, this.translateRawInternal.bind(this));
	}

	private async _translate(
		ctx: AbortController,
		text: string,
		run: (ctx: AbortController, core: string) => Promise<string>
	): Promise<string> {
		const { prefix, body: core, suffix } = splitWhitespace(text);
		if (!core) return text;
		
		if (this.exactGlossaryMappings.has(core)) {
			return prefix + this.exactGlossaryMappings.get(core)! + suffix;
		}

		const translated = await this.translateWithRetry(ctx, (ctx: AbortController) => run(ctx, core));
		return prefix + translated + suffix;
	}

	private async translateWithRetry(
		ctx: AbortController,
		run: (ctx: AbortController) => Promise<string>
	): Promise<string> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < TRANSLATE_MAX_ATTEMPTS; attempt++) {
			try {
				return await run(ctx);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				
				if (!isRetryableTranslateError(error)) {
					throw error;
				}
				
				lastError = error;

				if (attempt + 1 < TRANSLATE_MAX_ATTEMPTS) {
					const delay = translateRetryDelay(attempt + 1);
					await sleep(delay);
				}
			}
		}

		throw lastError || new Error('Max retries exceeded');
	}

	private async translateMasked(ctx: AbortController, core: string): Promise<string> {
		const state: PlaceholderState = { counter: 0 };
		const placeholders: string[] = [];
		const mapping: Record<string, string> = {};

		const next = (): string => {
			const id = `___LOCALIZE_PLACEHOLDER_${state.counter++}___`;
			placeholders.push(id);
			return id;
		};

		const masked = maskMarkdown(core, next, mapping);
		const result = await this.prompt(ctx, masked);
		const translated = stripCodexI18nInputWrappers(result.trim());

		if (!translated) {
			throw new EmptyTranslationError();
		}

		validatePlaceholders(translated, placeholders);
		return unmaskMarkdown(translated, mapping);
	}

	private async translateRawInternal(ctx: AbortController, core: string): Promise<string> {
		const result = await this.prompt(ctx, core);
		const translated = stripCodexI18nInputWrappers(result.trim());

		if (!translated) {
			throw new EmptyTranslationError();
		}

		return translated;
	}

	private async prompt(ctx: AbortController, message: string): Promise<string> {
		if (!this.runPrompt) {
			throw new Error('codex prompt runner unavailable');
		}

		const timeout = docsI18nPromptTimeout();
		const combinedController = new AbortController();

		const timer = setTimeout(() => {
		combinedController.abort();
		}, timeout);

		try {
			return await this.runPrompt(combinedController, {
				systemPrompt: this.systemPrompt,
				message,
				model: docsI18nModel(),
				thinking: this.thinking,
			});
		} finally {
			clearTimeout(timer);
		}
	}
}

export async function newCodexTranslator(
	srcLang: string,
	tgtLang: string,
	glossary: GlossaryEntry[],
	thinking: string
): Promise<CodexTranslator> {
	return new CodexTranslator(srcLang, tgtLang, glossary, thinking);
}