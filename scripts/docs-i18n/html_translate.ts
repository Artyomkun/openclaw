#!/usr/bin/env node
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { CodexTranslator } from './translator.ts';

interface HTMLReplacement {
	start: number;
	stop: number;
	value: string;
}

export async function translateHTMLBlocks(
	translator: CodexTranslator,
	body: string,
	srcLang: string,
	tgtLang: string
): Promise<string> {
	const source = body;
	const replacements: HTMLReplacement[] = [];
	const ast = unified().use(remarkParse).parse(source);
	visit(ast, (node: any) => {
		if (node.type === 'html') {
			const value = node.value as string;
			if (!node.position) return;

			const start = node.position.start.offset!;
			const stop = node.position.end.offset!;

			replacements.push({
				start,
				stop,
				value,
			});
		}
	});

	if (replacements.length === 0) {
		return body;
	}
	for (const rep of replacements) {
		const translated = await translateHTMLBlock(translator, rep.value, srcLang, tgtLang);
		rep.value = translated;
	}
	return applyHTMLReplacements(body, replacements);
}

async function translateHTMLBlock(
	translator: CodexTranslator,
	htmlText: string,
	srcLang: string,
	tgtLang: string
): Promise<string> {
	const parser = new DOMParser();
	const doc = parser.parseFromString(htmlText, 'text/html');
	const walker = document.createTreeWalker(
		doc.body,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode(node) {
				if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
				let parent = node.parentNode;
				while (parent) {
					if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(parent.nodeName)) {
						return NodeFilter.FILTER_REJECT;
					}
					parent = parent.parentNode;
				}
				return NodeFilter.FILTER_ACCEPT;
			}
		}
	);

	const nodes: Text[] = [];
	let currentNode = walker.nextNode();
	while (currentNode) {
		nodes.push(currentNode as Text);
		currentNode = walker.nextNode();
	}
	for (const node of nodes) {
		const text = node.textContent || '';
		if (!text.trim()) continue;

		const translated = await translator.translate(
			new AbortController(),
			text,
			srcLang,
			tgtLang
		);
		node.textContent = translated;
	}

	return doc.body.innerHTML;
}

function applyHTMLReplacements(body: string, replacements: HTMLReplacement[]): string {
	if (replacements.length === 0) return body;
	replacements.sort((a, b) => a.start - b.start);

	let result = '';
	let last = 0;

	for (const rep of replacements) {
		if (rep.start < last) continue;
		result += body.slice(last, rep.start);
		result += rep.value;
		last = rep.stop;
	}

	result += body.slice(last);
	return result;
}