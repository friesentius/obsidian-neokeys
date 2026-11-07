import type { Editor, EditorChange, EditorSelection } from "obsidian";
import { applyHeadingLevel, applyHeadingLevelToEditor, nextHeadingLevel } from "../src/headingLevel";

describe("nextHeadingLevel", () => {
	it("increases plain text to H6, the smallest heading", () => {
		expect(nextHeadingLevel(null, "increase")).toBe(6);
	});

	it("increases toward H1 by decrementing the level", () => {
		expect(nextHeadingLevel(6, "increase")).toBe(5);
		expect(nextHeadingLevel(3, "increase")).toBe(2);
		expect(nextHeadingLevel(2, "increase")).toBe(1);
	});

	it("is a no-op increasing past H1", () => {
		expect(nextHeadingLevel(1, "increase")).toBe(1);
	});

	it("decreases toward plain text by incrementing the level", () => {
		expect(nextHeadingLevel(1, "decrease")).toBe(2);
		expect(nextHeadingLevel(5, "decrease")).toBe(6);
	});

	it("decreases H6 to plain text", () => {
		expect(nextHeadingLevel(6, "decrease")).toBeNull();
	});

	it("is a no-op decreasing past plain text", () => {
		expect(nextHeadingLevel(null, "decrease")).toBeNull();
	});
});

describe("applyHeadingLevel", () => {
	it("promotes plain text to H6 on increase", () => {
		expect(applyHeadingLevel("Just a line", "increase")).toBe("###### Just a line");
	});

	it("promotes H3 to H2 on increase", () => {
		expect(applyHeadingLevel("### Title", "increase")).toBe("## Title");
	});

	it("leaves H1 unchanged on increase", () => {
		expect(applyHeadingLevel("# Title", "increase")).toBe("# Title");
	});

	it("demotes H2 to H3 on decrease", () => {
		expect(applyHeadingLevel("## Title", "decrease")).toBe("### Title");
	});

	it("demotes H6 to plain text on decrease", () => {
		expect(applyHeadingLevel("###### Title", "decrease")).toBe("Title");
	});

	it("leaves plain text unchanged on decrease", () => {
		expect(applyHeadingLevel("Just a line", "decrease")).toBe("Just a line");
	});

	it("preserves an empty heading with no content", () => {
		expect(applyHeadingLevel("###", "increase")).toBe("##");
		expect(applyHeadingLevel("###", "decrease")).toBe("####");
	});

	it("promotes an empty line to an empty H6 heading on increase", () => {
		expect(applyHeadingLevel("", "increase")).toBe("######");
	});

	it("treats 7 or more leading '#' characters as plain text, per CommonMark", () => {
		expect(applyHeadingLevel("####### Title", "increase")).toBe("###### ####### Title");
	});

	it("treats a '#' run with no following space as plain text", () => {
		expect(applyHeadingLevel("##NotAHeading", "increase")).toBe("###### ##NotAHeading");
	});
});

/**
 * Applies transaction changes the same way CodeMirror would: only the `from`-`to` range of each
 * line is replaced, so a test can assert that content outside that range (where a cursor or
 * selection might sit) is never touched.
 */
function fakeEditor(lines: string[], selections: EditorSelection[]) {
	const transactionCalls: EditorChange[][] = [];
	const editor = {
		getLine: (line: number) => lines[line],
		listSelections: () => selections,
		transaction: (tx: { changes?: EditorChange[] }) => {
			const changes = tx.changes ?? [];
			transactionCalls.push(changes);
			for (const change of changes) {
				const line = change.from.line;
				const text = lines[line];
				const toCh = change.to?.ch ?? change.from.ch;
				lines[line] = text.slice(0, change.from.ch) + change.text + text.slice(toCh);
			}
		},
	} as unknown as Editor;
	return { editor, transactionCalls };
}

function caret(line: number, ch = 0): EditorSelection {
	return { anchor: { line, ch }, head: { line, ch } };
}

