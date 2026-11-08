import type { Editor, EditorChange } from "obsidian";

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
 * The next heading level in the "increase" (none -> H1 -> H2 -> ... -> H6 -> none) or "decrease"
 * (none -> H6 -> H5 -> ... -> H1 -> none) direction. `null` means plain text (no heading). Both
 * directions wrap around the full none/H1/.../H6 cycle rather than clamping at either end.
 */
export function nextHeadingLevel(current: HeadingLevel | null, direction: HeadingDirection): HeadingLevel | null {
	const step = direction === "increase" ? 1 : -1;
	const next = (((current ?? 0) + step) + 7) % 7;
	return next === 0 ? null : (next as HeadingLevel);
}

function headingPrefix(level: HeadingLevel | null, hasContent: boolean): string {
	if (level === null) return "";
	return hasContent ? `${"#".repeat(level)} ` : "#".repeat(level);
}

/** Apply {@link nextHeadingLevel} to one line of text, rewriting its heading marker (or adding/removing one). */
export function applyHeadingLevel(line: string, direction: HeadingDirection): string {
	const parsed = parseHeadingLine(line);
	const currentLevel = parsed?.level ?? null;
	const content = parsed?.content ?? line;
	const next = nextHeadingLevel(currentLevel, direction);
	return headingPrefix(next, content.length > 0) + content;
}

/**
 * The edit needed to apply {@link applyHeadingLevel} to one line, scoped to just the heading
 * marker (not the whole line): this keeps the cursor and any selection within the line's content
 * exactly where they were, instead of CodeMirror collapsing them to the start of a whole-line
 * replacement. Returns null when the resulting prefix is unchanged, so an unaffected line is
 * never touched.
 */
function headingLineChange(line: number, text: string, direction: HeadingDirection): EditorChange | null {
	const parsed = parseHeadingLine(text);
	const currentLevel = parsed?.level ?? null;
	const content = parsed?.content ?? text;
	const oldPrefixLen = text.length - content.length;
	const next = nextHeadingLevel(currentLevel, direction);
	const newPrefix = headingPrefix(next, content.length > 0);
	if (newPrefix === text.slice(0, oldPrefixLen)) return null;
	return { from: { line, ch: 0 }, to: { line, ch: oldPrefixLen }, text: newPrefix };
}

/**
 * Every line touched by at least one selection (zero-width selections count their caret's line).
 * A multi-line selection that ends at column 0 of its last line selects none of that line's text,
 * so that line is left out, matching Obsidian's other line-oriented commands.
 */
function affectedLines(editor: Editor): number[] {
	const lines = new Set<number>();
	for (const { anchor, head } of editor.listSelections()) {
		const [from, to] = anchor.line <= head.line ? [anchor, head] : [head, anchor];
		const end = to.line > from.line && to.ch === 0 ? to.line - 1 : to.line;
		for (let line = from.line; line <= end; line++) lines.add(line);
	}
	return [...lines].sort((a, b) => a - b);
}

/**
 * Apply {@link applyHeadingLevel} to every selected line, or the cursor's line when nothing is
 * selected, as a single transaction so one undo reverts every line, and cursor/selection positions
 * within each line's content are preserved rather than collapsing to column 0.
 */
export function applyHeadingLevelToEditor(editor: Editor, direction: HeadingDirection): void {
	const changes = affectedLines(editor)
		.map((line) => headingLineChange(line, editor.getLine(line), direction))
		.filter((change): change is EditorChange => change !== null);
	if (changes.length > 0) editor.transaction({ changes });
}
