/**
 * A text step's placeholders, kept small and literal (nothing here evaluates an expression):
 * - `{{selection}}`: the selected text, empty when nothing is selected;
 * - `{{cursor}}`: where the cursor ends up (the first one counts; without one it ends after the text);
 * - `{{date}}` / `{{date:FORMAT}}`: the current date and time in a moment.js format (YYYY-MM-DD by default).
 * Anything else in double braces is inserted as written.
 */

export interface TextContext {
	selection: string;
	/** Today's date and time in a moment.js format; the host passes Obsidian's bundled moment. */
	formatDate(format: string): string;
}

export interface ExpandedText {
	text: string;
	/** Where the cursor goes, as an offset into `text`. */
	cursor: number;
}

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

const PLACEHOLDER = /\{\{(selection|cursor|date)(?::([^{}]*))?\}\}/g;

export function expandText(template: string, context: TextContext): ExpandedText {
	let text = "";
	let cursor: number | null = null;
	let last = 0;
	for (const match of template.matchAll(PLACEHOLDER)) {
		const [whole, name, arg] = match;
		const at = match.index;
		// `{{selection:x}}` and `{{cursor:x}}` are not placeholders: leave them as written.
		if (name !== "date" && arg !== undefined) continue;
		text += template.slice(last, at);
		last = at + whole.length;
		if (name === "selection") text += context.selection;
		else if (name === "cursor") cursor ??= text.length;
		else text += context.formatDate(arg === undefined || arg.trim() === "" ? DEFAULT_DATE_FORMAT : arg);
	}
	text += template.slice(last);
	return { text, cursor: cursor ?? text.length };
}

export interface LinePosition {
	line: number;
	ch: number;
}

/** Where the cursor stands after `inserted` is typed at `from`, counted from the text itself (the editor's own offsets are stale until the change lands). */
export function positionAfter(from: LinePosition, inserted: string): LinePosition {
	const lines = inserted.split("\n");
	if (lines.length === 1) return { line: from.line, ch: from.ch + inserted.length };
	return { line: from.line + lines.length - 1, ch: lines[lines.length - 1].length };
}
