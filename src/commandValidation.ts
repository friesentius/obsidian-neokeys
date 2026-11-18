import { entryKeyText } from "./tree";
import type { GroupNode } from "./types";

export interface InvalidCommandEntry {
	/** Key path from the root to this entry as the user reads it, e.g. ["f", "d"], with "No key" for a keyless hop. */
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
			const entryPath = [...path, entryKeyText(entry)];
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

/** The key paths of every item in `root` that runs `commandId`, in keymap order (e.g. [["i", "d"]]). */
export function findCommandUses(root: GroupNode, commandId: string): string[][] {
	const uses: string[][] = [];

	function walk(group: GroupNode, path: string[]): void {
		for (const entry of group.entries) {
			const entryPath = [...path, entryKeyText(entry)];
			if (entry.node.kind === "group") walk(entry.node, entryPath);
			else if (entry.node.kind === "command" && entry.node.command === commandId) uses.push(entryPath);
		}
	}

	walk(root, []);
	return uses;
}
