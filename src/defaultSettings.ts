import { DEFAULT_ANIMATION_DURATION_MS } from "./animation";
import { DEFAULT_KEYMAP_YAML } from "./sampleKeymap";
import { DIAL_CORNERS, type DialCorner, type NeokeysSettings } from "./types";

/**
 * The plugin's defaults and the sanitising of whatever data.json holds, kept free of Obsidian
 * imports so the upgrade path (settings saved by a release that had no dial keys, or a
 * hand-edited file) is unit-tested.
 */
export const DEFAULT_SETTINGS: NeokeysSettings = {
	keymapSource: DEFAULT_KEYMAP_YAML,
	showDelayMs: 200,
	comboLeader: "",
	animationsEnabled: true,
	animationDurationMs: DEFAULT_ANIMATION_DURATION_MS,
	mobileDialEnabled: true,
	mobileDialCorner: "bottom-right",
};

/** A stored or chosen corner value, falling back to the default for anything unrecognised. */
export function parseDialCorner(value: unknown): DialCorner {
	return DIAL_CORNERS.find((corner) => corner === value) ?? DEFAULT_SETTINGS.mobileDialCorner;
}

/** The settings to run with, given whatever `loadData()` returned: defaults filled in, dial keys sanitised. */
export function resolveSettings(loaded: unknown): NeokeysSettings {
	const stored = typeof loaded === "object" && loaded !== null ? (loaded as Partial<NeokeysSettings>) : {};
	const settings: NeokeysSettings = Object.assign({}, DEFAULT_SETTINGS, stored);
	settings.mobileDialEnabled = typeof stored.mobileDialEnabled === "boolean" ? stored.mobileDialEnabled : DEFAULT_SETTINGS.mobileDialEnabled;
	settings.mobileDialCorner = parseDialCorner(stored.mobileDialCorner);
	return settings;
}
