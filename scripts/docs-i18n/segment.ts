#!/usr/bin/env node
export interface Segment {
	start: number;
	stop: number;
	text: string;
	textHash: string;
	segmentId: string;
	translated: string;
	cacheKey: string;
}

export function createSegment(
	start: number,
	stop: number,
	text: string,
	textHash: string,
	segmentId: string,
	cacheKey: string
): Segment {
	return {
		start,
		stop,
		text,
		textHash,
		segmentId,
		translated: '',
		cacheKey,
	};
}

export function isSegmentEmpty(segment: Segment): boolean {
	return !segment.text || segment.text.trim().length === 0;
}

export function isSegmentTranslated(segment: Segment): boolean {
	return !!segment.translated && segment.translated.trim().length > 0;
}