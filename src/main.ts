import { Notice, Plugin } from "obsidian";
import { KeymapParseError, parseKeymapSource } from "./keymap";
import { executeCommandById } from "./obsidianCommands";
import { DEFAULT_SETTINGS, NeokeysSettingTab } from "./settings";
import type { NeokeysSettings } from "./types";
import { WhichKeyModal } from "./ui/whichKeyModal";

export default class NeokeysPlugin extends Plugin {
	settings: NeokeysSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "leader",
			name: "Leader",
			callback: () => this.activateLeader(),
		});

		this.addSettingTab(new NeokeysSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<NeokeysSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private activateLeader(): void {
		let root;
		try {
			root = parseKeymapSource(this.settings.keymapSource);
		} catch (err) {
			const message = err instanceof KeymapParseError ? err.message : String(err);
			new Notice(`Neokeys: invalid keymap — ${message}`, 8000);
			return;
		}

		new WhichKeyModal(this.app, root, this.settings.showDelayMs, {
			executeCommand: (id) => executeCommandById(this.app, id),
			openFile: (path) => {
				void this.app.workspace.openLinkText(path, "", false);
			},
		}).open();
	}
}
