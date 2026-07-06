#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import yaml from 'yaml';
import { TranslationMemory, TMEntry } from './tm';
import { CodexTranslator } from './translator.ts';
import {
    cacheNamespace,
    cacheKey,
    hashText,
    hashBytes,
    docsI18nProvider,
    docsI18nModel,
    validateNoTranslationTranscriptArtifacts
} from './util.ts';

export const LOCALIZED_LINK_POSTPROCESS_PENDING = 'pending';
export const LOCALIZED_LINK_POSTPROCESS_VERSION = 'locale-links-v1';
const WORKFLOW_VERSION = 16;

export async function processFile(
    translator: CodexTranslator,
    tm: TranslationMemory,
    docsRoot: string,
    filePath: string,
    srcLang: string,
    tgtLang: string
): Promise<{ skipped: boolean; outputPath: string }> {
    const { absPath, relPath } = resolveDocsPath(docsRoot, filePath);
    const content = await readFile(absPath, 'utf-8');
    const sourceBytes = await readFile(absPath);
    const { front, body } = splitFrontMatter(content);
    let frontData: Record<string, any> = {};
    if (front.trim()) {
        try {
            frontData = yaml.parse(front);
        } catch (err) {
            throw new Error(`Frontmatter parse failed for ${relPath}: ${err}`);
        }
    }
    await translateFrontMatter(translator, tm, frontData, relPath, srcLang, tgtLang);
    let translatedBody = await translateHTMLBlocks(translator, body, srcLang, tgtLang);
    const segments = extractSegments(translatedBody, relPath);
    const namespace = cacheNamespace();
    for (const seg of segments) {
        seg.cacheKey = cacheKey(namespace, srcLang, tgtLang, seg.segmentId, seg.textHash);

        const cached = tm.get(seg.cacheKey);
        if (cached) {
            seg.translated = cached.translated;
            continue;
        }

        const translated = await translator.translate(
            new AbortController(),
            seg.text,
            srcLang,
            tgtLang
        );

        seg.translated = translated;

        const entry: TMEntry = {
            cache_key: seg.cacheKey,
            segment_id: seg.segmentId,
            source_path: relPath,
            text_hash: seg.textHash,
            text: seg.text,
            translated: translated,
            provider: docsI18nProvider(),
            model: docsI18nModel(),
            src_lang: srcLang,
            tgt_lang: tgtLang,
            updated_at: new Date().toISOString(),
        };

        tm.put(entry);
    }
    const finalBody = applyTranslations(translatedBody, segments);
    const updatedFront = encodeFrontMatter(frontData, relPath, sourceBytes);
    const outputPath = join(docsRoot, tgtLang, relPath);
    await mkdir(dirname(outputPath), { recursive: true });
    const output = updatedFront + finalBody;
    await writeFile(outputPath, output, 'utf-8');
    return { skipped: false, outputPath };
}

