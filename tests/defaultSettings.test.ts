import { DEFAULT_SETTINGS, parseDialCorner, resolveSettings } from "../src/defaultSettings";

describe("resolveSettings", () => {
	it("fills in the dial settings for a file saved before the dial existed", () => {
		const saved = { keymapSource: "title: X\nitems: {}\n", showDelayMs: 50, comboLeader: "c-j", animationsEnabled: false, animationDurationMs: 90 };
		expect(resolveSettings(saved)).toEqual({ ...saved, mobileDialEnabled: true, mobileDialCorner: "bottom-right" });
	});

	it("keeps a stored corner and an explicit off", () => {
		expect(resolveSettings({ mobileDialEnabled: false, mobileDialCorner: "bottom-left" })).toMatchObject({
			mobileDialEnabled: false,
			mobileDialCorner: "bottom-left",
		});
	});

	it("falls back to the defaults for hand-edited values it does not understand", () => {
		expect(resolveSettings({ mobileDialEnabled: "yes", mobileDialCorner: "top-left" })).toMatchObject({
			mobileDialEnabled: true,
			mobileDialCorner: "bottom-right",
		});
		expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(resolveSettings("junk")).toEqual(DEFAULT_SETTINGS);
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
