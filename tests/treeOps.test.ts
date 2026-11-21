import { parseKeymapSource } from "../src/keymap";
import { serializeKeymap } from "../src/keymapSerialize";
import {
	addEntry,
	countEntries,
	getGroupAtPath,
	groupMetaChanged,
	moveEntry,
	removeEntry,
	setGroupMeta,
	updateEntry,
} from "../src/treeOps";
import { entryKindOf, nodeFromDraft, type EntryDraft } from "../src/entryDraft";
import type { CommandNode, GroupNode } from "../src/types";

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
      s:
        command: editor:save-file
  w:
    command: workspace:new-tab
`;

function root(): GroupNode {
	return parseKeymapSource(SOURCE);
}

describe("getGroupAtPath", () => {
	it("returns the root for an empty path", () => {
		expect(getGroupAtPath(root(), [])).toEqual(root());
	});

	it("finds a nested group", () => {
		const group = getGroupAtPath(root(), ["f"]);
		expect(group?.title).toBe("File");
	});

	it("returns undefined for a path through a non-group", () => {
		expect(getGroupAtPath(root(), ["f", "n"])).toBeUndefined();
	});

	it("returns undefined for a missing path", () => {
		expect(getGroupAtPath(root(), ["nope"])).toBeUndefined();
	});
});

describe("addEntry", () => {
	it("adds a new command entry at the root", () => {
		const node: CommandNode = { kind: "command", command: "app:zoom" };
		const result = addEntry(root(), [], "z", node);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const added = result.root.entries.find((e) => e.rawKey === "z");
		expect(added?.node).toEqual(node);
	});

	it("adds an entry inside a nested group", () => {
		const node: CommandNode = { kind: "command", command: "app:delete-file" };
		const result = addEntry(root(), ["f"], "d", node);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const file = getGroupAtPath(result.root, ["f"]);
		expect(file?.entries.map((e) => e.rawKey)).toEqual(["n", "s", "d"]);
	});

	it("rejects a duplicate raw key within the same group", () => {
		const result = addEntry(root(), ["f"], "n", { kind: "command", command: "x" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/already used/);
	});

	it("rejects a key that collides with a sibling's key combination", () => {
		// "A" and "s-a" both resolve to the same parsed key (shift folded into the letter's case).
		const added = addEntry(root(), [], "A", { kind: "command", command: "x" });
		expect(added.ok).toBe(true);
		if (!added.ok) return;
		const result = addEntry(added.root, [], "s-a", { kind: "command", command: "y" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/collides/);
	});

	it("rejects an unparsable key string", () => {
		const result = addEntry(root(), [], "", { kind: "command", command: "x" });
		expect(result.ok).toBe(false);
	});

	it("errors for a path that doesn't exist", () => {
		const result = addEntry(root(), ["nope"], "x", { kind: "command", command: "x" });
		expect(result.ok).toBe(false);
	});

	it("errors for a path through a non-group", () => {
		const result = addEntry(root(), ["f", "n"], "x", { kind: "command", command: "x" });
		expect(result.ok).toBe(false);
	});
});

describe("updateEntry", () => {
	it("updates a node in place, keeping position", () => {
		const node: CommandNode = { kind: "command", command: "editor:save-file", description: "Save!" };
		const result = updateEntry(root(), ["f"], "s", "s", node);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const file = getGroupAtPath(result.root, ["f"]);
		expect(file?.entries.map((e) => e.rawKey)).toEqual(["n", "s"]);
		expect(file?.entries[1].node).toEqual(node);
	});

	it("renames the key while keeping the node and position", () => {
		const result = updateEntry(root(), ["f"], "n", "c", { kind: "command", command: "file-explorer:new-file" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const file = getGroupAtPath(result.root, ["f"]);
		expect(file?.entries.map((e) => e.rawKey)).toEqual(["c", "s"]);
	});

	it("allows renaming to the same key it already has", () => {
		const result = updateEntry(root(), ["f"], "n", "n", { kind: "command", command: "x" });
		expect(result.ok).toBe(true);
	});

	it("rejects renaming to a key already used by a different sibling", () => {
		const result = updateEntry(root(), ["f"], "n", "s", { kind: "command", command: "x" });
		expect(result.ok).toBe(false);
	});

	it("errors when the entry to update doesn't exist", () => {
		const result = updateEntry(root(), ["f"], "zzz", "zzz", { kind: "command", command: "x" });
		expect(result.ok).toBe(false);
	});
});

describe("removeEntry", () => {
	it("removes a leaf entry", () => {
		const result = removeEntry(root(), ["f"], "s");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(getGroupAtPath(result.root, ["f"])?.entries.map((e) => e.rawKey)).toEqual(["n"]);
	});

	it("removes a group entry along with its whole subtree", () => {
		const result = removeEntry(root(), [], "f");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.root.entries.map((e) => e.rawKey)).toEqual(["w"]);
	});

	it("errors when the entry doesn't exist", () => {
		const result = removeEntry(root(), [], "zzz");
		expect(result.ok).toBe(false);
	});
});

describe("moveEntry", () => {
	it("swaps an entry with its next sibling", () => {
		const result = moveEntry(root(), ["f"], "n", 1);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(getGroupAtPath(result.root, ["f"])?.entries.map((e) => e.rawKey)).toEqual(["s", "n"]);
	});

	it("swaps an entry with its previous sibling", () => {
		const result = moveEntry(root(), ["f"], "s", -1);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(getGroupAtPath(result.root, ["f"])?.entries.map((e) => e.rawKey)).toEqual(["s", "n"]);
	});

	it("errors when moving past either end of the group", () => {
		expect(moveEntry(root(), ["f"], "n", -1).ok).toBe(false);
		expect(moveEntry(root(), ["f"], "s", 1).ok).toBe(false);
	});

	it("round-trips the new order through the serializer", () => {
		const result = moveEntry(root(), ["f"], "n", 1);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const reparsed = parseKeymapSource(serializeKeymap(result.root));
		expect(getGroupAtPath(reparsed, ["f"])?.entries.map((e) => e.rawKey)).toEqual(["s", "n"]);
	});
});

describe("setGroupMeta", () => {
	it("sets title and description on the root", () => {
		const result = setGroupMeta(root(), [], { title: "New title", description: "New desc" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.root.title).toBe("New title");
		expect(result.root.description).toBe("New desc");
	});

	it("clears title/description with an empty string", () => {
		const result = setGroupMeta(root(), ["f"], { title: "", description: "" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const file = getGroupAtPath(result.root, ["f"]);
		expect(file?.title).toBeUndefined();
		expect(file?.description).toBeUndefined();
	});

	it("leaves a field untouched when omitted from the update", () => {
		const result = setGroupMeta(root(), ["f"], { title: "Files" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const file = getGroupAtPath(result.root, ["f"]);
		expect(file?.title).toBe("Files");
		expect(file?.description).toBe("File operations");
	});

	it("errors for a nonexistent path", () => {
		expect(setGroupMeta(root(), ["nope"], { title: "x" }).ok).toBe(false);
	});
});

describe("groupMetaChanged", () => {
	it("is false when the values match what is stored (including absent fields as empty)", () => {
		const r = root();
		expect(groupMetaChanged(r, { title: "Neokeys" })).toBe(false);
		expect(groupMetaChanged(r, { description: "" })).toBe(false);
		expect(groupMetaChanged(r, {})).toBe(false);
	});

	it("is true when either field differs", () => {
		const r = root();
		expect(groupMetaChanged(r, { title: "Other" })).toBe(true);
		expect(groupMetaChanged(r, { title: "" })).toBe(true);
		expect(groupMetaChanged(r, { description: "New" })).toBe(true);
	});
});

describe("countEntries", () => {
	it("counts every entry including those in nested groups", () => {
		const r = root();
		expect(countEntries(r)).toBe(4);
		expect(countEntries(getGroupAtPath(r, ["f"])!)).toBe(2);
	});

	it("is zero for an empty group", () => {
		expect(countEntries({ kind: "group", entries: [] })).toBe(0);
	});
});

describe("icons through the editor's operations", () => {
	const draft = (over: Partial<EntryDraft>): EntryDraft => ({ rawKey: "x", kind: "command", title: "", description: "", icon: "", command: "app:zoom", commandName: "", file: "", macro: "", sticky: false, ...over });

	it("nodeFromDraft stores a macro item as an ordinary command item running the macro's command", () => {
		expect(nodeFromDraft(draft({ kind: "macro", macro: "tidy-note", command: "app:zoom", description: "Tidy", icon: "sparkles" }), null)).toEqual({ kind: "command", command: "neokeys:macro-tidy-note", description: "Tidy", icon: "sparkles" });
		expect(nodeFromDraft(draft({ kind: "macro", macro: "tidy-note" }), null)).toEqual({ kind: "command", command: "neokeys:macro-tidy-note" });
	});

	it("entryKindOf reads a command item running a macro as a macro item", () => {
		expect(entryKindOf({ kind: "command", command: "neokeys:macro-tidy-note" })).toBe("macro");
		expect(entryKindOf({ kind: "command", command: "neokeys:leader" })).toBe("command");
		expect(entryKindOf({ kind: "file", file: "Inbox" })).toBe("file");
		expect(entryKindOf({ kind: "group", entries: [] })).toBe("group");
	});

	it("nodeFromDraft writes an icon only when one is set, for every kind of entry", () => {
		expect(nodeFromDraft(draft({ icon: "zoom-in" }), null)).toEqual({ kind: "command", command: "app:zoom", icon: "zoom-in" });
		expect(nodeFromDraft(draft({}), null)).toEqual({ kind: "command", command: "app:zoom" });
		expect(nodeFromDraft(draft({ kind: "file", file: "Inbox", icon: "inbox", description: "Inbox note" }), null)).toEqual({ kind: "file", file: "Inbox", description: "Inbox note", icon: "inbox" });
		const group = root().entries[0].node;
		if (group.kind !== "group") throw new Error("expected a group");
		const made = nodeFromDraft(draft({ kind: "group", title: "File", icon: "folder" }), group.entries);
		expect(made).toEqual({ kind: "group", title: "File", icon: "folder", entries: group.entries });
		expect("icon" in nodeFromDraft(draft({ kind: "group", title: "File" }), group.entries)).toBe(false);
	});

	it("adds, edits, clears and keeps an icon through addEntry, updateEntry, moveEntry and setGroupMeta, and the YAML round-trips it", () => {
		let current = root();
		const added = addEntry(current, ["f"], "z", nodeFromDraft(draft({ rawKey: "z", icon: "zoom-in" }), null));
		if (!added.ok) throw new Error(added.error);
		current = added.root;
		const reparsed = (): GroupNode => parseKeymapSource(serializeKeymap(current));
		expect(getGroupAtPath(reparsed(), ["f"])?.entries.map((entry) => entry.node.icon)).toEqual([undefined, undefined, "zoom-in"]);

		// Editing the group's own title (setGroupMeta) and moving a sibling keep the icon.
		const meta = setGroupMeta(current, ["f"], { title: "Files" });
		if (!meta.ok) throw new Error(meta.error);
		const moved = moveEntry(meta.root, ["f"], "z", -1);
		if (!moved.ok) throw new Error(moved.error);
		current = moved.root;
		expect(getGroupAtPath(reparsed(), ["f"])?.entries.map((entry) => `${entry.rawKey}:${entry.node.icon ?? "-"}`)).toEqual(["n:-", "z:zoom-in", "s:-"]);

		// Changing the icon in the form replaces it; clearing it removes the line.
		const changed = updateEntry(current, ["f"], "z", "z", nodeFromDraft(draft({ rawKey: "z", icon: "search" }), null));
		if (!changed.ok) throw new Error(changed.error);
		expect(getGroupAtPath(parseKeymapSource(serializeKeymap(changed.root)), ["f"])?.entries[1].node.icon).toBe("search");
		const cleared = updateEntry(changed.root, ["f"], "z", "z", nodeFromDraft(draft({ rawKey: "z" }), null));
		if (!cleared.ok) throw new Error(cleared.error);
		expect(serializeKeymap(cleared.root)).not.toContain("icon");
	});

	it("keeps a group's icon when its title is edited from the form and its items are kept", () => {
		const start = parseKeymapSource("items:\n  g:\n    title: Old\n    icon: folder\n    items:\n      a: app:zoom Zoom\n");
		const group = start.entries[0].node;
		if (group.kind !== "group") throw new Error("expected a group");
		const result = updateEntry(start, [], "g", "g", nodeFromDraft(draft({ rawKey: "g", kind: "group", title: "New", icon: group.icon ?? "" }), group.entries));
		if (!result.ok) throw new Error(result.error);
		expect(serializeKeymap(result.root)).toBe("items:\n  g:\n    title: New\n    icon: folder\n    items:\n      a:\n        command: app:zoom\n        description: Zoom\n");
	});
});
