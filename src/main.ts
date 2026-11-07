import { Notice, Plugin } from "obsidian";
import type { KeymapEventHandler } from "obsidian";
import { prefersReducedMotion, shouldAnimate } from "./animation";
import { ComboLeaderError, parseComboLeaderString } from "./comboLeader";
import { applyHeadingLevelToEditor } from "./headingLevel";
import { KeymapParseError, parseKeymapSource } from "./keymap";
import { keyFromEvent, keysEqual } from "./keys";
import { executeCommandById } from "./obsidianCommands";
import { DEFAULT_SETTINGS, NeokeysSettingTab } from "./settings";
import type { NeokeysSettings } from "./types";
import { WhichKeyModal } from "./ui/whichKeyModal";

export default class NeokeysPlugin extends Plugin {
	settings: NeokeysSettings = DEFAULT_SETTINGS;
	private comboHandler: KeymapEventHandler | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "leader",
			name: "Leader",
			callback: () => this.activateLeader(),
		});

		this.addCommand({
			id: "increase-heading-level",
			name: "Increase heading level",
			editorCallback: (editor) => applyHeadingLevelToEditor(editor, "increase"),
		});

		this.addCommand({
			id: "decrease-heading-level",
			name: "Decrease heading level",
			editorCallback: (editor) => applyHeadingLevelToEditor(editor, "decrease"),
		});

		this.addSettingTab(new NeokeysSettingTab(this.app, this));
		this.registerComboLeader();
	}

	onunload(): void {
		this.unregisterComboLeader();
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<NeokeysSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * (Re-)register the optional settings-tab combo leader on the app's root scope, reading the
	 * current `settings.comboLeader`. Call after any settings change; off/empty is a no-op.
	 */
	registerComboLeader(): void {
		this.unregisterComboLeader();

		let combo;
		try {
			combo = parseComboLeaderString(this.settings.comboLeader);
		} catch (err) {
			if (!(err instanceof ComboLeaderError)) throw err;
			new Notice(`Neokeys: invalid combo leader "${this.settings.comboLeader}" - ${err.message}`, 8000);
			return;
		}
		if (!combo) return;

		this.comboHandler = this.app.scope.register(null, null, (evt) => {
			if (evt.isComposing || !keysEqual(keyFromEvent(evt), combo)) return;
			this.activateLeader();
			return false;
		});
	}

	private unregisterComboLeader(): void {
		if (!this.comboHandler) return;
		this.app.scope.unregister(this.comboHandler);
		this.comboHandler = null;
	}

	private activateLeader(): void {
		let root;
		try {
			root = parseKeymapSource(this.settings.keymapSource);
		} catch (err) {
			const message = err instanceof KeymapParseError ? err.message : String(err);
			new Notice(`Neokeys: invalid keymap - ${message}`, 8000);
			return;
		}

		const animate = shouldAnimate(this.settings.animationsEnabled, prefersReducedMotion(window));
		new WhichKeyModal(
			this.app,
			root,
			this.settings.showDelayMs,
			{ enabled: animate, durationMs: this.settings.animationDurationMs },
			{
				executeCommand: (id) => executeCommandById(this.app, id),
				openFile: (path) => {
					void this.app.workspace.openLinkText(path, "", false);
				},
			},
		).open();
	}
}
