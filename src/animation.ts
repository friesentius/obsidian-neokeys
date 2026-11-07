export const ANIMATION_DURATION_MIN_MS = 0;
export const ANIMATION_DURATION_MAX_MS = 1000;
export const DEFAULT_ANIMATION_DURATION_MS = 150;

/**
 * Bounds a user-supplied animation duration to [ANIMATION_DURATION_MIN_MS, ANIMATION_DURATION_MAX_MS],
 * rounding to the nearest millisecond. A non-finite input (NaN or Infinity) falls back to the default.
 */
export function clampAnimationDurationMs(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_ANIMATION_DURATION_MS;
	const rounded = Math.round(value);
	return Math.min(ANIMATION_DURATION_MAX_MS, Math.max(ANIMATION_DURATION_MIN_MS, rounded));
}

/**
 * Turns the raw settings text field into a stored duration: a blank or non-numeric field falls back
 * to the default (matching the field's placeholder), anything else is clamped.
 */
export function parseAnimationDurationInput(raw: string): number {
	const trimmed = raw.trim();
	if (trimmed === "") return DEFAULT_ANIMATION_DURATION_MS;
	return clampAnimationDurationMs(Number(trimmed));
}

/**
 * Whether the which-key popup should actually animate: the user's toggle, overridden to off
 * whenever the OS reports a reduced-motion preference, regardless of the toggle's value.
 */
export function shouldAnimate(animationsEnabled: boolean, prefersReducedMotion: boolean): boolean {
	return animationsEnabled && !prefersReducedMotion;
}

/** Reads the OS reduced-motion preference. Takes `window` explicitly so it stays testable. */
export function prefersReducedMotion(win: Pick<Window, "matchMedia"> | undefined): boolean {
	if (!win?.matchMedia) return false;
	return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
