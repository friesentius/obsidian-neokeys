import { App, ButtonComponent, Modal } from "obsidian";

/** Asks before deleting something irreversible; `onConfirm` runs only if the user clicks Delete. */
export class ConfirmDeleteModal extends Modal {
	constructor(
		app: App,
		private readonly message: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Delete group?");
		this.contentEl.createEl("p", { text: this.message });
		const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
		const deleteButton = new ButtonComponent(buttons).setButtonText("Delete").onClick(() => {
			this.close();
			this.onConfirm();
		});
		deleteButton.buttonEl.addClass("mod-warning");
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
