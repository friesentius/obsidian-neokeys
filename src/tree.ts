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

/** The label to show for an entry's row: its own description/title, falling back to an identifier. */
export function entryLabel(entry: GroupEntry): string {
	const { node } = entry;
	if (node.kind === "group") {
		return node.title ?? node.description ?? entry.rawKey;
	}
	if (node.kind === "command") {
		return node.description ?? node.command;
	}
	return node.description ?? node.file;
}

/**
 * Resolve a full sequence of key presses against a root group, descending one
 * key at a time. Returns the final group/command/file node reached, or
 * `undefined` if any step in the sequence has no matching entry.
 */
export function resolveSequence(root: GroupNode, sequence: ParsedKey[]) {
	let current: GroupNode = root;
	for (const pressed of sequence) {
		const entry = findEntry(current, pressed);
		if (!entry) return undefined;
		if (entry.node.kind !== "group") {
			return entry.node;
		}
		current = entry.node;
	}
	return current;
}
