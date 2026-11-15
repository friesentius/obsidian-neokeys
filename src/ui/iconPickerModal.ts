import { App, getIconIds, setIcon, SuggestModal } from "obsidian";
import { searchIcons } from "../icons";

/** Searchable picker over Obsidian's icons (Lucide's set, plus any a plugin registers), each shown with its picture. */
export class IconPickerModal extends SuggestModal<string> {
	constructor(
		app: App,
		private readonly onPick: (icon: string) => void,
	) {
		super(app);
		this.setPlaceholder("Search icons (file, star, folder...)");
		this.modalEl.addClass("neokeys-icon-picker");
	}

	getSuggestions(query: string): string[] {
		return searchIcons(getIconIds(), query);
	}

	renderSuggestion(name: string, el: HTMLElement): void {
		el.addClass("neokeys-icon-suggestion");
		setIcon(el.createSpan({ cls: "neokeys-icon-suggestion-icon" }), name);
		el.createSpan({ text: name });
	}

	onChooseSuggestion(name: string): void {
		this.onPick(name);
	}
}
