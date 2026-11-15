import { findInvalidCommands } from "../src/commandValidation";
import { parseKeymapSource } from "../src/keymap";

const SOURCE = `
title: Neokeys
items:
  f:
    title: File
    items:
      n:
        command: file-explorer:new-file
      o:
        command: nonexistent:open
  z:
    command: app:zoom
  w:
    title: Window
    items:
      q:
        command: also-missing:command
`;

describe("findInvalidCommands", () => {
	const root = parseKeymapSource(SOURCE);
	const known = new Set(["file-explorer:new-file", "app:zoom"]);
	const isKnown = (id: string): boolean => known.has(id);

	it("finds nothing when every command id is known", () => {
		const allKnown = (): boolean => true;
		expect(findInvalidCommands(root, allKnown)).toEqual([]);
	});

	it("collects invalid commands with their full key path, including nested groups", () => {
		const invalid = findInvalidCommands(root, isKnown);
		expect(invalid).toEqual([
			{ path: ["f", "o"], command: "nonexistent:open" },
			{ path: ["w", "q"], command: "also-missing:command" },
		]);
	});

	it("ignores file entries, which have no command id to validate", () => {
		const source = `
items:
  f:
    file: Inbox/Today
`;
		const fileRoot = parseKeymapSource(source);
		expect(findInvalidCommands(fileRoot, () => false)).toEqual([]);
	});

	it("names a keyless hop \"No key\" rather than its stored token", () => {
		const source = `
items:
  nokey1:
    icon: star
    items:
      nokey1:
        icon: zap
        command: missing:command
`;
		expect(findInvalidCommands(parseKeymapSource(source), () => false)).toEqual([
			{ path: ["No key", "No key"], command: "missing:command" },
		]);
	});
});
