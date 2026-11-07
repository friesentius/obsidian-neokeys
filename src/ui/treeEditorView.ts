import { App, ExtraButtonComponent, Setting } from "obsidian";
import { getCommandName, hasCommand } from "../obsidianCommands";
import { entryLabel } from "../tree";
import { addEntry, moveEntry, removeEntry, setGroupMeta, updateEntry } from "../treeOps";
import type { CommandNode, FileNode, GroupEntry, GroupNode, KeymapNode } from "../types";
import { EntryEditorModal, type EntryDraft } from "./entryEditorModal";

function nodeFromDraft(draft: EntryDraft, existingEntries: GroupEntry[] | null): KeymapNode {
	if (draft.kind === "group") {
		const node: GroupNode = { kind: "group", entries: existingEntries ?? [] };
		if (draft.title.length > 0) node.title = draft.title;
		if (draft.description.length > 0) node.description = draft.description;
		return node;
	}
	if (draft.kind === "command") {
		const node: CommandNode = { kind: "command", command: draft.command };
		if (draft.description.length > 0) node.description = draft.description;
		return node;
	}
	const node: FileNode = { kind: "file", file: draft.file };
	if (draft.description.length > 0) node.description = draft.description;
	return node;
}

/**
 * Renders the keymap as an expandable tree of groups/commands/files inside `containerEl`, and
 * handles add/edit/delete/reorder/group-meta edits by rebuilding and persisting the GroupNode
 * tree through treeOps.ts. Always reads the current tree via `getRoot()` rather than caching it,
 * so it reflects whatever was most recently saved (including an edit made from the YAML view).
 */
export class TreeEditorView {
	constructor(
		private readonly app: App,
		private readonly containerEl: HTMLElement,
		private readonly getRoot: () => GroupNode,
		private readonly persist: (root: GroupNode) => Promise<void>,
	) {}

	render(): void {
		this.containerEl.empty();
		this.renderGroup(this.containerEl, this.getRoot(), [], true);
	}

	private renderGroup(container: HTMLElement, group: GroupNode, path: string[], isRoot: boolean): void {
		const wrap = container.createDiv({ cls: "neokeys-tree-group" });

		const metaSetting = new Setting(wrap).setClass("neokeys-tree-group-meta");
		metaSetting.setName(isRoot ? "Root menu" : "Group");

		if (!isRoot) {
			let titleValue = group.title ?? "";
			metaSetting.addText((text) => {
				text.setPlaceholder("Title").setValue(titleValue);
				text.onChange((value) => (titleValue = value));
				text.inputEl.addEventListener("blur", () => void this.commitMeta(path, { title: titleValue }));
			});
		}

		let descValue = group.description ?? "";
		metaSetting.addText((text) => {
			text.setPlaceholder("Description").setValue(descValue);
			text.onChange((value) => (descValue = value));
			text.inputEl.addEventListener("blur", () => void this.commitMeta(path, { description: descValue }));
		});

		metaSetting.addButton((button) =>
			button
				.setButtonText("Add item")
				.setCta()
				.onClick(() => this.openAddModal(path)),
		);

		const listEl = wrap.createDiv({ cls: "neokeys-tree-items" });
		if (group.entries.length === 0) {
			listEl.createDiv({ cls: "neokeys-tree-empty", text: "No items yet." });
		}
		group.entries.forEach((entry, index) => {
			this.renderEntry(listEl, path, entry, index, group.entries.length);
		});
	}

	private async commitMeta(path: string[], meta: { title?: string; description?: string }): Promise<void> {
		const result = setGroupMeta(this.getRoot(), path, meta);
		if (result.ok) await this.persist(result.root);
	}

	private renderEntry(
		listEl: HTMLElement,
		path: string[],
		entry: GroupEntry,
		index: number,
		siblingCount: number,
	): void {
		const row = listEl.createDiv({ cls: `neokeys-tree-row neokeys-tree-row-${entry.node.kind}` });
		const invalid = entry.node.kind === "command" && !hasCommand(this.app, entry.node.command);
		const label = entryLabel(entry, (id) => getCommandName(this.app, id));

		row.createSpan({ cls: "neokeys-tree-key", text: entry.rawKey });
		row.createSpan({
			cls: "neokeys-tree-label" + (invalid ? " neokeys-tree-label-invalid" : ""),
			text: label,
		});
		if (invalid) row.createSpan({ cls: "neokeys-invalid-badge", text: "Unknown command" });

		const controls = row.createDiv({ cls: "neokeys-tree-row-controls" });
		new ExtraButtonComponent(controls)
			.setIcon("arrow-up")
			.setTooltip("Move up")
			.setDisabled(index === 0)
			.onClick(async () => {
				const result = moveEntry(this.getRoot(), path, entry.rawKey, -1);
				if (result.ok) await this.persist(result.root);
			});
		new ExtraButtonComponent(controls)
			.setIcon("arrow-down")
			.setTooltip("Move down")
			.setDisabled(index === siblingCount - 1)
			.onClick(async () => {
				const result = moveEntry(this.getRoot(), path, entry.rawKey, 1);
				if (result.ok) await this.persist(result.root);
			});
		new ExtraButtonComponent(controls)
			.setIcon("pencil")
			.setTooltip("Edit")
			.onClick(() => this.openEditModal(path, entry));
		new ExtraButtonComponent(controls)
			.setIcon("trash")
			.setTooltip("Delete")
			.onClick(async () => {
				const result = removeEntry(this.getRoot(), path, entry.rawKey);
				if (result.ok) await this.persist(result.root);
			});

		if (entry.node.kind === "group") {
			this.renderGroup(listEl, entry.node, [...path, entry.rawKey], false);
		}
	}

	private openAddModal(path: string[]): void {
		new EntryEditorModal(this.app, "Add item", null, (draft) => {
			const node = nodeFromDraft(draft, null);
			const result = addEntry(this.getRoot(), path, draft.rawKey, node);
			if (!result.ok) return result.error;
			void this.persist(result.root);
			return null;
		}).open();
	}

	private openEditModal(path: string[], entry: GroupEntry): void {
		new EntryEditorModal(this.app, "Edit item", { rawKey: entry.rawKey, node: entry.node }, (draft) => {
			const existingEntries = entry.node.kind === "group" ? entry.node.entries : null;
			const node = nodeFromDraft(draft, existingEntries);
			const result = updateEntry(this.getRoot(), path, entry.rawKey, draft.rawKey, node);
			if (!result.ok) return result.error;
			void this.persist(result.root);
			return null;
		}).open();
	}
}
