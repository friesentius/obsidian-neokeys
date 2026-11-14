/** A label as the item shows it: a slash gets a break opportunity after it, so "bullet/checkbox" wraps there rather than mid-word. */
export function itemLabelText(label: string): string {
	return label.replace(/\//g, "/​");
}

/**
 * An item's shown label split where the key chip may part from it: the head runs up to the first
 * break opportunity (a space, or the zero-width space after a slash) and never wraps, so the chip
 * stays glued to it; the tail is everything from that break on, and is empty when there is none.
 */
export function splitItemLabel(label: string): { head: string; tail: string } {
	const text = itemLabelText(label);
	const breaks = [text.indexOf(" "), text.indexOf("​")].filter((index) => index !== -1);
	if (breaks.length === 0) return { head: text, tail: "" };
	const at = Math.min(...breaks);
	return { head: text.slice(0, at), tail: text.slice(at) };
}
