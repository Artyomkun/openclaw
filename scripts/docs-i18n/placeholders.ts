#!/usr/bin/env node
export interface PlaceholderState {
	counter: number;
	used: Set<string>;
	next(): string;
}

export function createPlaceholderState(text: string): PlaceholderState {
	const counter = 900000;
	const used = new Set<string>();

	const placeholderRe = /__OC_I18N_\d+__/g;
	const matches = text.match(placeholderRe);
	if (matches) {
		for (const match of matches) {
			used.add(match);
		}
	}

	return {
		counter,
		used,
		next(): string {
			while (true) {
				const candidate = `__OC_I18N_${this.counter}__`;
				this.counter++;
				if (this.used.has(candidate)) {
				continue;
				}
				this.used.add(candidate);
				return candidate;
			}
		}
	};
}