import { App, ButtonComponent, Modal, Platform, Scope, Setting } from "obsidian";
import { entryKindOf, type EntryDraft, type EntryKind } from "../entryDraft";
import { deviceFromPlatform, hasKeyField, iconDescription, keyDescription, keyIsOptional, validateKeyAndIcon, type EntryDevice } from "../entryValidation";
import { keyFromEvent, keyToString } from "../keys";
import { isKeylessId } from "../keyless";
import { keyFromTyped } from "../typedKey";
import { CommandPickerModal } from "./commandPickerModal";
import { renderIconSetting } from "./iconSetting";
import { MacroEditorModal, type MacroStore } from "./macroEditorModal";
import { macroIdFromCommand } from "../macros/model";
import { macroStepsLine } from "../macros/summary";
import { getCommandName } from "../obsidianCommands";
import { openModalInWindow } from "./modalWindow";
import type { KeymapNode } from "../types";

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
	private icon = "";
	private command = "";
	private commandName = "";
	private file = "";
	/** The id of the macro a macro item runs, "" when none is chosen yet. */
	private macro = "";
	/** For a group: whether it stays open after one of its items runs. */
	private sticky: boolean;
	private errorEl: HTMLElement | null = null;
	private buttonContainerEl!: HTMLElement;
	private keyDisplayEl: HTMLElement | null = null;
	private keyInputEl: HTMLInputElement | null = null;
	/** Which kind of device the form is on, read when it opens: what the key and icon rows offer and require depends on it. */
	private device: EntryDevice = "desktop";
	private stopRecording: (() => void) | null = null;

	constructor(
		app: App,
		private readonly heading: string,
		initial: { rawKey: string; node: KeymapNode; sticky: boolean } | null,
		private readonly onSubmit: (draft: EntryDraft) => string | null,
		private readonly macroStore: MacroStore,
		private readonly kindLockedReason?: string,
	) {
		super(app);
		this.kind = initial ? entryKindOf(initial.node) : "command";
		// An item with no key is stored under a bookkeeping token; the form shows it as an empty key.
		this.rawKey = initial === null || isKeylessId(initial.rawKey) ? "" : initial.rawKey;
		this.icon = initial?.node.icon ?? "";
		this.sticky = initial?.sticky ?? false;
		if (initial?.node.kind === "group") {
			this.title = initial.node.title ?? "";
			this.description = initial.node.description ?? "";
		} else if (initial?.node.kind === "command") {
			this.command = initial.node.command;
			this.commandName = getCommandName(app, initial.node.command) ?? "";
			this.macro = macroIdFromCommand(initial.node.command) ?? "";
			this.description = initial.node.description ?? "";
		} else if (initial?.node.kind === "file") {
			this.file = initial.node.file;
			this.description = initial.node.description ?? "";
		}
	}

	onOpen(): void {
		this.device = deviceFromPlatform(Platform);
		this.modalEl.addClass("neokeys-entry-editor");
		this.titleEl.setText(this.heading);
		this.render();
	}

	onClose(): void {
		this.cancelRecording();
		this.contentEl.empty();
	}

	private render(): void {
		this.syncKeyFromField();
		const { contentEl } = this;
		contentEl.empty();
		this.errorEl = null;

		const kindSetting = new Setting(contentEl).setName("Kind");
		if (this.kindLockedReason !== undefined) {
			kindSetting.setDesc(this.kindLockedReason);
		}
		kindSetting.addDropdown((dd) =>
			dd
				.addOption("group", "Group (submenu)")
				.addOption("command", "Command")
				.addOption("file", "File")
				.addOption("macro", "Macro")
				.setValue(this.kind)
				.setDisabled(this.kindLockedReason !== undefined)
				.onChange((value) => {
					this.kind = value as EntryKind;
					this.render();
				}),
		);

		this.renderKeySetting(contentEl);

		this.renderIconSetting(contentEl);

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
						openModalInWindow(
							new CommandPickerModal(this.app, (picked) => {
								this.command = picked.id;
								this.commandName = picked.name;
								this.render();
							}),
							this.contentEl.win,
						);
					}),
				);
		}

		if (this.kind === "macro") this.renderMacroSetting(contentEl);

		if (this.kind === "file") {
			new Setting(contentEl)
				.setName("File path")
				.addText((text) => text.setValue(this.file).onChange((value) => (this.file = value)));
		}

		new Setting(contentEl)
			.setName("Description")
			.addTextArea((text) => {
				text
					.setPlaceholder(this.kind === "macro" ? "Optional. Defaults to the macro's name." : "Optional description")
					.setValue(this.description)
					.onChange((value) => (this.description = value));
				// A textarea wraps, so long existing descriptions are shown in full instead of cut off.
				text.inputEl.rows = 2;
				text.inputEl.addClass("neokeys-entry-description-input");
			});

		if (this.kind === "group") {
			new Setting(contentEl)
				.setName("Stay open after an item runs")
				.setDesc("Sticky: the group stays open, so an item can run again and again. Escape or a tap outside closes it.")
				.addToggle((toggle) => toggle.setValue(this.sticky).onChange((value) => (this.sticky = value)));
		}

		this.buttonContainerEl = contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(this.buttonContainerEl).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(this.buttonContainerEl)
			.setButtonText("Save")
			.setCta()
			.onClick(() => this.submit());
	}

	/**
	 * The Macro row: a dropdown of the saved macros, and "New macro..." to make one in the macro
	 * editor and come back with it chosen. The item is stored as a command item running the macro.
	 */
	private renderMacroSetting(contentEl: HTMLElement): void {
		const macros = this.macroStore.macros();
		const chosen = macros.find((macro) => macro.id === this.macro);
		const desc = chosen
			? macroStepsLine(chosen, (id) => getCommandName(this.app, id))
			: this.macro !== ""
				? `The macro "${this.macro}" no longer exists. Choose another, or make a new one.`
				: "Choose one of your macros, or make a new one.";
		const setting = new Setting(contentEl).setName("Macro").setDesc(desc).setClass("neokeys-entry-macro");
		setting.addDropdown((dropdown) => {
			dropdown.addOption("", macros.length === 0 ? "No macros yet" : "Choose a macro...");
			for (const macro of macros) dropdown.addOption(macro.id, macro.name);
			if (this.macro !== "" && !chosen) dropdown.addOption(this.macro, `${this.macro} (missing)`);
			dropdown.setValue(this.macro).onChange((value) => {
				this.macro = value;
				this.render();
			});
		});
		setting.addButton((button) =>
			button.setButtonText("New macro...").onClick(() => {
				openModalInWindow(
					new MacroEditorModal(this.app, null, this.macroStore, (macro) => {
						this.macro = macro.id;
						this.render();
					}),
					this.contentEl.win,
				);
			}),
		);
	}

	/**
	 * The key row. Every device but a desktop gets a text field: tapping it opens the on-screen
	 * keyboard and the typed character is the key, which "Record key" cannot do since a phone gives
	 * nothing the recorder's scope could focus. Every device keeps "Record key" for a hardware
	 * keyboard, since whether a phone or tablet has one cannot be told reliably.
	 */
	private renderKeySetting(contentEl: HTMLElement): void {
		this.keyDisplayEl = null;
		this.keyInputEl = null;
		const keySetting = new Setting(contentEl).setName("Key");
		keySetting.setDesc(keyDescription(this.device));

		if (hasKeyField(this.device)) {
			keySetting.addText((text) => {
				const input = text.inputEl;
				this.keyInputEl = input;
				input.addClass("neokeys-entry-key-input");
				input.setAttribute("aria-label", "Key");
				// Case is part of a key ("F" is Shift+F) and a key is not a word: keep the keyboard from fixing either.
				input.setAttribute("autocapitalize", "off");
				input.setAttribute("autocorrect", "off");
				input.setAttribute("autocomplete", "off");
				input.setAttribute("spellcheck", "false");
				input.setAttribute("enterkeyhint", "done");
				text.setPlaceholder(keyIsOptional(this.device) ? "Key (optional)" : "Key").setValue(this.rawKey);
				input.addEventListener("focus", () => input.select());
				// The key is read from what the field's text did, not from keydown, which a soft keyboard does not send dependably.
				input.addEventListener("input", (evt) => {
					if (!evt.isComposing) this.readTypedKey(evt);
				});
				input.addEventListener("compositionend", () => this.readTypedKey(null));
				// A predictive keyboard may still be composing when the user moves on: take what the field shows then.
				input.addEventListener("blur", () => this.syncKeyFromField());
			});
		} else {
			this.keyDisplayEl = keySetting.controlEl.createSpan({
				cls: "neokeys-entry-key-display",
				text: this.rawKey || "Not set",
			});
		}

		keySetting.addButton((button) => button.setButtonText("Record key").onClick(() => this.startRecording(button)));
	}

	/** Takes the key from the field after a change to it, then shows the key in the field's own form ("space" for a typed space). */
	private readTypedKey(evt: InputEvent | null): void {
		const input = this.keyInputEl;
		if (!input) return;
		const typed = keyFromTyped(evt?.inputType ?? "insertText", evt?.data ?? null, input.value);
		if (typed !== null) this.rawKey = typed;
		input.value = this.rawKey;
		if (typed !== null && typed !== "") input.select();
	}

	/**
	 * Takes the key from the field if it shows something other than the key held: a keyboard that is
	 * mid-composition (Android's, say) has not sent its final input yet when a button is tapped.
	 */
	private syncKeyFromField(): void {
		if (this.keyInputEl && this.keyInputEl.value !== this.rawKey) this.readTypedKey(null);
	}

	/** Shows the current key in whichever control the form has for it. */
	private showKey(): void {
		this.keyDisplayEl?.setText(this.rawKey || "Not set");
		if (this.keyInputEl) this.keyInputEl.value = this.rawKey;
	}

	/** The icon row: its picture and name, a picker over Obsidian's icons, and a clear button. */
	private renderIconSetting(contentEl: HTMLElement): void {
		renderIconSetting(
			this.app,
			contentEl,
			this.icon,
			{
				known: iconDescription(this.device),
				unknown: "Obsidian has no icon with this name, so the mobile dial shows the key instead. Pick another, or clear it.",
			},
			(icon) => {
				this.icon = icon;
				this.render();
			},
		);
	}

	private showError(message: string): void {
		if (!this.errorEl) {
			this.errorEl = this.contentEl.createDiv({ cls: "neokeys-entry-editor-error" });
			this.contentEl.insertBefore(this.errorEl, this.buttonContainerEl);
		}
		this.errorEl.setText(message);
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
			this.showKey();
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
		this.syncKeyFromField();
		const keyError = validateKeyAndIcon(this.device, this.rawKey, this.icon);
		if (keyError !== null) {
			this.showError(keyError);
			return;
		}
		if (this.kind === "command" && this.command.trim().length === 0) {
			this.showError("Choose a command first.");
			return;
		}
		if (this.kind === "macro" && this.macro === "") {
			this.showError("Choose a macro first, or make a new one.");
			return;
		}
		if (this.kind === "macro" && !this.macroStore.macros().some((macro) => macro.id === this.macro)) {
			this.showError("That macro no longer exists. Choose another, or make a new one.");
			return;
		}
		if (this.kind === "file" && this.file.trim().length === 0) {
			this.showError("Set a file path first.");
			return;
		}

		const draft: EntryDraft = {
			rawKey: this.rawKey.trim(),
			kind: this.kind,
			title: this.title.trim(),
			description: this.description.trim(),
			icon: this.icon.trim(),
			command: this.command.trim(),
			commandName: this.commandName,
			file: this.file.trim(),
			macro: this.macro,
			sticky: this.kind === "group" && this.sticky,
		};

		const error = this.onSubmit(draft);
		if (error) {
			this.showError(error);
			return;
		}
		this.close();
	}
}
