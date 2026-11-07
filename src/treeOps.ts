import { KeyParseError, parseKeyString } from "./keys";
import type { GroupNode, KeymapNode } from "./types";

export type TreeOpResult = { ok: true; root: GroupNode } | { ok: false; error: string };

type UpdateResult = GroupNode | { error: string };

function isUpdateError(value: UpdateResult): value is { error: string } {
	return "error" in value;
}

/** Find the group at `path` (a sequence of rawKeys from the root into nested groups), if it exists. */
export function getGroupAtPath(root: GroupNode, path: string[]): GroupNode | undefined {
	let group = root;
	for (const rawKey of path) {
		const entry = group.entries.find((e) => e.rawKey === rawKey);
		if (!entry || entry.node.kind !== "group") return undefined;
		group = entry.node;
	}
	return group;
}

/** Rebuild `root` with the group at `path` replaced by `updater`'s result, or stop at its error. */
function replaceGroupAtPath(root: GroupNode, path: string[], updater: (group: GroupNode) => UpdateResult): TreeOpResult {
	if (path.length === 0) {
		const result = updater(root);
		if (isUpdateError(result)) return { ok: false, error: result.error };
		return { ok: true, root: result };
	}

	const [head, ...rest] = path;
	const index = root.entries.findIndex((e) => e.rawKey === head);
	if (index === -1) return { ok: false, error: `No entry "${head}" in this group` };
	const entry = root.entries[index];
	if (entry.node.kind !== "group") return { ok: false, error: `"${head}" is not a group` };

	const nested = replaceGroupAtPath(entry.node, rest, updater);
	if (!nested.ok) return nested;

	const entries = [...root.entries];
	entries[index] = { ...entry, node: nested.root };
	return { ok: true, root: { ...root, entries } };
}

/**
 * Returns the dedupe key `parseKeyString` + `keysEqual` agree a sibling key combination maps to,
 * or an error describing why `rawKey` can't be used at all. Shared by add/update/the parser so
 * "same key" means the same thing everywhere.
 */
function keyDedupeKey(rawKey: string): string | { error: string } {
	try {
		return JSON.stringify(parseKeyString(rawKey));
	} catch (e) {
		if (e instanceof KeyParseError) return { error: e.message };
		throw e;
	}
}

function checkKeyAvailable(
	group: GroupNode,
	rawKey: string,
	skipIndex: number | null,
): { error: string } | null {
	const dedupe = keyDedupeKey(rawKey);
	if (typeof dedupe !== "string") return dedupe;

	for (const [i, entry] of group.entries.entries()) {
		if (i === skipIndex) continue;
		if (entry.rawKey === rawKey) {
			return { error: `Key "${rawKey}" is already used in this group` };
		}
		const existingDedupe = keyDedupeKey(entry.rawKey);
		if (typeof existingDedupe === "string" && existingDedupe === dedupe) {
			return {
				error: `Key "${rawKey}" collides with sibling key "${entry.rawKey}" (same key combination)`,
			};
		}
	}
	return null;
}

/** Add a new entry (group, command, or file node) as the last child of the group at `path`. */
export function addEntry(root: GroupNode, path: string[], rawKey: string, node: KeymapNode): TreeOpResult {
	return replaceGroupAtPath(root, path, (group) => {
		const conflict = checkKeyAvailable(group, rawKey, null);
		if (conflict) return conflict;

		let key;
		try {
			key = parseKeyString(rawKey);
		} catch (e) {
			if (e instanceof KeyParseError) return { error: e.message };
			throw e;
		}

		return { ...group, entries: [...group.entries, { rawKey, key, node }] };
	});
}

/** Replace the entry `oldRawKey` in the group at `path` with a new key and/or node, in place. */
export function updateEntry(
	root: GroupNode,
	path: string[],
	oldRawKey: string,
	newRawKey: string,
	node: KeymapNode,
): TreeOpResult {
	return replaceGroupAtPath(root, path, (group) => {
		const index = group.entries.findIndex((e) => e.rawKey === oldRawKey);
		if (index === -1) return { error: `No entry "${oldRawKey}" in this group` };

		const conflict = checkKeyAvailable(group, newRawKey, index);
		if (conflict) return conflict;

		let key;
		try {
			key = parseKeyString(newRawKey);
		} catch (e) {
			if (e instanceof KeyParseError) return { error: e.message };
			throw e;
		}

		const entries = [...group.entries];
		entries[index] = { rawKey: newRawKey, key, node };
		return { ...group, entries };
	});
}

/** Remove the entry `rawKey` from the group at `path`. Removing a group removes its whole subtree. */
export function removeEntry(root: GroupNode, path: string[], rawKey: string): TreeOpResult {
	return replaceGroupAtPath(root, path, (group) => {
		const index = group.entries.findIndex((e) => e.rawKey === rawKey);
		if (index === -1) return { error: `No entry "${rawKey}" in this group` };
		const entries = [...group.entries];
		entries.splice(index, 1);
		return { ...group, entries };
	});
}

/**
 * Swap the entry `rawKey` with its previous (`delta: -1`) or next (`delta: 1`) sibling in the
 * group at `path`. This is purely the stored order in `entries`, the same order the serializer
 * writes back out; it does not affect the which-key popup's own kind-then-key display sort.
 */
export function moveEntry(root: GroupNode, path: string[], rawKey: string, delta: -1 | 1): TreeOpResult {
	return replaceGroupAtPath(root, path, (group) => {
		const index = group.entries.findIndex((e) => e.rawKey === rawKey);
		if (index === -1) return { error: `No entry "${rawKey}" in this group` };
		const target = index + delta;
		if (target < 0 || target >= group.entries.length) {
			return { error: "Already at that end of the group" };
		}
		const entries = [...group.entries];
		[entries[index], entries[target]] = [entries[target], entries[index]];
		return { ...group, entries };
	});
}

/** Set (or clear, with an empty string) the title/description of the group at `path`. */
export function setGroupMeta(
	root: GroupNode,
	path: string[],
	meta: { title?: string; description?: string },
): TreeOpResult {
	return replaceGroupAtPath(root, path, (group) => {
		const updated: GroupNode = { ...group };
		if (meta.title !== undefined) {
			if (meta.title.length > 0) updated.title = meta.title;
			else delete updated.title;
		}
		if (meta.description !== undefined) {
			if (meta.description.length > 0) updated.description = meta.description;
			else delete updated.description;
		}
		return updated;
	});
}
