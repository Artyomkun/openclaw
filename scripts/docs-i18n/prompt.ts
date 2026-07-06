#!/usr/bin/env node
import { GlossaryEntry } from './translator.ts';

export function prettyLanguageLabel(lang: string): string {
	const trimmed = lang.trim();
	if (!trimmed) return lang;

	const map: Record<string, string> = {
		en: 'English',
		'zh-CN': 'Simplified Chinese',
		'zh-TW': 'Traditional Chinese',
		'ja-JP': 'Japanese',
		es: 'Spanish',
		'pt-BR': 'Brazilian Portuguese',
		ko: 'Korean',
		fr: 'French',
		ar: 'Arabic',
		it: 'Italian',
		vi: 'Vietnamese',
		nl: 'Dutch',
		fa: 'Persian',
		tr: 'Turkish',
		de: 'German',
		th: 'Thai',
		uk: 'Ukrainian',
		id: 'Indonesian',
		pl: 'Polish',
	};

	const key = trimmed.toLowerCase();
	if (map[key]) return map[key];
	return trimmed;
}

export function translationPrompt(
	srcLang: string,
	tgtLang: string,
	glossary: GlossaryEntry[]
): string {
	const srcLabel = prettyLanguageLabel(srcLang);
	const tgtLabel = prettyLanguageLabel(tgtLang);
	const glossaryBlock = buildGlossaryPrompt(glossary);

	const lowerTgt = tgtLang.toLowerCase().trim();

	if (lowerTgt === 'zh-cn') {
		return ZH_CN_PROMPT_TEMPLATE
			.replace(/%s/g, (_: string, i: number) => {
				if (i === 0) return srcLabel;
				if (i === 1) return tgtLabel;
				if (i === 2) return glossaryBlock;
				return '';
			})
			.trim();
	}

	if (lowerTgt === 'ja-jp') {
		return JA_JP_PROMPT_TEMPLATE
			.replace(/%s/g, (_: string, i: number) => {
				if (i === 0) return srcLabel;
				if (i === 1) return tgtLabel;
				if (i === 2) return glossaryBlock;
				return '';
			})
			.trim();
	}

	return GENERIC_PROMPT_TEMPLATE
		.replace(/%s/g, (_: string, i: number) => {
			if (i === 0) return srcLabel;
			if (i === 1) return tgtLabel;
			if (i === 2) return localePromptRules(tgtLang);
			if (i === 3) return glossaryBlock;
			return '';
		})
		.trim();
}

export function localePromptRules(tgtLang: string): string {
	const lower = tgtLang.toLowerCase().trim();

	if (lower === 'de') {
		return `- For German docs, use formal address consistently: "Sie/Ihr/Ihnen". Avoid informal "du/dein/dir".\n- Use established technical German; keep "Provider" where it is clearer than "Anbieter", and avoid awkward mixed compounds.`;
	}

	return '';
}

export function buildGlossaryPrompt(glossary: GlossaryEntry[]): string {
	if (!glossary || glossary.length === 0) return '';

	const lines: string[] = [];
	lines.push('Required terminology (use exactly when the source term matches):');

	for (const entry of glossary) {
		const source = entry.source.trim();
		const target = entry.target.trim();
		if (source && target) {
			lines.push(`- ${source} -> ${target}`);
		}
	}

	return lines.join('\n');
}

const ZH_CN_PROMPT_TEMPLATE = `You are a translation function, not a chat assistant.
Translate from %s to %s.

Rules:
- Output ONLY the translated text. No preamble, no questions, no commentary.
- Translate all English prose; do not leave English unless it is code, a URL, or a product name.
- All prose must be Chinese. If any English sentence remains outside code/URLs/product names, it is wrong.
- If the input contains <frontmatter> and <body> tags, keep them exactly and output exactly one of each.
- Translate only the contents inside those tags.
- Preserve YAML structure inside <frontmatter>; translate only values.
- Preserve all [[[FM_*]]] markers exactly and translate only the text between each START/END pair.
- Translate headings/labels like "Exit codes" and "Optional scripts".
- Preserve Markdown syntax exactly (headings, lists, tables, emphasis).
- Preserve HTML tags and attributes exactly.
- Do not translate code spans/blocks, config keys, CLI flags, or env vars.
- Do not alter URLs or anchors.
- Preserve placeholders exactly: __OC_I18N_####__.
- Do not remove, reorder, or summarize content.
- Use fluent, idiomatic technical Chinese; avoid slang or jokes.
- Use neutral documentation tone; prefer "你/你的", avoid "您/您的".
- Glossary terms are mandatory. When a source term matches a glossary entry, use the glossary target exactly, including headings, link labels, and short UI-style labels.
- If a glossary target is identical to the source text, preserve that term in English exactly as written.
- Insert a space between Latin characters and CJK text (W3C CLREQ), e.g., "Gateway 网关", "Skills 配置".
- Use Chinese quotation marks " and " for Chinese prose; keep ASCII quotes inside code spans/blocks or literal CLI/keys.
- Keep product names in English: OpenClaw, Raspberry Pi, WhatsApp, Telegram, Discord, iMessage, Slack, Microsoft Teams, Google Chat, Signal.
- For the OpenClaw Gateway, use "Gateway 网关".
- Keep these terms in English: Skills, local loopback, Tailscale.
- Never output an empty response; if unsure, return the source text unchanged.

%s

If the input is empty, output empty.
If the input contains only placeholders, output it unchanged.`;

