import { keyToString } from "./keys";

/**
 * What a key field's `input` event means for the key, kept free of Obsidian and DOM imports so it
 * is unit-tested. A soft keyboard sends no dependable `keydown` (Android reports every key as
 * "Unidentified" mid-composition), but it always changes the field's text, so the key is read from
 * that change: the last character typed replaces whatever the field held.
 *
 * Returns the new key string (`""` when the field was emptied), or null when the event carries no
 * usable character (a newline or tab, a lone modifier-like control character), so the caller keeps
 * the key it had.
 *
 * `inserted` is the event's own `data` (the text it added) when the browser gives it: it is the
 * only trustworthy source when the caret was not at the end of the field. `value` is the field's
 * text after the change.
 */
export function keyFromTyped(inputType: string, inserted: string | null, value: string): string | null {
	if (inputType.startsWith("delete")) return "";
	const source = inserted !== null && inserted.length > 0 ? inserted : value;
	const chars = [...source];
	const last = chars[chars.length - 1];
	if (last === undefined) return "";
	if (last !== " " && /^\s$/u.test(last)) return null;
	return keyToString({ key: last, ctrl: false, shift: false, alt: false, meta: false });
}
