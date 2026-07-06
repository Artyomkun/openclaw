#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';

export interface GlossaryEntry {
	source: string;
	target: string;
}

export async function loadGlossary(filepath: string): Promise<GlossaryEntry[]> {
	if (!existsSync(filepath)) {
		return [];
	}

	try {
		const data = await readFile(filepath, 'utf-8');
		const entries = JSON.parse(data) as GlossaryEntry[];
		if (!Array.isArray(entries)) {
			throw new Error('Glossary must be an array');
		}
		
		return entries;
	} catch (err) {
		throw new Error(`Glossary parse failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}


export function loadGlossarySync(filepath: string): GlossaryEntry[] {
	if (!existsSync(filepath)) {
		return [];
	}

	try {
		const data = readFileSync(filepath, 'utf-8');
		const entries = JSON.parse(data) as GlossaryEntry[];
		
		if (!Array.isArray(entries)) {
		throw new Error('Glossary must be an array');
		}
		
		return entries;
	} catch (err) {
		throw new Error(`Glossary parse failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}