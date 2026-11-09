import { readFileSync } from "node:fs";
import { join } from "node:path";

interface CssRule {
	classes: string[];
	display: string | undefined;
	order: number;
}

/**
 * Parses the subset of CSS this stylesheet actually uses - comma-separated selector lists of
 * plain class chains (e.g. ".a.b"), no combinators, no @media, no !important - just enough to
 * resolve which rule's `display` wins the cascade for an element carrying a given set of classes.
 */
function parseRules(css: string): CssRule[] {
	const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const rules: CssRule[] = [];
	let order = 0;
	for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectorList = match[1];
		const body = match[2];
		const displayMatch = body.match(/display\s*:\s*([^;]+);/);
		const display = displayMatch ? displayMatch[1].trim() : undefined;
		for (const rawSelector of selectorList.split(",")) {
			const selector = rawSelector.trim();
			if (selector.length === 0) continue;
			const classMatches = [...selector.matchAll(/\.([\w-]+)/g)];
			const isPlainClassChain = classMatches.map((m) => m[0]).join("") === selector;
			if (!isPlainClassChain) continue;
			rules.push({ classes: classMatches.map((m) => m[1]), display, order: order++ });
		}
	}
	return rules;
}

/** Cascade resolution: highest specificity wins; a later rule wins a tie, exactly like a browser. */
function resolveDisplay(rules: CssRule[], elementClasses: string[]): string | undefined {
	const elementClassSet = new Set(elementClasses);
	const matching = rules.filter((rule) => rule.classes.every((c) => elementClassSet.has(c)));
	let winner: CssRule | undefined;
	for (const rule of matching) {
		if (rule.display === undefined) continue;
		if (
			!winner ||
			rule.classes.length > winner.classes.length ||
			(rule.classes.length === winner.classes.length && rule.order > winner.order)
		) {
			winner = rule;
		}
	}
	return winner?.display;
}

describe("keymap tree collapse CSS", () => {
	const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
	const rules = parseRules(css);

	it("hides a collapsed group's items (neokeys-tree-items.neokeys-hidden wins the cascade)", () => {
		const display = resolveDisplay(rules, ["neokeys-tree-items", "neokeys-hidden"]);
		expect(display).toBe("none");
	});

	it("still shows an expanded group's items as flex", () => {
		const display = resolveDisplay(rules, ["neokeys-tree-items"]);
		expect(display).toBe("flex");
	});
});
