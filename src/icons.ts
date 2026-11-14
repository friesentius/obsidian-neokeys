/**
 * Helpers for the icon an entry may carry (see `icon` in types.ts): Obsidian's own icons, which
 * are Lucide's. Obsidian lists its bundled icons with a "lucide-" prefix but accepts the bare
 * name everywhere (setIcon, getIcon), and the bare name is what a keymap should say, so that is
 * what is stored and shown. Kept free of Obsidian imports so the search is unit-tested.
 */

const LUCIDE_PREFIX = "lucide-";

/** The bare name of an icon id: "lucide-file-text" and "file-text" are both "file-text"; a plugin's own icon id is left as it is. */
export function iconName(id: string): string {
	return id.startsWith(LUCIDE_PREFIX) ? id.slice(LUCIDE_PREFIX.length) : id;
}

/**
 * The icons whose names match `query`, best first, at most `limit`: every word of the query must
 * appear in the name (so "file text" finds "file-text" and "text-file"), and a name that equals
 * the query, then one that starts with it, then one with a word starting with it, comes ahead of
 * the rest, which stay in alphabetical order. An empty query lists the first `limit` names.
 */
export function searchIcons(ids: readonly string[], query: string, limit = 60): string[] {
	const names = [...new Set(ids.map(iconName))].sort((a, b) => a.localeCompare(b));
	const words = query
		.toLowerCase()
		.split(/[\s-]+/)
		.filter((word) => word.length > 0);
	if (words.length === 0) return names.slice(0, limit);
	const whole = words.join("-");
	const scored: { name: string; rank: number }[] = [];
	for (const name of names) {
		const lower = name.toLowerCase();
		if (!words.every((word) => lower.includes(word))) continue;
		const rank = lower === whole ? 0 : lower.startsWith(whole) ? 1 : lower.split("-").some((part) => part.startsWith(words[0])) ? 2 : 3;
		scored.push({ name, rank });
	}
	return scored
		.sort((a, b) => a.rank - b.rank)
		.slice(0, limit)
		.map((entry) => entry.name);
}
