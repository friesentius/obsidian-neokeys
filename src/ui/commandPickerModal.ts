import { App, FuzzySuggestModal } from "obsidian";
import { listCommands } from "../obsidianCommands";

/** Searchable picker over Obsidian's currently registered commands, by id and display name. */
export class CommandPickerModal extends FuzzySuggestModal<{ id: string; name: string }> {
	constructor(
		app: App,
		private readonly onPick: (command: { id: string; name: string }) => void,
		/** Commands not to offer (a macro leaves out the Leader and itself). */
		private readonly exclude: (id: string) => boolean = () => false,
	) {
		super(app);
		this.setPlaceholder("Search for a command...");
	}

	getItems(): { id: string; name: string }[] {
		return listCommands(this.app)
			.filter((command) => !this.exclude(command.id))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	getItemText(item: { id: string; name: string }): string {
		return `${item.name} (${item.id})`;
	}

	onChooseItem(item: { id: string; name: string }): void {
		this.onPick(item);
	}
}
