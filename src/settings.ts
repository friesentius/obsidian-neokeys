import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { ComboLeaderError, parseComboLeaderString, validateComboLeader } from "./comboLeader";
import { findInvalidCommands } from "./commandValidation";
import { KeymapParseError, parseKeymapSource } from "./keymap";
import { keyFromEvent, keyGlyph, keyToString } from "./keys";
import { hasCommand } from "./obsidianCommands";
import { DEFAULT_KEYMAP_YAML } from "./sampleKeymap";
import type { NeokeysSettings, ParsedKey } from "./types";
import type NeokeysPlugin from "./main";

export const DEFAULT_SETTINGS: NeokeysSettings = {
	keymapSource: DEFAULT_KEYMAP_YAML,
	showDelayMs: 200,
	comboLeader: "",
};

const LEADER_NAME = "Assign the leader hotkey";
const LEADER_DESC =
	'Neokeys ships no default hotkey. Open Settings → Hotkeys and bind a key or combo (e.g. Ctrl+B) to the "Neokeys: Leader" command.';
const COMBO_NAME = "Combo leader (optional)";
const COMBO_DESC =
	"An alternative to the Hotkeys command above: a key combo that opens the which-key popup from anywhere, without needing a bound command. Must include a modifier (Ctrl, Alt, or Cmd). Off by default.";
const SHOW_DELAY_NAME = "Show delay";
const SHOW_DELAY_DESC =
	"Milliseconds to wait before the which-key popup appears. A fast, memorized sequence never flashes it. Set to 0 to show immediately.";
const KEYMAP_DESC =
	"Spacekeys-compatible YAML (JSON is also accepted, since JSON is valid YAML). Each group has items; each item is a group, a command (\"command: <id>\" or the short form \"<id> <description>\"), or a file (\"file: <path>\").";
const INVALID_COMMANDS_NAME = "Invalid commands";
const INVALID_COMMANDS_DESC =
	"Command IDs in your keymap that Obsidian doesn't currently recognize (a typo, or a plugin that's disabled). They're marked in the which-key popup too, and show an error instead of doing nothing if pressed.";

const MODIFIER_KEY_NAMES = new Set(["Control", "Shift", "Alt", "Meta"]);

/**
 * Settings tab. Obsidian 1.13+ renders it from getSettingDefinitions(), which
 * also indexes it for settings search; older versions call display(). Both
 * paths build their rows with the same helpers, so the controls behave the
 * same everywhere.
 */
