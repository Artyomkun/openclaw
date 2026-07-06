#!/usr/bin/env node
import { CodexTranslator } from './translator.ts';

const DEFAULT_DOC_CHUNK_MAX_BYTES = 12000;
const DEFAULT_DOC_CHUNK_PROMPT_BUDGET = 15000;

const FRONTMATTER_TAG_START = '<frontmatter>';
const FRONTMATTER_TAG_END = '</frontmatter>';
const BODY_TAG_START = '<body>';
const BODY_TAG_END = '</body>';
const PROTOCOL_TOKENS = [FRONTMATTER_TAG_START, FRONTMATTER_TAG_END, BODY_TAG_START, BODY_TAG_END, '[[[FM_'];

const COMPONENT_TAG_RE = /<\/([A-Z][A-Za-z0-9]*)\b[^>]*?\/?>/g;

interface DocChunkStructure {
	fenceCount: number;
	tagCounts: Record<string, number>;
}

interface DocChunkSplitPlan {
	groups: string[][];
	reason: string;
}

export async function translateDocBodyChunked(
	translator: CodexTranslator,
	relPath: string,
	body: string,
	srcLang: string,
	tgtLang: string
): Promise<string> {
	if (!body.trim()) return body;

	const blocks = splitDocBodyIntoBlocks(body);
	const groups = groupDocBlocks(blocks, docsI18nDocChunkMaxBytes());

	let result = '';
	for (let i = 0; i < groups.length; i++) {
		const chunkId = `${relPath}.chunk-${String(i + 1).padStart(3, '0')}`;
		const translated = await translateDocBlockGroup(translator, chunkId, groups[i], srcLang, tgtLang);
		result += translated;
	}

	return result;
}

function splitDocBodyIntoBlocks(body: string): string[] {
	if (!body) return [];

	const lines = body.split(/\n/);
	const blocks: string[] = [];
	let current: string[] = [];
	let fenceDelimiter = '';

	for (const line of lines) {
		current.push(line);
		const newDelimiter = leadingFenceDelimiter(line);
		if (fenceDelimiter) {
			if (newDelimiter && newDelimiter[0] === fenceDelimiter[0] && isClosingFenceLine(line, fenceDelimiter)) {
				fenceDelimiter = '';
			}
		} else if (newDelimiter) {
			fenceDelimiter = newDelimiter;
		}

		if (!fenceDelimiter && !line.trim()) {
			blocks.push(current.join('\n'));
			current = [];
		}
	}

	if (current.length > 0) {
		blocks.push(current.join('\n'));
	}

	return blocks.length > 0 ? blocks : [body];
}

function groupDocBlocks(blocks: string[], maxBytes: number): string[][] {
	if (blocks.length === 0) return [];
	if (maxBytes <= 0) maxBytes = DEFAULT_DOC_CHUNK_MAX_BYTES;

	const groups: string[][] = [];
	let current: string[] = [];
	let currentBytes = 0;

	for (const block of blocks) {
		const blockBytes = block.length;
		if (current.length > 0 && currentBytes + blockBytes > maxBytes) {
			groups.push(current);
			current = [];
			currentBytes = 0;
		}
		if (blockBytes > maxBytes) {
			groups.push([block]);
			continue;
		}
		current.push(block);
		currentBytes += blockBytes;
	}

	if (current.length > 0) {
		groups.push(current);
	}

	return groups;
}

