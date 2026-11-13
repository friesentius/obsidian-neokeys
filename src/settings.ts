import { App, ButtonComponent, Notice, PluginSettingTab, Scope, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { DEFAULT_ANIMATION_DURATION_MS, parseAnimationDurationInput } from "./animation";
import { ComboLeaderError, describeComboLeader, parseComboLeaderString } from "./comboLeader";
import { findInvalidCommands } from "./commandValidation";
import { findHotkeyConflicts } from "./hotkeyConflict";
import { KeymapParseError, parseKeymapSource } from "./keymap";
import { serializeKeymap } from "./keymapSerialize";
import { keyFromEvent, keyToString } from "./keys";
import { getCommandHotkeys, hasCommand, listOtherCommandHotkeys } from "./obsidianCommands";
import { parseDialCorner } from "./defaultSettings";
import type { GroupNode } from "./types";
import { TreeEditorView } from "./ui/treeEditorView";
import type NeokeysPlugin from "./main";

export { DEFAULT_SETTINGS, parseDialCorner } from "./defaultSettings";

const LEADER_NAME = "Assign the leader hotkey";
const LEADER_DESC =
	'Neokeys ships no default hotkey. Open Settings → Hotkeys and bind a key or combo (e.g. Ctrl+J) to the "Neokeys: Leader" command.';
const COMBO_NAME = "Combo leader (optional)";
const COMBO_DESC =
	"An alternative to the Hotkeys command above: a key combo that opens the which-key popup from anywhere, without needing a bound command. Must include a modifier (Ctrl, Alt, or Cmd). Off by default.";
const SHOW_DELAY_NAME = "Show delay";
const SHOW_DELAY_DESC =
	"Milliseconds to wait before the which-key popup appears. A fast, memorized sequence never flashes it. Set to 0 to show immediately.";
const ANIMATIONS_NAME = "Animations";
const ANIMATIONS_DESC =
	"Slide the which-key popup in from the bottom edge, and crossfade between menus when navigating. Always off when your OS's reduced-motion accessibility preference is on, regardless of this toggle.";
const ANIMATION_DURATION_NAME = "Animation duration";
const ANIMATION_DURATION_DESC = "Milliseconds for the slide-in and crossfade animations (0‑1000).";
const MOBILE_DIAL_NAME = "Show the dial on mobile";
const MOBILE_DIAL_DESC =
	"On phones and tablets, pin a leader button to a bottom corner of the screen. Press it to fan the current menu's items out on rings around it, drag onto one and let go to run it (a group opens its own items), or tap items directly.";
const MOBILE_DIAL_DESKTOP_NOTE = "Desktop keeps the keyboard-driven popup.";
const MOBILE_DIAL_CORNER_NAME = "Dial corner";
const MOBILE_DIAL_CORNER_DESC = "Which bottom corner the dial's button is pinned to.";
const KEYMAP_DESC =
	'Edit the keymap as a tree, or use "Edit as YAML/JSON" for the raw, Spacekeys-compatible source (each group has items; each item is a group, a command ("command: <id>" or the short form "<id> <description>"), or a file ("file: <path>")). Both views edit the same stored keymap - switching away from the YAML view saves it first, and an invalid edit there is never silently discarded.';
const YAML_NOTE =
	"Saving here keeps your text exactly as written, comments included. Any edit in the tree editor rewrites this source in a normalized form, dropping comments and expanding the short command form.";
const INVALID_COMMANDS_NAME = "Invalid commands";
const INVALID_COMMANDS_DESC =
	"Command IDs in your keymap that Obsidian doesn't currently recognize (a typo, or a plugin that's disabled). They're marked in the which-key popup too, and show an error instead of doing nothing if pressed.";
const HOTKEY_CONFLICTS_NAME = "Hotkey conflicts";
const HOTKEY_CONFLICTS_DESC =
	"Whether the leader hotkey or the combo leader above collides with another command's Obsidian hotkey.";

const MODIFIER_KEY_NAMES = new Set(["Control", "Shift", "Alt", "AltGraph", "Meta", "OS", "CapsLock"]);

/**
 * Settings tab. Obsidian 1.13+ renders it from getSettingDefinitions(), which
 * also indexes it for settings search; older versions call display(). Both
 * paths build their rows with the same helpers, so the controls behave the
 * same everywhere.
 */
export class NeokeysSettingTab extends PluginSettingTab {
	private errorEl: HTMLElement | null = null;
	private keymapTextAreaEl: HTMLTextAreaElement | null = null;
	private treeContainerEl: HTMLElement | null = null;
	private yamlContainerEl: HTMLElement | null = null;
	private treeEditorView: TreeEditorView | null = null;
	private viewToggleButton: ButtonComponent | null = null;
	private viewMode: "tree" | "yaml" = "tree";
	private comboDisplayEl: HTMLElement | null = null;
	private comboErrorEl: HTMLElement | null = null;
	private invalidCommandsEl: HTMLElement | null = null;
	private hotkeyConflictsEl: HTMLElement | null = null;
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
					{
						name: HOTKEY_CONFLICTS_NAME,
						desc: HOTKEY_CONFLICTS_DESC,
						searchable: false,
						render: (setting) => this.renderHotkeyConflicts(setting),
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
					{
						name: ANIMATIONS_NAME,
						desc: ANIMATIONS_DESC,
						aliases: ["animation", "motion", "slide", "crossfade", "reduced motion"],
						render: (setting) => this.renderAnimationsEnabled(setting),
					},
					{
						name: ANIMATION_DURATION_NAME,
						desc: ANIMATION_DURATION_DESC,
						render: (setting) => this.renderAnimationDuration(setting),
					},
				],
			},
			{
				type: "group",
				heading: "Mobile dial",
				items: [
					{
						name: MOBILE_DIAL_NAME,
						desc: `${MOBILE_DIAL_DESC} ${MOBILE_DIAL_DESKTOP_NOTE}`,
						aliases: ["mobile", "phone", "tablet", "touch", "fan", "dial"],
						render: (setting) => this.renderMobileDialEnabled(setting),
					},
					{
						name: MOBILE_DIAL_CORNER_NAME,
						desc: MOBILE_DIAL_CORNER_DESC,
						aliases: ["corner", "left", "right", "position"],
						render: (setting) => this.renderMobileDialCorner(setting),
					},
				],
			},
			{
				type: "group",
				heading: "Keymap",
				items: [
					{
						name: "Keymap editor",
						desc: KEYMAP_DESC,
						aliases: ["yaml", "json", "keybindings", "tree"],
						searchable: false,
						render: (setting) => this.renderKeymapEditor(setting),
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
		this.renderHotkeyConflicts(new Setting(containerEl).setName(HOTKEY_CONFLICTS_NAME).setDesc(HOTKEY_CONFLICTS_DESC));

		new Setting(containerEl).setName("Which-key popup").setHeading();
		this.renderShowDelay(new Setting(containerEl));
		this.renderAnimationsEnabled(new Setting(containerEl));
		this.renderAnimationDuration(new Setting(containerEl));

		new Setting(containerEl).setName("Mobile dial").setHeading();
		this.renderMobileDialEnabled(new Setting(containerEl));
		this.renderMobileDialCorner(new Setting(containerEl));

		new Setting(containerEl).setName("Keymap").setHeading();
		this.renderKeymapEditor(new Setting(containerEl));
		this.renderInvalidCommands(new Setting(containerEl).setName(INVALID_COMMANDS_NAME).setDesc(INVALID_COMMANDS_DESC));
	}

	hide(): void {
		this.cancelComboRecording();
		super.hide();
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

		// A scope pushed on top of Obsidian's keymap sees every key before
		// Obsidian's own handlers (e.g. Escape closing the Settings window).
		const scope = new Scope();
		scope.register(null, null, (evt) => {
			if (evt.isComposing) return false;

			if (evt.key === "Escape") {
				this.cancelComboRecording();
				return false;
			}
			if (MODIFIER_KEY_NAMES.has(evt.key)) return false;

			const key = keyFromEvent(evt);
			this.cancelComboRecording();
			void this.applyComboLeader(keyToString(key));
			return false;
		});

		this.app.keymap.pushScope(scope);
		this.stopRecordingCombo = () => {
			this.app.keymap.popScope(scope);
			button.setButtonText("Record combo");
			button.setDisabled(false);
		};
	}

	private cancelComboRecording(): void {
		this.stopRecordingCombo?.();
		this.stopRecordingCombo = null;
	}

	private async applyComboLeader(value: string): Promise<void> {
		try {
			parseComboLeaderString(value);
		} catch (err) {
			this.showComboError(err);
			return;
		}

		this.plugin.settings.comboLeader = value;
		await this.plugin.saveSettings();
		this.plugin.registerComboLeader();
		this.clearComboError();
		this.updateComboDisplay();
		this.updateHotkeyConflicts();
	}

	private updateComboDisplay(): void {
		if (!this.comboDisplayEl) return;
		let combo;
		try {
			combo = parseComboLeaderString(this.plugin.settings.comboLeader);
		} catch (err) {
			if (!(err instanceof ComboLeaderError)) throw err;
			this.comboDisplayEl.setText(`Invalid: "${this.plugin.settings.comboLeader}"`);
			return;
		}
		this.comboDisplayEl.setText(combo ? describeComboLeader(combo) : "Not set");
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

	private renderAnimationsEnabled(setting: Setting): void {
		setting
			.setName(ANIMATIONS_NAME)
			.setDesc(ANIMATIONS_DESC)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.animationsEnabled).onChange(async (value) => {
					this.plugin.settings.animationsEnabled = value;
					await this.plugin.saveSettings();
				}),
			);
	}

	private renderAnimationDuration(setting: Setting): void {
		setting
			.setName(ANIMATION_DURATION_NAME)
			.setDesc(ANIMATION_DURATION_DESC)
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_ANIMATION_DURATION_MS))
					.setValue(String(this.plugin.settings.animationDurationMs))
					.onChange(async (value) => {
						this.plugin.settings.animationDurationMs = parseAnimationDurationInput(value);
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderMobileDialEnabled(setting: Setting): void {
		setting
			.setName(MOBILE_DIAL_NAME)
			.setDesc(
				createFragment((fragment) => {
					fragment.appendText(MOBILE_DIAL_DESC);
					fragment.createEl("br");
					fragment.appendText(MOBILE_DIAL_DESKTOP_NOTE);
				}),
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.mobileDialEnabled).onChange(async (value) => {
					this.plugin.settings.mobileDialEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.applyMobileDial();
				}),
			);
	}

	private renderMobileDialCorner(setting: Setting): void {
		setting
			.setName(MOBILE_DIAL_CORNER_NAME)
			.setDesc(MOBILE_DIAL_CORNER_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("bottom-right", "Bottom right")
					.addOption("bottom-left", "Bottom left")
					.setValue(this.plugin.settings.mobileDialCorner)
					.onChange(async (value) => {
						this.plugin.settings.mobileDialCorner = parseDialCorner(value);
						await this.plugin.saveSettings();
						this.plugin.applyMobileDial();
					}),
			);
	}

	/**
	 * Which Obsidian command id Neokeys' own leader command runs under. Obsidian prefixes a
	 * plugin's addCommand({id: "leader"}) with the plugin's manifest id, so this always matches
	 * manifest.json rather than hardcoding "neokeys:leader".
	 */
	private get leaderCommandId(): string {
		return `${this.plugin.manifest.id}:leader`;
	}

	private renderHotkeyConflicts(setting: Setting): void {
		this.hotkeyConflictsEl = setting.infoEl.createDiv({ cls: "neokeys-hotkey-conflicts" });
		this.updateHotkeyConflicts();
	}

	private updateHotkeyConflicts(): void {
		if (!this.hotkeyConflictsEl) return;
		this.hotkeyConflictsEl.empty();

		const otherBindings = listOtherCommandHotkeys(this.app, this.leaderCommandId);
		const rows: string[] = [];

		for (const key of getCommandHotkeys(this.app, this.leaderCommandId)) {
			for (const conflict of findHotkeyConflicts(key, otherBindings)) {
				rows.push(
					`${describeComboLeader(key)} (leader hotkey) also triggers "${conflict.name}" (${conflict.id}).`,
				);
			}
		}

		let combo;
		try {
			combo = parseComboLeaderString(this.plugin.settings.comboLeader);
		} catch {
			combo = null;
		}
		if (combo) {
			for (const conflict of findHotkeyConflicts(combo, otherBindings)) {
				rows.push(
					`${describeComboLeader(combo)} (combo leader) also triggers "${conflict.name}" (${conflict.id}).`,
				);
			}
		}

		if (rows.length === 0) {
			this.hotkeyConflictsEl.setText("None");
			return;
		}
		for (const row of rows) {
			this.hotkeyConflictsEl.createDiv({ text: row, cls: "neokeys-hotkey-conflict-row" });
		}
	}

	private renderKeymapEditor(setting: Setting): void {
		setting.setClass("neokeys-keymap-editor").setName("Keymap editor").setDesc(KEYMAP_DESC);
		// infoEl, not descEl: setDesc() empties descEl.
		this.errorEl = setting.infoEl.createDiv({ cls: "neokeys-keymap-error" });

		const container = setting.controlEl.createDiv({ cls: "neokeys-keymap-container" });

		const toggleRow = container.createDiv({ cls: "neokeys-keymap-toggle-row" });
		this.viewToggleButton = new ButtonComponent(toggleRow).onClick(() => void this.toggleView());

		this.treeContainerEl = container.createDiv({ cls: "neokeys-tree-container" });
		this.yamlContainerEl = container.createDiv({ cls: "neokeys-yaml-container" });

		this.yamlContainerEl.createDiv({ cls: "neokeys-yaml-note", text: YAML_NOTE });

		const textArea = this.yamlContainerEl.createEl("textarea", { cls: "neokeys-keymap-textarea" });
		textArea.rows = 18;
		textArea.value = this.plugin.settings.keymapSource;
		this.keymapTextAreaEl = textArea;

		const saveRow = this.yamlContainerEl.createDiv({ cls: "neokeys-keymap-save-row" });
		new ButtonComponent(saveRow)
			.setButtonText("Save keymap")
			.setCta()
			.onClick(() => void this.saveKeymap(textArea.value));

		this.treeEditorView = new TreeEditorView(
			this.app,
			this.treeContainerEl,
			() => parseKeymapSource(this.plugin.settings.keymapSource),
			(root) => this.persistTree(root),
		);

		this.applyViewMode();
	}

	private applyViewMode(): void {
		if (this.viewMode === "tree") {
			try {
				this.treeEditorView?.render();
			} catch (err) {
				// Stored keymap source should always be valid (every write path validates first),
				// but data.json is external state a person or another tool can still hand-edit.
				// Fall back to the YAML view, which can at least show what's actually there.
				this.showKeymapError(err);
				this.viewMode = "yaml";
			}
		}
		this.treeContainerEl?.toggleClass("neokeys-hidden", this.viewMode !== "tree");
		this.yamlContainerEl?.toggleClass("neokeys-hidden", this.viewMode !== "yaml");
		this.viewToggleButton?.setButtonText(this.viewMode === "tree" ? "Edit as YAML/JSON" : "Back to tree editor");
	}

	/**
	 * Switches between the tree and YAML/JSON views. Leaving the YAML view with unsaved, invalid
	 * text blocks the switch and shows the error instead of discarding it or overwriting the tree;
	 * unsaved valid text is saved first, so both views always agree on the stored keymap.
	 */
	private async toggleView(): Promise<void> {
		if (this.viewMode === "tree") {
			this.viewMode = "yaml";
			this.applyViewMode();
			return;
		}

		const value = this.keymapTextAreaEl?.value ?? "";
		if (value !== this.plugin.settings.keymapSource) {
			const saved = await this.saveKeymapSource(value);
			if (!saved) return;
		}

		this.viewMode = "tree";
		this.applyViewMode();
	}

	/** Validate and persist YAML/JSON source from the escape-hatch view. Returns whether it saved. */
	private async saveKeymapSource(source: string): Promise<boolean> {
		try {
			parseKeymapSource(source);
		} catch (err) {
			this.showKeymapError(err);
			return false;
		}

		this.plugin.settings.keymapSource = source;
		await this.plugin.saveSettings();
		this.clearKeymapError();
		this.updateInvalidCommands();
		return true;
	}

	private async saveKeymap(source: string): Promise<void> {
		const saved = await this.saveKeymapSource(source);
		if (saved) new Notice("Neokeys keymap saved");
	}

	/** Persist a tree edit (already valid by construction) and refresh every dependent view. */
	private async persistTree(root: GroupNode): Promise<void> {
		this.plugin.settings.keymapSource = serializeKeymap(root);
		await this.plugin.saveSettings();
		if (this.keymapTextAreaEl) this.keymapTextAreaEl.value = this.plugin.settings.keymapSource;
		this.clearKeymapError();
		this.updateInvalidCommands();
		this.treeEditorView?.render();
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
