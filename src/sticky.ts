import type { GroupNode } from "./types";

/**
 * Sticky groups: a group that stays open after one of its items runs, so `Leader t h + + +`
 * raises a heading three times. Which groups are sticky lives in data.json as a list of group key
 * paths (the raw keys from the root to the group, e.g. ["t", "h"]), not in the keymap YAML: every
 * released Neokeys rejects the whole keymap on a field it does not know, while every release keeps
 * a data.json field it does not know when it saves. So a synced device on an older Neokeys still
 * loads the keymap; its groups simply are not sticky there. Kept free of Obsidian imports so the
 * path bookkeeping is unit-tested.
 */

/** A group's key path: the raw keys (or `nokeyN` tokens) from the root down to the group. */
export type GroupPath = readonly string[];

/** The sticky groups a fresh install starts with: Text › Heading in the default keymap. */
export const DEFAULT_STICKY_GROUPS: string[][] = [["t", "h"]];

function samePath(a: GroupPath, b: GroupPath): boolean {
	return a.length === b.length && a.every((key, i) => key === b[i]);
}

function startsWith(path: GroupPath, prefix: GroupPath): boolean {
	return prefix.length <= path.length && prefix.every((key, i) => key === path[i]);
}

/**
 * The sticky group list to run with, given whatever data.json holds: every entry a non-empty list
 * of strings, duplicates dropped. Anything else becomes an empty list.
 */
export function sanitizeStickyGroups(value: unknown): string[][] {
	if (!Array.isArray(value)) return [];
	const paths: string[][] = [];
	for (const entry of value) {
		if (!Array.isArray(entry) || entry.length === 0 || !entry.every((key) => typeof key === "string" && key.length > 0)) continue;
		const path = entry as string[];
		if (!paths.some((existing) => samePath(existing, path))) paths.push([...path]);
	}
	return paths;
}

export function isStickyPath(sticky: readonly GroupPath[], path: GroupPath): boolean {
	return path.length > 0 && sticky.some((entry) => samePath(entry, path));
}

/** `sticky` with `path` marked sticky or not; the list is new, the input untouched. */
export function setStickyPath(sticky: readonly GroupPath[], path: GroupPath, on: boolean): string[][] {
	const rest = sticky.filter((entry) => !samePath(entry, path)).map((entry) => [...entry]);
	if (on && path.length > 0) rest.push([...path]);
	return rest;
}

/** `sticky` after the group at `from` got the key path `to` (its key changed): it and every group inside it follow. */
export function moveStickyPaths(sticky: readonly GroupPath[], from: GroupPath, to: GroupPath): string[][] {
	return sticky.map((entry) => (startsWith(entry, from) ? [...to, ...entry.slice(from.length)] : [...entry]));
}

/** `sticky` after the group at `path` was deleted: it and every group inside it go. */
export function removeStickyPaths(sticky: readonly GroupPath[], path: GroupPath): string[][] {
	return sticky.filter((entry) => !startsWith(entry, path)).map((entry) => [...entry]);
}

/**
 * The key path of the last group in `path`, a navigation stack from the root (as the popup and
 * the dial keep one), or null when a hop cannot be found (it cannot happen for a stack built by
 * walking the keymap, but a stack is only a list of nodes).
 */
export function keyPathOf(path: readonly GroupNode[]): string[] | null {
	const keys: string[] = [];
	for (let i = 1; i < path.length; i++) {
		const entry = path[i - 1].entries.find((e) => e.node === path[i]);
		if (!entry) return null;
		keys.push(entry.rawKey);
	}
	return keys;
}

/** Whether the deepest group of a navigation stack is sticky. */
export function isStickyStack(sticky: readonly GroupPath[], path: readonly GroupNode[]): boolean {
	const keys = keyPathOf(path);
	return keys !== null && isStickyPath(sticky, keys);
}
