#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';
import { RouteIndex } from './route-index';
import { splitFrontMatter } from './util.ts';

const LOCALIZED_LINK_POSTPROCESS_VERSION = 'v1';

export async function postprocessLocalizedDocs(
	docsRoot: string,
	targetLang: string,
	localizedFiles: string[]
): Promise<void> {
	if (!targetLang || targetLang === 'en' || localizedFiles.length === 0) {
		return;
	}
	const routes = new RouteIndex(targetLang);
	await routes.load(docsRoot);

	for (const filePath of localizedFiles) {
		try {
			const content = await readFile(filePath, 'utf-8');
			const { front, body } = splitFrontMatter(content);
			const rewrittenBody = routes.localizeBodyLinks(body);
			const updatedFrontMatter = setPostprocessVersion(
				front,
				LOCALIZED_LINK_POSTPROCESS_VERSION
			);
			if (rewrittenBody === body && updatedFrontMatter === front) {
				continue;
			}
			let output: string;
			if (updatedFrontMatter && updatedFrontMatter.trim()) {
				output = '---\n' + updatedFrontMatter + '\n---\n\n' + rewrittenBody;
			} else {
				output = rewrittenBody;
			}

			await writeFile(filePath, output, 'utf-8');
		} catch (err) {
			throw new Error(`Failed to postprocess ${filePath}: ${err}`);
		}
	}
}

export function setPostprocessVersion(
	frontMatter: string,
	version: string
): string {
	const trimmed = frontMatter.trim();
	if (!trimmed) return frontMatter;

	const lines = frontMatter.split('\n');
	let inXI18N = false;
	let xi18nLine = -1;
	let insertAt = lines.length;
	let childIndent = '  ';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();

		if (trimmedLine === 'x-i18n:') {
		inXI18N = true;
		xi18nLine = i;
		insertAt = lines.length;
		continue;
		}

		if (!inXI18N) continue;
		if (!trimmedLine) continue;

		const indent = leadingWhitespace(line);
		if (indent.length <= leadingWhitespace(lines[xi18nLine]).length) {
		insertAt = i;
		break;
		}

		childIndent = indent;

		if (trimmedLine.startsWith('postprocess_version:')) {
		lines[i] = indent + 'postprocess_version: ' + version;
		return lines.join('\n');
		}
	}

	if (xi18nLine === -1) {
		return frontMatter;
	}

	const newLine = childIndent + 'postprocess_version: ' + version;
	lines.splice(insertAt, 0, newLine);
	return lines.join('\n');
}

export function leadingWhitespace(text: string): string {
	const match = text.match(/^[ \t]*/);
	return match ? match[0] : '';
}

export function needsPostprocess(
	content: string,
	sourceHash: string,
	targetLang: string
): boolean {
	if (targetLang === 'en') return false;

	const { front } = splitFrontMatter(content);
	if (!front) return true;

	try {
		const lines = front.split('\n');
		let inXI18N = false;
		let storedHash = '';
		let storedVersion = '';

		for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === 'x-i18n:') {
			inXI18N = true;
			continue;
		}
		if (!inXI18N) continue;
		if (!trimmed) continue;

		if (trimmed.startsWith('source_hash:')) {
			storedHash = trimmed.split(':')[1]?.trim() || '';
		}
		if (trimmed.startsWith('postprocess_version:')) {
			storedVersion = trimmed.split(':')[1]?.trim() || '';
		}
		// Если вышли из x-i18n
		if (leadingWhitespace(line).length <= 2) {
			break;
		}
		}

		if (storedHash !== sourceHash) return true;
		if (storedVersion !== LOCALIZED_LINK_POSTPROCESS_VERSION) return true;
		return false;
	} catch {
		return true;
	}
}

export { LOCALIZED_LINK_POSTPROCESS_VERSION };