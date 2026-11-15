/**
 * Items with no key. On a phone an item needs a key or an icon, so an icon-only item exists and
 * must survive in a keymap that syncs to a desktop or tablet.
 *
 * A keymap stores its items under their key string, so a keyless item still needs a unique,
 * stable token to be stored under. The token is `nokey1`, `nokey2`, and so on: a word with no dash
 * (a dashed token would be read as modifiers and rejected by every Neokeys version before this
 * one, which would refuse the whole keymap on a device not yet updated), and not the name of any
 * key a keyboard sends, so an older version loads the item as a key nobody can press. This module
 * owns the token's shape; nothing else should build or test one by hand.
 */

const KEYLESS_ID = /^nokey[0-9]+$/;

/** Whether `rawKey` is the token a keyless item is stored under, rather than a key string. */
export function isKeylessId(rawKey: string): boolean {
	return KEYLESS_ID.test(rawKey);
}

/** The first token (`nokey1`, `nokey2`, ...) that is not among `taken`. */
export function nextKeylessId(taken: Iterable<string>): string {
	const used = new Set(taken);
	let n = 1;
	while (used.has(`nokey${n}`)) n++;
	return `nokey${n}`;
}
