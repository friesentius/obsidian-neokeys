import { keysEqual } from "./keys";
import type { GroupEntry, GroupNode, ParsedKey } from "./types";

/** Find the entry in `group` whose key matches `pressed`, if any. */
export function findEntry(group: GroupNode, pressed: ParsedKey): GroupEntry | undefined {
	return group.entries.find((entry) => keysEqual(entry.key, pressed));
}

function kindOrder(entry: GroupEntry): number {
	switch (entry.node.kind) {
		case "group":
			return 0;
		case "file":
			return 1;
		case "command":
			return 2;
	}
}

/**
 * Sort entries for display: groups, then files, then commands; within each tier, in the order
 * they're stored (the order the tree editor's reorder buttons and the YAML's item order control),
 * relying on Array.prototype.sort's stability to keep that relative order intact.
 */
export function sortEntries(group: GroupNode): GroupEntry[] {
	return [...group.entries].sort((a, b) => kindOrder(a) - kindOrder(b));
}

/**
 * The label to show for an entry's row: its own description/title, falling
 * back to the Obsidian command's own display name for a bare command entry
 * (via `resolveCommandName`, since that lookup needs a live App), and only
 * falling back further to a raw identifier when nothing else is available.
 */
export function entryLabel(entry: GroupEntry, resolveCommandName?: (id: string) => string | undefined): string {
	const { node } = entry;
	if (node.kind === "group") {
		return node.title ?? node.description ?? entry.rawKey;
	}
	if (node.kind === "command") {
		return node.description ?? resolveCommandName?.(node.command) ?? node.command;
	}
	return node.description ?? node.file;
}

/**
 * The which-key header's label breadcrumb: one label per hop from the root to the current
 * group, in Spacekeys terms "File > Open" rather than raw key glyphs. `path` is the full
 * navigation stack including the root; the root itself contributes no label since nothing led
 * into it.
 */
export function breadcrumbTrail(
	path: GroupNode[],
	resolveCommandName?: (id: string) => string | undefined,
): string[] {
	const labels: string[] = [];
	for (let i = 1; i < path.length; i++) {
		const parent = path[i - 1];
		const entry = parent.entries.find((e) => e.node === path[i]);
		labels.push(entry ? entryLabel(entry, resolveCommandName) : "?");
	}
	return labels;
}
