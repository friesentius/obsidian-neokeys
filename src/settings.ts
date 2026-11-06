import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { KeymapParseError, parseKeymapSource } from "./keymap";
import { DEFAULT_KEYMAP_YAML } from "./sampleKeymap";
import type { NeokeysSettings } from "./types";
import type NeokeysPlugin from "./main";

export const DEFAULT_SETTINGS: NeokeysSettings = {
	keymapSource: DEFAULT_KEYMAP_YAML,
	showDelayMs: 200,
};

const LEADER_NAME = "Assign the leader hotkey";
const LEADER_DESC =
	'Neokeys ships no default hotkey. Open Settings → Hotkeys and bind a key or combo (e.g. Ctrl+B) to the "Neokeys: Leader" command.';
const SHOW_DELAY_NAME = "Show delay";
const SHOW_DELAY_DESC =
	"Milliseconds to wait before the which-key popup appears. A fast, memorized sequence never flashes it. Set to 0 to show immediately.";
const KEYMAP_DESC =
	"Spacekeys-compatible YAML (JSON is also accepted, since JSON is valid YAML). Each group has items; each item is a group, a command (\"command: <id>\" or the short form \"<id> <description>\"), or a file (\"file: <path>\").";

/**
 * Settings tab. Obsidian 1.13+ renders it from getSettingDefinitions(), which
 * also indexes it for settings search; older versions call display(). Both
 * paths build their rows with the same helpers, so the controls behave the
 * same everywhere.
 */
export class NeokeysSettingTab extends PluginSettingTab {
	private errorEl: HTMLElement | null = null;
	private keymapTextAreaEl: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		private readonly plugin: NeokeysPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				heading: "Leader key",
				items: [
					{
						name: LEADER_NAME,
						desc: LEADER_DESC,
						aliases: ["hotkey", "prefix"],
						render: (setting) => this.renderLeaderHotkey(setting),
					},
				],
			},
			{
				type: "group",
				heading: "Which-key popup",
				items: [
					{
						name: SHOW_DELAY_NAME,
						desc: SHOW_DELAY_DESC,
						render: (setting) => this.renderShowDelay(setting),
					},
				],
			},
			{
				type: "group",
				heading: "Keymap",
				items: [
					{
						name: "Keymap editor",
						searchable: false,
						render: (setting) => this.renderKeymapEditor(setting),
					},
					{
						name: "Save keymap",
						desc: KEYMAP_DESC,
						aliases: ["yaml", "json", "keybindings"],
						render: (setting) => {
							setting.setName("Save keymap").setDesc(KEYMAP_DESC);
							// infoEl, not descEl: setDesc() empties descEl.
							this.errorEl = setting.infoEl.createDiv({ cls: "neokeys-keymap-error" });
							this.renderSaveKeymapButton(setting);
						},
					},
				],
			},
		];
	}

	/** Fallback renderer for Obsidian versions older than 1.13.0. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Leader key").setHeading();
		this.renderLeaderHotkey(new Setting(containerEl));

		new Setting(containerEl).setName("Which-key popup").setHeading();
		this.renderShowDelay(new Setting(containerEl));

		new Setting(containerEl).setName("Keymap").setHeading();
		new Setting(containerEl).setDesc(KEYMAP_DESC);
		this.renderKeymapEditor(new Setting(containerEl));
		this.errorEl = containerEl.createDiv({ cls: "neokeys-keymap-error" });
		this.renderSaveKeymapButton(new Setting(containerEl));
	}

	private renderLeaderHotkey(setting: Setting): void {
		setting.setName(LEADER_NAME).setDesc(LEADER_DESC);
	}

	private renderShowDelay(setting: Setting): void {
		setting
			.setName(SHOW_DELAY_NAME)
			.setDesc(SHOW_DELAY_DESC)
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
	}

	private renderKeymapEditor(setting: Setting): void {
		setting.setClass("neokeys-keymap-editor").addTextArea((text) => {
			this.keymapTextAreaEl = text.inputEl;
			text.setValue(this.plugin.settings.keymapSource);
			text.inputEl.rows = 18;
			text.inputEl.addClass("neokeys-keymap-textarea");
		});
	}

	private renderSaveKeymapButton(setting: Setting): void {
		setting.addButton((button) =>
			button
				.setButtonText("Save keymap")
				.setCta()
				.onClick(async () => {
					await this.saveKeymap(this.keymapTextAreaEl?.value ?? "");
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
