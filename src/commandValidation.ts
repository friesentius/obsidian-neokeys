import type { GroupNode } from "./types";

export interface InvalidCommandEntry {
	/** Raw key path from the root to this entry, e.g. ["f", "d"]. */
	path: string[];
	command: string;
}

/**
 * Walk `root` and collect every command entry whose id `isKnown` rejects. Pure and
 * Obsidian-free: callers supply the live command-ID lookup (see obsidianCommands.ts).
 */
export function findInvalidCommands(root: GroupNode, isKnown: (id: string) => boolean): InvalidCommandEntry[] {
	const invalid: InvalidCommandEntry[] = [];

	function walk(group: GroupNode, path: string[]): void {
		for (const entry of group.entries) {
			const entryPath = [...path, entry.rawKey];
			if (entry.node.kind === "group") {
				walk(entry.node, entryPath);
			} else if (entry.node.kind === "command" && !isKnown(entry.node.command)) {
				invalid.push({ path: entryPath, command: entry.node.command });
			}
		}
	}

	walk(root, []);
	return invalid;
}
