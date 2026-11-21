import { App, ButtonComponent, ExtraButtonComponent, getIcon, Platform, setIcon } from "obsidian";
import { nodeFromDraft } from "../entryDraft";
import { deviceFromPlatform, entryNeeds } from "../entryValidation";
import { getCommandName, hasCommand } from "../obsidianCommands";
import { entryKeyText, entryLabel } from "../tree";
import {
	addEntry,
	countEntries,
	getGroupAtPath,
	groupMetaChanged,
	moveEntry,
	removeEntry,
	setGroupMeta,
	updateEntry,
} from "../treeOps";
import { isStickyPath, moveStickyPaths, removeStickyPaths, setStickyPath } from "../sticky";
import type { GroupEntry, GroupNode } from "../types";
import { ConfirmDeleteModal } from "./confirmDeleteModal";
import { EntryEditorModal } from "./entryEditorModal";
import type { MacroStore } from "./macroEditorModal";
import { openModalInWindow } from "./modalWindow";

/** The sticky group list in the settings, which follows the tree's edits (a group's key changes, a group is deleted). */
export interface StickyStore {
	paths(): readonly string[][];
	/** Replace the list; the next `persist` saves it with the keymap. */
	set(paths: string[][]): void;
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
		/** The macros a "Macro" item can run, and a way to save a new one made from the Add/Edit dialog. */
		private readonly macroStore: MacroStore,
		private readonly stickyStore: StickyStore,
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
		titleInput.addEventListener("blur", () => void this.commitMeta([], { title: titleInput.value.trim() }));

		meta.createEl("label", { cls: "neokeys-tree-field-label", text: "Description" });
		const descInput = meta.createEl("input", { cls: "neokeys-tree-field-input", attr: { type: "text" } });
		descInput.placeholder = "Description";
		descInput.value = group.description ?? "";
		descInput.addEventListener("blur", () => void this.commitMeta([], { description: descInput.value.trim() }));

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
		const root = this.getRoot();
		const group = getGroupAtPath(root, path);
		if (!group || !groupMetaChanged(group, meta)) return;
		const result = setGroupMeta(root, path, meta);
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

		// An entry with no key (made on a phone) shows "No key" where the key goes, and a note when this device needs one.
		const keyless = entry.key === null;
		row.createSpan({ cls: "neokeys-tree-key" + (keyless ? " neokeys-tree-key-none" : ""), text: entryKeyText(entry) });
		const needs = entryNeeds(deviceFromPlatform(Platform), !keyless, entry.node.icon);
		// An entry's icon, small, before its name: the dial shows it in place of the key.
		if (entry.node.icon !== undefined && getIcon(entry.node.icon) !== null) {
			setIcon(row.createSpan({ cls: "neokeys-tree-icon", attr: { "aria-label": `Icon: ${entry.node.icon}` } }), entry.node.icon);
		}
		row.createSpan({
			cls: "neokeys-tree-label" + (invalid ? " neokeys-tree-label-invalid" : ""),
			text: label,
		});
		if (isGroup && isStickyPath(this.stickyStore.paths(), childPath)) {
			setIcon(row.createSpan({ cls: "neokeys-tree-sticky", attr: { "aria-label": "Sticky: stays open after an item runs" } }), "pin");
		}
		if (invalid) row.createSpan({ cls: "neokeys-invalid-badge", text: "Unknown command" });
		if (needs !== null) row.createSpan({ cls: "neokeys-invalid-badge", text: needs });

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
			.onClick(() => this.deleteEntry(path, entry));

		if (entry.node.kind === "group") {
			this.renderChildren(entryWrap, entry.node, childPath);
		}
	}

	private deleteEntry(path: string[], entry: GroupEntry): void {
		const remove = (): void => {
			const result = removeEntry(this.getRoot(), path, entry.rawKey);
			if (!result.ok) return;
			this.stickyStore.set(removeStickyPaths(this.stickyStore.paths(), [...path, entry.rawKey]));
			void this.persist(result.root);
		};
		if (entry.node.kind !== "group" || entry.node.entries.length === 0) {
			remove();
			return;
		}
		const count = countEntries(entry.node);
		const items = count === 1 ? "1 item" : `${count} items`;
		const name = entry.key === null ? `"${entryLabel(entry)}"` : entry.node.title ? `"${entry.rawKey}" (${entry.node.title})` : `"${entry.rawKey}"`;
		openModalInWindow(
			new ConfirmDeleteModal(
				this.app,
				`Delete the group ${name} and the ${items} inside it? This can't be undone.`,
				remove,
			),
			this.containerEl.win,
		);
	}

	private openAddModal(path: string[]): void {
		openModalInWindow(
			new EntryEditorModal(this.app, "Add item", null, (draft) => {
				const node = nodeFromDraft(draft, null);
				const result = addEntry(this.getRoot(), path, draft.rawKey, node);
				if (!result.ok) return result.error;
				// The new entry is the group's last; its key may be a fresh `nokeyN` token.
				const siblings = getGroupAtPath(result.root, path)?.entries ?? [];
				const added = siblings[siblings.length - 1];
				if (added && node.kind === "group") this.stickyStore.set(setStickyPath(this.stickyStore.paths(), [...path, added.rawKey], draft.sticky));
				void this.persist(result.root);
				return null;
			}, this.macroStore),
			this.containerEl.win,
		);
	}

	private openEditModal(path: string[], entry: GroupEntry): void {
		const existingEntries = entry.node.kind === "group" ? entry.node.entries : null;
		const lockKind = existingEntries !== null && existingEntries.length > 0;
		openModalInWindow(
			new EntryEditorModal(
				this.app,
				"Edit item",
				{ rawKey: entry.rawKey, node: entry.node, sticky: isStickyPath(this.stickyStore.paths(), [...path, entry.rawKey]) },
				(draft) => {
					const node = nodeFromDraft(draft, existingEntries);
					const result = updateEntry(this.getRoot(), path, entry.rawKey, draft.rawKey, node);
					if (!result.ok) return result.error;
					// The entry keeps its place; its key (and so the key path of it and every group inside it) may have changed.
					const index = getGroupAtPath(this.getRoot(), path)?.entries.findIndex((e) => e.rawKey === entry.rawKey) ?? -1;
					const updated = index === -1 ? undefined : getGroupAtPath(result.root, path)?.entries[index];
					const from = [...path, entry.rawKey];
					let sticky = removeStickyPaths(this.stickyStore.paths(), from);
					if (updated && node.kind === "group") {
						sticky = setStickyPath(moveStickyPaths(this.stickyStore.paths(), from, [...path, updated.rawKey]), [...path, updated.rawKey], draft.sticky);
					}
					this.stickyStore.set(sticky);
					void this.persist(result.root);
					return null;
				},
				this.macroStore,
				lockKind ? "Has items; change its items first to switch this away from a group." : undefined,
			),
			this.containerEl.win,
		);
	}
}
