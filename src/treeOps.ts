import { KeyParseError, parseKeyString } from "./keys";
import { isKeylessId, nextKeylessId } from "./keyless";
import type { GroupEntry, GroupNode, KeymapNode } from "./types";

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

/**
 * The entry that `rawKey` stands for in `group`: a keyed one after the usual availability and
 * parse checks, or, for an empty `rawKey`, a keyless one (made on a phone). A keyless entry is
 * stored under a `nokeyN` token (see keyless.ts) - `keep`, when it already had one, else a fresh
 * one - and must have an icon, since the icon is all that names it on the dial.
 */
function resolveEntryKey(
	group: GroupNode,
	rawKey: string,
	node: KeymapNode,
	skipIndex: number | null,
	keep: string | null,
): { error: string } | Pick<GroupEntry, "rawKey" | "key"> {
	if (rawKey === "") {
		if (node.icon === undefined || node.icon.length === 0) {
			return { error: "An item with no key needs an icon" };
		}
		if (keep !== null && isKeylessId(keep)) return { rawKey: keep, key: null };
		const taken = group.entries.filter((_, i) => i !== skipIndex).map((e) => e.rawKey);
		return { rawKey: nextKeylessId(taken), key: null };
	}

	if (isKeylessId(rawKey)) {
		return { error: `"${rawKey}" is reserved for items with no key; leave the key empty instead` };
	}
	const conflict = checkKeyAvailable(group, rawKey, skipIndex);
	if (conflict) return conflict;
	try {
		return { rawKey, key: parseKeyString(rawKey) };
	} catch (e) {
		if (e instanceof KeyParseError) return { error: e.message };
		throw e;
	}
}

/**
 * Add a new entry (group, command, or file node) as the last child of the group at `path`. An
 * empty `rawKey` adds a keyless entry, which needs an icon on `node`.
 */
export function addEntry(root: GroupNode, path: string[], rawKey: string, node: KeymapNode): TreeOpResult {
	return replaceGroupAtPath(root, path, (group) => {
		const resolved = resolveEntryKey(group, rawKey, node, null, null);
		if ("error" in resolved) return resolved;
		return { ...group, entries: [...group.entries, { ...resolved, node }] };
	});
}

/**
 * Replace the entry `oldRawKey` in the group at `path` with a new key and/or node, in place. An
 * empty `newRawKey` makes the entry keyless (it needs an icon on `node`), keeping its token when
 * it already was.
 */
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

		const resolved = resolveEntryKey(group, newRawKey, node, index, oldRawKey);
		if ("error" in resolved) return resolved;

		const entries = [...group.entries];
		entries[index] = { ...resolved, node };
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
 * group at `path`. This is the stored order in `entries`, the same order the serializer writes
 * back out, and the order the which-key popup keeps within its groups/files/commands tiers.
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

/** Whether applying `meta` via setGroupMeta would change `group`'s title or description. */
export function groupMetaChanged(group: GroupNode, meta: { title?: string; description?: string }): boolean {
	return (
		(meta.title !== undefined && meta.title !== (group.title ?? "")) ||
		(meta.description !== undefined && meta.description !== (group.description ?? ""))
	);
}

/** Total number of entries inside `group`, counting every nested group's entries too. */
export function countEntries(group: GroupNode): number {
	return group.entries.reduce(
		(total, entry) => total + 1 + (entry.node.kind === "group" ? countEntries(entry.node) : 0),
		0,
	);
}
