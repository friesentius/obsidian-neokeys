import type { Editor } from "obsidian";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingDirection = "increase" | "decrease";

/**
 * Matches an ATX heading: 1-6 `#` characters at the start of the line, followed by either a space
 * (and the rest of the line as content) or end of line (an empty heading). A 7th `#`, or any other
 * character immediately after the hashes, fails to match and is treated as plain text, matching
 * CommonMark's ATX heading rule.
 */
const HEADING_PATTERN = /^(#{1,6})(?: (.*)|())$/;

function parseHeadingLine(line: string): { level: HeadingLevel; content: string } | null {
	const match = HEADING_PATTERN.exec(line);
	if (!match) return null;
	return { level: match[1].length as HeadingLevel, content: match[2] ?? "" };
}

/**
 * The next heading level in the "increase" (bigger heading, toward H1) or "decrease" (smaller
 * heading, toward plain text) direction. `null` means plain text (no heading).
 *
 * The two ends are clamped rather than wrapping or cycling:
 * - Increasing plain text lands on H6 (the smallest heading) first; increasing H1 is a no-op,
 *   since H1 is already the biggest heading.
 * - Decreasing H6 removes the heading (back to plain text); decreasing plain text is a no-op,
 *   since there's nothing smaller than no heading.
 *
 * This makes plain-text/H6/H5/.../H1 one continuous ladder in both directions.
 */
export function nextHeadingLevel(current: HeadingLevel | null, direction: HeadingDirection): HeadingLevel | null {
	if (direction === "increase") {
		if (current === null) return 6;
		if (current === 1) return 1;
		return (current - 1) as HeadingLevel;
	}
	if (current === null) return null;
	if (current === 6) return null;
	return (current + 1) as HeadingLevel;
}

/** Apply {@link nextHeadingLevel} to one line of text, rewriting its heading marker (or adding/removing one). */
export function applyHeadingLevel(line: string, direction: HeadingDirection): string {
	const parsed = parseHeadingLine(line);
	const currentLevel = parsed?.level ?? null;
	const content = parsed?.content ?? line;
	const next = nextHeadingLevel(currentLevel, direction);
	if (next === null) {
		return content;
	}
	return content.length > 0 ? `${"#".repeat(next)} ${content}` : "#".repeat(next);
}

/** Every line touched by at least one selection (zero-width selections count their caret's line). */
function affectedLines(editor: Editor): number[] {
	const lines = new Set<number>();
	for (const selection of editor.listSelections()) {
		const start = Math.min(selection.anchor.line, selection.head.line);
		const end = Math.max(selection.anchor.line, selection.head.line);
		for (let line = start; line <= end; line++) lines.add(line);
	}
	return [...lines].sort((a, b) => a - b);
}

/** Apply {@link applyHeadingLevel} to every selected line, or the cursor's line when nothing is selected. */
export function applyHeadingLevelToEditor(editor: Editor, direction: HeadingDirection): void {
	for (const line of affectedLines(editor)) {
		editor.setLine(line, applyHeadingLevel(editor.getLine(line), direction));
	}
}