async function translateDocBlockGroup(
	translator: CodexTranslator,
	chunkId: string,
	blocks: string[],
	srcLang: string,
	tgtLang: string
): Promise<string> {
	const source = blocks.join('');
	if (!source.trim()) return source;

	const plan = planDocChunkSplit(blocks, docsI18nDocChunkMaxBytes(), docsI18nDocChunkPromptBudget());
	if (plan) {
		return translatePlannedDocChunkGroups(translator, chunkId, plan.groups, srcLang, tgtLang);
	}

	const { normalizedSource, commonIndent } = stripCommonIndent(source);

	try {
		const ctx = new AbortController();
		let translated = await translator.translate(normalizedSource, ctx);
		translated = sanitizeDocChunkProtocolWrappers(normalizedSource, translated);
		translated = reapplyCommonIndent(translated, commonIndent);
		validateDocChunkTranslation(source, translated);
		return translated;
	} catch (err) {
		if (blocks.length <= 1) {
			try {
				return await translateDocLeafBlock(translator, chunkId, source, srcLang, tgtLang);
			} catch {
				const retryPlan = planSingletonDocChunkRetry(source, docsI18nDocChunkMaxBytes(), docsI18nDocChunkPromptBudget());
				if (retryPlan) {
					return translatePlannedDocChunkGroups(translator, chunkId, retryPlan.groups, srcLang, tgtLang);
				}
				throw new Error(`${chunkId}: ${err}`);
			}
		}

		const retryPlan = planDocChunkSplit(blocks, docsI18nDocChunkMaxBytes(), docsI18nDocChunkPromptBudget());
		if (retryPlan) {
			return translatePlannedDocChunkGroups(translator, chunkId, retryPlan.groups, srcLang, tgtLang);
		}

		const simpleSplit = splitDocChunkBlocksMidpointSimple(blocks);
		if (simpleSplit) {
			return translatePlannedDocChunkGroups(translator, chunkId, simpleSplit.groups, srcLang, tgtLang);
		}

		throw new Error(`${chunkId}: ${err}`);
	}
}

function planDocChunkSplit(
	blocks: string[],
	maxBytes: number,
	promptBudget: number
): DocChunkSplitPlan {
	const source = blocks.join('');
	const { normalizedSource } = stripCommonIndent(source);
	const estimatedPromptCost = estimateDocPromptCost(normalizedSource);

	if (blocks.length > 1 && promptBudget > 0 && estimatedPromptCost > promptBudget) {
		const splitPlan = splitDocChunkBlocksMidpoint(blocks);
		return splitPlan || { groups: [blocks], reason: 'no-split-needed' };
	}
	if (blocks.length === 1) {
		const plan = planSingletonDocChunk(blocks[0], maxBytes, promptBudget);
		return plan || { groups: [[blocks[0]]], reason: 'no-split-needed' };
	}

	return { groups: [blocks], reason: 'no-split-needed' };
}

function splitDocChunkBlocksMidpoint(
	blocks: string[],
): DocChunkSplitPlan | null {
	if (blocks.length <= 1) return null;
	const mid = Math.floor(blocks.length / 2);
	if (mid <= 0 || mid >= blocks.length) return null;

	return {
		groups: [blocks.slice(0, mid), blocks.slice(mid)],
		reason: 'prompt-budget',
	};
}

function splitDocChunkBlocksMidpointSimple(blocks: string[]): DocChunkSplitPlan | null {
	if (blocks.length <= 1) return null;
	const mid = Math.floor(blocks.length / 2);
	if (mid <= 0 || mid >= blocks.length) return null;

	return {
		groups: [blocks.slice(0, mid), blocks.slice(mid)],
		reason: 'retry-midpoint',
	};
}

async function translateDocLeafBlock(
	translator: CodexTranslator,
	chunkId: string,
	source: string,
	srcLang: string,
	tgtLang: string
): Promise<string> {
	const structure = summarizeDocChunkStructure(source);
	if (structure.fenceCount !== 0) {
		throw new Error(`${chunkId}: raw leaf fallback not applicable`);
	}

	const { normalizedSource, commonIndent } = stripCommonIndent(source);
	const { maskedSource, placeholders } = maskDocComponentTags(normalizedSource);

	let translated = await translator.translate(maskedSource, new AbortController());
	translated = restoreDocComponentTags(translated, placeholders);
	translated = sanitizeDocChunkProtocolWrappers(source, translated);
	translated = reapplyCommonIndent(translated, commonIndent);

	validateDocChunkTranslation(source, translated);
	return translated;
}

function planSingletonDocChunk(
	block: string,
	maxBytes: number,
	promptBudget: number
): DocChunkSplitPlan {
	const { normalizedSource } = stripCommonIndent(block);
	const estimatedPromptCost = estimateDocPromptCost(normalizedSource);

	const overBytes = maxBytes > 0 && block.length > maxBytes;
	const overPrompt = promptBudget > 0 && estimatedPromptCost > promptBudget;

	if (!overBytes && !overPrompt) {
		return { groups: [[block]], reason: 'no-split-needed' };
	}

	return planSingletonDocChunkWithMode(block, maxBytes, promptBudget, false);
}

