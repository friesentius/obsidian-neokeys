import { DEFAULT_SETTINGS, parseDialCorner, parseDialItemSize, resolveSettings } from "../src/defaultSettings";

describe("resolveSettings", () => {
	it("fills in the dial settings for a file saved before the dial existed", () => {
		const saved = { keymapSource: "title: X\nitems: {}\n", showDelayMs: 50, comboLeader: "c-j", animationsEnabled: false, animationDurationMs: 90 };
		expect(resolveSettings(saved)).toEqual({ ...saved, mobileDialEnabled: true, mobileDialCorner: "bottom-right", mobileDialItemSize: 66 });
	});

	it("fills in the item size for a file saved by a release whose dial had one size", () => {
		expect(resolveSettings({ mobileDialEnabled: true, mobileDialCorner: "bottom-left" })).toMatchObject({ mobileDialItemSize: 66 });
	});

	it("keeps a stored corner, size and an explicit off", () => {
		expect(resolveSettings({ mobileDialEnabled: false, mobileDialCorner: "bottom-left", mobileDialItemSize: 60 })).toMatchObject({
			mobileDialEnabled: false,
			mobileDialCorner: "bottom-left",
			mobileDialItemSize: 60,
		});
	});

	it("falls back to the defaults for hand-edited values it does not understand", () => {
		expect(resolveSettings({ mobileDialEnabled: "yes", mobileDialCorner: "top-left", mobileDialItemSize: "big" })).toMatchObject({
			mobileDialEnabled: true,
			mobileDialCorner: "bottom-right",
			mobileDialItemSize: 66,
		});
		expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(resolveSettings("junk")).toEqual(DEFAULT_SETTINGS);
	});
});

describe("parseDialItemSize", () => {
	it("keeps whole pixels inside the offered range and clamps the rest", () => {
		expect(parseDialItemSize(60)).toBe(60);
		expect(parseDialItemSize(61.4)).toBe(61);
		expect(parseDialItemSize(40)).toBe(56);
		expect(parseDialItemSize(80)).toBe(72);
		expect(parseDialItemSize(Number.NaN)).toBe(66);
		expect(parseDialItemSize("66")).toBe(66);
		expect(parseDialItemSize(undefined)).toBe(66);
	});
});

describe("parseDialCorner", () => {
	it("accepts the two corners and nothing else", () => {
		expect(parseDialCorner("bottom-left")).toBe("bottom-left");
		expect(parseDialCorner("bottom-right")).toBe("bottom-right");
		expect(parseDialCorner("top-left")).toBe("bottom-right");
		expect(parseDialCorner(undefined)).toBe("bottom-right");
		expect(parseDialCorner(3)).toBe("bottom-right");
	});
});
