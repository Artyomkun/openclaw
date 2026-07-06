#!/usr/bin/env node
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { hashText, segmentId } from './util.ts';

interface Segment {
	start: number;
	stop: number;
	text: string;
	textHash: string;
	segmentId: string;
	translated: string;
	cacheKey: string;
}

export function extractSegments(body: string, relPath: string): Segment[] {
	const source = body;
	const segments: Segment[] = [];
	let lastBlock: any = null;
	const ast = unified().use(remarkParse).parse(source);

	visit(ast, (node: any, parent: any) => {
		if (['code', 'html'].includes(node.type)) {
			return;
		}
		if (node.type === 'inlineCode') {
			return;
		}
		if (node.type === 'text') {
			const textValue = node.value as string;
			if (!textValue.trim()) return;
			if (!node.position) return;

			const start = node.position.start.offset!;
			const stop = node.position.end.offset!;
			const block = findBlockParent(parent);
			if (!block) return;
			if (segments.length > 0 && lastBlock === block) {
				const last = segments[segments.length - 1];
				const gap = source.slice(last.stop, start);
				if (!gap.trim()) {
				last.stop = stop;
				return;
				}
			}

			segments.push({
				start,
				stop,
				text: textValue,
				textHash: '',
				segmentId: '',
				translated: '',
				cacheKey: '',
			});
			lastBlock = block;
		}
	});
	const filtered: Segment[] = [];
	for (const seg of segments) {
		const textValue = source.slice(seg.start, seg.stop);
		const trimmed = textValue.trim();
		if (!trimmed) continue;

		const textHash = hashText(textValue);
		const segId = segmentId(relPath, textHash);

		filtered.push({
		start: seg.start,
		stop: seg.stop,
		text: textValue,
		textHash,
		segmentId: segId,
		translated: '',
		cacheKey: '',
		});
	}
	filtered.sort((a, b) => a.start - b.start);

	return filtered;
}

function findBlockParent(parent: any): any {
	let current = parent;
	while (current) {
		if (isTranslatableBlock(current)) {
		return current;
		}
		current = current.parent;
	}
	return null;
}


function isTranslatableBlock(node: any): boolean {
	const types = ['paragraph', 'heading', 'listItem', 'blockquote'];
	return types.includes(node?.type);
}

export function applyTranslations(body: string, segments: Segment[]): string {
	if (segments.length === 0) return body;

	let result = '';
	let last = 0;

	for (const seg of segments) {
		if (seg.start < last) continue;
		result += body.slice(last, seg.start);
		result += seg.translated || seg.text;
		last = seg.stop;
	}

	result += body.slice(last);
	return result;
}