function planSingletonDocChunkRetry(
	block: string,
	maxBytes: number,
	promptBudget: number
): DocChunkSplitPlan {
	return planSingletonDocChunkWithMode(block, maxBytes, promptBudget, true);
}

function planSingletonDocChunkWithMode(
	block: string,
	maxBytes: number,
	promptBudget: number,
	force: boolean
): DocChunkSplitPlan {
	const sections = splitDocBlockSections(block);
	if (sections.length > 1) {
		const groups = sections.map(s => [s]).filter(g => g[0].trim());
		if (groups.length > 1) {
			return {
				groups,
				reason: force ? 'singleton-retry-structural' : 'singleton-structural',
			};
		}
	}

	const fenceGroups = splitPureFencedDocSectionWithMode(block, maxBytes, promptBudget, force);
	if (fenceGroups) {
		return {
			groups: fenceGroups,
			reason: force ? 'singleton-retry-fence' : 'singleton-fence',
		};
	}

	const plainGroups = splitPlainDocSectionWithMode(block, maxBytes, promptBudget, force);
	if (plainGroups) {
		return {
			groups: plainGroups,
			reason: force ? 'singleton-retry-lines' : 'singleton-lines',
		};
	}

	return {
		groups: [[block]],
		reason: force ? 'singleton-retry-fallback' : 'singleton-fallback',
	};
}

function splitDocBlockSections(block: string): string[] {
	const lines = block.split(/\n/);
	if (lines.length === 0) return [];

	const sections: string[] = [];
	let current: string[] = [];
	let fenceDelimiter = '';

	for (const line of lines) {
		const lineDelimiter = leadingFenceDelimiter(line);

		if (!fenceDelimiter && lineDelimiter) {
			if (current.length > 0) {
				sections.push(current.join('\n'));
				current = [];
			}
			current.push(line);
			fenceDelimiter = lineDelimiter;
			continue;
		}

		current.push(line);

		if (fenceDelimiter) {
			if (lineDelimiter && lineDelimiter[0] === fenceDelimiter[0] && isClosingFenceLine(line, fenceDelimiter)) {
				sections.push(current.join('\n'));
				current = [];
				fenceDelimiter = '';
			}
			continue;
		}

		if (!line.trim()) {
			sections.push(current.join('\n'));
			current = [];
		}
	}

	if (current.length > 0) {
		sections.push(current.join('\n'));
	}

	return sections.length > 1 ? sections : [];
}

function splitPureFencedDocSectionWithMode(
	block: string,
	maxBytes: number,
	promptBudget: number,
	force: boolean
): string[][] {
	const lines = block.split(/\n/);

	const openingIndex = firstNonEmptyLineIndex(lines);
	const closingIndex = lastNonEmptyLineIndex(lines);

	const opening = lines[openingIndex];
	const closing = lines[closingIndex];
	const inner = lines.slice(openingIndex + 1, closingIndex).join('\n');

	const innerGroups = splitPlainDocSectionWithMode(inner, maxBytes - opening.length - closing.length, promptBudget, force);

	if (!innerGroups) {
		return [[block]];
	}

	return innerGroups.map(group => {
		const joined = group.join('');
		return [opening + '\n' + joined + '\n' + closing];
	});
}

function splitPlainDocSectionWithMode(
	text: string,
	maxBytes: number,
	promptBudget: number,
	force: boolean
): string[][] {
	if (maxBytes <= 0) maxBytes = text.length;
	if (promptBudget <= 0) promptBudget = DEFAULT_DOC_CHUNK_PROMPT_BUDGET;

	const lines = text.split(/\n/);
	if (lines.length <= 1) return [];

	const groups: string[][] = [];
	let current: string[] = [];
	let currentBytes = 0;
	let currentPrompt = 0;

	for (const line of lines) {
		const linePrompt = estimateDocPromptCost(line);

		if (line.length > maxBytes || linePrompt > promptBudget) {
			return [];
		}

		if (current.length > 0 && (currentBytes + line.length > maxBytes || currentPrompt + linePrompt > promptBudget)) {
			groups.push([current.join('\n')]);
			current = [];
			currentBytes = 0;
			currentPrompt = 0;
		}

		current.push(line);
		currentBytes += line.length;
		currentPrompt += linePrompt;
	}

	if (current.length > 0) {
		groups.push([current.join('\n')]);
	}

	if (groups.length <= 1) {
		if (!force) return [];
		return splitPlainDocSectionMidpoint(lines) || [];
	}

	return groups;
}

