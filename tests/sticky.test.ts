import { parseKeymapSource } from "../src/keymap";
import { DEFAULT_KEYMAP_YAML } from "../src/sampleKeymap";
import {
	DEFAULT_STICKY_GROUPS,
	isStickyPath,
	isStickyStack,
	keyPathOf,
	moveStickyPaths,
	removeStickyPaths,
	sanitizeStickyGroups,
	setStickyPath,
} from "../src/sticky";
import type { GroupNode } from "../src/types";

const SOURCE = `
title: Neokeys
items:
  t:
    title: Text
    items:
      h:
        title: Heading
        items:
          '+': neokeys:increase-heading-level
      f:
        title: Formatting
        items:
          b: editor:toggle-bold
  nokey1:
    title: Phone
    icon: smartphone
    items:
      z: app:zoom
`;

/** The navigation stack from the root down the given keys, as the popup and the dial keep it. */
function stack(root: GroupNode, keys: string[]): GroupNode[] {
	const path = [root];
	for (const key of keys) {
		const entry = path[path.length - 1].entries.find((e) => e.rawKey === key);
		if (!entry || entry.node.kind !== "group") throw new Error(`no group ${key}`);
		path.push(entry.node);
	}
	return path;
}

describe("sticky group paths", () => {
	it("the default names Text › Heading, which is in the default keymap", () => {
		expect(DEFAULT_STICKY_GROUPS).toEqual([["t", "h"]]);
		const heading = stack(parseKeymapSource(DEFAULT_KEYMAP_YAML), ["t", "h"]);
		expect(heading[heading.length - 1].title).toBe("Heading");
	});

	it("sanitises what data.json holds: lists of non-empty strings, duplicates once", () => {
		expect(sanitizeStickyGroups(undefined)).toEqual([]);
		expect(sanitizeStickyGroups("t h")).toEqual([]);
		expect(sanitizeStickyGroups([["t", "h"], ["t", "h"], [], ["t", 3], "x", [""], ["nokey1"]])).toEqual([["t", "h"], ["nokey1"]]);
	});

	it("marks and unmarks a path without touching the input", () => {
		const start = [["t", "h"]];
		const on = setStickyPath(start, ["t", "f"], true);
		expect(on).toEqual([["t", "h"], ["t", "f"]]);
		expect(setStickyPath(on, ["t", "f"], true)).toEqual([["t", "h"], ["t", "f"]]);
		expect(setStickyPath(on, ["t", "h"], false)).toEqual([["t", "f"]]);
		expect(start).toEqual([["t", "h"]]);
		expect(setStickyPath([], [], true)).toEqual([]);
	});

	it("a group whose key changed takes its own and its subgroups' stickiness along", () => {
		expect(moveStickyPaths([["t"], ["t", "h"], ["tx"], ["w"]], ["t"], ["x"])).toEqual([["x"], ["x", "h"], ["tx"], ["w"]]);
	});

	it("a deleted group drops its own and its subgroups' stickiness, not a sibling's", () => {
		expect(removeStickyPaths([["t"], ["t", "h"], ["tx"], ["w"]], ["t"])).toEqual([["tx"], ["w"]]);
	});

	it("reads a navigation stack's key path, keyless groups by their token", () => {
		const root = parseKeymapSource(SOURCE);
		expect(keyPathOf([root])).toEqual([]);
		expect(keyPathOf(stack(root, ["t", "h"]))).toEqual(["t", "h"]);
		expect(keyPathOf(stack(root, ["nokey1"]))).toEqual(["nokey1"]);
		expect(keyPathOf([root, parseKeymapSource(SOURCE)])).toBeNull();
	});

	it("only the deepest group of the stack decides, and the root is never sticky", () => {
		const root = parseKeymapSource(SOURCE);
		const sticky = [["t", "h"], []];
		expect(isStickyStack(sticky, stack(root, ["t", "h"]))).toBe(true);
		expect(isStickyStack(sticky, stack(root, ["t"]))).toBe(false);
		expect(isStickyStack(sticky, stack(root, ["t", "f"]))).toBe(false);
		expect(isStickyStack(sticky, [root])).toBe(false);
		expect(isStickyPath(sticky, [])).toBe(false);
	});
});
