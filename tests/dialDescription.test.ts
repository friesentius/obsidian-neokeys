import { cardFits, cardTop, placeBubble, type CoveredCircle } from "../src/dial/description";

const SCREEN = { width: 390, height: 844, top: 160 };
const ANCHOR = { x: 350, y: 804 };
const BOX = { width: 180, height: 50 };

describe("the description card", () => {
	it("fits when its height, plus the gaps to the pill and the rings, sits between them", () => {
		expect(cardFits(160, 400, 100)).toBe(true);
		expect(cardFits(160, 274, 100)).toBe(true);
		expect(cardFits(160, 273, 100)).toBe(false);
	});

	it("hangs 40px below the pill when the rings leave the room, else as close to the pill as the rings require, never closer than the gap", () => {
		expect(cardTop(160, 600, 100)).toBe(200);
		expect(cardTop(160, 290, 100)).toBe(182);
		expect(cardTop(160, 200, 100)).toBe(166);
	});
});

describe("the bubble beside the thumb", () => {
	it("sits radially outward from the armed circle when nothing is there", () => {
		const armed = { x: 350 - 97, y: 804 };
		const placed = placeBubble(armed, 25, BOX, SCREEN, [], ANCHOR, -1);
		// Outward from a bottom-right anchor is to the left: the box's right edge clears the circle and its gap.
		expect(placed.left + BOX.width).toBeCloseTo(armed.x - 25 - 10, 6);
		expect(placed.top).toBeCloseTo(armed.y - BOX.height / 2, 6);
	});

	it("moves to another side when outward would cover other circles", () => {
		const armed = { x: 350 - 97, y: 804 };
		const blocking: CoveredCircle[] = [{ x: armed.x - 60, y: armed.y, radius: 22, weight: 2 }];
		const placed = placeBubble(armed, 25, BOX, SCREEN, blocking, ANCHOR, -1);
		const nearestX = Math.max(placed.left, Math.min(placed.left + BOX.width, blocking[0].x));
		const nearestY = Math.max(placed.top, Math.min(placed.top + BOX.height, blocking[0].y));
		expect(Math.hypot(blocking[0].x - nearestX, blocking[0].y - nearestY)).toBeGreaterThanOrEqual(blocking[0].radius - 2);
	});

	it("stays on screen and below the pill wherever the armed circle is", () => {
		for (const armed of [
			{ x: 30, y: 300 },
			{ x: 350, y: 548 },
			{ x: 200, y: 170 },
			{ x: 380, y: 830 },
		]) {
			const placed = placeBubble(armed, 25, BOX, SCREEN, [], ANCHOR, -1);
			expect(placed.left).toBeGreaterThanOrEqual(8);
			expect(placed.left + BOX.width).toBeLessThanOrEqual(SCREEN.width - 8);
			expect(placed.top).toBeGreaterThanOrEqual(SCREEN.top + 6);
			expect(placed.top + BOX.height).toBeLessThanOrEqual(SCREEN.height - 8);
		}
	});

	it("takes the spot that covers the least when every spot covers something", () => {
		const armed = { x: 350 - 97, y: 804 };
		const everywhere: CoveredCircle[] = [];
		for (let x = 0; x <= 390; x += 30) for (let y = 160; y <= 844; y += 30) everywhere.push({ x, y, radius: 22, weight: x < 200 ? 1 : 3 });
		const placed = placeBubble(armed, 25, BOX, SCREEN, everywhere, ANCHOR, -1);
		const covered = (left: number, top: number) =>
			everywhere.reduce((sum, circle) => {
				const nx = Math.max(left, Math.min(left + BOX.width, circle.x));
				const ny = Math.max(top, Math.min(top + BOX.height, circle.y));
				return sum + (Math.hypot(circle.x - nx, circle.y - ny) < circle.radius - 2 ? circle.weight : 0);
			}, 0);
		const outward = placeBubble(armed, 25, BOX, SCREEN, [], ANCHOR, -1);
		expect(covered(placed.left, placed.top)).toBeLessThanOrEqual(covered(outward.left, outward.top));
	});

	it("mirrors toward the far edge for the bottom-left corner", () => {
		const anchor = { x: 40, y: 804 };
		const armed = { x: 40 + 97, y: 804 };
		const placed = placeBubble(armed, 25, BOX, SCREEN, [], anchor, 1);
		expect(placed.left).toBeCloseTo(armed.x + 25 + 10, 6);
	});
});
