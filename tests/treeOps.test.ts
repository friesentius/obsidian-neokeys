import { parseKeymapSource } from "../src/keymap";
import { serializeKeymap } from "../src/keymapSerialize";
import { addEntry, getGroupAtPath, moveEntry, removeEntry, setGroupMeta, updateEntry } from "../src/treeOps";
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
