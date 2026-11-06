import { App, Modal } from "obsidian";
import { ShowDelayGate } from "../delay";
import { keyFromEvent, keyGlyph } from "../keys";
import { getCommandName } from "../obsidianCommands";
import { entryLabel, findEntry, sortEntries } from "../tree";
import type { GroupNode } from "../types";

export interface WhichKeyCallbacks {
	executeCommand(id: string): void;
	openFile(path: string): void;
}

export class WhichKeyModal extends Modal {
	private path: GroupNode[];
	private delayGate!: ShowDelayGate;
	private breadcrumbEl!: HTMLElement;
	private headerTitleEl!: HTMLElement;
	private descEl!: HTMLElement;
	private gridEl!: HTMLElement;

	constructor(
		app: App,
		private readonly root: GroupNode,
		private readonly showDelayMs: number,
		private readonly callbacks: WhichKeyCallbacks,
	) {
		super(app);
		this.path = [root];
	}

	onOpen(): void {
		this.containerEl.addClass("neokeys-modal-container");
		this.modalEl.addClass("neokeys-modal", "neokeys-modal-collapsed");

		const header = this.contentEl.createDiv({ cls: "neokeys-header" });
		this.headerTitleEl = header.createDiv({ cls: "neokeys-header-title" });
		this.descEl = header.createDiv({ cls: "neokeys-header-desc" });
		this.breadcrumbEl = this.contentEl.createDiv({ cls: "neokeys-breadcrumb" });
		this.gridEl = this.contentEl.createDiv({ cls: "neokeys-grid" });

		this.scope.register(null, null, (evt) => this.handleKey(evt));

		this.render();
		this.delayGate = new ShowDelayGate(this.showDelayMs, () => {
			this.modalEl.removeClass("neokeys-modal-collapsed");
		});
		this.delayGate.poke();
	}

	onClose(): void {
		this.delayGate?.cancel();
		this.contentEl.empty();
	}

	private get currentGroup(): GroupNode {
		return this.path[this.path.length - 1];
	}

	private render(): void {
		const group = this.currentGroup;
		this.headerTitleEl.setText(group.title ?? "Neokeys");
		this.descEl.setText(group.description ?? "");
		this.descEl.toggleClass("neokeys-hidden", !group.description);

		this.breadcrumbEl.empty();
		this.breadcrumbEl.toggleClass("neokeys-hidden", this.path.length <= 1);
		for (let i = 1; i < this.path.length; i++) {
			const parent = this.path[i - 1];
			const entry = parent.entries.find((e) => e.node === this.path[i]);
			this.breadcrumbEl.createSpan({ text: entry ? keyGlyph(entry.key) : "?", cls: "neokeys-breadcrumb-key" });
		}

		this.gridEl.empty();
		for (const entry of sortEntries(group)) {
			const row = this.gridEl.createDiv({ cls: `neokeys-row neokeys-row-${entry.node.kind}` });
			row.createSpan({ text: keyGlyph(entry.key), cls: "neokeys-key" });
			const label = entryLabel(entry, (id) => getCommandName(this.app, id));
			row.createSpan({
				text: entry.node.kind === "group" ? `+${label}` : label,
				cls: "neokeys-label",
			});
		}
	}

	private handleKey(evt: KeyboardEvent): false {
		if (evt.isComposing) {
			return false;
		}

		if (evt.key === "Escape") {
			this.close();
			return false;
		}

		if (evt.key === "Backspace") {
			if (this.path.length > 1) {
				this.path.pop();
				this.render();
			} else {
				this.close();
			}
			return false;
		}

		const pressed = keyFromEvent(evt);
		const entry = findEntry(this.currentGroup, pressed);
		if (!entry) {
			return false;
		}

		this.delayGate.poke();

		if (entry.node.kind === "group") {
			this.path.push(entry.node);
			this.render();
			return false;
		}

		this.close();
		if (entry.node.kind === "command") {
			this.callbacks.executeCommand(entry.node.command);
		} else {
			this.callbacks.openFile(entry.node.file);
		}
		return false;
	}
}
