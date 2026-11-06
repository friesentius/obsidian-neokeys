import { compareKeys, keysEqual } from "./keys";
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

/** Sort entries for display: groups, then files, then commands; alphabetically by key within each tier. */
export function sortEntries(group: GroupNode): GroupEntry[] {
	return [...group.entries].sort((a, b) => {
		const kindDiff = kindOrder(a) - kindOrder(b);
		if (kindDiff !== 0) return kindDiff;
		return compareKeys(a.key, b.key);
	});
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
