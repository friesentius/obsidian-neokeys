import { iconName } from "../src/icons";
import { parseKeymapSource } from "../src/keymap";
import { DEFAULT_KEYMAP_YAML } from "../src/sampleKeymap";
import type { GroupNode, KeymapNode } from "../src/types";
import { OBSIDIAN_ICON_NAMES } from "./obsidianIcons";

interface Walked {
	path: string;
	node: KeymapNode;
}

/** Every group (below the root) and item of the default keymap, with its key path. */
function walk(group: GroupNode, prefix: string[] = []): Walked[] {
	return group.entries.flatMap((entry) => {
		const path = [...prefix, entry.rawKey];
		const here: Walked = { path: path.join(" "), node: entry.node };
		return entry.node.kind === "group" ? [here, ...walk(entry.node, path)] : [here];
	});
}

const nodes = walk(parseKeymapSource(DEFAULT_KEYMAP_YAML));

/**
 * The tab-by-number commands show the digit on the dial: the icon set has no digits past 6, and
 * eight identical icons on one ring would hide which circle is which tab.
 */
const KEY_ONLY = /^workspace:goto-tab-[1-8]$/;
const keyOnly = (walked: Walked): boolean => walked.node.kind === "command" && KEY_ONLY.test(walked.node.command);

describe("the default keymap's icons", () => {
	it("gives every group and item an icon, except the tab-by-number commands, which keep their digit", () => {
		const without = nodes.filter((walked) => walked.node.icon === undefined);
		expect(without.every(keyOnly)).toBe(true);
		expect(without.map((walked) => (walked.node.kind === "command" ? walked.node.command : walked.path))).toEqual(
			[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `workspace:goto-tab-${n}`),
		);
	});

	it("writes each icon as a bare Lucide name that Obsidian bundles, so none falls back to the key", () => {
		const unknown = nodes.filter((walked) => walked.node.icon !== undefined && !OBSIDIAN_ICON_NAMES.has(walked.node.icon));
		expect(unknown.map((walked) => `${walked.path}: ${walked.node.icon}`)).toEqual([]);
		for (const walked of nodes) {
			if (walked.node.icon !== undefined) expect(iconName(walked.node.icon)).toBe(walked.node.icon);
		}
	});

	it("keeps the icons of items that share a menu apart, so a ring or popup never repeats one", () => {
		const check = (group: GroupNode): void => {
			const icons = group.entries.map((entry) => entry.node.icon).filter((icon): icon is string => icon !== undefined);
			expect(icons.filter((icon, i) => icons.indexOf(icon) !== i)).toEqual([]);
			for (const entry of group.entries) if (entry.node.kind === "group") check(entry.node);
		};
		check(parseKeymapSource(DEFAULT_KEYMAP_YAML));
	});

	it("gives the heading items the matching heading-N icons", () => {
		const headings = nodes.filter((walked) => walked.node.kind === "command" && /^editor:set-heading-[1-6]$/.test(walked.node.command));
		expect(headings).toHaveLength(6);
		for (const walked of headings) {
			if (walked.node.kind === "command") expect(walked.node.icon).toBe(`heading-${walked.node.command.slice(-1)}`);
		}
	});
});
