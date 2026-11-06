import { KeymapParseError, parseKeymapSource } from "../src/keymap";
import { DEFAULT_KEYMAP_YAML } from "../src/sampleKeymap";

describe("parseKeymapSource: valid input", () => {
	it("parses the bundled default keymap without error", () => {
		const root = parseKeymapSource(DEFAULT_KEYMAP_YAML);
		expect(root.kind).toBe("group");
		expect(root.title).toBe("Neokeys");
		expect(root.entries.length).toBeGreaterThan(0);
	});

	it("parses a group with title, description, and nested items", () => {
		const root = parseKeymapSource(`
title: Root
items:
  f:
    title: File
    description: File operations
    items:
      n:
        command: file-explorer:new-file
        description: New file
`);
		const fEntry = root.entries.find((e) => e.rawKey === "f");
		expect(fEntry?.node.kind).toBe("group");
		if (fEntry?.node.kind === "group") {
			expect(fEntry.node.title).toBe("File");
			expect(fEntry.node.entries[0].node).toEqual({
				kind: "command",
				command: "file-explorer:new-file",
				description: "New file",
			});
		}
	});

	it("parses the command shorthand form '<id> <description>'", () => {
		const root = parseKeymapSource(`
items:
  d:
    command: app:delete-file
  m: file-explorer:move-file Move file
`);
		const m = root.entries.find((e) => e.rawKey === "m");
		expect(m?.node).toEqual({ kind: "command", command: "file-explorer:move-file", description: "Move file" });
	});

	it("parses the command shorthand form with no description", () => {
		const root = parseKeymapSource(`items:\n  d: app:delete-file\n`);
		const d = root.entries.find((e) => e.rawKey === "d");
		expect(d?.node).toEqual({ kind: "command", command: "app:delete-file" });
	});

	it("parses a file node", () => {
		const root = parseKeymapSource(`items:\n  o:\n    file: Inbox/Today\n    description: Today's note\n`);
		const o = root.entries.find((e) => e.rawKey === "o");
		expect(o?.node).toEqual({ kind: "file", file: "Inbox/Today", description: "Today's note" });
	});

	it("also accepts plain JSON, since JSON is valid YAML", () => {
		const json = JSON.stringify({
			title: "Neokeys",
			items: { f: { command: "app:delete-file" } },
		});
		const root = parseKeymapSource(json);
		expect(root.title).toBe("Neokeys");
		expect(root.entries[0].rawKey).toBe("f");
	});

	it("accepts an empty items map (a leaf group with no children)", () => {
		const root = parseKeymapSource("items: {}\n");
		expect(root.entries).toEqual([]);
	});
});

describe("parseKeymapSource: invalid input produces clear, located errors", () => {
	it("rejects malformed YAML/JSON syntax", () => {
		expect(() => parseKeymapSource("items: [this is not: a mapping")).toThrow(KeymapParseError);
	});

	it("rejects an empty document", () => {
		expect(() => parseKeymapSource("")).toThrow(/empty/);
	});

	it("rejects a document missing items", () => {
		try {
			parseKeymapSource("title: Neokeys\n");
			throw new Error("expected parseKeymapSource to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(KeymapParseError);
			expect((err as KeymapParseError).breadcrumb).toBe("items");
		}
	});

	it("rejects an entry with neither items, command, nor file", () => {
		try {
			parseKeymapSource("items:\n  f:\n    description: just a description\n");
			throw new Error("expected parseKeymapSource to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(KeymapParseError);
			expect((err as KeymapParseError).breadcrumb).toBe("items.f");
		}
	});

	it("rejects an entry combining command and file", () => {
		expect(() =>
			parseKeymapSource("items:\n  f:\n    command: app:delete-file\n    file: Inbox/Today\n"),
		).toThrow(/combine/);
	});

	it("rejects an unknown field on a group", () => {
		expect(() => parseKeymapSource("items:\n  f:\n    unexpected: true\n    items: {}\n")).toThrow(
			/Unknown field "unexpected"/,
		);
	});

	it("rejects an unparsable key string, with a breadcrumb into the tree", () => {
		try {
			parseKeymapSource("items:\n  '':\n    command: app:delete-file\n");
			throw new Error("expected parseKeymapSource to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(KeymapParseError);
			expect((err as KeymapParseError).breadcrumb).toBe("items.");
		}
	});

	it("rejects two sibling keys that resolve to the same key combination", () => {
		expect(() => parseKeymapSource("items:\n  a:\n    command: x\n  s-a:\n    command: y\n")).toThrow(
			/collides/,
		);
	});

	it("rejects a non-string title", () => {
		expect(() => parseKeymapSource("title: 5\nitems: {}\n")).toThrow(/"title" must be a string/);
	});
});
