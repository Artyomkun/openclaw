#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { createHash } from 'crypto';
import yaml from 'yaml';

// ===== Константы =====
const FRONTMATTER_TAG_START = '<frontmatter>';
const FRONTMATTER_TAG_END = '</frontmatter>';
const BODY_TAG_START = '<body>';
const BODY_TAG_END = '</body>';
const LOCALIZED_LINK_POSTPROCESS_VERSION = 'v1';

// ===== Утилиты =====
function hashBytes(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
}

function trimTagNewlines(value: string): string {
    return value.replace(/^\n+/, '').replace(/\n+$/, '');
}

function splitFrontMatter(content: string): { front: string; body: string } {
	const frontStart = content.indexOf(FRONTMATTER_TAG_START);
	if (frontStart === -1) return { front: '', body: content };
	
	const frontEnd = content.indexOf(FRONTMATTER_TAG_END, frontStart);
	if (frontEnd === -1) return { front: '', body: content };
	
	const front = content.substring(frontStart + FRONTMATTER_TAG_START.length, frontEnd);
	const bodyStart = content.indexOf(BODY_TAG_START, frontEnd);
	if (bodyStart === -1) {
		return { front: trimTagNewlines(front), body: content.substring(frontEnd + FRONTMATTER_TAG_END.length) };
	}
	
	const body = content.substring(bodyStart + BODY_TAG_START.length);
	const bodyEnd = body.lastIndexOf(BODY_TAG_END);
	const finalBody = bodyEnd !== -1 ? body.substring(0, bodyEnd) : body;
	
	return { front: trimTagNewlines(front), body: trimTagNewlines(finalBody) };
	}

function extractSourceHash(frontData: any): string {
	return frontData?.['x-i18n']?.source_hash || '';
}

function extractPostprocessVersion(frontData: any): string {
	return frontData?.['x-i18n']?.postprocess_version || '';
}

// ===== Основная логика =====
async function processFile(
	docsRoot: string,
	filePath: string,
	srcLang: string,
	tgtLang: string,
	overwrite: boolean
): Promise<{ skipped: boolean; outputPath: string | null }> {
	const absPath = resolve(filePath);
	const relPath = relative(docsRoot, absPath);
	const content = await readFile(absPath);
	const currentHash = hashBytes(content);
	const outputPath = resolve(docsRoot, tgtLang, relPath);
	if (!overwrite && existsSync(outputPath)) {
		const existing = await readFile(outputPath, 'utf-8');
		const { front } = splitFrontMatter(existing);
		
		if (front) {
		try {
			const frontData = yaml.parse(front);
			const storedHash = extractSourceHash(frontData);
			if (storedHash && storedHash.toLowerCase() === currentHash.toLowerCase()) {
			if (tgtLang.toLowerCase() === 'en') {
				return { skipped: true, outputPath: null };
			}
			const ppVersion = extractPostprocessVersion(frontData);
			if (ppVersion === LOCALIZED_LINK_POSTPROCESS_VERSION) {
				return { skipped: true, outputPath: null };
			}
			return { skipped: false, outputPath };
			}
		} catch (_) {
			// Если не спарсилось — переводим заново
		}
		}
	}
	
	const text = content.toString('utf-8');
	const { front, body } = splitFrontMatter(text);
	let frontData: any = {};
	if (front.trim()) {
		try {
		frontData = yaml.parse(front);
		} catch (err) {
		throw new Error(`Frontmatter parse failed for ${relPath}: ${err}`);
		}
	}
	if (!frontData['x-i18n']) frontData['x-i18n'] = {};
	frontData['x-i18n']['source_hash'] = currentHash;
	if (tgtLang.toLowerCase() !== 'en') {
		frontData['x-i18n']['postprocess_version'] = LOCALIZED_LINK_POSTPROCESS_VERSION;
	}
	
	const updatedFront = yaml.stringify(frontData);
	const response = await fetch('http://localhost:3179/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
		from: 'docs-translator',
		to: 'codex',
		content: `Translate the following Markdown text from ${srcLang} to ${tgtLang}. Preserve all formatting, links, and code blocks:\n\n${body}`
		})
	});

	if (!response.ok) {
		throw new Error(`Codex API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json() as { reply: string };
	const translatedBody = data.reply || body;
	const output = 
		FRONTMATTER_TAG_START + '\n' + updatedFront + '\n' + FRONTMATTER_TAG_END + '\n' +
		BODY_TAG_START + '\n' + translatedBody + '\n' + BODY_TAG_END;
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, output, 'utf-8');
	
	return { skipped: false, outputPath };
}

// ===== CLI =====
const args = process.argv.slice(2);
const [command, srcLang = 'en', tgtLang = 'ru', ...files] = args;

if (command === 'translate' && files.length > 0) {
	const docsRoot = process.cwd();
	for (const file of files) {
		const result = await processFile(docsRoot, file, srcLang, tgtLang, false);
		if (result.skipped) {
			console.log(`⏭️ Skipped: ${file}`);
		} else {
			console.log(`✅ Translated: ${file} → ${result.outputPath}`);
		}
	}
} else {
  	console.log('Usage: tsx scripts/translate-docs.ts translate <srcLang> <tgtLang> <file1> <file2> ...');
}