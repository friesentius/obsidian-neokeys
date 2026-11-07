import { findHotkeyConflicts, hotkeyToParsedKey } from "../src/hotkeyConflict";
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

describe("hotkeyToParsedKey", () => {
	it("matches a real logged Obsidian hotkey for an unshifted Ctrl+B binding", () => {
		// Obsidian's own hotkeys.json stores a bare letter's `key` uppercase even without Shift
		// held (confirmed against a real recorded "Neokeys: Leader" binding in the Phase 1 e2e
		// logs: {"modifiers":["Mod"],"key":"B"} for a plain Ctrl+B press on Linux).
		const parsed = hotkeyToParsedKey({ modifiers: ["Mod"], key: "B" }, false);
		expect(parsed).toEqual(parseKeyString("c-b"));
	});

	it("maps Mod to Cmd on macOS and to Ctrl elsewhere", () => {
		expect(hotkeyToParsedKey({ modifiers: ["Mod"], key: "j" }, true)).toEqual(parseKeyString("m-j"));
		expect(hotkeyToParsedKey({ modifiers: ["Mod"], key: "j" }, false)).toEqual(parseKeyString("c-j"));
	});

	it("uppercases a letter only when Shift is an explicit modifier", () => {
		expect(hotkeyToParsedKey({ modifiers: ["Mod", "Shift"], key: "b" }, false)).toEqual(parseKeyString("cs-b"));
	});

	it("keeps Shift on a caseless character so Ctrl+Shift+1 stays distinct from Ctrl+1", () => {
		const shifted = hotkeyToParsedKey({ modifiers: ["Mod", "Shift"], key: "1" }, false);
		const plain = hotkeyToParsedKey({ modifiers: ["Mod"], key: "1" }, false);
		expect(shifted).toEqual({ key: "1", ctrl: true, shift: true, alt: false, meta: false });
		expect(plain).toEqual(parseKeyString("c-1"));
		expect(findHotkeyConflicts(shifted, [{ id: "workspace:goto-tab-1", name: "Go to tab #1", key: plain }])).toEqual(
			[],
		);
		expect(findHotkeyConflicts(plain, [{ id: "other:cmd", name: "Other", key: shifted }])).toEqual([]);
		expect(findHotkeyConflicts(shifted, [{ id: "other:cmd", name: "Other", key: shifted }])).toEqual([
			{ id: "other:cmd", name: "Other" },
		]);
	});

	it("lowercases a multi-character key name regardless of case", () => {
		expect(hotkeyToParsedKey({ modifiers: ["Mod"], key: "Enter" }, false)).toEqual(parseKeyString("c-enter"));
	});

	it("round-trips through findHotkeyConflicts against a real-shaped binding", () => {
		const leaderKey = parseKeyString("c-b");
		const conflicts = findHotkeyConflicts(leaderKey, [
			{ id: "editor:toggle-bold", name: "Toggle bold", key: hotkeyToParsedKey({ modifiers: ["Mod"], key: "B" }, false) },
		]);
		expect(conflicts).toEqual([{ id: "editor:toggle-bold", name: "Toggle bold" }]);
	});
});
