/**
 * What a render does with each ring on screen, as pure arithmetic over the rings before and
 * after: a ring that shows the same items of the same group is kept (and only re-placed, so the
 * rings under the thumb do not replay their entrance); a ring at the same depth that shows
 * something else (the thumb moved from one group to its sibling, so the ring outside them is now
 * the sibling's items) is swapped, the old one leaving as the new one enters; a ring with
 * nothing at its depth before is entered. Rings that were deeper than any there are now are
 * dropped.
 */
export type RingChange = "keep" | "swap" | "enter";

/** One ring as the diff sees it: the group it shows and the identity of each item on it, in order. */
export interface RingShape<G = unknown, I = unknown> {
	group: G;
	items: readonly I[];
}

/** One change per ring now on screen, innermost first. */
export function diffRings<G, I>(before: readonly RingShape<G, I>[], after: readonly RingShape<G, I>[]): RingChange[] {
	return after.map((ring, index): RingChange => {
		const old = before[index];
		if (!old) return "enter";
		const same = old.group === ring.group && old.items.length === ring.items.length && old.items.every((item, i) => item === ring.items[i]);
		return same ? "keep" : "swap";
	});
}

/**
 * Put a swapped-in ring where the old one is, then let the old one leave. The new ring goes
 * after the old one, so it stacks above it while the old one animates out; it is inserted
 * first because `retire` may remove the old ring at once (ring animation off), and inserting
 * after a node that is no longer in the document does nothing.
 */
export function swapRing<T extends { after(node: T): void }>(old: T, next: T, retire: (el: T) => void): void {
	old.after(next);
	retire(old);
}
