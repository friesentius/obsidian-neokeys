import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { KeymapParseError, parseKeymapSource } from "./keymap";
import { DEFAULT_KEYMAP_YAML } from "./sampleKeymap";
import type { NeokeysSettings } from "./types";
import type NeokeysPlugin from "./main";

export const DEFAULT_SETTINGS: NeokeysSettings = {
	keymapSource: DEFAULT_KEYMAP_YAML,
	showDelayMs: 200,
};

export class NeokeysSettingTab extends PluginSettingTab {
	private errorEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly plugin: NeokeysPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Leader key").setHeading();
		new Setting(containerEl)
			.setName("Assign the leader hotkey")
			.setDesc(
				'Neokeys ships no default hotkey. Open Settings → Hotkeys and bind a key or combo (e.g. Ctrl+B) to the "Neokeys: Leader" command.',
			);

		new Setting(containerEl).setName("Which-key popup").setHeading();
		new Setting(containerEl)
			.setName("Show delay")
			.setDesc("Milliseconds to wait before the which-key popup appears. A fast, memorized sequence never flashes it. Set to 0 to show immediately.")
			.addText((text) =>
				text
					.setPlaceholder("200")
					.setValue(String(this.plugin.settings.showDelayMs))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!Number.isFinite(parsed) || parsed < 0) return;
						this.plugin.settings.showDelayMs = Math.round(parsed);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Keymap").setHeading();
		new Setting(containerEl).setDesc(
			"Spacekeys-compatible YAML (JSON is also accepted, since JSON is valid YAML). Each group has items; each item is a group, a command (\"command: <id>\" or the short form \"<id> <description>\"), or a file (\"file: <path>\").",
		);

		let textAreaEl: HTMLTextAreaElement | undefined;
		new Setting(containerEl)
			.setClass("neokeys-keymap-editor")
			.addTextArea((text) => {
				textAreaEl = text.inputEl;
				text.setValue(this.plugin.settings.keymapSource);
				text.inputEl.rows = 18;
				text.inputEl.addClass("neokeys-keymap-textarea");
			});

		this.errorEl = containerEl.createDiv({ cls: "neokeys-keymap-error" });

		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText("Save keymap")
				.setCta()
				.onClick(async () => {
					const source = textAreaEl?.value ?? "";
					await this.saveKeymap(source);
				}),
		);
	}

	private async saveKeymap(source: string): Promise<void> {
		try {
			parseKeymapSource(source);
		} catch (err) {
			this.showKeymapError(err);
			return;
		}

		this.plugin.settings.keymapSource = source;
		await this.plugin.saveSettings();
		this.clearKeymapError();
		new Notice("Neokeys keymap saved");
	}

	private showKeymapError(err: unknown): void {
		if (!this.errorEl) return;
		const message = err instanceof KeymapParseError ? err.message : String(err);
		this.errorEl.setText(`Invalid keymap: ${message}`);
		this.errorEl.addClass("neokeys-keymap-error-active");
	}

	private clearKeymapError(): void {
		if (!this.errorEl) return;
		this.errorEl.setText("");
		this.errorEl.removeClass("neokeys-keymap-error-active");
	}
}
