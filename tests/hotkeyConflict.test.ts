import { findHotkeyConflicts } from "../src/hotkeyConflict";
import { parseKeyString } from "../src/keys";

describe("findHotkeyConflicts", () => {
	it("finds no conflicts when nothing matches", () => {
		const conflicts = findHotkeyConflicts(parseKeyString("c-j"), [
			{ id: "editor:bold", name: "Bold", key: parseKeyString("c-b") },
		]);
		expect(conflicts).toEqual([]);
	});

	it("reports a command bound to the same key combination", () => {
		const conflicts = findHotkeyConflicts(parseKeyString("c-b"), [
			{ id: "editor:bold", name: "Bold", key: parseKeyString("c-b") },
			{ id: "editor:italic", name: "Italic", key: parseKeyString("c-i") },
		]);
		expect(conflicts).toEqual([{ id: "editor:bold", name: "Bold" }]);
	});

	it("reports every command bound to the same key, not just the first", () => {
		const conflicts = findHotkeyConflicts(parseKeyString("c-j"), [
			{ id: "plugin-a:thing", name: "Thing A", key: parseKeyString("c-j") },
			{ id: "plugin-b:thing", name: "Thing B", key: parseKeyString("c-j") },
		]);
		expect(conflicts.map((c) => c.id).sort()).toEqual(["plugin-a:thing", "plugin-b:thing"]);
	});

	it("treats a shifted letter and its modifier-flag equivalent as the same key", () => {
		const conflicts = findHotkeyConflicts(parseKeyString("cs-b"), [
			{ id: "other:cmd", name: "Other", key: { key: "B", ctrl: true, shift: true, alt: false, meta: false } },
		]);
		expect(conflicts).toEqual([{ id: "other:cmd", name: "Other" }]);
	});
});
