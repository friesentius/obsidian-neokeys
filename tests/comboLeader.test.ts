import {
	ComboLeaderError,
	describeComboLeader,
	hasRequiredModifier,
	parseComboLeaderString,
	validateComboLeader,
} from "../src/comboLeader";
import { keyFromEvent, keyToString, parseKeyString } from "../src/keys";

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

describe("recorded combo round-trip", () => {
	const event = (key: string, mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>>) =>
		keyFromEvent({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

	it.each([
		["Ctrl+B", event("b", { ctrlKey: true })],
		["Ctrl+Space", event(" ", { ctrlKey: true })],
		["Alt+Shift+Space", event(" ", { altKey: true, shiftKey: true })],
		["Ctrl+Shift+Tab", event("Tab", { ctrlKey: true, shiftKey: true })],
		["Ctrl+Minus", event("-", { ctrlKey: true })],
	])("stores %s as a string that parses back to the same key", (_label, key) => {
		expect(parseComboLeaderString(keyToString(key))).toEqual(key);
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
