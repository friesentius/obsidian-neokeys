import type { CommandNode, FileNode, GroupEntry, GroupNode, KeymapNode } from "./types";

export type EntryKind = "group" | "command" | "file";

/** What the add/edit form collects for one tree entry. Empty strings mean "not set". */
export interface EntryDraft {
	rawKey: string;
	kind: EntryKind;
	title: string;
	description: string;
	/** An icon id from Obsidian's icon set, or "" for none (the dial then shows the key). */
	icon: string;
	command: string;
	commandName: string;
	file: string;
}

/**
 * The keymap node a submitted draft stands for. A group keeps the entries it already has (the
 * form never edits them), and every optional field (title, description, icon) is written only
 * when set, so an entry without one serializes exactly as it did before the field existed.
 */
export function nodeFromDraft(draft: EntryDraft, existingEntries: GroupEntry[] | null): KeymapNode {
	if (draft.kind === "group") {
		const node: GroupNode = { kind: "group", entries: existingEntries ?? [] };
		if (draft.title.length > 0) node.title = draft.title;
		if (draft.description.length > 0) node.description = draft.description;
		if (draft.icon.length > 0) node.icon = draft.icon;
		return node;
	}
	if (draft.kind === "command") {
		const node: CommandNode = { kind: "command", command: draft.command };
		if (draft.description.length > 0) node.description = draft.description;
		if (draft.icon.length > 0) node.icon = draft.icon;
		return node;
	}
	const node: FileNode = { kind: "file", file: draft.file };
	if (draft.description.length > 0) node.description = draft.description;
	if (draft.icon.length > 0) node.icon = draft.icon;
	return node;
}
