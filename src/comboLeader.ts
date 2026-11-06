import { KeyParseError, keyToString, parseKeyString } from "./keys";
import type { ParsedKey } from "./types";

export class ComboLeaderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ComboLeaderError";
	}
}

export const COMBO_LEADER_MODIFIER_HINT =
	'A combo leader needs a modifier key (Ctrl, Alt, or Cmd) - for example "ctrl+b".';

/**
 * Whether `key` carries at least one of ctrl/alt/meta. Shift alone is not enough: for a
 * single-character key shift is already folded into the character's case (see keys.ts), so a
 * "shift-only" combo would just be a different bare, unmodified key - exactly the conflict a
 * required modifier exists to rule out.
 */
export function hasRequiredModifier(key: ParsedKey): boolean {
	return key.ctrl || key.alt || key.meta;
}

/** Throws ComboLeaderError when `key` has no modifier. */
export function validateComboLeader(key: ParsedKey): void {
	if (!hasRequiredModifier(key)) {
		throw new ComboLeaderError(COMBO_LEADER_MODIFIER_HINT);
	}
}

/**
 * Parse and validate a stored combo-leader key string (the settings field's persisted format).
 * An empty/blank string means "not set" and returns null.
 */
export function parseComboLeaderString(source: string): ParsedKey | null {
	const trimmed = source.trim();
	if (trimmed.length === 0) return null;

	let key: ParsedKey;
	try {
		key = parseKeyString(trimmed);
	} catch (err) {
		if (err instanceof KeyParseError) {
			throw new ComboLeaderError(err.message);
		}
		throw err;
	}

	validateComboLeader(key);
	return key;
}

/** The combo-leader key string to persist for a captured ParsedKey. */
export function comboLeaderToString(key: ParsedKey): string {
	return keyToString(key);
}
