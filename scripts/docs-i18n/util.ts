#!/usr/bin/env node
import { createHash } from 'crypto';
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  unlink,
  access
} from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';

const WORKFLOW_VERSION = 16;
const DOCS_I18N_ENGINE_NAME = 'codex';
const ENV_DOCS_I18N_PROVIDER = 'OPENCLAW_DOCS_I18N_PROVIDER';
const ENV_DOCS_I18N_MODEL = 'OPENCLAW_DOCS_I18N_MODEL';
const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const DEFAULT_FALLBACK_PROVIDER = 'openai';
const DEFAULT_FALLBACK_MODEL_NAME = DEFAULT_OPENAI_MODEL;

// Regex to detect "junk" from AI agents in translations
// WARNING: this regex contains spam words in Chinese.
// We can keep it when rewriting in TS, but it would be better to replace it
// with an allowlist approach or smarter validation.
const TRANSLATION_TRANSCRIPT_ARTIFACT_RE = new RegExp(
  `(?i)(?:\\b(?:analysis|commentary|final|assistant|user)\\s+to\\s*=\\s*(?:functions\\.[a-z0-9_-]+|[a-z_]+)|` +
  `\\bto\\s*=\\s*(?:functions\\.[a-z0-9_-]+|analysis|commentary|final)\\b|` +
  `\\bfunctions\\.[a-z0-9_-]+\\b|` +
  `/home/runner/work/|\\.agents/skills/|` +
  `\\bforce_parallel\\s*:|\\bcode\\s+omitted\\b|\\bomitted\\s+reasoning\\b|` +
  `全民彩票|娱乐平台开户|娱乐平台|皇平台|彩票平台|一本道|毛片|高清视频免费|不卡免费播放`
);

export function docsI18nProvider(): string {
	const value = process.env[ENV_DOCS_I18N_PROVIDER]?.trim() || '';
	if (value.toLowerCase() === 'openai') {
		return value;
	}
	return DEFAULT_FALLBACK_PROVIDER;
}

export function docsI18nModel(): string {
	const value = process.env[ENV_DOCS_I18N_MODEL]?.trim() || '';
	if (value) {
		return value;
	}
	return DEFAULT_FALLBACK_MODEL_NAME;
}

export function cacheNamespace(): string {
	return `wf=${WORKFLOW_VERSION}|engine=${DOCS_I18N_ENGINE_NAME}|provider=${docsI18nProvider()}|model=${docsI18nModel()}`;
}

export function cacheKey(
	namespace: string,
	srcLang: string,
	tgtLang: string,
	segmentId: string,
	textHash: string
): string {
	const raw = `${namespace}|${srcLang}|${tgtLang}|${segmentId}|${textHash}`;
	return createHash('sha256').update(raw).digest('hex');
}

export function normalizeText(text: string): string {
	return text.trim().replace(/\s+/g, ' ');
}

export function hashText(text: string): string {
	const normalized = normalizeText(text);
	return createHash('sha256').update(normalized).digest('hex');
}

export function hashBytes(data: Buffer): string {
	return createHash('sha256').update(data).digest('hex');
}

export function segmentId(relPath: string, textHash: string): string {
	const shortHash = textHash.length > 16 ? textHash.slice(0, 16) : textHash;
	return `${relPath}:${shortHash}`;
}

export function splitWhitespace(text: string): { prefix: string; body: string; suffix: string } {
	if (!text) {
		return { prefix: '', body: '', suffix: '' };
	}

	let start = 0;
	while (start < text.length && /\s/.test(text[start])) {
		start++;
	}

	let end = text.length;
	while (end > start && /\s/.test(text[end - 1])) {
		end--;
	}

	return {
		prefix: text.slice(0, start),
		body: text.slice(start, end),
		suffix: text.slice(end),
	};
}

export function splitFrontMatter(content: string): { front: string; body: string } {
	if (!content.startsWith('---')) {
		return { front: '', body: content };
	}

	const lines = content.split('\n');
	if (lines.length < 2) {
		return { front: '', body: content };
	}

	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			endIndex = i;
			break;
		}
	}

	if (endIndex === -1) {
		return { front: '', body: content };
	}

	const front = lines.slice(1, endIndex).join('\n');
	let body = lines.slice(endIndex + 1).join('\n');
	if (body.startsWith('\n')) {
		body = body.slice(1);
	}

	return { front, body };
}

export function isWhitespace(char: string): boolean {
	return /[\s]/.test(char);
}

export function validateNoTranslationTranscriptArtifacts(source: string, translated: string): void {
	const sourceLower = source.toLowerCase();

	const tokens = ['<openclaw_docs_i18n_input>', '</openclaw_docs_i18n_input>'];
	for (const token of tokens) {
		if (translated.toLowerCase().includes(token) && !sourceLower.includes(token)) {
		throw new Error(`Agent transcript artifact leaked into translation: "${token}"`);
		}
	}

	const matches = translated.match(TRANSLATION_TRANSCRIPT_ARTIFACT_RE);
	if (matches) {
		for (const match of matches) {
			const trimmed = match.trim();
			if (!trimmed) continue;
			if (sourceLower.includes(trimmed.toLowerCase())) continue;
			throw new Error(`Agent transcript artifact leaked into translation: "${trimmed}"`);
		}
	}
}

