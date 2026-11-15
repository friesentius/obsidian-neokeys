import { keyGlyph, keysEqual } from "./keys";
import { isKeylessId } from "./keyless";
import type { GroupEntry, GroupNode, ParsedKey } from "./types";

/** Find the entry in `group` whose key matches `pressed`, if any. An entry with no key is never found: nothing a keyboard sends selects it. */
export function findEntry(group: GroupNode, pressed: ParsedKey): GroupEntry | undefined {
	return group.entries.find((entry) => entry.key !== null && keysEqual(entry.key, pressed));
}

/** The entries a keyboard can reach: every one that has a key. The keyboard popup lists only these. */
export function keyedEntries(entries: GroupEntry[]): GroupEntry[] {
	return entries.filter((entry) => entry.key !== null);
}

/** An entry's key as the grid and the dial write it ("f", "Ctrl+J"), or "" for an entry with no key. */
export function entryKeyGlyph(entry: GroupEntry): string {
	return entry.key === null ? "" : keyGlyph(entry.key);
}

/** An entry's key as the tree editor and the settings write it ("f", "C-j"), or "No key" for an entry with no key. */
export function entryKeyText(entry: GroupEntry): string {
	return entry.key === null ? "No key" : entry.rawKey;
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
		// A keyless entry's token ("nokey1") is bookkeeping, not a name: its icon is the nearest thing it has.
		return node.title ?? node.description ?? (isKeylessId(entry.rawKey) ? (node.icon ?? "Untitled group") : entry.rawKey);
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
