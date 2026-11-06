import { ShowDelayGate, TimerSource } from "../src/delay";

function fakeTimers(): TimerSource & { flush(): void; pending(): number } {
	let nextHandle = 1;
	const scheduled = new Map<number, { ms: number; handler: () => void }>();
	return {
		setTimeout(handler, ms) {
			const handle = nextHandle++;
			scheduled.set(handle, { ms, handler });
			return handle;
		},
		clearTimeout(handle) {
			scheduled.delete(handle);
		},
		flush() {
			const toRun = [...scheduled.values()];
			scheduled.clear();
			for (const { handler } of toRun) handler();
		},
		pending() {
			return scheduled.size;
		},
	};
}

describe("ShowDelayGate", () => {
	it("does not show immediately when delay > 0", () => {
		const timers = fakeTimers();
		const onShow = jest.fn();
		const gate = new ShowDelayGate(200, onShow, timers);

		gate.poke();

		expect(onShow).not.toHaveBeenCalled();
		expect(timers.pending()).toBe(1);
	});

	it("shows once the delay elapses", () => {
		const timers = fakeTimers();
		const onShow = jest.fn();
		const gate = new ShowDelayGate(200, onShow, timers);

		gate.poke();
		timers.flush();

		expect(onShow).toHaveBeenCalledTimes(1);
		expect(gate.isShown).toBe(true);
	});

	it("shows immediately when delay is 0", () => {
		const timers = fakeTimers();
		const onShow = jest.fn();
		const gate = new ShowDelayGate(0, onShow, timers);

		gate.poke();

		expect(onShow).toHaveBeenCalledTimes(1);
	});

	it("resets the timer on every poke while still collapsed", () => {
		const timers = fakeTimers();
		const onShow = jest.fn();
		const gate = new ShowDelayGate(200, onShow, timers);

		gate.poke();
		expect(timers.pending()).toBe(1);
		gate.poke();
		// the first timer was cleared and a fresh one scheduled, not a second one stacked on top
		expect(timers.pending()).toBe(1);

		timers.flush();
		expect(onShow).toHaveBeenCalledTimes(1);
	});

	it("does nothing further once already shown", () => {
		const timers = fakeTimers();
		const onShow = jest.fn();
		const gate = new ShowDelayGate(0, onShow, timers);

		gate.poke();
		gate.poke();
		gate.poke();

		expect(onShow).toHaveBeenCalledTimes(1);
		expect(timers.pending()).toBe(0);
	});

	it("cancel() clears a pending timer and suppresses onShow", () => {
		const timers = fakeTimers();
		const onShow = jest.fn();
		const gate = new ShowDelayGate(200, onShow, timers);

		gate.poke();
		gate.cancel();
		timers.flush();

		expect(onShow).not.toHaveBeenCalled();
		expect(gate.isShown).toBe(false);
	});
});
