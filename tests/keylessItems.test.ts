import { parseKeymapSource } from "../src/keymap";
import { serializeKeymap } from "../src/keymapSerialize";
import { isKeylessId, nextKeylessId } from "../src/keyless";
import { parseKeyString } from "../src/keys";
import { entryKeyGlyph, entryLabel, findEntry, keyedEntries, sortEntries } from "../src/tree";
import { addEntry, getGroupAtPath, moveEntry, removeEntry, updateEntry } from "../src/treeOps";
import type { CommandNode, GroupNode } from "../src/types";

/** A keymap as a phone writes it: one item with a key, two with an icon only. */
const SOURCE = `
items:
  f:
    command: editor:toggle-bold
  nokey1:
    command: editor:toggle-italics
    icon: italic
  nokey2:
    title: Links
    icon: link
    items:
      w:
        command: editor:insert-wikilink
`;

function root(): GroupNode {
	return parseKeymapSource(SOURCE);
}

const iconNode = (icon: string | undefined): CommandNode => ({ kind: "command", command: "app:about", ...(icon !== undefined ? { icon } : {}) });

describe("the keyless token", () => {
	it("is nokey followed by a number, and nothing else is", () => {
		expect(isKeylessId("nokey1")).toBe(true);
		expect(isKeylessId("nokey42")).toBe(true);
		for (const other of ["nokey", "nokeys", "Nokey1", "nokey-1", "nokey1a", "f", "c-j", "space", ""]) {
			expect(isKeylessId(other)).toBe(false);
		}
	});

	it("takes the lowest number not in use", () => {
		expect(nextKeylessId([])).toBe("nokey1");
		expect(nextKeylessId(["f", "nokey1", "nokey3"])).toBe("nokey2");
	});

	it("is a key string a Neokeys without keyless support already accepts, so an older device still loads the keymap", () => {
		// Before keyless items existed, a multi-character word with no dash parsed as a key no
		// keyboard sends. A dashed token ("nokey-1") would not: it is read as modifiers and rejected.
		expect(() => parseKeyString("nokey1")).not.toThrow();
		expect(parseKeyString("nokey1").key).toBe("nokey1");
		expect(() => parseKeyString("nokey-1")).toThrow();
	});
});

describe("parsing a keymap with keyless items", () => {
	it("gives a keyless item no key, and keeps its token and node", () => {
		const entries = root().entries;
		expect(entries.map((e) => [e.rawKey, e.key === null])).toEqual([
			["f", false],
			["nokey1", true],
			["nokey2", true],
		]);
		expect(entries[1].node).toEqual({ kind: "command", command: "editor:toggle-italics", icon: "italic" });
	});

	it("does not treat two keyless items as colliding, and still flags two equal keys", () => {
		expect(() => root()).not.toThrow();
		expect(() => parseKeymapSource("items:\n  F: a:b\n  s-f: c:d\n")).toThrow(/collides/);
	});

	it("loads a keyless item with no icon rather than refusing the whole keymap (the editor flags it)", () => {
		const parsed = parseKeymapSource("items:\n  nokey1: app:about\n");
		expect(parsed.entries[0].key).toBeNull();
	});

	it("round-trips through the serializer", () => {
		const again = parseKeymapSource(serializeKeymap(root()));
		expect(again.entries.map((e) => e.rawKey)).toEqual(["f", "nokey1", "nokey2"]);
		expect(again.entries[2].node.kind).toBe("group");
		expect(serializeKeymap(again)).toBe(serializeKeymap(root()));
	});
});

describe("a keyless item on a device with a keyboard", () => {
	it("is never found by a key press, whatever was pressed", () => {
		const group = root();
		for (const key of ["nokey1", "nokey2", "n", "i", "l", "w"]) {
			expect(findEntry(group, parseKeyString(key))).toBeUndefined();
		}
		expect(findEntry(group, parseKeyString("f"))?.rawKey).toBe("f");
	});

	it("is left out of what the keyboard popup lists, and stays in what the dial lists", () => {
		const group = root();
		expect(keyedEntries(sortEntries(group)).map((e) => e.rawKey)).toEqual(["f"]);
		expect(sortEntries(group).map((e) => e.rawKey)).toEqual(["nokey2", "f", "nokey1"]);
	});

	it("has no key glyph, and a label that is never its token", () => {
		const [, command, group] = root().entries;
		expect(entryKeyGlyph(command)).toBe("");
		expect(entryLabel(command, () => undefined)).toBe("editor:toggle-italics");
		expect(entryLabel(group, () => undefined)).toBe("Links");
		const untitled = parseKeymapSource("items:\n  nokey1:\n    icon: link\n    items: {}\n").entries[0];
		expect(entryLabel(untitled, () => undefined)).toBe("link");
	});

	it("keeps its own children reachable on the dial and keyboard-reachable inside the group", () => {
		const group = getGroupAtPath(root(), ["nokey2"]);
		expect(group?.entries.map((e) => e.rawKey)).toEqual(["w"]);
	});
});

describe("tree edits with keyless items", () => {
	it("adds a keyless item under the next free token when the key is empty and an icon is set", () => {
		const result = addEntry(root(), [], "", iconNode("bold"));
		expect(result.ok && result.root.entries.map((e) => e.rawKey)).toEqual(["f", "nokey1", "nokey2", "nokey3"]);
	});

	it("refuses a keyless item with no icon", () => {
		const result = addEntry(root(), [], "", iconNode(undefined));
		expect(result).toEqual({ ok: false, error: "An item with no key needs an icon" });
	});

	it("refuses to store a key under a keyless token", () => {
		const result = addEntry(root(), [], "nokey9", iconNode("bold"));
		expect(result.ok).toBe(false);
	});

	it("keeps a keyless item's token when it is edited and stays keyless", () => {
		const result = updateEntry(root(), [], "nokey1", "", iconNode("star"));
		expect(result.ok && result.root.entries.map((e) => e.rawKey)).toEqual(["f", "nokey1", "nokey2"]);
	});

	it("gives a keyless item a key, which still collides with a sibling's", () => {
		const given = updateEntry(root(), [], "nokey1", "i", iconNode("star"));
		expect(given.ok && given.root.entries[1].key?.key).toBe("i");
		const clash = updateEntry(root(), [], "nokey1", "f", iconNode("star"));
		expect(clash.ok).toBe(false);
	});

	it("takes the key off a keyed item when it has an icon, and refuses when it has none", () => {
		const off = updateEntry(root(), [], "f", "", iconNode("bold"));
		expect(off.ok && off.root.entries[0].key).toBeNull();
		expect(off.ok && off.root.entries[0].rawKey).toBe("nokey3");
		expect(updateEntry(root(), [], "f", "", iconNode(undefined)).ok).toBe(false);
	});

	it("moves and removes a keyless item by its token", () => {
		const moved = moveEntry(root(), [], "nokey1", -1);
		expect(moved.ok && moved.root.entries.map((e) => e.rawKey)).toEqual(["nokey1", "f", "nokey2"]);
		const removed = removeEntry(root(), [], "nokey1");
		expect(removed.ok && removed.root.entries.map((e) => e.rawKey)).toEqual(["f", "nokey2"]);
	});
});
