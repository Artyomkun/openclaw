#!/usr/bin/env node
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative} from 'path';
import yaml from 'yaml';

interface DocsRedirect {
	source: string;
	destination: string;
}

interface DocsConfig {
	redirects: DocsRedirect[];
}

const LOCALE_DIR_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const FENCED_BACKTICK_RE = /(^|\n)[ \t]*```[^\n]*\n.*?\n[ \t]*```[ \t]*(?:\n|$)/gs;
const FENCED_TILDE_RE = /(^|\n)[ \t]*~~~[^\n]*\n.*?\n[ \t]*~~~[ \t]*(?:\n|$)/gs;
const INLINE_CODE_RE = /`[^`]*`/g;
const MARKDOWN_LINK_RE = /!?\[[^\]]*\]\(([^)]+)\)/g;
const HREF_DOUBLE_RE = /\bhref\s*=\s*"([^"]*)"/g;
const HREF_SINGLE_RE = /\bhref\s*=\s*'([^']*)'/g;

function normalizeRoute(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return '';
	const stripped = trimmed.replace(/^\/+|\/+$/g, '');
	return stripped ? '/' + stripped : '/';
}

function normalizeSlashes(path: string): string {
    return path.replace(/\\/g, '/');
}

function firstPathSegment(relPath: string): string {
	const parts = relPath.split('/');
	return parts[0] || '';
}

function isMarkdownFile(path: string): boolean {
    return path.endsWith('.md') || path.endsWith('.mdx');
}

function addRoute(routes: Set<string>, route: string): void {
    if (route) routes.add(route);
}

function addRouteCandidates(routes: Set<string>, relPath: string, permalinks: string[]): void {
	const base = relPath.replace(/\.mdx?$/, '');
	if (base !== relPath) {
		addRoute(routes, normalizeRoute(base));
		if (base === 'index') {
			addRoute(routes, '/');
		} else if (base.endsWith('/index')) {
			addRoute(routes, normalizeRoute(base.replace(/\/index$/, '')));
		}
	}
	for (const permalink of permalinks) {
		addRoute(routes, normalizeRoute(permalink));
	}
}

function hasURLScheme(raw: string): boolean {
	const schemes = ['http://', 'https://', 'mailto:', 'tel:', 'data:', 'javascript:', 'vbscript:'];
	const lower = raw.toLowerCase();
	for (const scheme of schemes) {
		if (lower.startsWith(scheme)) return true;
	}
	return false;
}

function splitURLSuffix(raw: string): { path: string; suffix: string } {
	const index = raw.search(/[?#]/);
	if (index === -1) return { path: raw, suffix: '' };
	return { path: raw.slice(0, index), suffix: raw.slice(index) };
}

function splitFrontMatter(content: string): { front: string; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) return { front: '', body: content };
	return { front: match[1], body: content.slice(match[0].length) };
}

export class RouteIndex implements RouteIndex {
	targetLang: string;
	redirects: Map<string, string>;
	sourceRoutes: Set<string>;
	localizedRoutes: Set<string>;
	localePrefixes: Set<string>;

	constructor(targetLang: string) {
		this.targetLang = targetLang.trim();
		this.redirects = new Map();
		this.sourceRoutes = new Set();
		this.localizedRoutes = new Set();
		this.localePrefixes = new Set();
	}

	async load(docsRoot: string): Promise<void> {
		await this.loadRedirects(join(docsRoot, 'docs.json'));
		await this.loadRoutes(docsRoot);
	}

	private async loadRedirects(configPath: string): Promise<void> {
		if (!existsSync(configPath)) return;
		const data = await readFile(configPath, 'utf-8');
		const config = JSON.parse(data) as DocsConfig;
		for (const item of config.redirects || []) {
			const source = normalizeRoute(item.source);
			const destination = normalizeRoute(item.destination);
			if (source && destination) {
				this.redirects.set(source, destination);
			}
		}
	}

	private async loadRoutes(docsRoot: string): Promise<void> {
		const entries = await readdir(docsRoot, { withFileTypes: true });
		const locales = new Set<string>();
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const name = entry.name;
			if (!LOCALE_DIR_RE.test(name)) continue;
			const readmePath = join(docsRoot, name, '.i18n', 'README.md');
			if (existsSync(readmePath)) {
				locales.add(name);
			}
		}
		if (this.targetLang) locales.add(this.targetLang);
		this.localePrefixes = locales;
		await this.walkDir(docsRoot, docsRoot);
	}

	private async walkDir(docsRoot: string, currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await this.walkDir(docsRoot, fullPath);
				continue;
			}
			if (!isMarkdownFile(entry.name)) continue;

			const relPath = normalizeSlashes(relative(docsRoot, fullPath));
			const firstSegment = firstPathSegment(relPath);

			const content = await readFile(fullPath, 'utf-8');
			const { front } = splitFrontMatter(content);
			let permalinks: string[] = [];
			if (front.trim()) {
				try {
					const data = yaml.parse(front);
					if (data?.permalink) {
						permalinks = [String(data.permalink).trim()];
					}
				} catch (_) {}
			}

			const trimmedRel = relPath.replace(/^[^/]+\//, '');
			if (firstSegment === this.targetLang) {
				addRouteCandidates(this.localizedRoutes, trimmedRel, permalinks);
			} else if (this.localePrefixes.has(firstSegment)) {
				continue;
			} else {
				addRouteCandidates(this.sourceRoutes, relPath, permalinks);
			}
		}
	}

	isLocalePrefix(segment: string): boolean {
		return this.localePrefixes.has(segment);
	}

	routeHasLocalePrefix(route: string): boolean {
		if (route === '/') return false;
		const first = route.replace(/^\//, '').split('/')[0] || '';
		return this.isLocalePrefix(first);
	}

	resolveRoute(route: string): { resolved: string; ok: boolean } {
		let current = normalizeRoute(route);
		if (!current) return { resolved: '', ok: false };

		const seen = new Set<string>();
		while (true) {
			const next = this.redirects.get(current);
			if (!next) break;
			if (seen.has(current)) return { resolved: '', ok: false };
			seen.add(current);
			current = next;
		}

		if (this.localizedRoutes.has(current)) {
			return { resolved: current, ok: true };
		}
		if (this.sourceRoutes.has(current)) {
			return { resolved: current, ok: true };
		}
		return { resolved: '', ok: false };
	}

	localizeURL(raw: string): string {
		const trimmed = raw.trim();
		if (!trimmed) return raw;
		if (trimmed.startsWith('#') || trimmed.startsWith('//')) return raw;
		if (hasURLScheme(trimmed)) return raw;

		const { path: pathPart, suffix } = splitURLSuffix(trimmed);
		if (!pathPart.startsWith('/')) return raw;

		const normalized = normalizeRoute(pathPart);
		if (this.routeHasLocalePrefix(normalized)) return raw;

		const { resolved, ok } = this.resolveRoute(normalized);
		if (!ok) return raw;
		if (!this.localizedRoutes.has(resolved)) return raw;

		return this.prefixLocaleRoute(resolved) + suffix;
	}

	prefixLocaleRoute(route: string): string {
		if (route === '/') return '/' + this.targetLang;
		return '/' + this.targetLang + route;
	}

	localizeBodyLinks(body: string): string {
		if (!this.targetLang || this.targetLang.toLowerCase() === 'en') {
			return body;
		}
		const state = { counter: 0 };
		const placeholders: string[] = [];
		const mapping: Record<string, string> = {};

		const next = () => {
		const id = `___LOCALIZE_PLACEHOLDER_${state.counter++}___`;
		placeholders.push(id);
		return id;
		};

		let masked = body;
		masked = maskMatches(masked, FENCED_BACKTICK_RE, next, mapping);
		masked = maskMatches(masked, FENCED_TILDE_RE, next, mapping);
		masked = maskMatches(masked, INLINE_CODE_RE, next, mapping);
		masked = this.rewriteMarkdownLinks(masked);
		masked = this.rewriteHrefs(masked);
		return unmaskMarkdown(masked, placeholders, mapping);
	}

	private rewriteMarkdownLinks(text: string): string {
		const matches = [...text.matchAll(MARKDOWN_LINK_RE)];
		if (!matches.length) return text;

		let result = '';
		let pos = 0;
		for (const match of matches) {
			const fullMatch = match[0];
			const target = match[1];
			const start = match.index!;
			const end = start + fullMatch.length;

			result += text.slice(pos, start);
			if (fullMatch.startsWith('!')) {
				result += target;
			} else {
				result += this.localizeURL(target);
			}
			pos = end;
		}
		result += text.slice(pos);
		return result;
	}

	private rewriteHrefs(text: string): string {
		let result = text;
		result = this.rewriteCapturedTargets(result, HREF_DOUBLE_RE);
		result = this.rewriteCapturedTargets(result, HREF_SINGLE_RE);
		return result;
	}

	private rewriteCapturedTargets(text: string, re: RegExp): string {
		const matches = [...text.matchAll(re)];
		if (!matches.length) return text;

		let result = '';
		let pos = 0;
		for (const match of matches) {
		const fullMatch = match[0];
		const target = match[1];
		const start = match.index!;
		const end = start + fullMatch.length;

		result += text.slice(pos, start);
		result += this.localizeURL(target);
		pos = end;
		}
		result += text.slice(pos);
		return result;
	}
}

function maskMatches(
	text: string,
	re: RegExp,
	next: () => string,
	mapping: Record<string, string>
): string {
	const matches = [...text.matchAll(re)];
	if (!matches.length) return text;

	let result = '';
	let pos = 0;
	const regex = new RegExp(re.source, re.flags);
	let match;
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

function unmaskMarkdown(
	text: string,
	placeholders: string[],
	mapping: Record<string, string>
): string {
	let result = text;
	for (const placeholder of placeholders) {
		result = result.replace(placeholder, mapping[placeholder] || '');
	}
	return result;
}