function splitPlainDocSectionMidpoint(lines: string[]): string[][] {
	if (lines.length <= 1) return [];

	const mid = Math.floor(lines.length / 2);
	if (mid <= 0 || mid >= lines.length) return [];

	const left = lines.slice(0, mid).join('\n');
	const right = lines.slice(mid).join('\n');

	if (!left.trim() || !right.trim()) return [];

	return [[left], [right]];
}

function firstNonEmptyLineIndex(lines: string[]): number {
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim()) return i;
	}
	return -1;
}

function lastNonEmptyLineIndex(lines: string[]): number {
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].trim()) return i;
	}
	return -1;
}

function leadingFenceDelimiter(line: string): string {
	const trimmed = line.replace(/^[ \t]+/, '');
	if (trimmed.length < 3) return '';

	const first = trimmed[0];
	if (first !== '`' && first !== '~') return '';

	let i = 0;
	while (i < trimmed.length && trimmed[i] === first) i++;
	if (i < 3) return '';

	return trimmed.slice(0, i);
}

function isClosingFenceLine(line: string, delimiter: string): boolean {
	const trimmed = line.replace(/^[ \t]+/, '');
	if (!trimmed.startsWith(delimiter)) return false;
	return trimmed.slice(delimiter.length).trim() === '';
}

