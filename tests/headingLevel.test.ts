import type { Editor, EditorSelection } from "obsidian";
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

function fakeEditor(lines: string[], selections: EditorSelection[]): Editor {
	return {
		getLine: (line: number) => lines[line],
		setLine: (line: number, text: string) => {
			lines[line] = text;
		},
		listSelections: () => selections,
	} as unknown as Editor;
}

function caret(line: number, ch = 0): EditorSelection {
	return { anchor: { line, ch }, head: { line, ch } };
}

describe("applyHeadingLevelToEditor", () => {
	it("applies to the cursor's line when nothing is selected", () => {
		const lines = ["Para one", "Para two", "Para three"];
		const editor = fakeEditor(lines, [caret(1)]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["Para one", "###### Para two", "Para three"]);
	});

	it("applies to every line spanned by a selection", () => {
		const lines = ["Para one", "Para two", "Para three"];
		const editor = fakeEditor(lines, [{ anchor: { line: 0, ch: 0 }, head: { line: 2, ch: 3 } }]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["###### Para one", "###### Para two", "###### Para three"]);
	});

	it("applies to each line touched by multiple cursors/selections", () => {
		const lines = ["Para one", "Para two", "Para three", "Para four"];
		const editor = fakeEditor(lines, [caret(0), { anchor: { line: 2, ch: 0 }, head: { line: 3, ch: 0 } }]);
		applyHeadingLevelToEditor(editor, "increase");
		expect(lines).toEqual(["###### Para one", "Para two", "###### Para three", "###### Para four"]);
	});
});