describe("applyHeadingLevelToEditor", () => {
	it("applies to the cursor's line when nothing is selected", () => {
		const lines = ["Para one", "Para two", "Para three"];
		const { editor } = fakeEditor(lines, [caret(1)]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["Para one", "###### Para two", "Para three"]);
	});

	it("applies to every line spanned by a selection", () => {
		const lines = ["Para one", "Para two", "Para three"];
		const { editor } = fakeEditor(lines, [{ anchor: { line: 0, ch: 0 }, head: { line: 2, ch: 3 } }]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["###### Para one", "###### Para two", "###### Para three"]);
	});

	it("applies to each line touched by multiple cursors/selections", () => {
		const lines = ["Para one", "Para two", "Para three", "Para four"];
		const { editor } = fakeEditor(lines, [caret(0), { anchor: { line: 2, ch: 0 }, head: { line: 3, ch: 4 } }]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["###### Para one", "Para two", "###### Para three", "###### Para four"]);
	});

	it("skips the last line of a multi-line selection that ends at its column 0", () => {
		const lines = ["Para one", "Para two", "Para three"];
		const { editor } = fakeEditor(lines, [{ anchor: { line: 0, ch: 0 }, head: { line: 2, ch: 0 } }]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["###### Para one", "###### Para two", "Para three"]);
	});

	it("skips a column-0 trailing line for a backward selection too", () => {
		const lines = ["Para one", "Para two", "Para three"];
		const { editor } = fakeEditor(lines, [{ anchor: { line: 2, ch: 0 }, head: { line: 0, ch: 3 } }]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["###### Para one", "###### Para two", "Para three"]);
	});

	it("still applies to a caret at column 0", () => {
		const lines = ["Para one", "Para two"];
		const { editor } = fakeEditor(lines, [caret(1, 0)]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["Para one", "###### Para two"]);
	});

	it("applies every changed line in a single transaction, for one undo step", () => {
		const lines = ["Para one", "Para two", "Para three"];
		const { editor, transactionCalls } = fakeEditor(lines, [{ anchor: { line: 0, ch: 0 }, head: { line: 2, ch: 4 } }]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(transactionCalls.length).toBe(1);
		expect(transactionCalls[0].length).toBe(3);
	});

	it("does not call transaction when increasing a line already at H1 (no-op)", () => {
		const lines = ["# Title"];
		const { editor, transactionCalls } = fakeEditor(lines, [caret(0)]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(transactionCalls.length).toBe(0);
		expect(lines).toEqual(["# Title"]);
	});

	it("does not call transaction when decreasing plain text (no-op)", () => {
		const lines = ["Just a line"];
		const { editor, transactionCalls } = fakeEditor(lines, [caret(0)]);
		applyHeadingLevelToEditor(editor, "decrease");
		expect(transactionCalls.length).toBe(0);
		expect(lines).toEqual(["Just a line"]);
	});

	it("only edits the heading marker, leaving a cursor positioned in the content unaffected", () => {
		// Promoting plain text to H6 only inserts at ch 0; a cursor at ch 10 (inside "way home.")
		// sits outside the edited range and is therefore never remapped to column 0.
		const lines = ["Pick up milk, bread, and coffee on the way home."];
		const { editor, transactionCalls } = fakeEditor(lines, [caret(0, 10)]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(transactionCalls[0]).toEqual([
			{ from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 }, text: "###### " },
		]);
		expect(lines).toEqual(["###### Pick up milk, bread, and coffee on the way home."]);
	});

	it("shrinks the edit range to just the old heading marker when demoting H6 to plain text", () => {
		const lines = ["###### Title"];
		const { editor, transactionCalls } = fakeEditor(lines, [caret(0, 10)]);
		applyHeadingLevelToEditor(editor, "decrease");
		expect(transactionCalls[0]).toEqual([{ from: { line: 0, ch: 0 }, to: { line: 0, ch: 7 }, text: "" }]);
		expect(lines).toEqual(["Title"]);
	});
});
