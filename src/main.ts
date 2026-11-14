import { Notice, Platform, Plugin } from "obsidian";
import type { KeymapEventHandler } from "obsidian";
import { prefersReducedMotion, shouldAnimate } from "./animation";
import { ComboLeaderError, parseComboLeaderString } from "./comboLeader";
import { applyHeadingLevelToEditor } from "./headingLevel";
import { KeymapParseError, parseKeymapSource } from "./keymap";
import { keyFromEvent, keysEqual } from "./keys";
import { executeCommandById } from "./obsidianCommands";
import { DEFAULT_SETTINGS, resolveSettings } from "./defaultSettings";
import { NeokeysSettingTab } from "./settings";
import type { GroupNode, NeokeysSettings } from "./types";
import { MobileDial } from "./ui/mobileDial";
import { WhichKeyModal, type WhichKeyCallbacks } from "./ui/whichKeyModal";

export default class NeokeysPlugin extends Plugin {
	settings: NeokeysSettings = DEFAULT_SETTINGS;
	private comboHandler: KeymapEventHandler | null = null;
	/** The pinned mobile dial; null on desktop or when the setting is off. */
	private dial: MobileDial | null = null;

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
		this.applyMobileDial();
	}

	onunload(): void {
		this.unregisterComboLeader();
		this.dial?.destroy();
		this.dial = null;
	}

	async loadSettings(): Promise<void> {
		this.settings = resolveSettings(await this.loadData());
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

	/**
	 * (Re-)create the mobile dial from the current settings. Only mobile gets it: desktop keeps
	 * the keyboard-driven which-key popup exactly as before. Call after any dial setting changes.
	 */
	applyMobileDial(): void {
		this.dial?.destroy();
		this.dial = null;
		if (!Platform.isMobile || !this.settings.mobileDialEnabled) return;

		this.dial = new MobileDial(
			this.app,
			() => this.parseRoot(),
			{
				corner: this.settings.mobileDialCorner,
				itemSize: this.settings.mobileDialItemSize,
				description: this.settings.mobileDialDescription,
				animation: () => ({
					enabled: shouldAnimate(this.settings.animationsEnabled, prefersReducedMotion(window)),
					durationMs: this.settings.animationDurationMs,
				}),
			},
			this.leaderCallbacks(),
		);
		this.dial.mount();
	}

	/** The current keymap's root, or null after reporting why it cannot be parsed. */
	private parseRoot(): GroupNode | null {
		try {
			return parseKeymapSource(this.settings.keymapSource);
		} catch (err) {
			const message = err instanceof KeymapParseError ? err.message : String(err);
			new Notice(`Neokeys: invalid keymap - ${message}`, 8000);
			return null;
		}
	}

	private leaderCallbacks(): WhichKeyCallbacks {
		return {
			executeCommand: (id) => executeCommandById(this.app, id),
			openFile: (path) => {
				void this.app.workspace.openLinkText(path, "", false);
			},
		};
	}

	private activateLeader(): void {
		// On mobile with the dial on, Leader (from the command palette or a combo on a hardware
		// keyboard) opens the dial itself rather than the popup, which has no touch path.
		if (this.dial) {
			this.dial.open();
			return;
		}

		const root = this.parseRoot();
		if (!root) return;

		const animate = shouldAnimate(this.settings.animationsEnabled, prefersReducedMotion(window));
		new WhichKeyModal(
			this.app,
			root,
			this.settings.showDelayMs,
			{ enabled: animate, durationMs: this.settings.animationDurationMs },
			this.leaderCallbacks(),
		).open();
	}
}
