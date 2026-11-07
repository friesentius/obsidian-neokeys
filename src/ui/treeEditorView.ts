import { App, ButtonComponent, ExtraButtonComponent } from "obsidian";
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
 *
 * Each group renders exactly one header: the root gets its title/description as inline fields
 * above its children (it has no parent row to host them), and every nested group's header is the
 * single row its parent draws for it (chevron, key, title, move/edit/delete) - editing a nested
 * group's title or description goes through the same "Edit item" dialog as any other entry,
 * rather than a second set of inline inputs living under its own header.
 */
export class TreeEditorView {
	/** Paths (joined with NUL) of groups collapsed by the user; survives across re-renders. */
	private readonly collapsed = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly containerEl: HTMLElement,
		private readonly getRoot: () => GroupNode,
		private readonly persist: (root: GroupNode) => Promise<void>,
	) {}

	render(): void {
		this.containerEl.empty();
		this.renderRoot(this.containerEl, this.getRoot());
	}

	private pathKey(path: string[]): string {
		return path.join("\u0000");
	}

	private renderRoot(container: HTMLElement, group: GroupNode): void {
		const wrap = container.createDiv({ cls: "neokeys-tree-group" });
		const meta = wrap.createDiv({ cls: "neokeys-tree-root-meta" });

		meta.createEl("label", { cls: "neokeys-tree-field-label", text: "Title" });
		const titleInput = meta.createEl("input", { cls: "neokeys-tree-field-input", attr: { type: "text" } });
		titleInput.placeholder = "Title";
		titleInput.value = group.title ?? "";
		titleInput.addEventListener("blur", () => void this.commitMeta([], { title: titleInput.value }));

		meta.createEl("label", { cls: "neokeys-tree-field-label", text: "Description" });
		const descInput = meta.createEl("input", { cls: "neokeys-tree-field-input", attr: { type: "text" } });
		descInput.placeholder = "Description";
		descInput.value = group.description ?? "";
		descInput.addEventListener("blur", () => void this.commitMeta([], { description: descInput.value }));

		this.renderChildren(wrap, group, []);
	}

	private renderChildren(wrap: HTMLElement, group: GroupNode, path: string[]): void {
		const listEl = wrap.createDiv({ cls: "neokeys-tree-items" });
		const collapsed = path.length > 0 && this.collapsed.has(this.pathKey(path));
		listEl.toggleClass("neokeys-hidden", collapsed);

		if (group.entries.length === 0) {
			listEl.createDiv({ cls: "neokeys-tree-empty", text: "No items yet." });
		}
		group.entries.forEach((entry, index) => {
			this.renderEntry(listEl, path, entry, index, group.entries.length);
		});

		const addRow = listEl.createDiv({ cls: "neokeys-tree-add-row" });
		new ButtonComponent(addRow).setButtonText("Add item").onClick(() => this.openAddModal(path));
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
		const isGroup = entry.node.kind === "group";
		const childPath = [...path, entry.rawKey];
		const entryWrap = isGroup ? listEl.createDiv({ cls: "neokeys-tree-group" }) : listEl;

		const row = entryWrap.createDiv({ cls: `neokeys-tree-row neokeys-tree-row-${entry.node.kind}` });
		const invalid = entry.node.kind === "command" && !hasCommand(this.app, entry.node.command);
		const label = entryLabel(entry, (id) => getCommandName(this.app, id));

		if (isGroup) {
			const collapsed = this.collapsed.has(this.pathKey(childPath));
			new ExtraButtonComponent(row)
				.setIcon(collapsed ? "chevron-right" : "chevron-down")
				.setTooltip(collapsed ? "Expand" : "Collapse")
				.onClick(() => {
					if (collapsed) this.collapsed.delete(this.pathKey(childPath));
					else this.collapsed.add(this.pathKey(childPath));
					this.render();
				});
		}

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
			this.renderChildren(entryWrap, entry.node, childPath);
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
		const existingEntries = entry.node.kind === "group" ? entry.node.entries : null;
		const lockKind = existingEntries !== null && existingEntries.length > 0;
		new EntryEditorModal(
			this.app,
			"Edit item",
			{ rawKey: entry.rawKey, node: entry.node },
			(draft) => {
				const node = nodeFromDraft(draft, existingEntries);
				const result = updateEntry(this.getRoot(), path, entry.rawKey, draft.rawKey, node);
				if (!result.ok) return result.error;
				void this.persist(result.root);
				return null;
			},
			lockKind ? "Has items; change its items first to switch this away from a group." : undefined,
		).open();
	}
}