function estimateDocPromptCost(text: string): number {
	let cost = text.length;
	cost += (text.match(/`/g) || []).length * 6;
	cost += (text.match(/\|/g) || []).length * 4;
	cost += (text.match(/{/g) || []).length * 4;
	cost += (text.match(/}/g) || []).length * 4;
	cost += (text.match(/\[/g) || []).length * 4;
	cost += (text.match(/\]/g) || []).length * 4;
	cost += (text.match(/:/g) || []).length * 2;
	cost += (text.match(/</g) || []).length * 4;
	cost += (text.match(/>/g) || []).length * 4;
	return cost;
}

// ============================================================
//  STRIP/REAPPLY INDENT
// ============================================================

function stripCommonIndent(text: string): { normalizedSource: string; commonIndent: string } {
	const lines = text.split(/\n/);
	let commonIndent = '';

	for (const line of lines) {
		const trimmed = line.trimEnd();
		if (!trimmed.trim()) continue;
		const indent = leadingIndent(trimmed);
		if (!commonIndent) {
			commonIndent = indent;
			continue;
		}
		commonIndent = commonIndentPrefix(commonIndent, indent);
		if (!commonIndent) {
			return { normalizedSource: text, commonIndent: '' };
		}
	}

	if (!commonIndent) {
		return { normalizedSource: text, commonIndent: '' };
	}

	const normalized = lines.map(line => {
		if (!line.trim()) return line;
		if (line.startsWith(commonIndent)) {
		return line.slice(commonIndent.length);
		}
		return line;
	}).join('\n');

	return { normalizedSource: normalized, commonIndent };
}

function reapplyCommonIndent(text: string, indent: string): string {
	if (!indent || !text) return text;

	return text.split(/\n/).map(line => {
		if (!line.trim()) return line;
		return indent + line;
	}).join('\n');
}

function leadingIndent(line: string): string {
	let i = 0;
	while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
	return line.slice(0, i);
}

function commonIndentPrefix(a: string, b: string): string {
	const limit = Math.min(a.length, b.length);
	let i = 0;
	while (i < limit && a[i] === b[i]) i++;
	return a.slice(0, i);
}

function validateDocChunkTranslation(source: string, translated: string): void {
	if (hasUnexpectedTopLevelProtocolWrapper(source, translated)) {
		throw new Error('protocol token leaked: top-level wrapper');
	}

	const sourceLower = source.toLowerCase();
	const translatedLower = translated.toLowerCase();

	for (const token of PROTOCOL_TOKENS) {
		const tokenLower = token.toLowerCase();
		if (sourceLower.includes(tokenLower)) continue;
		if (translatedLower.includes(tokenLower)) {
			throw new Error(`protocol token leaked: ${token}`);
		}
	}

	const sourceStructure = summarizeDocChunkStructure(source);
	const translatedStructure = summarizeDocChunkStructure(translated);

	if (sourceStructure.fenceCount !== translatedStructure.fenceCount) {
		throw new Error(`code fence mismatch: source=${sourceStructure.fenceCount} translated=${translatedStructure.fenceCount}`);
	}

	const sourceKeys = Object.keys(sourceStructure.tagCounts).sort();
	const translatedKeys = Object.keys(translatedStructure.tagCounts).sort();

	if (sourceKeys.join(',') !== translatedKeys.join(',')) {
		throw new Error('component tag set mismatch');
	}

	for (const key of sourceKeys) {
		if (sourceStructure.tagCounts[key] !== translatedStructure.tagCounts[key]) {
			throw new Error(`component tag mismatch for ${key}: source=${sourceStructure.tagCounts[key]} translated=${translatedStructure.tagCounts[key]}`);
		}
	}
}

function summarizeDocChunkStructure(text: string): DocChunkStructure {
	const lines = text.split(/\n/);
	let fenceCount = 0;
	const tagCounts: Record<string, number> = {};
	let fenceDelimiter = '';

	for (const line of lines) {
		const newDelimiter = leadingFenceDelimiter(line);
		if (fenceDelimiter) {
			if (newDelimiter && newDelimiter[0] === fenceDelimiter[0] && isClosingFenceLine(line, fenceDelimiter)) {
				fenceCount++;
				fenceDelimiter = '';
			}
		} else if (newDelimiter) {
			fenceCount++;
			fenceDelimiter = newDelimiter;
		}

		const matches = line.match(COMPONENT_TAG_RE);
		if (matches) {
			for (const match of matches) {
				const tag = match.replace(/[<>/]/g, '');
				tagCounts[tag] = (tagCounts[tag] || 0) + 1;
			}
		}
	}

	return { fenceCount, tagCounts };
}

function sanitizeDocChunkProtocolWrappers(source: string, translated: string): string {
	if (!containsProtocolWrapperToken(translated)) {
		return translated;
	}

	const trimmedTranslated = translated.trim();
	if (!hasUnexpectedTopLevelProtocolWrapper(source, trimmedTranslated)) {
		return translated;
	}

	if (!hasAmbiguousTaggedBodyClose(source, trimmedTranslated)) {
		const parsed = parseTaggedDocument(trimmedTranslated);
		if (parsed && parsed.body.trim()) {
		return parsed.body;
		}
	}

	const stripped = stripBodyOnlyWrapper(source, trimmedTranslated);
	if (stripped && stripped.trim()) {
		return stripped;
	}

	return translated;
}

function hasUnexpectedTopLevelProtocolWrapper(source: string, translated: string): boolean {
	const sourceTrimmed = source.trim().toLowerCase();
	const translatedTrimmed = translated.trim().toLowerCase();

	if (
		translatedTrimmed.startsWith(FRONTMATTER_TAG_START.toLowerCase()) &&
		!sourceTrimmed.startsWith(FRONTMATTER_TAG_START.toLowerCase())
	) {
		return true;
	}

	if (
		translatedTrimmed.startsWith(BODY_TAG_START.toLowerCase()) &&
		!sourceTrimmed.startsWith(BODY_TAG_START.toLowerCase())
	) {
		return true;
	}

	if (
		translatedTrimmed.endsWith(FRONTMATTER_TAG_END.toLowerCase()) &&
		!sourceTrimmed.endsWith(FRONTMATTER_TAG_END.toLowerCase())
	) {
		return true;
	}

	if (
		translatedTrimmed.endsWith(BODY_TAG_END.toLowerCase()) &&
		!sourceTrimmed.endsWith(BODY_TAG_END.toLowerCase())
	) {
		return true;
	}

	return false;
}

function containsProtocolWrapperToken(text: string): boolean {
	const lower = text.toLowerCase();
	return lower.includes(BODY_TAG_START.toLowerCase()) || lower.includes(FRONTMATTER_TAG_START.toLowerCase());
}

function hasAmbiguousTaggedBodyClose(source: string, translated: string): boolean {
	const sourceLower = source.toLowerCase();
	if (!sourceLower.includes(BODY_TAG_START.toLowerCase()) && !sourceLower.includes(BODY_TAG_END.toLowerCase())) {
		return false;
	}

	const translatedLower = translated.toLowerCase();
	if (!translatedLower.includes(FRONTMATTER_TAG_START.toLowerCase())) {
		return false;
	}

	return (translatedLower.match(new RegExp(BODY_TAG_END.toLowerCase(), 'g')) || []).length === 1;
}

function stripBodyOnlyWrapper(source: string, text: string): string {
	const sourceLower = source.toLowerCase();
	if (sourceLower.includes(BODY_TAG_START.toLowerCase()) || sourceLower.includes(BODY_TAG_END.toLowerCase())) {
		return '';
	}

	const lower = text.toLowerCase();
	if (!lower.startsWith(BODY_TAG_START.toLowerCase()) || !lower.endsWith(BODY_TAG_END.toLowerCase())) {
		return '';
	}

	const body = text.slice(BODY_TAG_START.length, -BODY_TAG_END.length);
	const bodyLower = lower.slice(BODY_TAG_START.length, -BODY_TAG_END.length);

	if (bodyLower.includes(BODY_TAG_START.toLowerCase()) || bodyLower.includes(BODY_TAG_END.toLowerCase())) {
		return '';
	}

	return body.trim();
	}

function parseTaggedDocument(text: string): { front: string; body: string } {
	const frontStart = text.indexOf(FRONTMATTER_TAG_START);
	if (frontStart === -1) return { front: '', body: '' };

	const frontEnd = text.indexOf(FRONTMATTER_TAG_END, frontStart + FRONTMATTER_TAG_START.length);
	if (frontEnd === -1) return { front: '', body: '' };

	const bodyStart = text.indexOf(BODY_TAG_START, frontEnd + FRONTMATTER_TAG_END.length);
	if (bodyStart === -1) return { front: '', body: '' };

	const bodyEnd = text.indexOf(BODY_TAG_END, bodyStart + BODY_TAG_START.length);
	if (bodyEnd === -1) return { front: '', body: '' };

	const front = text.slice(frontStart + FRONTMATTER_TAG_START.length, frontEnd).trim();
	const body = text.slice(bodyStart + BODY_TAG_START.length, bodyEnd).trim();

	return { front, body };
}

function maskDocComponentTags(text: string): { maskedSource: string; placeholders: string[] } {
	const placeholders: string[] = [];
	const masked = text.replace(COMPONENT_TAG_RE, (match) => {
		const placeholder = `__OC_DOC_TAG_${String(placeholders.length).padStart(3, '0')}__`;
		placeholders.push(match);
		return placeholder;
	});
	return { maskedSource: masked, placeholders };
}

function restoreDocComponentTags(text: string, placeholders: string[]): string {
	let restored = text;
	for (let i = 0; i < placeholders.length; i++) {
		const placeholder = `__OC_DOC_TAG_${String(i).padStart(3, '0')}__`;
		if (!restored.includes(placeholder)) {
			throw new Error(`component tag placeholder missing: ${placeholder}`);
		}
		restored = restored.replace(new RegExp(placeholder, 'g'), placeholders[i]);
	}
	return restored;
}

function docsI18nDocChunkMaxBytes(): number {
	const value = process.env.OPENCLAW_DOCS_I18N_DOC_CHUNK_MAX_BYTES?.trim();
	if (!value) return DEFAULT_DOC_CHUNK_MAX_BYTES;
	const parsed = parseInt(value, 10);
	return parsed > 0 ? parsed : DEFAULT_DOC_CHUNK_MAX_BYTES;
}

function docsI18nDocChunkPromptBudget(): number {
	const value = process.env.OPENCLAW_DOCS_I18N_DOC_CHUNK_PROMPT_BUDGET?.trim();
	if (!value) return DEFAULT_DOC_CHUNK_PROMPT_BUDGET;
	const parsed = parseInt(value, 10);
	return parsed > 0 ? parsed : DEFAULT_DOC_CHUNK_PROMPT_BUDGET;
}

async function translatePlannedDocChunkGroups(
	translator: CodexTranslator,
	chunkId: string,
	groups: string[][],
	srcLang: string,
	tgtLang: string
): Promise<string> {
	let result = '';
	for (let i = 0; i < groups.length; i++) {
		const translated = await translateDocBlockGroup(
			translator,
			`${chunkId}.${String(i + 1).padStart(2, '0')}`,
			groups[i],
			srcLang,
			tgtLang
		);
		result += translated;
	}
	return result;
}