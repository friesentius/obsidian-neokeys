import { macroCommandId, macroIdFromCommand } from "./macros/model";
import type { CommandNode, FileNode, GroupEntry, GroupNode, KeymapNode } from "./types";

/**
 * What the add/edit form offers. A "macro" item is stored as an ordinary command item that runs
 * the macro's command, so the keymap schema (and any Neokeys that predates macros) is unchanged.
 */
export type EntryKind = "group" | "command" | "file" | "macro";

/** The kind the form shows for an existing node: a command item running one of Neokeys' macro commands is a macro item. */
export function entryKindOf(node: KeymapNode): EntryKind {
	if (node.kind === "command" && macroIdFromCommand(node.command) !== null) return "macro";
	return node.kind;
}

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
	/** The id of the macro a macro item runs. */
	macro: string;
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
	if (draft.kind === "command" || draft.kind === "macro") {
		const node: CommandNode = { kind: "command", command: draft.kind === "macro" ? macroCommandId(draft.macro) : draft.command };
		if (draft.description.length > 0) node.description = draft.description;
		if (draft.icon.length > 0) node.icon = draft.icon;
		return node;
	}
	const node: FileNode = { kind: "file", file: draft.file };
	if (draft.description.length > 0) node.description = draft.description;
	if (draft.icon.length > 0) node.icon = draft.icon;
	return node;
}