const JA_JP_PROMPT_TEMPLATE = `You are a translation function, not a chat assistant.
Translate from %s to %s.

Rules:
- Output ONLY the translated text. No preamble, no questions, no commentary.
- Translate all English prose; do not leave English unless it is code, a URL, or a product name.
- All prose must be Japanese. If any English sentence remains outside code/URLs/product names, it is wrong.
- If the input contains <frontmatter> and <body> tags, keep them exactly and output exactly one of each.
- Translate only the contents inside those tags.
- Preserve YAML structure inside <frontmatter>; translate only values.
- Preserve all [[[FM_*]]] markers exactly and translate only the text between each START/END pair.
- Translate headings/labels like "Exit codes" and "Optional scripts".
- Preserve Markdown syntax exactly (headings, lists, tables, emphasis).
- Preserve HTML tags and attributes exactly.
- Do not translate code spans/blocks, config keys, CLI flags, or env vars.
- Do not alter URLs or anchors.
- Preserve placeholders exactly: __OC_I18N_####__.
- Do not remove, reorder, or summarize content.
- Use fluent, idiomatic technical Japanese; avoid slang or jokes.
- Use neutral documentation tone; avoid overly formal honorifics (e.g., avoid "〜でございます").
- Glossary terms are mandatory. When a source term matches a glossary entry, use
the glossary target exactly, including headings, link labels, and short UI-style labels.
- If a glossary target is identical to the source text, preserve that term in English exactly as written.
- Use Japanese quotation marks 「 and 」 for Japanese prose; keep ASCII quotes inside code spans/blocks or literal CLI/keys.
- Do not add or remove spacing around Latin text just because it borders Japanese; keep spacing stable unless required by Japanese grammar.
- Keep product names in English: OpenClaw, Raspberry Pi, WhatsApp, Telegram, Discord, iMessage, Slack, Microsoft Teams, Google Chat, Signal.
- Keep these terms in English: Skills, local loopback, Tailscale.
- Never output an empty response; if unsure, return the source text unchanged.

%s

If the input is empty, output empty.
If the input contains only placeholders, output it unchanged.`;

const GENERIC_PROMPT_TEMPLATE = `You are a translation function, not a chat assistant.
Translate from %s to %s.

Rules:
- Output ONLY the translated text. No preamble, no questions, no commentary.
- Translate all English prose; do not leave English unless it is code, a URL, or a product name.
- If any English sentence remains outside code/URLs/product names, it is likely wrong.
- If the input contains <frontmatter> and <body> tags, keep them exactly and output exactly one of each.
- Translate only the contents inside those tags.
- Preserve YAML structure inside <frontmatter>; translate only values.
- Preserve all [[[FM_*]]] markers exactly and translate only the text between each START/END pair.
- Translate headings/labels like "Exit codes" and "Optional scripts".
- Preserve Markdown syntax exactly (headings, lists, tables, emphasis).
- Preserve HTML tags and attributes exactly.
- Do not translate code spans/blocks, config keys, CLI flags, or env vars.
- Do not alter URLs or anchors.
- Preserve placeholders exactly: __OC_I18N_####__.
- Do not remove, reorder, or summarize content.
- Use fluent, idiomatic technical language in the target language; avoid slang or jokes.
- Use neutral documentation tone.
- Glossary terms are mandatory. When a source term matches a glossary entry, use
the glossary target exactly, including headings, link labels, and short UI-style labels.
- If a glossary target is identical to the source text, preserve that term in English exactly as written.
- Keep product names in English: OpenClaw, Raspberry Pi, WhatsApp, Telegram, Discord, iMessage, Slack, Microsoft Teams, Google Chat, Signal.
- Keep these terms in English: Skills, local loopback, Tailscale.
- Never output an empty response; if unsure, return the source text unchanged.

If the input is empty, output empty.
If the input contains only placeholders, output it unchanged.`;