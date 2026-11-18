import { App, ButtonComponent, Modal, Setting, type ExtraButtonComponent } from "obsidian";
import { knownStep, LEADER_COMMAND_ID, macroCommandId, newMacroId, type Macro, type MacroStep } from "../macros/model";
import { stepKindLabel, stepSummary } from "../macros/summary";
import { checkMacro } from "../macros/validation";
import { getCommandName, hasCommand } from "../obsidianCommands";
import { CommandPickerModal } from "./commandPickerModal";
import { renderIconSetting } from "./iconSetting";
import { openModalInWindow } from "./modalWindow";
import { TextStepModal } from "./textStepModal";

/** What the macro editor needs from the plugin: the saved macros, and a way to save one. */
export interface MacroStore {
	macros(): readonly Macro[];
	save(macro: Macro): Promise<void>;
}

/**
 * The macro editor: a name, an icon, and the steps in order, each a row with move up, move down,
 * edit and delete, like the keymap's tree editor. A command step is picked with the same command
 * picker the keymap uses; a text step is written in its own small dialog with room for the
 * placeholder help. Saving checks the macro first (a name, a step, no Leader step, no loop).
 */
export class MacroEditorModal extends Modal {
	private name: string;
	private icon: string;
	private steps: MacroStep[];
	private errorEl: HTMLElement | null = null;
	private buttonContainerEl!: HTMLElement;
	private saving = false;

	constructor(
		app: App,
		/** The macro being edited, or null for a new one. */
		private readonly initial: Macro | null,
		private readonly store: MacroStore,
		/** Called with the saved macro once it is stored. */
		private readonly onSaved: (macro: Macro) => void = () => {},
	) {
		super(app);
		this.name = initial?.name ?? "";
		this.icon = initial?.icon ?? "";
		this.steps = initial ? initial.steps.map((step) => ({ ...step })) : [];
	}

	onOpen(): void {
		this.modalEl.addClass("neokeys-entry-editor", "neokeys-macro-editor");
		this.titleEl.setText(this.initial ? "Edit macro" : "New macro");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		// A re-render (a step moved or edited) keeps the dialog where it was scrolled to.
		const scrolled = [this.modalEl.scrollTop, this.contentEl.scrollTop];
		const { contentEl } = this;
		contentEl.empty();
		this.errorEl = null;

		const nameSetting = new Setting(contentEl).setName("Name").setDesc(paletteNote(this.name));
		nameSetting.addText((text) => {
			text.setPlaceholder("Macro name")
				.setValue(this.name)
				.onChange((value) => {
					this.name = value;
					nameSetting.setDesc(paletteNote(value));
				});
			text.inputEl.addClass("neokeys-macro-name-input");
		});

		renderIconSetting(
			this.app,
			contentEl,
			this.icon,
			{
				known: "Optional. Shown in the macro list and wherever Obsidian shows a command's icon, such as the mobile toolbar.",
				unknown: "Obsidian has no icon with this name. Pick another, or clear it.",
			},
			(icon) => {
				this.icon = icon;
				this.render();
			},
		);

		new Setting(contentEl).setName("Steps").setHeading().settingEl.addClass("neokeys-macro-steps-heading");
		if (this.steps.length === 0) {
			contentEl.createDiv({ cls: "neokeys-macro-steps-empty", text: "No steps yet. Add a command or some text." });
		}
		this.steps.forEach((step, index) => this.renderStep(contentEl, step, index));

		const add = new Setting(contentEl).setClass("neokeys-macro-add-steps");
		add.addButton((button) => button.setButtonText("Add command step").onClick(() => this.pickCommand(null)));
		add.addButton((button) => button.setButtonText("Add text step").onClick(() => this.editText(null)));

		this.buttonContainerEl = contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(this.buttonContainerEl).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(this.buttonContainerEl)
			.setButtonText("Save")
			.setCta()
			.onClick(() => void this.submit());

		[this.modalEl.scrollTop, this.contentEl.scrollTop] = scrolled;
	}

