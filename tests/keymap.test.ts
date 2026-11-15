import { KeymapParseError, parseKeymapSource } from "../src/keymap";
import { DEFAULT_KEYMAP_YAML } from "../src/sampleKeymap";
import type { CommandNode, FileNode, GroupNode } from "../src/types";

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

	it("coerces a bare numeric-looking key to a string, matching plain-object key semantics", () => {
		const root = parseKeymapSource("items:\n  1: workspace:goto-tab-1\n");
		expect(root.entries[0].rawKey).toBe("1");
		expect(root.entries[0].node).toEqual({ kind: "command", command: "workspace:goto-tab-1" });
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
			expect((err as KeymapParseError).path).toEqual(["items"]);
		}
	});

	it("rejects an entry with neither items, command, nor file", () => {
		try {
			parseKeymapSource("items:\n  f:\n    description: just a description\n");
			throw new Error("expected parseKeymapSource to throw");
		} catch (err) {
			expect(err).toBeInstanceOf(KeymapParseError);
			expect((err as KeymapParseError).path).toEqual(["items", "f"]);
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
			expect((err as KeymapParseError).path).toEqual(["items", ""]);
		}
	});

	it("rejects two sibling keys that resolve to the same key combination", () => {
		expect(() => parseKeymapSource("items:\n  A:\n    command: x\n  s-a:\n    command: y\n")).toThrow(
			/collides/,
		);
	});

	it("rejects a non-string title", () => {
		expect(() => parseKeymapSource("title: 5\nitems: {}\n")).toThrow(/"title" must be a string/);
	});
});

describe("parseKeymapSource: icons", () => {
	const SOURCE = `
items:
  f:
    title: File
    icon: folder
    items:
      n:
        command: file-explorer:new-file
        description: New file
        icon: file-plus
      o:
        file: Inbox/Today
        icon: calendar
      s: editor:save-file Save
`;

	it("reads an icon from a group, a command and a file, and none from the shorthand", () => {
		const root = parseKeymapSource(SOURCE);
		const file = root.entries[0].node;
		if (file.kind !== "group") throw new Error("expected a group");
		expect(file.icon).toBe("folder");
		expect(file.entries.map((entry) => entry.node.icon)).toEqual(["file-plus", "calendar", undefined]);
		expect(file.entries[0].node).toEqual({ kind: "command", command: "file-explorer:new-file", description: "New file", icon: "file-plus" });
	});

	it("loads an older keymap, written before icons existed, with no icon on any node", () => {
		const walk = (node: GroupNode | CommandNode | FileNode): void => {
			expect("icon" in node).toBe(false);
			if (node.kind === "group") node.entries.forEach((entry) => walk(entry.node));
		};
		walk(parseKeymapSource(DEFAULT_KEYMAP_YAML));
	});

	it("trims the name and treats an empty one as no icon", () => {
		const root = parseKeymapSource('items:\n  a:\n    command: x\n    icon: "  star  "\n  b:\n    command: y\n    icon: ""\n  c:\n    command: z\n    icon: "   "\n');
		expect(root.entries.map((entry) => entry.node.icon)).toEqual(["star", undefined, undefined]);
		expect("icon" in root.entries[1].node).toBe(false);
	});

	it("accepts a name Obsidian may not know: a keymap written for a newer Obsidian or a plugin's icon still loads", () => {
		const root = parseKeymapSource("items:\n  a:\n    command: x\n    icon: some-plugin-icon-that-does-not-exist\n");
		expect(root.entries[0].node.icon).toBe("some-plugin-icon-that-does-not-exist");
	});

	it("rejects an icon that is not a string, with the entry's place in the tree", () => {
		expect(() => parseKeymapSource("items:\n  a:\n    command: x\n    icon: 5\n")).toThrow(/"icon" must be a string \(at items\.a\)/);
		expect(() => parseKeymapSource("items:\n  g:\n    icon: [a]\n    items: {}\n")).toThrow(/"icon" must be a string/);
	});

	it("still rejects other unknown fields next to an icon", () => {
		expect(() => parseKeymapSource("items:\n  a:\n    command: x\n    icon: star\n    colour: red\n")).toThrow(/Unknown field "colour"/);
	});
});
