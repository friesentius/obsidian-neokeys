import { App, ButtonComponent, ExtraButtonComponent, getIcon, Modal, Platform, Scope, setIcon, Setting } from "obsidian";
import type { EntryDraft, EntryKind } from "../entryDraft";
import { deviceFromPlatform, hasKeyField, keyIsOptional, validateKeyAndIcon, type EntryDevice } from "../entryValidation";
import { keyFromEvent, keyToString } from "../keys";
import { isKeylessId } from "../keyless";
import { keyFromTyped } from "../typedKey";
import { CommandPickerModal } from "./commandPickerModal";
import { IconPickerModal } from "./iconPickerModal";
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
		initial: { rawKey: string; node: KeymapNode } | null,
		private readonly onSubmit: (draft: EntryDraft) => string | null,
		private readonly kindLockedReason?: string,
	) {
		super(app);
		this.kind = initial?.node.kind ?? "command";
		// An item with no key is stored under a bookkeeping token; the form shows it as an empty key.
		this.rawKey = initial === null || isKeylessId(initial.rawKey) ? "" : initial.rawKey;
		this.icon = initial?.node.icon ?? "";
		if (initial?.node.kind === "group") {
			this.title = initial.node.title ?? "";
			this.description = initial.node.description ?? "";
		} else if (initial?.node.kind === "command") {
			this.command = initial.node.command;
			this.commandName = getCommandName(app, initial.node.command) ?? "";
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

		if (this.kind === "file") {
			new Setting(contentEl)
				.setName("File path")
				.addText((text) => text.setValue(this.file).onChange((value) => (this.file = value)));
		}

		new Setting(contentEl)
			.setName("Description")
			.addTextArea((text) => {
				text
					.setPlaceholder("Optional description")
					.setValue(this.description)
					.onChange((value) => (this.description = value));
				// A textarea wraps, so long existing descriptions are shown in full instead of cut off.
				text.inputEl.rows = 2;
				text.inputEl.addClass("neokeys-entry-description-input");
			});

		this.buttonContainerEl = contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(this.buttonContainerEl).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(this.buttonContainerEl)
			.setButtonText("Save")
			.setCta()
			.onClick(() => this.submit());
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
		if (this.device === "phone") {
			keySetting.setDesc(
				"One character, typed on your keyboard, or a key with Ctrl/Shift/Alt/Cmd recorded from a hardware keyboard. Not needed when the item has an icon.",
			);
		} else if (this.device === "tablet") {
			keySetting.setDesc("One character, typed on your keyboard, or a key with Ctrl/Shift/Alt/Cmd recorded from a hardware keyboard.");
		} else {
			keySetting.setDesc("A single key, with optional Ctrl/Shift/Alt/Cmd.");
		}

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
					if (!(evt as InputEvent).isComposing) this.readTypedKey(evt as InputEvent);
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
		const known = this.icon === "" || getIcon(this.icon) !== null;
		const setting = new Setting(contentEl)
			.setName("Icon")
			.setDesc(
				known
					? this.device === "phone"
						? "Shown on the dial's circle in place of the key (the key still shows in the pill and descriptions). Needed when the item has no key."
						: "Shown on the mobile dial's circle in place of the key (the key still shows in the pill and descriptions). Optional."
					: "Obsidian has no icon with this name, so the mobile dial shows the key instead. Pick another, or clear it.",
			);
		const pictureEl = setting.controlEl.createSpan({ cls: "neokeys-entry-icon-picture" });
		if (this.icon !== "" && known) setIcon(pictureEl, this.icon);
		setting.controlEl.createSpan({ cls: "neokeys-entry-key-display", text: this.icon || "None" });
		setting.addButton((button) =>
			button.setButtonText(this.icon === "" ? "Choose icon..." : "Change icon...").onClick(() => {
				openModalInWindow(
					new IconPickerModal(this.app, (picked) => {
						this.icon = picked;
						this.render();
					}),
					this.contentEl.win,
				);
			}),
		);
		if (this.icon !== "") {
			setting.addExtraButton((button: ExtraButtonComponent) =>
				button
					.setIcon("x")
					.setTooltip("Clear the icon")
					.onClick(() => {
						this.icon = "";
						this.render();
					}),
			);
		}
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
		};

		const error = this.onSubmit(draft);
		if (error) {
			this.showError(error);
			return;
		}
		this.close();
	}
}
