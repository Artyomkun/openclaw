#!/usr/bin/env node
import { resolve, relative } from 'path';

interface OrderedFile {
	path: string;
	rel: string;
}

export function orderFiles(docsRoot: string, files: string[]): string[] {
	const entries: OrderedFile[] = [];
	for (const file of files) {
		const abs = resolve(file);
		let rel: string;
		try {
		rel = relative(docsRoot, abs);
		} catch {
		rel = abs;
		}
		entries.push({ path: file, rel });
	}

	if (entries.length === 0) {
		return [];
	}
	entries.sort((a, b) => a.rel.localeCompare(b.rel));
	return entries.map((entry) => entry.path);
}