export function fatal(error: Error | null): void {
	if (!error) return;
	console.error(error.message);
	process.exit(1);
}

export interface CacheEntry {
	hash: string;
	translation: string;
	timestamp: number;
}

export class TranslationCache {
	private cacheDir: string;
	private namespace: string;

	constructor(cacheDir: string) {
		this.cacheDir = cacheDir;
		this.namespace = cacheNamespace();
	}

	private async ensureDir(): Promise<void> {
		try {
			await access(this.cacheDir, constants.W_OK);
		} catch {
			await mkdir(this.cacheDir, { recursive: true });
		}
	}

	private getCachePath(key: string): string {
		return join(this.cacheDir, `${key}.json`);
	}

	async get(srcLang: string, tgtLang: string, segmentId: string, textHash: string): Promise<CacheEntry | null> {
		const key = cacheKey(this.namespace, srcLang, tgtLang, segmentId, textHash);
		const path = this.getCachePath(key);

		try {
			await access(path, constants.R_OK);
			const data = await readFile(path, 'utf-8');
			return JSON.parse(data) as CacheEntry;
		} catch {
			return null;
		}
	}

	async set(
		srcLang: string,
		tgtLang: string,
		segmentId: string,
		textHash: string,
		translation: string
	): Promise<void> {
		await this.ensureDir();

		const key = cacheKey(this.namespace, srcLang, tgtLang, segmentId, textHash);
		const path = this.getCachePath(key);

		const entry: CacheEntry = {
			hash: textHash,
			translation,
			timestamp: Date.now(),
		};

		await writeFile(path, JSON.stringify(entry, null, 2));
	}

	async clear(options?: { olderThan?: number; keepCount?: number; dryRun?: boolean }): Promise<number> {
		try {
			await access(this.cacheDir, constants.R_OK);
		} catch {
			return 0;
		}

		const files = await readdir(this.cacheDir);
		const cacheFiles = files.filter(f => f.endsWith('.json'));

		if (cacheFiles.length === 0) {
			return 0;
		}

		const fileStats = await Promise.all(
			cacheFiles.map(async (file) => {
				const path = join(this.cacheDir, file);
				const stats = await stat(path);
				return { file, path, mtime: stats.mtimeMs };
			})
		);

		fileStats.sort((a, b) => b.mtime - a.mtime);
		let toDelete: string[] = [];

		if (options?.olderThan && options.olderThan > 0) {
			const cutoff = Date.now() - options.olderThan;
			const oldFiles = fileStats.filter(f => f.mtime < cutoff);
			toDelete.push(...oldFiles.map(f => f.path));
		}

		if (options?.keepCount && options.keepCount > 0 && options.keepCount < fileStats.length) {
			const toDeleteFromKeep = fileStats.slice(options.keepCount);
			for (const f of toDeleteFromKeep) {
				if (!toDelete.includes(f.path)) {
				toDelete.push(f.path);
				}
			}
		}

		if (!options?.olderThan && !options?.keepCount) {
			toDelete = fileStats.map(f => f.path);
		}

		if (options?.dryRun) {
			console.log(`[Cache] Would delete ${toDelete.length} files:`);
			for (const path of toDelete.slice(0, 10)) {
				console.log(`  - ${path}`);
			}
			if (toDelete.length > 10) {
				console.log(`  ... and ${toDelete.length - 10} more`);
			}
			return toDelete.length;
		}

		let deletedCount = 0;
		for (const path of toDelete) {
			try {
				await unlink(path);
				deletedCount++;
			} catch (err) {
				console.warn(`[Cache] Failed to delete ${path}:`, err);
			}
		}

		console.log(`[Cache] Deleted ${deletedCount} cache files`);
		return deletedCount;
	}

	async stats(): Promise<{ total: number; size: number; oldest: Date | null; newest: Date | null }> {
		try {
			await access(this.cacheDir, constants.R_OK);
		} catch {
			return { total: 0, size: 0, oldest: null, newest: null };
		}

		const files = await readdir(this.cacheDir);
		const cacheFiles = files.filter(f => f.endsWith('.json'));

		if (cacheFiles.length === 0) {
			return { total: 0, size: 0, oldest: null, newest: null };
		}

		let totalSize = 0;
		let oldest = Infinity;
		let newest = 0;

		for (const file of cacheFiles) {
			const path = join(this.cacheDir, file);
			const stats = await stat(path);
			totalSize += stats.size;
			if (stats.mtimeMs < oldest) oldest = stats.mtimeMs;
			if (stats.mtimeMs > newest) newest = stats.mtimeMs;
		}

		return {
			total: cacheFiles.length,
			size: totalSize,
			oldest: oldest !== Infinity ? new Date(oldest) : null,
			newest: newest !== 0 ? new Date(newest) : null,
		};
	}
}