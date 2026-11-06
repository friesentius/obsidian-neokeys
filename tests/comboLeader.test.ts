import {
	ComboLeaderError,
	comboLeaderToString,
	describeComboLeader,
	hasRequiredModifier,
	parseComboLeaderString,
	validateComboLeader,
} from "../src/comboLeader";
import { parseKeyString } from "../src/keys";

describe("hasRequiredModifier", () => {
	it("accepts ctrl, alt, or meta alone", () => {
		expect(hasRequiredModifier(parseKeyString("c-b"))).toBe(true);
		expect(hasRequiredModifier(parseKeyString("a-b"))).toBe(true);
		expect(hasRequiredModifier(parseKeyString("m-b"))).toBe(true);
	});

	it("rejects a bare key and a shift-only combo", () => {
		expect(hasRequiredModifier(parseKeyString("b"))).toBe(false);
		expect(hasRequiredModifier(parseKeyString("B"))).toBe(false);
		expect(hasRequiredModifier(parseKeyString("sa-tab"))).toBe(true);
		expect(hasRequiredModifier(parseKeyString("s-tab"))).toBe(false);
	});
});

describe("validateComboLeader", () => {
	it("passes for a modifier combo", () => {
		expect(() => validateComboLeader(parseKeyString("c-b"))).not.toThrow();
	});

	it("throws ComboLeaderError for a combo with no modifier", () => {
		expect(() => validateComboLeader(parseKeyString("b"))).toThrow(ComboLeaderError);
		expect(() => validateComboLeader(parseKeyString("b"))).toThrow(/modifier/);
	});
});

describe("parseComboLeaderString", () => {
	it("returns null for an empty or blank string", () => {
		expect(parseComboLeaderString("")).toBeNull();
		expect(parseComboLeaderString("   ")).toBeNull();
	});

	it("parses a valid combo string", () => {
		expect(parseComboLeaderString("c-b")).toEqual(parseKeyString("c-b"));
	});

	it("rejects a combo with no modifier", () => {
		expect(() => parseComboLeaderString("b")).toThrow(ComboLeaderError);
	});

	it("rejects an unparseable key string", () => {
		expect(() => parseComboLeaderString("x-b")).toThrow(ComboLeaderError);
	});
});

describe("comboLeaderToString", () => {
	it("round-trips through parseComboLeaderString", () => {
		const key = parseKeyString("c-b");
		const str = comboLeaderToString(key);
		expect(parseComboLeaderString(str)).toEqual(key);
	});
});

describe("describeComboLeader", () => {
	it("formats modifiers and an uppercase letter Obsidian-Hotkeys style", () => {
		expect(describeComboLeader(parseKeyString("c-j"))).toBe("Ctrl + J");
		expect(describeComboLeader(parseKeyString("a-b"))).toBe("Alt + B");
		expect(describeComboLeader(parseKeyString("m-b"))).toBe("Cmd + B");
	});

	it("spells out Shift for a shifted letter folded into its case", () => {
		expect(describeComboLeader(parseKeyString("cs-f"))).toBe("Ctrl + Shift + F");
	});

	it("names a non-letter key and keeps an explicit shift modifier", () => {
		expect(describeComboLeader(parseKeyString("c-enter"))).toBe("Ctrl + Enter");
		expect(describeComboLeader(parseKeyString("cs-tab"))).toBe("Ctrl + Shift + Tab");
	});
});