export class NeokeysSettingTab extends PluginSettingTab {
	private errorEl: HTMLElement | null = null;
	private keymapTextAreaEl: HTMLTextAreaElement | null = null;
	private comboDisplayEl: HTMLElement | null = null;
	private comboErrorEl: HTMLElement | null = null;
	private invalidCommandsEl: HTMLElement | null = null;
	private stopRecordingCombo: (() => void) | null = null;

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
					{
						name: COMBO_NAME,
						desc: COMBO_DESC,
						aliases: ["combo", "modifier"],
						render: (setting) => this.renderComboLeader(setting),
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
					{
						name: INVALID_COMMANDS_NAME,
						desc: INVALID_COMMANDS_DESC,
						searchable: false,
						render: (setting) => this.renderInvalidCommands(setting),
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
		this.renderComboLeader(new Setting(containerEl));

		new Setting(containerEl).setName("Which-key popup").setHeading();
		this.renderShowDelay(new Setting(containerEl));

		new Setting(containerEl).setName("Keymap").setHeading();
		new Setting(containerEl).setDesc(KEYMAP_DESC);
		this.renderKeymapEditor(new Setting(containerEl));
		this.errorEl = containerEl.createDiv({ cls: "neokeys-keymap-error" });
		this.renderSaveKeymapButton(new Setting(containerEl));
		this.renderInvalidCommands(new Setting(containerEl).setName(INVALID_COMMANDS_NAME).setDesc(INVALID_COMMANDS_DESC));
	}

	hide(): void {
		this.cancelComboRecording();
	}

	private renderLeaderHotkey(setting: Setting): void {
		setting.setName(LEADER_NAME).setDesc(LEADER_DESC);
	}

	private renderComboLeader(setting: Setting): void {
		setting.setName(COMBO_NAME).setDesc(COMBO_DESC);
		this.comboDisplayEl = setting.controlEl.createSpan({ cls: "neokeys-combo-display" });
		this.updateComboDisplay();

		let recordButton!: ButtonComponent;
		setting.addButton((button) => {
			recordButton = button;
			button.setButtonText("Record combo").onClick(() => this.startComboRecording(recordButton));
		});
		setting.addExtraButton((button) =>
			button
				.setIcon("x")
				.setTooltip("Clear combo leader")
				.onClick(() => void this.applyComboLeader("")),
		);

		// infoEl, not descEl: setDesc() empties descEl.
		this.comboErrorEl = setting.infoEl.createDiv({ cls: "neokeys-combo-error" });
	}

	private startComboRecording(button: ButtonComponent): void {
		this.cancelComboRecording();
		button.setButtonText("Press a combo... (Esc to cancel)");
		button.setDisabled(true);

		const handler = (evt: KeyboardEvent): void => {
			if (evt.isComposing) return;
			evt.preventDefault();
			evt.stopPropagation();

			if (evt.key === "Escape") {
				this.cancelComboRecording();
				return;
			}
			if (MODIFIER_KEY_NAMES.has(evt.key)) return;

			const key = keyFromEvent(evt);
			this.cancelComboRecording();
			void this.applyComboLeader(keyToString(key));
		};

		window.addEventListener("keydown", handler, true);
		this.stopRecordingCombo = () => {
			window.removeEventListener("keydown", handler, true);
			button.setButtonText("Record combo");
			button.setDisabled(false);
		};
	}

	private cancelComboRecording(): void {
		this.stopRecordingCombo?.();
		this.stopRecordingCombo = null;
	}

	private async applyComboLeader(value: string): Promise<void> {
		let parsed: ParsedKey | null;
		try {
			parsed = parseComboLeaderString(value);
		} catch (err) {
			this.showComboError(err);
			return;
		}
		if (parsed) validateComboLeader(parsed);

		this.plugin.settings.comboLeader = value;
		await this.plugin.saveSettings();
		this.plugin.registerComboLeader();
		this.clearComboError();
		this.updateComboDisplay();
	}

	private updateComboDisplay(): void {
		if (!this.comboDisplayEl) return;
		const combo = parseComboLeaderString(this.plugin.settings.comboLeader);
		this.comboDisplayEl.setText(combo ? keyGlyph(combo) : "Not set");
	}

	private showComboError(err: unknown): void {
		if (!this.comboErrorEl) return;
		const message = err instanceof ComboLeaderError ? err.message : String(err);
		this.comboErrorEl.setText(message);
		this.comboErrorEl.addClass("neokeys-combo-error-active");
	}

	private clearComboError(): void {
		if (!this.comboErrorEl) return;
		this.comboErrorEl.setText("");
		this.comboErrorEl.removeClass("neokeys-combo-error-active");
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
		this.updateInvalidCommands();
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

	private renderInvalidCommands(setting: Setting): void {
		this.invalidCommandsEl = setting.infoEl.createDiv({ cls: "neokeys-invalid-commands" });
		this.updateInvalidCommands();
	}

	private updateInvalidCommands(): void {
		if (!this.invalidCommandsEl) return;
		this.invalidCommandsEl.empty();

		let root;
		try {
			root = parseKeymapSource(this.plugin.settings.keymapSource);
		} catch {
			return;
		}

		const invalid = findInvalidCommands(root, (id) => hasCommand(this.app, id));
		if (invalid.length === 0) {
			this.invalidCommandsEl.setText("None");
			return;
		}
		for (const entry of invalid) {
			this.invalidCommandsEl.createDiv({
				text: `${entry.path.join(" ")}: "${entry.command}" is not a registered command`,
				cls: "neokeys-invalid-command-row",
			});
		}
	}
}
