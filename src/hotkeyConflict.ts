import { keysEqual } from "./keys";
import type { ParsedKey } from "./types";

export interface CommandKeyBinding {
	id: string;
	name: string;
	key: ParsedKey;
}

export interface HotkeyConflict {
	id: string;
	name: string;
}

/** The shape of Obsidian's own (not publicly typed as such, but stable) `Hotkey` object. */
export interface RawHotkey {
	modifiers: string[];
	key: string;
}

/**
 * Convert an Obsidian `Hotkey` (modifiers + a base key, "Mod" meaning the platform modifier) into
 * a Neokeys `ParsedKey`, folding shift into a single letter's case the same way every other key
 * source in this plugin does (see keys.ts): Obsidian stores a letter's `key` field uppercase
 * regardless of whether Shift was actually held (e.g. a bare Ctrl+B hotkey is `{modifiers:["Mod"],
 * key:"B"}`), so the letter's case must be normalized from the modifier list, not trusted as-is.
 */
export function hotkeyToParsedKey(hotkey: RawHotkey, isMac: boolean): ParsedKey {
	const mods = { ctrl: false, shift: false, alt: false, meta: false };
	for (const modifier of hotkey.modifiers) {
		switch (modifier) {
			case "Mod":
				if (isMac) mods.meta = true;
				else mods.ctrl = true;
				break;
			case "Ctrl":
				mods.ctrl = true;
				break;
			case "Meta":
				mods.meta = true;
				break;
			case "Alt":
				mods.alt = true;
				break;
			case "Shift":
				mods.shift = true;
				break;
		}
	}

	// Single-character keys fold shift into the character's case (see keys.ts's own normalize()),
	// so the shift flag itself is zeroed afterwards to match every other ParsedKey in this plugin.
	if (hotkey.key.length === 1) {
		const key = mods.shift ? hotkey.key.toUpperCase() : hotkey.key.toLowerCase();
		return { key, ctrl: mods.ctrl, shift: false, alt: mods.alt, meta: mods.meta };
	}

	return { key: hotkey.key.toLowerCase(), ctrl: mods.ctrl, shift: mods.shift, alt: mods.alt, meta: mods.meta };
}

/**
 * Pure: which of `bindings` collide with `leaderKey` (the leader hotkey or the combo leader)?
 * `bindings` is one entry per Obsidian hotkey actually bound to some other command - the live
 * lookup over `app.hotkeyManager` that builds this list is Obsidian-API-touching and lives in
 * obsidianCommands.ts instead, deliberately not unit-tested per this project's test strategy.
 */
export function findHotkeyConflicts(leaderKey: ParsedKey, bindings: CommandKeyBinding[]): HotkeyConflict[] {
	return bindings.filter((b) => keysEqual(b.key, leaderKey)).map((b) => ({ id: b.id, name: b.name }));
}
