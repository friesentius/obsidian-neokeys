/**
 * What an item must have before the add/edit form saves it, kept free of Obsidian imports so the
 * rules are unit-tested per device.
 *
 * A phone has no hotkeys and its dial only ever labels a circle with the key, so there an item
 * needs a key or an icon, either one. A tablet is held to the desktop rule (a key is required, the
 * icon is optional): its keyboard is a real one often enough, and a keymap built there should work
 * on a desktop as is.
 */

export type EntryDevice = "phone" | "tablet" | "desktop";

/** The device class from Obsidian's own Platform flags (never from screen width). */
export function deviceFromPlatform(platform: { isPhone: boolean; isTablet: boolean }): EntryDevice {
	if (platform.isPhone) return "phone";
	if (platform.isTablet) return "tablet";
	return "desktop";
}

/** Whether the form shows a text field that opens the on-screen keyboard to type the key into. */
export function hasKeyField(device: EntryDevice): boolean {
	return device !== "desktop";
}

/** Whether the form shows "Record key", which waits for a physical key press. */
export function hasRecordButton(device: EntryDevice): boolean {
	return device !== "phone";
}

/** Whether an item may be saved without a key (it must then have an icon). */
export function keyIsOptional(device: EntryDevice): boolean {
	return device === "phone";
}

/** The inline error for a key/icon pair, or null when the device accepts it. */
export function validateKeyAndIcon(device: EntryDevice, rawKey: string, icon: string): string | null {
	const hasKey = rawKey.trim().length > 0;
	if (hasKey) return null;
	if (!keyIsOptional(device)) return "Set a key first.";
	return icon.trim().length > 0 ? null : "Set a key or an icon first.";
}

/**
 * The note the tree editor puts on an existing entry that this device would not have accepted, or
 * null. Only a keyless entry can fail (see keyless.ts): a phone makes them by design, and when the
 * keymap reaches a tablet or desktop they stay on the dial but no key press can reach them, so the
 * editor flags them there until they are given a key.
 */
export function entryNeeds(device: EntryDevice, hasKey: boolean, icon: string | undefined): string | null {
	if (hasKey) return null;
	if (!keyIsOptional(device)) return "Needs a key";
	return icon === undefined || icon.trim().length === 0 ? "Needs a key or an icon" : null;
}
