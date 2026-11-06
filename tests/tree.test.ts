import { parseKeyString } from "../src/keys";
import { parseKeymapSource } from "../src/keymap";
import { entryLabel, findEntry, resolveSequence, sortEntries } from "../src/tree";

const SOURCE = `
title: Neokeys
items:
  f:
    title: File
    description: File operations
    items:
      n:
        command: file-explorer:new-file
        description: New file
      o:
        file: Inbox/Today
  z:
    command: app:zoom
  a:
    command: app:about
`;

describe("findEntry / resolveSequence", () => {
	const root = parseKeymapSource(SOURCE);

	it("finds a top-level entry by key", () => {
		const entry = findEntry(root, parseKeyString("f"));
		expect(entry?.node.kind).toBe("group");
	});

	it("returns undefined for an unmatched key", () => {
		expect(findEntry(root, parseKeyString("q"))).toBeUndefined();
	});

	it("resolves a multi-key sequence down to a command node", () => {
		const result = resolveSequence(root, [parseKeyString("f"), parseKeyString("n")]);
		expect(result).toEqual({ kind: "command", command: "file-explorer:new-file", description: "New file" });
	});

	it("resolves a multi-key sequence down to a file node", () => {
		const result = resolveSequence(root, [parseKeyString("f"), parseKeyString("o")]);
		expect(result).toEqual({ kind: "file", file: "Inbox/Today" });
	});

	it("resolves an empty sequence to the root group", () => {
		expect(resolveSequence(root, [])).toBe(root);
	});

	it("stops and returns undefined when a step in the sequence has no match", () => {
		expect(resolveSequence(root, [parseKeyString("f"), parseKeyString("q")])).toBeUndefined();
	});

	it("stops early once a command is reached, ignoring any further keys", () => {
		const result = resolveSequence(root, [parseKeyString("z"), parseKeyString("q")]);
		// the sequence above is built from already-parsed keys, so resolution
		// never reaches the second one: the walk stops at the command node.
		expect(result).toEqual({ kind: "command", command: "app:zoom" });
	});
});

describe("sortEntries", () => {
	it("orders groups first, then files, then commands, alphabetically within each tier", () => {
		const root = parseKeymapSource(SOURCE);
		const sorted = sortEntries(root);
		expect(sorted.map((e) => e.rawKey)).toEqual(["f", "a", "z"]);
	});
});

describe("entryLabel", () => {
	it("prefers a group's title, then description, then the raw key", () => {
		const root = parseKeymapSource(SOURCE);
		const f = findEntry(root, parseKeyString("f"))!;
		expect(entryLabel(f)).toBe("File");
	});

	it("falls back to the command id when a command has no description and no resolver is given", () => {
		const root = parseKeymapSource(SOURCE);
		const z = findEntry(root, parseKeyString("z"))!;
		expect(entryLabel(z)).toBe("app:zoom");
	});

	it("falls back to the resolved Obsidian command name before the raw id", () => {
		const root = parseKeymapSource(SOURCE);
		const z = findEntry(root, parseKeyString("z"))!;
		expect(entryLabel(z, (id) => (id === "app:zoom" ? "Zoom in" : undefined))).toBe("Zoom in");
	});

	it("prefers a command's description over its id", () => {
		const root = parseKeymapSource(SOURCE);
		const f = findEntry(root, parseKeyString("f"))!;
		if (f.node.kind !== "group") throw new Error("expected group");
		const n = findEntry(f.node, parseKeyString("n"))!;
		expect(entryLabel(n)).toBe("New file");
	});
});
