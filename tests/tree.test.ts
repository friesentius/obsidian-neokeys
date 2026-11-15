import { parseKeyString } from "../src/keys";
import { parseKeymapSource } from "../src/keymap";
import { breadcrumbTrail, entryLabel, entryPopupIcon, findEntry, sortEntries } from "../src/tree";
import { moveEntry } from "../src/treeOps";
import type { GroupNode } from "../src/types";

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

describe("findEntry", () => {
	const root = parseKeymapSource(SOURCE);

	it("finds a top-level entry by key", () => {
		const entry = findEntry(root, parseKeyString("f"));
		expect(entry?.node.kind).toBe("group");
	});

	it("returns undefined for an unmatched key", () => {
		expect(findEntry(root, parseKeyString("q"))).toBeUndefined();
	});
});

describe("sortEntries", () => {
	it("orders groups first, then files, then commands; stored order within each tier", () => {
		const root = parseKeymapSource(SOURCE);
		const sorted = sortEntries(root);
		// "z" is stored before "a": stored order, not alphabetical, within the commands tier.
		expect(sorted.map((e) => e.rawKey)).toEqual(["f", "z", "a"]);
	});

	it("reflects a reorder made through treeOps, so the which-key menu shows the new order", () => {
		const root = parseKeymapSource(SOURCE);
		const result = moveEntry(root, [], "a", -1);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const sorted = sortEntries(result.root);
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

describe("breadcrumbTrail", () => {
	const NESTED_SOURCE = `
title: Neokeys
items:
  f:
    title: File
    items:
      o:
        title: Open
        description: Open things
        items:
          f:
            command: app:open-file
  z:
    command: app:zoom
`;

	it("is empty at the root", () => {
		const root = parseKeymapSource(NESTED_SOURCE);
		expect(breadcrumbTrail([root])).toEqual([]);
	});

	it("builds one label per hop, two levels deep", () => {
		const root = parseKeymapSource(NESTED_SOURCE);
		const file = findEntry(root, parseKeyString("f"))!.node as GroupNode;
		const open = findEntry(file, parseKeyString("o"))!.node as GroupNode;
		expect(breadcrumbTrail([root, file, open])).toEqual(["File", "Open"]);
	});

	it("falls back to the raw key when a path segment's entry can't be found", () => {
		const root = parseKeymapSource(NESTED_SOURCE);
		const file = findEntry(root, parseKeyString("f"))!.node as GroupNode;
		const orphan: GroupNode = { kind: "group", entries: [] };
		expect(breadcrumbTrail([root, file, orphan])).toEqual(["File", "?"]);
	});
});

describe("entryPopupIcon", () => {
	const known = (id: string) => id === "star" || id === "folder";
	const root = parseKeymapSource("items:\n  a:\n    command: editor:toggle-bold\n    icon: star\n  b: editor:toggle-italics\n  c:\n    command: editor:toggle-code\n    icon: not-an-icon\n  g:\n    title: Group\n    icon: folder\n    items:\n      x: file-explorer:new-file\n");

	it("gives the popup an entry's icon beside its key, for a command and for a group", () => {
		const byKey = (key: string) => root.entries.find((e) => e.rawKey === key)!;
		expect(entryPopupIcon(byKey("a"), known)).toBe("star");
		expect(entryPopupIcon(byKey("g"), known)).toBe("folder");
	});

	it("leaves an entry with no icon, or one Obsidian does not know, as it was", () => {
		const byKey = (key: string) => root.entries.find((e) => e.rawKey === key)!;
		expect(entryPopupIcon(byKey("b"), known)).toBeNull();
		expect(entryPopupIcon(byKey("c"), known)).toBeNull();
	});
});