	private renderStep(contentEl: HTMLElement, step: MacroStep, index: number): void {
		const known = knownStep(step);
		const row = new Setting(contentEl).setName(`${index + 1}. ${stepKindLabel(step)}`).setClass("neokeys-macro-step");
		const desc = row.descEl;
		if (known?.type === "text") {
			desc.createSpan({ cls: "neokeys-macro-step-text", text: stepSummary(step, () => undefined) });
		} else if (known?.type === "command") {
			const name = getCommandName(this.app, known.command);
			desc.setText(name === undefined ? known.command : `${name} (${known.command})`);
			if (!hasCommand(this.app, known.command)) desc.createSpan({ cls: "neokeys-invalid-badge", text: "Unknown command" });
		} else {
			desc.setText("Saved by a newer version of Neokeys. It is kept as it is; update Neokeys on this device to change or run it.");
		}

		const extra = (icon: string, tooltip: string, onClick: () => void, disabled = false): void => {
			row.addExtraButton((button: ExtraButtonComponent) => button.setIcon(icon).setTooltip(tooltip).setDisabled(disabled).onClick(onClick));
		};
		extra("arrow-up", "Move up", () => this.move(index, -1), index === 0);
		extra("arrow-down", "Move down", () => this.move(index, 1), index === this.steps.length - 1);
		if (known !== null) extra("pencil", "Edit", () => (known.type === "text" ? this.editText(index) : this.pickCommand(index)));
		extra("trash-2", "Delete", () => {
			this.steps.splice(index, 1);
			this.render();
		});
	}

	private move(index: number, by: -1 | 1): void {
		const to = index + by;
		if (to < 0 || to >= this.steps.length) return;
		[this.steps[index], this.steps[to]] = [this.steps[to], this.steps[index]];
		this.render();
	}

	/** Pick the command for step `index`, or for a new step at the end when null. */
	private pickCommand(index: number | null): void {
		const own = this.initial ? macroCommandId(this.initial.id) : null;
		openModalInWindow(
			new CommandPickerModal(
				this.app,
				(picked) => {
					const step: MacroStep = { ...(index === null ? {} : this.steps[index]), type: "command", command: picked.id };
					if (index === null) this.steps.push(step);
					else this.steps[index] = step;
					this.render();
				},
				(id) => id === LEADER_COMMAND_ID || id === own,
			),
			this.contentEl.win,
		);
	}

	/** Write the text for step `index`, or for a new step at the end when null. */
	private editText(index: number | null): void {
		const current = index === null ? null : knownStep(this.steps[index]);
		openModalInWindow(
			new TextStepModal(this.app, current?.type === "text" ? current.text : "", (text) => {
				const step: MacroStep = { ...(index === null ? {} : this.steps[index]), type: "text", text };
				if (index === null) this.steps.push(step);
				else this.steps[index] = step;
				this.render();
			}),
			this.contentEl.win,
		);
	}

	private showError(message: string): void {
		if (!this.errorEl) {
			this.errorEl = this.contentEl.createDiv({ cls: "neokeys-entry-editor-error" });
			this.contentEl.insertBefore(this.errorEl, this.buttonContainerEl);
		}
		this.errorEl.setText(message);
	}

	private async submit(): Promise<void> {
		if (this.saving) return;
		const saved = this.store.macros();
		// Anything a newer Neokeys stored on the macro is kept; the id never changes once made.
		const macro: Macro = {
			...(this.initial ?? {}),
			id: this.initial?.id ?? newMacroId(this.name, saved.map((m) => m.id)),
			name: this.name.trim(),
			steps: this.steps,
		};
		if (this.icon.trim().length > 0) macro.icon = this.icon.trim();
		else delete macro.icon;

		const error = checkMacro(macro, saved);
		if (error !== null) {
			this.showError(error);
			return;
		}
		this.saving = true;
		try {
			await this.store.save(macro);
		} finally {
			this.saving = false;
		}
		this.close();
		this.onSaved(macro);
	}
}

function paletteNote(name: string): string {
	return `Shown in the command palette as "Neokeys: ${name.trim() || "<name>"}".`;
}
