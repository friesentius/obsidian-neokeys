import { parseKeymapSource } from "../src/keymap";
import { serializeKeymap } from "../src/keymapSerialize";
import { DEFAULT_KEYMAP_YAML } from "../src/sampleKeymap";

function roundTrip(source: string) {
	const root = parseKeymapSource(source);
	const serialized = serializeKeymap(root);
	const reparsed = parseKeymapSource(serialized);
	return { root, serialized, reparsed };
}

describe("serializeKeymap", () => {
	it("round-trips the bundled default keymap", () => {
		const { root, reparsed } = roundTrip(DEFAULT_KEYMAP_YAML);
		expect(reparsed).toEqual(root);
	});

	it("round-trips awkward key strings exactly", () => {
		const source = `
items:
  "?":
    command: a
  "-":
    command: b
  "c--":
    command: c
  space:
    command: d
  "1":
    command: e
  "true":
    command: f
  "null":
    command: g
  c-enter:
    command: h
`;
		const { root, reparsed } = roundTrip(source);
		expect(reparsed).toEqual(root);
		expect(reparsed.entries.map((e) => e.rawKey)).toEqual(root.entries.map((e) => e.rawKey));
	});

	it("preserves item order, including numeric-looking keys ahead of letter keys", () => {
		const source = `
items:
  a:
    command: x
  "1":
    command: y
  b:
    command: z
`;
		const { serialized, reparsed } = roundTrip(source);
		expect(reparsed.entries.map((e) => e.rawKey)).toEqual(["a", "1", "b"]);
		expect(serialized.indexOf('"1"')).toBeGreaterThan(serialized.indexOf("a:"));
	});

	it("preserves group title and description", () => {
		const source = `
title: Root
description: Root menu
items:
  f:
    title: File
    description: File things
    items: {}
`;
		const { root, reparsed } = roundTrip(source);
		expect(reparsed).toEqual(root);
	});

	it("writes an explicit mapping, not the command shorthand", () => {
		const root = parseKeymapSource("items:\n  n: file-explorer:new-file New file\n");
		const serialized = serializeKeymap(root);
		expect(serialized).toContain("command: file-explorer:new-file");
		expect(serialized).toContain("description: New file");
	});

	it("round-trips a file node", () => {
		const { root, reparsed } = roundTrip("items:\n  o:\n    file: Inbox/Today\n    description: Today's note\n");
		expect(reparsed).toEqual(root);
	});

	it("round-trips an empty items map", () => {
		const { root, reparsed } = roundTrip("items: {}\n");
		expect(reparsed).toEqual(root);
	});
});
