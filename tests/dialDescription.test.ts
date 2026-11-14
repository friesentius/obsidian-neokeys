import { BUBBLE_MARGIN, bubbleNeedsShortForm, cardFits, cardTop, coveredCircles, NEAR_ENOUGH, placeBubble, preferShortBubble, type BubbleArea, type CoveredCircle } from "../src/dial/description";
import { ANCHOR_RADIUS, DEFAULT_RING_PARAMS, edgeRoom, peakSize, planRings, ringParamsFor, ringSlots, slotPosition, type DialGeometry, type DialRingParams } from "../src/dial/layout";

const AREA: BubbleArea = { left: 8, top: 166, right: 382, bottom: 836 };
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
	/** The nearest the box comes to `point`. */
	const distanceFrom = (point: { x: number; y: number }, placed: { left: number; top: number }, box = BOX): number =>
		Math.hypot(point.x - Math.max(placed.left, Math.min(placed.left + box.width, point.x)), point.y - Math.max(placed.top, Math.min(placed.top + box.height, point.y)));

	it("sits beside the thumb, on the side away from the hand, when nothing is around it", () => {
		const thumb = { x: 350 - 97, y: 804 };
		const placed = placeBubble(thumb, 25, BOX, AREA, [], ANCHOR);
		// The hand reaches in from the corner on the right, so the bubble is above the thumb or to its far side, never on the hand's side, clear of its keep-out circle and the gap.
		expect(placed.left + BOX.width / 2).toBeLessThanOrEqual(thumb.x);
		expect(distanceFrom(thumb, placed)).toBeCloseTo(40, 0);
	});

	it("stays beside the thumb even when circles are everywhere: nearness counts, it does not run to the far corner of the screen to find a clear spot", () => {
		const thumb = { x: 350 - 97, y: 804 };
		const everywhere: CoveredCircle[] = [];
		for (let x = 0; x <= 390; x += 30) for (let y = 160; y <= 844; y += 30) everywhere.push({ x, y, radius: 22, weight: 2 });
		const placed = placeBubble(thumb, 25, BOX, AREA, everywhere, ANCHOR);
		expect(distanceFrom(thumb, placed)).toBeLessThan(110);
	});

	it("on a dial crowded all round the thumb (measured in Obsidian: Text, then Heading, thumb on h), finds the free patch above the rings rather than hiding the key of a circle beside it", () => {
		// ring, x, y, radius of every circle; the thumb is the second of ring 1.
		const measured = [[0, 253, 727, 25], [0, 267, 670, 29], [0, 309, 632, 24], [0, 357, 623, 22], [1, 184, 704, 26], [1, 201, 644, 33], [1, 239, 595, 25], [1, 284, 567, 22], [1, 334, 554, 22], [2, 113, 732, 23], [2, 117, 679, 28], [2, 136, 618, 32], [2, 173, 562, 32], [2, 220, 522, 27], [2, 266, 498, 22], [2, 306, 487, 18], [2, 340, 483, 14], [2, 367, 484, 11]];
		const circles: CoveredCircle[] = [{ x: 350, y: 720, radius: 28, weight: 2 }];
		for (const [ring, x, y, radius] of measured) if (!(x === 201 && y === 644)) circles.push({ x, y, radius, weight: ring === 2 ? 2 : 1 });
		const box = { width: 220, height: 78 };
		const area: BubbleArea = { left: 8, top: 179, right: 382, bottom: 760 };
		const placed = placeBubble({ x: 201, y: 644 }, 33, box, area, circles, { x: 350, y: 720 });
		const hidden = circles.filter((circle) => distanceFrom(circle, placed, box) < 12);
		expect(hidden).toEqual([]);
		// Still beside the thumb, as near as the circles allow: above the outer ring's digits, not at the top of the screen.
		expect(distanceFrom({ x: 201, y: 644 }, placed, box)).toBeLessThan(160);
	});

	it("reports how many circles' keys the spot it chose hides, so the DOM layer can try a shorter bubble: none where there is room, some where there is not", () => {
		const thumb = { x: 200, y: 400 };
		expect(placeBubble(thumb, 25, BOX, AREA, [], ANCHOR).hidden).toBe(0);
		const crowd: CoveredCircle[] = [];
		for (let x = 0; x <= 390; x += 20) for (let y = 200; y <= 800; y += 20) if (Math.hypot(x - thumb.x, y - thumb.y) > 40) crowd.push({ x, y, radius: 24, weight: 2 });
		const placed = placeBubble(thumb, 33, BOX, AREA, crowd, ANCHOR);
		expect(placed.hidden).toBe(crowd.filter((circle) => distanceFrom(circle, placed) < 12).length);
		expect(placed.hidden).toBeGreaterThan(0);
	});

	it("asks for a short bubble only when the full one hides a key that must stay or is not snug against the thumb, and takes it when it is better placed by a few tens of pixels", () => {
		const at = { left: 0, top: 0 };
		expect(bubbleNeedsShortForm({ ...at, cost: 1, away: 10, hidden: 0 })).toBe(false);
		expect(bubbleNeedsShortForm({ ...at, cost: 1, away: NEAR_ENOUGH, hidden: 0 })).toBe(false);
		expect(bubbleNeedsShortForm({ ...at, cost: 1, away: NEAR_ENOUGH + 1, hidden: 0 })).toBe(true);
		expect(bubbleNeedsShortForm({ ...at, cost: 1, away: 0, hidden: 1 })).toBe(true);
		const full = { ...at, cost: 2, away: 50, hidden: 0 };
		expect(preferShortBubble(full, { ...at, cost: 0.2, away: 5, hidden: 0 })).toBe(true);
		expect(preferShortBubble(full, { ...at, cost: 1.9, away: 45, hidden: 0 })).toBe(false);
	});

	it("keeps clear of the thumb's own circle whatever else is around, even with no room beside it", () => {
		const thumb = { x: 200, y: 400 };
		const crowd: CoveredCircle[] = [];
		for (let x = 0; x <= 390; x += 20) for (let y = 200; y <= 800; y += 20) if (Math.hypot(x - thumb.x, y - thumb.y) > 40) crowd.push({ x, y, radius: 24, weight: 2 });
		const placed = placeBubble(thumb, 33, BOX, AREA, crowd, ANCHOR);
		expect(distanceFrom(thumb, placed)).toBeGreaterThanOrEqual(33);
	});

	it("stays inside the area it is given wherever the thumb is, down to the corners of the screen", () => {
		for (const thumb of [
			{ x: 30, y: 300 },
			{ x: 350, y: 548 },
			{ x: 200, y: 170 },
			{ x: 380, y: 830 },
			{ x: 10, y: 832 },
			{ x: 380, y: 170 },
		]) {
			const placed = placeBubble(thumb, 25, BOX, AREA, [], ANCHOR);
			expect(placed.left).toBeGreaterThanOrEqual(AREA.left);
			expect(placed.left + BOX.width).toBeLessThanOrEqual(AREA.right);
			expect(placed.top).toBeGreaterThanOrEqual(AREA.top);
			expect(placed.top + BOX.height).toBeLessThanOrEqual(AREA.bottom);
			expect(distanceFrom(thumb, placed)).toBeGreaterThanOrEqual(25);
		}
	});

	it("takes the spot that covers the least of what is near the thumb", () => {
		const thumb = { x: 350 - 97, y: 700 };
		const outward = placeBubble(thumb, 25, BOX, AREA, [], ANCHOR);
		const blocking: CoveredCircle[] = [{ x: outward.left + BOX.width / 2, y: outward.top + BOX.height / 2, radius: 24, weight: 3 }];
		const placed = placeBubble(thumb, 25, BOX, AREA, blocking, ANCHOR);
		expect(Math.hypot(blocking[0].x - Math.max(placed.left, Math.min(placed.left + BOX.width, blocking[0].x)), blocking[0].y - Math.max(placed.top, Math.min(placed.top + BOX.height, blocking[0].y)))).toBeGreaterThanOrEqual(blocking[0].radius - 2);
		expect(distanceFrom(thumb, placed)).toBeLessThan(100);
	});

	it("moves a little when the thumb moves a little: the previous spot is kept while it is nearly as good, so the bubble does not flip sides", () => {
		const circles: CoveredCircle[] = [{ x: 150, y: 640, radius: 22, weight: 2 }];
		let previous = placeBubble({ x: 200, y: 700 }, 25, BOX, AREA, circles, ANCHOR);
		let flips = 0;
		for (let step = 1; step <= 40; step++) {
			const placed = placeBubble({ x: 200 - step * 0.8, y: 700 - step * 1.2 }, 25, BOX, AREA, circles, ANCHOR, previous);
			if (Math.hypot(placed.left - previous.left, placed.top - previous.top) > 40) flips++;
			previous = placed;
		}
		expect(flips).toBeLessThanOrEqual(1);
	});

	describe("the circles it keeps off", () => {
		const ring = (items: { x: number; size: number; presence?: number; armed?: boolean }[]) => ({ items: items.map((item) => ({ y: 500, presence: 1, armed: false, ...item })) });

		it("keeps the anchor and the armed circle's two neighbours on its ring off at all cost, and any other circle at a small one", () => {
			const circles = coveredCircles([ring([{ x: 100, size: 44 }, { x: 150, size: 44 }, { x: 200, size: 66, armed: true }, { x: 260, size: 44 }, { x: 320, size: 44 }])], ANCHOR);
			// The anchor, then every circle but the armed one, in order: heavy for the anchor and the two neighbours, light for the rest.
			expect(circles.map((circle) => circle.weight >= 1)).toEqual([true, false, true, true, false]);
			expect(circles[0]).toMatchObject({ x: ANCHOR.x, y: ANCHOR.y, radius: ANCHOR_RADIUS });
			expect(circles.slice(1).filter((circle) => circle.weight < 1).every((circle) => circle.weight < 0.2)).toBe(true);
		});

		it("weighs a circle too small to show a key less than one that does, and a fading circle in proportion to how much of it is there; a gone one not at all", () => {
			const circles = coveredCircles([ring([{ x: 100, size: 44 }, { x: 150, size: 12 }, { x: 200, size: 44 }, { x: 260, size: 44, presence: 0.5 }, { x: 320, size: 44, presence: 0 }, { x: 380, size: 66, armed: true }])], ANCHOR);
			const key = circles.find((circle) => circle.x === 100)!;
			const dot = circles.find((circle) => circle.x === 150)!;
			expect(dot.weight).toBeLessThan(key.weight);
			expect(circles.some((circle) => circle.x === 320)).toBe(false);
			const full = key;
			const faded = circles.find((circle) => circle.x === 260)!;
			expect(faded.weight).toBeCloseTo(full.weight / 2);
		});

		it("counts a neighbour on the armed circle's own ring only: the rings inside and outside have none", () => {
			const circles = coveredCircles([ring([{ x: 100, size: 44 }, { x: 150, size: 44 }]), ring([{ x: 100, size: 44 }, { x: 160, size: 66, armed: true }, { x: 220, size: 44 }])], ANCHOR);
			const weights = circles.slice(1).map((circle) => circle.weight);
			expect(weights.slice(0, 2).every((weight) => weight < 0.2)).toBe(true);
			expect(weights.slice(2)).toEqual([2, 2]);
		});

		it("lets the bubble sit beside a thumb at the end of a ring crowded with dots, covering the dots rather than going away from the finger", () => {
			// A column of 10px dots up from the thumb, as the far circles of a 22-item ring are, with a legible neighbour below it.
			const thumb = { x: 185, y: 777 };
			const dots = Array.from({ length: 12 }, (_, i) => ({ x: 188 + i * 2, size: 10, y: 765 - i * 13 }));
			const view = [{ items: [{ x: 184, y: 790, size: 44, presence: 1, armed: false }, { x: thumb.x, y: thumb.y, size: 66, presence: 1, armed: true }, ...dots.map((dot) => ({ ...dot, presence: 1, armed: false }))] }];
			const circles = coveredCircles(view, ANCHOR);
			const placed = placeBubble(thumb, 33, { width: 215, height: 62 }, AREA, circles, ANCHOR);
			expect(distanceFrom(thumb, placed, { width: 215, height: 62 }) - 33).toBeLessThan(35);
			// The thumb's one legible neighbour keeps its key.
			expect(distanceFrom({ x: 184, y: 790 }, placed, { width: 215, height: 62 })).toBeGreaterThanOrEqual(12);
		});
	});

	describe("on the dial's own rings", () => {
		const EDGE = 12;
		const MARGIN = 4;
		/** The geometry the DOM layer measures on a phone, as in the layout tests: the pill below the header, `bottomChrome` of keyboard and toolbar under the anchor. */
		function phone(width: number, height: number, corner: "bottom-right" | "bottom-left", bottomChrome: number, topInset: number): DialGeometry {
			const anchorY = height - bottomChrome - EDGE - ANCHOR_RADIUS;
			const anchorX = corner === "bottom-right" ? width - EDGE - ANCHOR_RADIUS : EDGE + ANCHOR_RADIUS;
			return { corner, anchor: { x: anchorX, y: anchorY }, bounds: { left: MARGIN, top: topInset + 44 + 67 + MARGIN, right: width - MARGIN, bottom: anchorY + ANCHOR_RADIUS + (EDGE - MARGIN) } };
		}

		/** How far from the armed circle's rim the bubble may be: a circle's width or so. */
		const BESIDE_GAP = 50;

		const cases: [string, DialGeometry][] = [
			["390x844, keyboard down", phone(390, 844, "bottom-right", 0, 47)],
			["390x844, keyboard up", phone(390, 844, "bottom-right", 52 + 300, 47)],
			["iPhone SE, keyboard up", phone(375, 667, "bottom-right", 52 + 260, 20)],
			["320x568, keyboard up", phone(320, 568, "bottom-right", 52 + 216, 20)],
			["left corner, keyboard up", phone(390, 844, "bottom-left", 52 + 300, 47)],
			["tablet 820x1180", phone(820, 1180, "bottom-right", 0, 24)],
			["tablet, left corner", phone(820, 1180, "bottom-left", 0, 24)],
		];

		/** The circles on screen with the finger on item `index` of ring `level`, which has its lens; the rings inside it keep theirs at the item that opened this ring. */
		function scene(geometry: DialGeometry, params: DialRingParams, counts: number[], level: number, index: number) {
			const rings = planRings(geometry, params, counts);
			const peak = peakSize(geometry, params);
			const room = edgeRoom(geometry);
			const slots = rings.flatMap((ring, ringIndex) => ringSlots(ringIndex, ring, ringIndex <= level ? counts[ringIndex] : 0, params, peak, ringIndex === level ? (counts[level] > 1 ? index / (counts[level] - 1) : 0.5) : 0.5, room));
			const armed = slots.find((slot) => slot.ring === level && slot.index === index);
			if (!armed) return null;
			const view = rings.map((_, ringIndex) => ({
				items: slots
					.filter((slot) => slot.ring === ringIndex)
					.map((slot) => {
						const at = slotPosition(slot, geometry, rings);
						return { x: at.x, y: at.y, size: slot.size, presence: slot.presence, armed: slot === armed };
					}),
			}));
			const area: BubbleArea = { left: BUBBLE_MARGIN, top: geometry.bounds.top - MARGIN + BUBBLE_MARGIN, right: geometry.bounds.right + MARGIN - BUBBLE_MARGIN, bottom: geometry.bounds.bottom };
			return { thumb: slotPosition(armed, geometry, rings), half: armed.size / 2, circles: coveredCircles(view, geometry.anchor), area };
		}

		const FULL = { width: 215, height: 62 };
		const SHORT = { width: 150, height: 40 };
		/** What the DOM layer does: the full bubble, and the short one where the full one hides a key that must stay or sits away from the thumb, if that does better. */
		function chooseBubble(thumb: { x: number; y: number }, half: number, area: BubbleArea, circles: CoveredCircle[], anchor: { x: number; y: number }) {
			let box = FULL;
			let placed = placeBubble(thumb, half, box, area, circles, anchor);
			if (bubbleNeedsShortForm(placed)) {
				const shorter = placeBubble(thumb, half, SHORT, area, circles, anchor);
				if (preferShortBubble(placed, shorter)) {
					placed = shorter;
					box = SHORT;
				}
			}
			return { placed, box };
		}

		it.each(cases)("%s: for every item the finger can be on, on every ring of the default keymap's deepest path, the bubble is on screen, below the pill and off the thumb, whichever form it takes", (_name, geometry) => {
			const problems: string[] = [];
			for (const params of [DEFAULT_RING_PARAMS, ringParamsFor(56, { peak: 1.5 }), ringParamsFor(40, { peak: 1 })]) {
				const counts = [4, 5, 9];
				for (const box of [FULL, SHORT]) {
					for (let level = 0; level < counts.length; level++) {
						for (let index = 0; index < counts[level]; index++) {
							const around = scene(geometry, params, counts, level, index);
							if (!around) continue;
							const { thumb, half, circles, area } = around;
							const placed = placeBubble(thumb, half, box, area, circles, geometry.anchor);
							const what = `${params.itemSize}px, ring ${level} item ${index}, box ${box.width}x${box.height}`;
							if (placed.left < area.left - 1e-6 || placed.left + box.width > area.right + 1e-6) problems.push(`${what}: off the side of the screen`);
							if (placed.top < area.top - 1e-6 || placed.top + box.height > area.bottom + 1e-6) problems.push(`${what}: above the pill or below the anchor`);
							const near = distanceFrom(thumb, placed, box);
							// A screen too small to hold the box beside the thumb, even a 320px phone with its keyboard up, may let the box's edge touch the circle's rim, but never the thumb's own centre.
							if (near < half - 2) problems.push(`${what}: on the thumb (${near.toFixed(0)}px from it, the circle is ${half.toFixed(0)}px)`);
						}
					}
				}
			}
			expect(problems.slice(0, 6)).toEqual([]);
		});

		it.each(cases)("%s: the bubble is always beside the thumb, as the DOM layer chooses its form: within 50px of the armed circle's rim at every item of every ring, the rings of a 22 item File group and of the default keymap included", (_name, geometry) => {
			const problems: string[] = [];
			for (const params of [DEFAULT_RING_PARAMS, ringParamsFor(56, { peak: 1.5 }), ringParamsFor(40, { peak: 1 })]) {
				for (const counts of [[4, 5, 9], [8, 22], [6, 18, 12], [6, 24]]) {
					for (let level = 0; level < counts.length; level++) {
						for (let index = 0; index < counts[level]; index++) {
							const around = scene(geometry, params, counts, level, index);
							if (!around) continue;
							const { thumb, half, circles, area } = around;
							const { placed, box } = chooseBubble(thumb, half, area, circles, geometry.anchor);
							const gap = distanceFrom(thumb, placed, box) - half;
							const what = `${params.itemSize}px, counts ${counts.join("/")}, ring ${level} item ${index}`;
							if (gap > BESIDE_GAP) problems.push(`${what}: the bubble is ${gap.toFixed(0)}px from the armed circle`);
						}
					}
				}
			}
			expect(problems.slice(0, 6)).toEqual([]);
		});
	});
});
