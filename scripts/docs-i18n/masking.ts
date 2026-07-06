#!/usr/bin/env node
const inlineCodeRe = /`[^`]+`/g;
const angleLinkRe = /<https?:\/\/[^>]+>/g;
const linkURLRe = /\[[^\]]*\]\(([^)]+)\)/g;

export function maskMarkdown(
	text: string,
	nextPlaceholder: () => string,
	placeholders: string[],
	mapping: Record<string, string>
): string {
	let masked = maskMatches(text, inlineCodeRe, nextPlaceholder, placeholders, mapping);
	masked = maskMatches(masked, angleLinkRe, nextPlaceholder, placeholders, mapping);
	masked = maskLinkURLs(masked, nextPlaceholder, placeholders, mapping);
	return masked;
}

function maskMatches(
	text: string,
	re: RegExp,
	nextPlaceholder: () => string,
	placeholders: string[],
	mapping: Record<string, string>
): string {
	const matches = [...text.matchAll(re)];
	if (matches.length === 0) return text;

	let result = '';
	let pos = 0;

	for (const match of matches) {
		const fullMatch = match[0];
		const start = match.index!;
		const end = start + fullMatch.length;

		result += text.slice(pos, start);

		const placeholder = nextPlaceholder();
		mapping[placeholder] = fullMatch;
		placeholders.push(placeholder);
		result += placeholder;

		pos = end;
	}

	result += text.slice(pos);
	return result;
}

function maskLinkURLs(
	text: string,
	nextPlaceholder: () => string,
	placeholders: string[],
	mapping: Record<string, string>
): string {
	const matches = [...text.matchAll(linkURLRe)];
	if (matches.length === 0) return text;

	let result = '';
	let pos = 0;

	for (const match of matches) {
		const fullMatch = match[0];
		const url = match[1];
		const start = match.index!;
		const urlStart = start + fullMatch.indexOf(url);
		const urlEnd = urlStart + url.length;

		result += text.slice(pos, urlStart);

		const placeholder = nextPlaceholder();
		mapping[placeholder] = url;
		placeholders.push(placeholder);
		result += placeholder;

		pos = urlEnd;
	}

	result += text.slice(pos);
	return result;
}

export function unmaskMarkdown(
	text: string,
	placeholders: string[],
	mapping: Record<string, string>
): string {
	let result = text;
	for (const placeholder of placeholders) {
		const original = mapping[placeholder] || '';
		result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
	}
	return result;
}

export function validatePlaceholders(text: string, placeholders: string[]): void {
	for (const placeholder of placeholders) {
		if (!text.includes(placeholder)) {
			throw new Error(`placeholder missing: ${placeholder}`);
		}
	}
}