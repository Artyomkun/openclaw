#!/usr/bin/env node
import { newCodexTranslator, GlossaryEntry } from './translator.ts';
import { loadTranslationMemory } from './tm.ts';
import { processFile } from './process.ts';

export async function translateDocs(
    docsRoot: string,
    srcLang: string,
    tgtLang: string,
    files: string[],
    glossary: GlossaryEntry[] = [],
    thinking: string = 'high'
): Promise<void> {
    const translator = await newCodexTranslator(srcLang, tgtLang, glossary, thinking);
    const tm = await loadTranslationMemory({
        user: 'openclaw',
        password: process.env.ORACLE_PASSWORD,
        connectionString: 'localhost:1521/XEPDB1',
    });

    const results: { file: string; output: string }[] = [];

    for (const file of files) {
        try {
            const { outputPath } = await processFile(
                translator,
                tm,
                docsRoot,
                file,
                srcLang,
                tgtLang
            );
            results.push({ file, output: outputPath });
        } catch (err) {
            console.error(`Failed to translate ${file}:`, err);
        }
    }
    for (const r of results) {
        console.log(`  ${r.file} → ${r.output}`);
    }
}