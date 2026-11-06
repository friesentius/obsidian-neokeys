import { compareKeys, formatKey, keyFromEvent, keysEqual, parseKeyString, KeyParseError } from "../src/keys";

describe("parseKeyString / formatKey round-trip", () => {
	const cases = ["a", "A", "?", "-", "space", "c-enter", "cs-f", "c--", "f1", "f12", "c-a", "sa-tab"];

	for (const raw of cases) {
		it(`round-trips "${raw}"`, () => {
			const parsed = parseKeyString(raw);
			const formatted = formatKey(parsed);
			const reparsed = parseKeyString(formatted);
			expect(reparsed).toEqual(parsed);
		});
	}

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

	it("ignores an explicit shift modifier on single-character keys", () => {
		expect(parseKeyString("s-a")).toEqual(parseKeyString("a"));
		expect(parseKeyString("s-?")).toEqual(parseKeyString("?"));
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

	it("matches the config-string form of the same physical key", () => {
		const fromEvent = keyFromEvent({ key: "f", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false });
		const fromString = parseKeyString("c-f");
		expect(keysEqual(fromEvent, fromString)).toBe(true);
	});
});

describe("compareKeys", () => {
	it("orders keys with fewer modifiers first, then alphabetically", () => {
		const keys = ["c-z", "a", "z", "c-a"].map(parseKeyString);
		const sorted = [...keys].sort(compareKeys);
		expect(sorted.map(formatKey)).toEqual(["a", "z", "c-a", "c-z"]);
	});
});
