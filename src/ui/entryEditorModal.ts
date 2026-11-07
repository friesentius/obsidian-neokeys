import { App, ButtonComponent, Modal, Scope, Setting } from "obsidian";
import { keyFromEvent, keyToString } from "../keys";
import { CommandPickerModal } from "./commandPickerModal";
import type { KeymapNode } from "../types";

export type EntryKind = "group" | "command" | "file";

export interface EntryDraft {
	rawKey: string;
	kind: EntryKind;
	title: string;
	description: string;
	command: string;
	commandName: string;
	file: string;
}

const MODIFIER_KEY_NAMES = new Set(["Control", "Shift", "Alt", "AltGraph", "Meta", "OS", "CapsLock"]);

/**
 * Add/edit form for one tree entry. `onSubmit` does the actual tree mutation (so it can run the
 * shared key-validation/dedupe logic in treeOps.ts) and returns an error string to keep the modal
 * open and show it, or null on success to close it.
 */
export class EntryEditorModal extends Modal {
	private kind: EntryKind;
	private rawKey: string;
	private title = "";
	private description = "";
	private command = "";
	private commandName = "";
	private file = "";
	private errorEl!: HTMLElement;
	private keyDisplayEl!: HTMLElement;
	private stopRecording: (() => void) | null = null;

	constructor(
		app: App,
		private readonly heading: string,
		initial: { rawKey: string; node: KeymapNode } | null,
		private readonly onSubmit: (draft: EntryDraft) => string | null,
	) {
		super(app);
		this.kind = initial?.node.kind ?? "command";
		this.rawKey = initial?.rawKey ?? "";
		if (initial?.node.kind === "group") {
			this.title = initial.node.title ?? "";
			this.description = initial.node.description ?? "";
		} else if (initial?.node.kind === "command") {
			this.command = initial.node.command;
			this.description = initial.node.description ?? "";
		} else if (initial?.node.kind === "file") {
			this.file = initial.node.file;
			this.description = initial.node.description ?? "";
		}
	}

	onOpen(): void {
		this.modalEl.addClass("neokeys-entry-editor");
		this.titleEl.setText(this.heading);
		this.render();
	}

	onClose(): void {
		this.cancelRecording();
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl).setName("Kind").addDropdown((dd) =>
			dd
				.addOption("group", "Group (submenu)")
				.addOption("command", "Command")
				.addOption("file", "File")
				.setValue(this.kind)
				.onChange((value) => {
					this.kind = value as EntryKind;
					this.render();
				}),
		);

		const keySetting = new Setting(contentEl)
			.setName("Key")
			.setDesc("A single key, with optional Ctrl/Shift/Alt/Cmd.");
		this.keyDisplayEl = keySetting.controlEl.createSpan({
			cls: "neokeys-entry-key-display",
			text: this.rawKey || "Not set",
		});
		keySetting.addButton((button) => button.setButtonText("Record key").onClick(() => this.startRecording(button)));

		if (this.kind === "group") {
			new Setting(contentEl)
				.setName("Title")
				.addText((text) => text.setValue(this.title).onChange((value) => (this.title = value)));
		}

		if (this.kind === "command") {
			new Setting(contentEl)
				.setName("Command")
				.setDesc(this.command ? `${this.commandName || this.command} (${this.command})` : "No command chosen")
				.addButton((button) =>
					button.setButtonText("Choose command...").onClick(() => {
						new CommandPickerModal(this.app, (picked) => {
							this.command = picked.id;
							this.commandName = picked.name;
							this.render();
						}).open();
					}),
				);
		}

		if (this.kind === "file") {
			new Setting(contentEl)
				.setName("File path")
				.addText((text) => text.setValue(this.file).onChange((value) => (this.file = value)));
		}

		new Setting(contentEl)
			.setName("Description")
			.addText((text) => text.setValue(this.description).onChange((value) => (this.description = value)));

		this.errorEl = contentEl.createDiv({ cls: "neokeys-entry-editor-error" });

		new Setting(contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => this.submit()),
			);
	}

	private startRecording(button: ButtonComponent): void {
		this.cancelRecording();
		button.setButtonText("Press a key... (Esc to cancel)");
		button.setDisabled(true);

		// Same Scope-ahead-of-Obsidian's-own-handlers trick as the settings tab's combo recorder.
		const scope = new Scope();
		scope.register(null, null, (evt) => {
			if (evt.isComposing) return false;
			if (evt.key === "Escape") {
				this.cancelRecording();
				return false;
			}
			if (MODIFIER_KEY_NAMES.has(evt.key)) return false;

			const key = keyFromEvent(evt);
			this.cancelRecording();
			this.rawKey = keyToString(key);
			this.keyDisplayEl.setText(this.rawKey);
			return false;
		});
		this.app.keymap.pushScope(scope);
		this.stopRecording = () => {
			this.app.keymap.popScope(scope);
			button.setButtonText("Record key");
			button.setDisabled(false);
		};
	}

	private cancelRecording(): void {
		this.stopRecording?.();
		this.stopRecording = null;
	}

	private submit(): void {
		if (this.rawKey.trim().length === 0) {
			this.errorEl.setText("Set a key first.");
			return;
		}
		if (this.kind === "command" && this.command.trim().length === 0) {
			this.errorEl.setText("Choose a command first.");
			return;
		}
		if (this.kind === "file" && this.file.trim().length === 0) {
			this.errorEl.setText("Set a file path first.");
			return;
		}

		const draft: EntryDraft = {
			rawKey: this.rawKey.trim(),
			kind: this.kind,
			title: this.title.trim(),
			description: this.description.trim(),
			command: this.command.trim(),
			commandName: this.commandName,
			file: this.file.trim(),
		};

		const error = this.onSubmit(draft);
		if (error) {
			this.errorEl.setText(error);
			return;
		}
		this.close();
	}
}
