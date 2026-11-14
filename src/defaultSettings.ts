import { DEFAULT_ANIMATION_DURATION_MS } from "./animation";
import { DEFAULT_DIAL_ITEM_SIZE, MAX_DIAL_ITEM_SIZE, MIN_DIAL_ITEM_SIZE } from "./dial/layout";
import { DEFAULT_KEYMAP_YAML } from "./sampleKeymap";
import { DIAL_CORNERS, DIAL_DESCRIPTIONS, type DialCorner, type DialDescription, type NeokeysSettings } from "./types";

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
	mobileDialItemSize: DEFAULT_DIAL_ITEM_SIZE,
	mobileDialDescription: "none",
};

/** A stored or chosen corner value, falling back to the default for anything unrecognised. */
export function parseDialCorner(value: unknown): DialCorner {
	return DIAL_CORNERS.find((corner) => corner === value) ?? DEFAULT_SETTINGS.mobileDialCorner;
}

/** A stored or chosen description placement, falling back to the default for anything unrecognised. */
export function parseDialDescription(value: unknown): DialDescription {
	return DIAL_DESCRIPTIONS.find((placement) => placement === value) ?? DEFAULT_SETTINGS.mobileDialDescription;
}

/**
 * A stored or chosen item size: whole pixels within the offered range, the default for anything
 * else. A value outside the range is not clamped: the range moved when the circles went from
 * labelled to key-only, so a size saved for the labelled circles says nothing about the size
 * the user would pick for these.
 */
export function parseDialItemSize(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.mobileDialItemSize;
	const size = Math.round(value);
	return size >= MIN_DIAL_ITEM_SIZE && size <= MAX_DIAL_ITEM_SIZE ? size : DEFAULT_SETTINGS.mobileDialItemSize;
}

/** The settings to run with, given whatever `loadData()` returned: defaults filled in, dial keys sanitised. */
export function resolveSettings(loaded: unknown): NeokeysSettings {
	const stored = typeof loaded === "object" && loaded !== null ? (loaded as Partial<NeokeysSettings>) : {};
	const settings: NeokeysSettings = Object.assign({}, DEFAULT_SETTINGS, stored);
	settings.mobileDialEnabled = typeof stored.mobileDialEnabled === "boolean" ? stored.mobileDialEnabled : DEFAULT_SETTINGS.mobileDialEnabled;
	settings.mobileDialCorner = parseDialCorner(stored.mobileDialCorner);
	settings.mobileDialItemSize = parseDialItemSize(stored.mobileDialItemSize);
	settings.mobileDialDescription = parseDialDescription(stored.mobileDialDescription);
	return settings;
}
