import { App, ButtonComponent, Modal, Setting, type TextAreaComponent } from "obsidian";

const HELP =
	"Replaces the selection in the open note. {{selection}} is the selected text (empty when nothing is selected), {{cursor}} is where the cursor ends up (after the text without one), {{date:YYYY-MM-DD}} is the date and time in any moment.js format. One undo takes it back.";

const PLACEHOLDERS: readonly [label: string, token: string][] = [
	["Selection", "{{selection}}"],
	["Cursor", "{{cursor}}"],
	["Date", "{{date:YYYY-MM-DD}}"],
];

/** The small dialog a macro's text step is written in: the text, its placeholders as buttons, and their help. */
export class TextStepModal extends Modal {
	private text: string;
	private textArea: TextAreaComponent | null = null;
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		initial: string,
		private readonly onSave: (text: string) => void,
	) {
		super(app);
		this.text = initial;
	}

	onOpen(): void {
		this.modalEl.addClass("neokeys-entry-editor", "neokeys-text-step-editor");
		this.titleEl.setText("Text step");
		const { contentEl } = this;

		new Setting(contentEl)
			.setName("Text")
			.setDesc(HELP)
			.setClass("neokeys-text-step-setting")
			.addTextArea((text) => {
				this.textArea = text;
				text.setPlaceholder("Text to insert").setValue(this.text).onChange((value) => (this.text = value));
				text.inputEl.rows = 4;
				text.inputEl.addClass("neokeys-text-step-input");
				// Placeholders and markup are not words: keep a phone keyboard from "fixing" them.
				text.inputEl.setAttribute("autocapitalize", "off");
				text.inputEl.setAttribute("autocorrect", "off");
				text.inputEl.setAttribute("spellcheck", "false");
			});

		const placeholders = contentEl.createDiv({ cls: "neokeys-text-step-placeholders" });
		for (const [label, token] of PLACEHOLDERS) {
			new ButtonComponent(placeholders)
				.setButtonText(label)
				.setTooltip(`Insert ${token}`)
				.onClick(() => this.insert(token));
		}

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(buttons)
			.setButtonText("Save")
			.setCta()
			.onClick(() => this.submit(buttons));
		window.setTimeout(() => this.textArea?.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Put `token` where the caret is (over any selected text) and leave the caret after it. */
	private insert(token: string): void {
		const input = this.textArea?.inputEl;
		if (!input) return;
		const from = input.selectionStart ?? input.value.length;
		const to = input.selectionEnd ?? from;
		input.setRangeText(token, from, to, "end");
		this.text = input.value;
		input.focus();
	}

	private submit(buttons: HTMLElement): void {
		if (this.text.length === 0) {
			if (!this.errorEl) {
				this.errorEl = this.contentEl.createDiv({ cls: "neokeys-entry-editor-error" });
				this.contentEl.insertBefore(this.errorEl, buttons);
			}
			this.errorEl.setText("Write the text to insert first.");
			return;
		}
		this.close();
		this.onSave(this.text);
	}
}
