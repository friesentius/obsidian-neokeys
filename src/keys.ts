import type { ParsedKey } from "./types";

/**
 * Minimal structural subset of a browser KeyboardEvent, kept separate from
 * the DOM lib type so key parsing can be unit-tested without a DOM.
 */
export interface KeyboardEventLike {
	key: string;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
}

const ALIASES: Record<string, string> = {
	space: " ",
	spc: " ",
	up: "arrowup",
	down: "arrowdown",
	left: "arrowleft",
	right: "arrowright",
	enter: "enter",
	return: "enter",
	esc: "escape",
	escape: "escape",
	tab: "tab",
	backspace: "backspace",
	bs: "backspace",
	delete: "delete",
	del: "delete",
	home: "home",
	end: "end",
	pageup: "pageup",
	pgup: "pageup",
	pagedown: "pagedown",
	pgdn: "pagedown",
	insert: "insert",
	ins: "insert",
};

for (let i = 1; i <= 12; i++) {
	ALIASES[`f${i}`] = `f${i}`;
}

const MODIFIER_CHARS = new Set(["c", "s", "a", "m"]);

export class KeyParseError extends Error {
	constructor(
		public readonly raw: string,
		message: string,
	) {
		super(message);
		this.name = "KeyParseError";
	}
}

function resolveBase(base: string): string {
	const lower = base.toLowerCase();
	if (Object.prototype.hasOwnProperty.call(ALIASES, lower)) {
		return ALIASES[lower];
	}
	return base.length > 1 ? lower : base;
}

/** Zero the shift flag for single-character keys: the character's own case already encodes it. */
function normalize(key: ParsedKey): ParsedKey {
	if (key.key.length === 1) {
		return { ...key, shift: false };
	}
	return key;
}

/**
 * Parse a Spacekeys-style key string, e.g. "c-enter", "cs-f", "?", "c--".
 * An optional single run of modifier letters (c/s/a/m for ctrl/shift/alt/meta)
 * precedes a `-` and the base key; aliases map friendly names to raw key values.
 * Shift on a single letter becomes the uppercase letter ("cs-f" is Ctrl+Shift+F);
 * shift on any other single character is rejected, since the shifted character
 * itself must be written instead (e.g. "!" rather than "s-1").
 */
export function parseKeyString(raw: string): ParsedKey {
	if (raw.length === 0) {
		throw new KeyParseError(raw, "Key string must not be empty");
	}

	let mods = "";
	let base = raw;

	const dashIndex = raw.indexOf("-");
	if (dashIndex > 0 && dashIndex < raw.length - 1) {
		mods = raw.slice(0, dashIndex).toLowerCase();
		base = raw.slice(dashIndex + 1);
	}

	if (base.length === 0) {
		throw new KeyParseError(raw, `Invalid key string "${raw}": missing base key`);
	}

	const seen = new Set<string>();
	for (const ch of mods) {
		if (!MODIFIER_CHARS.has(ch)) {
			throw new KeyParseError(raw, `Invalid key string "${raw}": unknown modifier "${ch}"`);
		}
		if (seen.has(ch)) {
			throw new KeyParseError(raw, `Invalid key string "${raw}": modifier "${ch}" repeated`);
		}
		seen.add(ch);
	}

	let resolved = resolveBase(base);
	if (seen.has("s") && resolved.length === 1) {
		if (resolved.toLowerCase() === resolved.toUpperCase()) {
			throw new KeyParseError(
				raw,
				`Invalid key string "${raw}": shift cannot be combined with "${resolved}"; write the shifted character itself instead (e.g. "!" rather than "s-1")`,
			);
		}
		resolved = resolved.toUpperCase();
	}

	const key: ParsedKey = {
		key: resolved,
		ctrl: mods.includes("c"),
		shift: mods.includes("s"),
		alt: mods.includes("a"),
		meta: mods.includes("m"),
	};

	return normalize(key);
}

/** Inverse of {@link parseKeyString}: render a ParsedKey back to its key-string form, e.g. "c-b". */
export function keyToString(key: ParsedKey): string {
	let mods = "";
	if (key.ctrl) mods += "c";
	if (key.shift) mods += "s";
	if (key.alt) mods += "a";
	if (key.meta) mods += "m";
	const base = key.key === " " ? "space" : key.key;
	return mods.length > 0 ? `${mods}-${base}` : base;
}

/** Build a ParsedKey from a live (or test-fake) keyboard event. */
export function keyFromEvent(evt: KeyboardEventLike): ParsedKey {
	const raw = evt.key;
	const key = raw.length > 1 ? raw.toLowerCase() : raw;
	return normalize({
		key,
		ctrl: evt.ctrlKey,
		shift: evt.shiftKey,
		alt: evt.altKey,
		meta: evt.metaKey,
	});
}

export function keysEqual(a: ParsedKey, b: ParsedKey): boolean {
	const na = normalize(a);
	const nb = normalize(b);
	return (
		na.key === nb.key &&
		na.ctrl === nb.ctrl &&
		na.shift === nb.shift &&
		na.alt === nb.alt &&
		na.meta === nb.meta
	);
}

/** A human-friendly glyph for the raw-key breadcrumb and grid rows. */
export function keyGlyph(key: ParsedKey): string {
	const glyphs: Record<string, string> = {
		enter: "↵",
		backspace: "⌫",
		escape: "Esc",
		tab: "⇥",
		arrowup: "↑",
		arrowdown: "↓",
		arrowleft: "←",
		arrowright: "→",
		" ": "Space",
		delete: "Del",
		home: "Home",
		end: "End",
		pageup: "PgUp",
		pagedown: "PgDn",
		insert: "Ins",
	};
	const base = glyphs[key.key] ?? (key.key.length === 1 ? key.key : key.key.toUpperCase());

	// An uppercase letter is stored with shift folded in. Alone it reads fine
	// ("F"), but with another modifier "Ctrl+F" would name plain Ctrl+F, so
	// spell the shift out to label the key the user actually has to press.
	const shiftedLetter =
		key.key.length === 1 && key.key !== key.key.toLowerCase() && (key.ctrl || key.alt || key.meta);

	const parts: string[] = [];
	if (key.ctrl) parts.push("Ctrl");
	if (key.alt) parts.push("Alt");
	if (key.shift || shiftedLetter) parts.push("Shift");
	if (key.meta) parts.push("Cmd");
	parts.push(base);
	return parts.join("+");
}

/** Stable ordering for grid rows: by modifier count, then alphabetically by key. */
export function compareKeys(a: ParsedKey, b: ParsedKey): number {
	const na = normalize(a);
	const nb = normalize(b);
	const modCount = (k: ParsedKey) => Number(k.ctrl) + Number(k.shift) + Number(k.alt) + Number(k.meta);
	const diff = modCount(na) - modCount(nb);
	if (diff !== 0) return diff;
	return na.key.localeCompare(nb.key);
}
