import { DEFAULT_SETTINGS, parseDialCorner, parseDialDescription, parseDialItemSize, parseDialLensPeak, parseDialRadiusRule, parseDialRingAnimation, resolveSettings } from "../src/defaultSettings";

/** The dial keys a fresh install gets. */
const DIAL_DEFAULTS = {
	mobileDialEnabled: true,
	mobileDialCorner: "bottom-right",
	mobileDialItemSize: 44,
	mobileDialDescription: "none",
	mobileDialRadiusRule: "fixed",
	mobileDialLensPeak: 1.5,
	mobileDialRingAnimation: true,
	mobileDialRingAnimationStyle: "fade",
};

describe("resolveSettings", () => {
	it("fills in the dial settings for a file saved before the dial existed", () => {
		const saved = { keymapSource: "title: X\nitems: {}\n", showDelayMs: 50, comboLeader: "c-j", animationsEnabled: false, animationDurationMs: 90 };
		expect(resolveSettings(saved)).toEqual({ ...saved, ...DIAL_DEFAULTS });
	});

	it("fills in the item size for a file saved by a release whose dial had one size", () => {
		expect(resolveSettings({ mobileDialEnabled: true, mobileDialCorner: "bottom-left" })).toMatchObject({ mobileDialItemSize: 44, mobileDialDescription: "none" });
	});

	it("fills in fixed rings, the 1.5 lens and the fade for a file saved by a release whose dial paged instead", () => {
		const saved = { mobileDialEnabled: true, mobileDialCorner: "bottom-left", mobileDialItemSize: 48, mobileDialDescription: "card" };
		expect(resolveSettings(saved)).toMatchObject({ ...saved, mobileDialRadiusRule: "fixed", mobileDialLensPeak: 1.5, mobileDialRingAnimation: true, mobileDialRingAnimationStyle: "fade" });
	});

	it("keeps a stored radius rule, lens peak and ring animation, including the animation off", () => {
		expect(resolveSettings({ mobileDialRadiusRule: "fit", mobileDialLensPeak: 1.25, mobileDialRingAnimation: false, mobileDialRingAnimationStyle: "fly" })).toMatchObject({
			mobileDialRadiusRule: "fit",
			mobileDialLensPeak: 1.25,
			mobileDialRingAnimation: false,
			mobileDialRingAnimationStyle: "fly",
		});
	});

	it("keeps a stored corner, size and an explicit off", () => {
		expect(resolveSettings({ mobileDialEnabled: false, mobileDialCorner: "bottom-left", mobileDialItemSize: 50, mobileDialDescription: "thumb" })).toMatchObject({
			mobileDialEnabled: false,
			mobileDialCorner: "bottom-left",
			mobileDialItemSize: 50,
			mobileDialDescription: "thumb",
		});
	});

	it("falls back to the defaults for hand-edited values it does not understand", () => {
		expect(
			resolveSettings({ mobileDialEnabled: "yes", mobileDialCorner: "top-left", mobileDialItemSize: "big", mobileDialDescription: "everywhere", mobileDialRadiusRule: "loose", mobileDialLensPeak: "huge", mobileDialRingAnimation: "sure", mobileDialRingAnimationStyle: "spin" }),
		).toMatchObject(DIAL_DEFAULTS);
		expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(resolveSettings("junk")).toEqual(DEFAULT_SETTINGS);
	});
});

describe("parseDialItemSize", () => {
	it("keeps whole pixels inside the offered range and the default for anything that is not a number", () => {
		expect(parseDialItemSize(50)).toBe(50);
		expect(parseDialItemSize(51.4)).toBe(51);
		expect(parseDialItemSize(40)).toBe(40);
		expect(parseDialItemSize(56)).toBe(56);
		expect(parseDialItemSize(Number.NaN)).toBe(44);
		expect(parseDialItemSize("44")).toBe(44);
		expect(parseDialItemSize(undefined)).toBe(44);
	});

	it("falls back to the default, not the nearest end, for a size outside the range (one saved for the labelled circles of a development build)", () => {
		expect(parseDialItemSize(66)).toBe(44);
		expect(parseDialItemSize(72)).toBe(44);
		expect(parseDialItemSize(30)).toBe(44);
	});
});

describe("parseDialDescription", () => {
	it("keeps a known placement and falls back to the pill alone for anything else", () => {
		expect(parseDialDescription("card")).toBe("card");
		expect(parseDialDescription("thumb")).toBe("thumb");
		expect(parseDialDescription("none")).toBe("none");
		expect(parseDialDescription("bubble")).toBe("none");
		expect(parseDialDescription(undefined)).toBe("none");
	});
});

describe("parseDialLensPeak", () => {
	it("keeps a peak on the slider's steps, holds anything outside the range at the nearer end, and falls back to the default for a non-number", () => {
		expect(parseDialLensPeak(1.25)).toBe(1.25);
		expect(parseDialLensPeak(1)).toBe(1);
		expect(parseDialLensPeak(1.5)).toBe(1.5);
		expect(parseDialLensPeak(1.333)).toBe(1.35);
		expect(parseDialLensPeak(2)).toBe(1.5);
		expect(parseDialLensPeak(0.5)).toBe(1);
		expect(parseDialLensPeak("1.5")).toBe(1.5);
		expect(parseDialLensPeak(Number.NaN)).toBe(1.5);
		expect(parseDialLensPeak(undefined)).toBe(1.5);
	});
});

describe("parseDialRadiusRule and parseDialRingAnimation", () => {
	it("accept the offered values and nothing else", () => {
		expect(parseDialRadiusRule("fit")).toBe("fit");
		expect(parseDialRadiusRule("fixed")).toBe("fixed");
		expect(parseDialRadiusRule("compact")).toBe("fixed");
		expect(parseDialRadiusRule(undefined)).toBe("fixed");
		expect(parseDialRingAnimation("fly")).toBe("fly");
		expect(parseDialRingAnimation("fade")).toBe("fade");
		expect(parseDialRingAnimation("pop")).toBe("fade");
		expect(parseDialRingAnimation(undefined)).toBe("fade");
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
