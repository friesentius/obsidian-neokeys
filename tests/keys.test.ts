import { compareKeys, keyFromEvent, keyGlyph, keysEqual, keyToString, parseKeyString, KeyParseError } from "../src/keys";

describe("parseKeyString", () => {
	it("resolves aliases to their raw key value", () => {
		expect(parseKeyString("space")).toEqual({ key: " ", ctrl: false, shift: false, alt: false, meta: false });
		expect(parseKeyString("up")).toEqual({ key: "arrowup", ctrl: false, shift: false, alt: false, meta: false });
		expect(parseKeyString("c-esc")).toEqual({ key: "escape", ctrl: true, shift: false, alt: false, meta: false });
	});

	it("lower-cases multi-character base keys but preserves case of single characters", () => {
		expect(parseKeyString("Enter").key).toBe("enter");
		expect(parseKeyString("A").key).toBe("A");
		expect(parseKeyString("a").key).toBe("a");
	});

	it("maps an explicit shift modifier on a letter to the uppercase letter", () => {
		expect(parseKeyString("s-a")).toEqual(parseKeyString("A"));
		expect(parseKeyString("cs-f")).toEqual({ key: "F", ctrl: true, shift: false, alt: false, meta: false });
		expect(parseKeyString("s-A")).toEqual(parseKeyString("A"));
	});

	it("keeps an explicit shift modifier on multi-character keys", () => {
		expect(parseKeyString("sa-tab")).toEqual({ key: "tab", ctrl: false, shift: true, alt: true, meta: false });
	});

	it("rejects an explicit shift modifier on a non-letter character, pointing at the shifted character", () => {
		expect(() => parseKeyString("s-1")).toThrow(KeyParseError);
		expect(() => parseKeyString("s-1")).toThrow(/write the shifted character itself/);
		expect(() => parseKeyString("cs-/")).toThrow(KeyParseError);
		expect(() => parseKeyString("s-space")).toThrow(KeyParseError);
	});

	it("rejects an empty key string", () => {
		expect(() => parseKeyString("")).toThrow(KeyParseError);
	});

	it("rejects an unknown modifier letter", () => {
		expect(() => parseKeyString("x-a")).toThrow(KeyParseError);
	});

	it("rejects a repeated modifier letter", () => {
		expect(() => parseKeyString("cc-a")).toThrow(KeyParseError);
	});
});

describe("keyFromEvent", () => {
	it("builds a ParsedKey from a keyboard-event-like object", () => {
		const parsed = keyFromEvent({ key: "f", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false });
		expect(parsed).toEqual({ key: "f", ctrl: true, shift: false, alt: false, meta: false });
	});

	it("lower-cases multi-character event key names", () => {
		const parsed = keyFromEvent({ key: "Enter", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });
		expect(parsed.key).toBe("enter");
	});

	it("zeroes the shift flag for single-character keys, since the character already encodes it", () => {
		const parsed = keyFromEvent({ key: "?", ctrlKey: false, shiftKey: true, altKey: false, metaKey: false });
		expect(parsed.shift).toBe(false);
	});

	it("matches Ctrl+Shift+F against \"cs-f\" but not plain Ctrl+F", () => {
		const ctrlShiftF = keyFromEvent({ key: "F", ctrlKey: true, shiftKey: true, altKey: false, metaKey: false });
		const ctrlF = keyFromEvent({ key: "f", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false });
		expect(keysEqual(ctrlShiftF, parseKeyString("cs-f"))).toBe(true);
		expect(keysEqual(ctrlF, parseKeyString("cs-f"))).toBe(false);
	});

	it("matches the config-string form of the same physical key", () => {
		const fromEvent = keyFromEvent({ key: "f", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false });
		const fromString = parseKeyString("c-f");
		expect(keysEqual(fromEvent, fromString)).toBe(true);
	});
});

describe("keyToString", () => {
	it("is the inverse of parseKeyString for a modifier combo", () => {
		expect(keyToString(parseKeyString("c-b"))).toBe("c-b");
		expect(keyToString(parseKeyString("cs-f"))).toBe("c-F");
		expect(keyToString(parseKeyString("sa-tab"))).toBe("sa-tab");
	});

	it("renders a bare key with no modifier prefix", () => {
		expect(keyToString(parseKeyString("f"))).toBe("f");
	});
});

describe("compareKeys", () => {
	it("orders keys with fewer modifiers first, then alphabetically", () => {
		const keys = ["c-z", "a", "z", "c-a"].map(parseKeyString);
		const sorted = [...keys].sort(compareKeys);
		expect(sorted).toEqual(["a", "z", "c-a", "c-z"].map(parseKeyString));
	});
});

describe("keyGlyph", () => {
	it("spells out shift for an uppercase letter combined with another modifier", () => {
		expect(keyGlyph(parseKeyString("cs-f"))).toBe("Ctrl+Shift+F");
		expect(keyGlyph(parseKeyString("c-F"))).toBe("Ctrl+Shift+F");
		expect(keyGlyph(parseKeyString("a-F"))).toBe("Alt+Shift+F");
	});

	it("leaves a bare uppercase letter and lowercase combos without shift", () => {
		expect(keyGlyph(parseKeyString("F"))).toBe("F");
		expect(keyGlyph(parseKeyString("c-f"))).toBe("Ctrl+f");
		expect(keyGlyph(parseKeyString("!"))).toBe("!");
	});
});
