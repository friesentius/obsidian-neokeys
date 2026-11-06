export interface TimerSource {
	setTimeout(handler: () => void, ms: number): number;
	clearTimeout(handle: number): void;
}

const defaultTimers: TimerSource = {
	setTimeout: (handler, ms) => window.setTimeout(handler, ms),
	clearTimeout: (handle) => window.clearTimeout(handle),
};

/**
 * Governs the which-key popup's configurable show-delay: the grid stays
 * hidden until `delayMs` has elapsed since the most recent key press, so a
 * fast, already-known sequence never flashes the UI. There is no forced
 * abandon-timeout; once shown, the popup stays shown until the sequence
 * resolves or the user closes it.
 */
export class ShowDelayGate {
	private handle: number | undefined;
	private shown = false;

	constructor(
		private readonly delayMs: number,
		private readonly onShow: () => void,
		private readonly timers: TimerSource = defaultTimers,
	) {}

	/** Call once when the popup opens, and again on every key press while it is collapsed. */
	poke(): void {
		if (this.shown) return;

		if (this.handle !== undefined) {
			this.timers.clearTimeout(this.handle);
			this.handle = undefined;
		}

		if (this.delayMs <= 0) {
			this.show();
			return;
		}

		this.handle = this.timers.setTimeout(() => this.show(), this.delayMs);
	}

	private show(): void {
		this.shown = true;
		this.handle = undefined;
		this.onShow();
	}

	get isShown(): boolean {
		return this.shown;
	}

	cancel(): void {
		if (this.handle !== undefined) {
			this.timers.clearTimeout(this.handle);
			this.handle = undefined;
		}
	}
}
