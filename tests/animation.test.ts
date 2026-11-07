import {
	ANIMATION_DURATION_MAX_MS,
	ANIMATION_DURATION_MIN_MS,
	DEFAULT_ANIMATION_DURATION_MS,
	clampAnimationDurationMs,
	prefersReducedMotion,
	shouldAnimate,
} from "../src/animation";

describe("clampAnimationDurationMs", () => {
	it("passes through an in-range value", () => {
		expect(clampAnimationDurationMs(150)).toBe(150);
	});

	it("rounds a fractional value", () => {
		expect(clampAnimationDurationMs(150.6)).toBe(151);
	});

	it("clamps below the minimum", () => {
		expect(clampAnimationDurationMs(-50)).toBe(ANIMATION_DURATION_MIN_MS);
	});

	it("clamps above the maximum", () => {
		expect(clampAnimationDurationMs(5000)).toBe(ANIMATION_DURATION_MAX_MS);
	});

	it("accepts the boundary values unchanged", () => {
		expect(clampAnimationDurationMs(ANIMATION_DURATION_MIN_MS)).toBe(ANIMATION_DURATION_MIN_MS);
		expect(clampAnimationDurationMs(ANIMATION_DURATION_MAX_MS)).toBe(ANIMATION_DURATION_MAX_MS);
	});

	it("falls back to the default for non-finite input", () => {
		expect(clampAnimationDurationMs(NaN)).toBe(DEFAULT_ANIMATION_DURATION_MS);
		expect(clampAnimationDurationMs(Infinity)).toBe(DEFAULT_ANIMATION_DURATION_MS);
		expect(clampAnimationDurationMs(-Infinity)).toBe(DEFAULT_ANIMATION_DURATION_MS);
	});
});

describe("shouldAnimate", () => {
	it("animates when enabled and motion is not reduced", () => {
		expect(shouldAnimate(true, false)).toBe(true);
	});

	it("does not animate when the toggle is off", () => {
		expect(shouldAnimate(false, false)).toBe(false);
	});

	it("never animates when reduced motion is preferred, even if enabled", () => {
		expect(shouldAnimate(true, true)).toBe(false);
	});

	it("stays off when both are off", () => {
		expect(shouldAnimate(false, true)).toBe(false);
	});
});

describe("prefersReducedMotion", () => {
	it("returns true when the media query matches", () => {
		const win = { matchMedia: (query: string) => ({ matches: query.includes("reduce") }) as MediaQueryList };
		expect(prefersReducedMotion(win)).toBe(true);
	});

	it("returns false when the media query does not match", () => {
		const win = { matchMedia: () => ({ matches: false }) as MediaQueryList };
		expect(prefersReducedMotion(win)).toBe(false);
	});

	it("returns false when matchMedia is unavailable", () => {
		expect(prefersReducedMotion(undefined)).toBe(false);
		expect(prefersReducedMotion({} as Pick<Window, "matchMedia">)).toBe(false);
	});
});