export function resolveDocsPath(
    docsRoot: string,
    filePath: string
): { absPath: string; relPath: string } {
    const absPath = filePath;
    const relPath = filePath.replace(docsRoot + '/', '');
    return { absPath, relPath };
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

export function encodeFrontMatter(
    frontData: Record<string, any>,
    relPath: string,
    sourceBytes: Buffer
): string {
    if (!frontData) {
        frontData = {};
    }

    frontData['x-i18n'] = {
        source_path: relPath,
        source_hash: hashBytes(sourceBytes),
        provider: docsI18nProvider(),
        model: docsI18nModel(),
        workflow: WORKFLOW_VERSION,
        generated_at: new Date().toISOString(),
        postprocess_version: LOCALIZED_LINK_POSTPROCESS_PENDING,
    };

    const encoded = yaml.stringify(frontData);
    return `---\n${encoded}---\n\n`;
}

export async function translateFrontMatter(
    translator: CodexTranslator,
    tm: TranslationMemory,
    data: Record<string, any>,
    relPath: string,
    srcLang: string,
    tgtLang: string
): Promise<void> {
    if (!data || Object.keys(data).length === 0) return;
    if (data.summary && typeof data.summary === 'string') {
        const translated = await translateSnippet(
            translator,
            tm,
            `${relPath}:frontmatter:summary`,
            data.summary,
            srcLang,
            tgtLang
        );
        data.summary = translated;
    }
    if (data.title && typeof data.title === 'string') {
        const translated = await translateSnippet(
            translator,
            tm,
            `${relPath}:frontmatter:title`,
            data.title,
            srcLang,
            tgtLang
        );
        data.title = translated;
    }
    if (data.read_when && Array.isArray(data.read_when)) {
        const translated: any[] = [];
        for (let i = 0; i < data.read_when.length; i++) {
            const item = data.read_when[i];
            if (typeof item === 'string') {
                const value = await translateSnippet(
                    translator,
                    tm,
                    `${relPath}:frontmatter:read_when:${i}`,
                    item,
                    srcLang,
                    tgtLang
                );
                translated.push(value);
            } else {
                translated.push(item);
            }
        }
        data.read_when = translated;
    }
}

export async function translateSnippet(
    translator: CodexTranslator,
    tm: TranslationMemory,
    segmentId: string,
    textValue: string,
    srcLang: string,
    tgtLang: string
): Promise<string> {
    const trimmed = textValue.trim();
    if (!trimmed) return textValue;

    const namespace = cacheNamespace();
    const textHash = hashText(textValue);
    const ck = cacheKey(namespace, srcLang, tgtLang, segmentId, textHash);
    const cached = tm.get(ck);
    if (cached) {
        return cached.translated;
    }

    try {
        const translated = await translator.translate(
            new AbortController(),
            textValue,
            srcLang,
            tgtLang
        );
        const validationError = validateFrontmatterScalarTranslation(textValue, translated);
        let finalTranslated = translated;
        let shouldCache = true;

        if (validationError) {
            console.warn(`[docs-i18n] frontmatter fallback ${segmentId}: ${validationError}`);
            finalTranslated = textValue;
            shouldCache = false;
        }

        const sourcePath = segmentId.split(':frontmatter:')[0] || segmentId;

        const entry: TMEntry = {
            cache_key: ck,
            segment_id: segmentId,
            source_path: sourcePath,
            text_hash: textHash,
            text: textValue,
            translated: finalTranslated,
            provider: docsI18nProvider(),
            model: docsI18nModel(),
            src_lang: srcLang,
            tgt_lang: tgtLang,
            updated_at: new Date().toISOString(),
        };

        if (shouldCache) {
            tm.put(entry);
        }

        return finalTranslated;
    } catch (err) {
        console.warn(`[docs-i18n] frontmatter fallback ${segmentId}: ${err}`);
        return textValue;
    }
}

export function validateFrontmatterScalarTranslation(
    source: string,
    translated: string
): string {
    const trimmed = translated.trim();
    if (!trimmed) {
        return 'empty translation';
    }
    const lower = trimmed.toLowerCase();
    if (
        lower.includes('<frontmatter>') ||
        lower.includes('</frontmatter>') ||
        lower.includes('<body>') ||
        lower.includes('</body>')
    ) {
        return 'tagged document wrapper detected';
    }
    if (trimmed.includes('[[[FM_')) {
        return 'frontmatter marker leaked into scalar translation';
    }
    if (trimmed.includes('\n---\n') || trimmed.startsWith('---\n')) {
        return 'yaml document boundary detected';
    }
    if (!source.includes('\n') && trimmed.split('\n').length >= 3) {
        return 'unexpected multiline expansion';
    }
    const sourceLen = source.trim().length;
    const translatedLen = trimmed.length;
    if (sourceLen > 0) {
        let limit = sourceLen * 8 + 256;
        if (limit < 512) limit = 512;
        if (translatedLen > limit) {
            return `unexpected size expansion source=${sourceLen} translated=${translatedLen}`;
        }
    }
    const keys = ['title:', 'summary:', 'read_when:'];
    for (const key of keys) {
        if (lower.includes(`\n${key}`) || lower.startsWith(key)) {
            return `frontmatter key leaked into scalar translation: ${key}`;
        }
    }
    try {
        validateNoTranslationTranscriptArtifacts(source, trimmed);
    } catch (err) {
        return String(err);
    }

    return translated;
}

interface Segment {
    start: number;
    stop: number;
    text: string;
    textHash: string;
    segmentId: string;
    translated: string;
    cacheKey: string;
}

const FENCED_BACKTICK_RE = /(^|\n)[ \t]*```[^\n]*\n.*?\n[ \t]*```[ \t]*(?:\n|$)/gs;
const FENCED_TILDE_RE = /(^|\n)[ \t]*~~~[^\n]*\n.*?\n[ \t]*~~~[ \t]*(?:\n|$)/gs;
const INLINE_CODE_RE = /`[^`]*`/g;
const HTML_TAG_RE = /<[^>]+>/g;

export function extractSegments(body: string, relPath: string): Segment[] {
    const segments: Segment[] = [];
    const state = { counter: 0 };
    const mapping: Record<string, string> = {};
    
    const next = (): string => {
        const id = `___OC_SEGMENT_${state.counter++}___`;
        return id;
    };
    
    let masked = body;
    masked = maskMatches(masked, FENCED_BACKTICK_RE, next, mapping);
    masked = maskMatches(masked, FENCED_TILDE_RE, next, mapping);
    masked = maskMatches(masked, INLINE_CODE_RE, next, mapping);
    masked = maskMatches(masked, HTML_TAG_RE, next, mapping);

    const paragraphs = masked.split(/\n\n+/);
    let offset = 0;

    for (const para of paragraphs) {
        if (!para.trim()) continue;
        let original = para;
        for (const [placeholder, originalText] of Object.entries(mapping)) {
            original = original.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), originalText);
        }
        const start = body.indexOf(original, offset);
        if (start === -1) continue;
        const stop = start + original.length;
        offset = stop;
        
        const textHash = hashText(original);
        const segmentId = `${relPath}:${textHash.slice(0, 16)}`;
        
        segments.push({
            start,
            stop,
            text: original,
            textHash,
            segmentId,
            translated: '',
            cacheKey: '',
        });
    }
    
    return segments;
}

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

export function applyTranslations(body: string, segments: Segment[]): string {
    const sorted = [...segments].sort((a, b) => b.start - a.start);

    let result = body;
    for (const seg of sorted) {
        if (seg.translated && seg.translated !== seg.text) {
            result =
                result.slice(0, seg.start) +
                seg.translated +
                result.slice(seg.stop);
        }
    }

    return result;
}

export async function translateHTMLBlocks(
    translator: CodexTranslator,
    body: string,
    srcLang: string,
    tgtLang: string
): Promise<string> {
    const htmlBlockRegex = /<(div|span|p|section|article|aside|header|footer|main|nav)[^>]*>([\s\S]*?)<\/\1>/gi;
    
    let result = body;
    const matches = [...body.matchAll(htmlBlockRegex)];
    
    for (const match of matches) {
        const fullMatch = match[0];
        const tagName = match[1];
        const content = match[2];

        if (content.includes('```') || content.includes('`')) continue;
        
        try {
            const translated = await translator.translate(
            new AbortController(),
            content,
            srcLang,
            tgtLang
            );
            
            if (translated && translated !== content) {
            const newBlock = `<${tagName}>${translated}</${tagName}>`;
            result = result.replace(fullMatch, newBlock);
            }
        } catch (err) {
            console.warn(`[docs-i18n] Failed to translate HTML block: ${err}`);
        }
    }
    
    return result;
}