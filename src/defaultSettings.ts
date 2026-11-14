import { DEFAULT_ANIMATION_DURATION_MS } from "./animation";
import { DEFAULT_DIAL_ITEM_SIZE, DEFAULT_LENS_PEAK, DEFAULT_RADIUS_RULE, LENS_PEAK_STEP, MAX_DIAL_ITEM_SIZE, MAX_LENS_PEAK, MIN_DIAL_ITEM_SIZE, MIN_LENS_PEAK } from "./dial/layout";
import { DEFAULT_KEYMAP_YAML } from "./sampleKeymap";
import {
	DIAL_CORNERS,
	DIAL_DESCRIPTIONS,
	DIAL_RADIUS_RULES,
	DIAL_RING_ANIMATIONS,
	type DialCorner,
	type DialDescription,
	type DialRadiusRule,
	type DialRingAnimation,
	type NeokeysSettings,
} from "./types";

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
	mobileDialRadiusRule: DEFAULT_RADIUS_RULE,
	mobileDialLensPeak: DEFAULT_LENS_PEAK,
	mobileDialRingAnimation: true,
	mobileDialRingAnimationStyle: "fade",
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

/** A stored or chosen radius rule, falling back to the default for anything unrecognised. */
export function parseDialRadiusRule(value: unknown): DialRadiusRule {
	return DIAL_RADIUS_RULES.find((rule) => rule === value) ?? DEFAULT_SETTINGS.mobileDialRadiusRule;
}

/** A stored or chosen ring animation style, falling back to the default for anything unrecognised. */
export function parseDialRingAnimation(value: unknown): DialRingAnimation {
	return DIAL_RING_ANIMATIONS.find((style) => style === value) ?? DEFAULT_SETTINGS.mobileDialRingAnimationStyle;
}

/**
 * A stored or chosen lens peak: a multiple of the item size on the slider's steps, held within
 * the offered range (a hand-edited 2 means "as large as it goes"), the default for anything
 * that is not a number.
 */
export function parseDialLensPeak(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.mobileDialLensPeak;
	const clamped = Math.max(MIN_LENS_PEAK, Math.min(MAX_LENS_PEAK, value));
	return Math.round(Math.round(clamped / LENS_PEAK_STEP) * LENS_PEAK_STEP * 100) / 100;
}

/** The settings to run with, given whatever `loadData()` returned: defaults filled in, dial keys sanitised. */
export function resolveSettings(loaded: unknown): NeokeysSettings {
	const stored = typeof loaded === "object" && loaded !== null ? (loaded as Partial<NeokeysSettings>) : {};
	const settings: NeokeysSettings = Object.assign({}, DEFAULT_SETTINGS, stored);
	settings.mobileDialEnabled = typeof stored.mobileDialEnabled === "boolean" ? stored.mobileDialEnabled : DEFAULT_SETTINGS.mobileDialEnabled;
	settings.mobileDialCorner = parseDialCorner(stored.mobileDialCorner);
	settings.mobileDialItemSize = parseDialItemSize(stored.mobileDialItemSize);
	settings.mobileDialDescription = parseDialDescription(stored.mobileDialDescription);
	settings.mobileDialRadiusRule = parseDialRadiusRule(stored.mobileDialRadiusRule);
	settings.mobileDialLensPeak = parseDialLensPeak(stored.mobileDialLensPeak);
	settings.mobileDialRingAnimation = typeof stored.mobileDialRingAnimation === "boolean" ? stored.mobileDialRingAnimation : DEFAULT_SETTINGS.mobileDialRingAnimation;
	settings.mobileDialRingAnimationStyle = parseDialRingAnimation(stored.mobileDialRingAnimationStyle);
	return settings;
}
