import {
	ANCHOR_RADIUS,
	BEAD_FLOOR,
	chooseMode,
	DEFAULT_DIAL_ITEM_SIZE,
	DEFAULT_LENS_PEAK,
	DEFAULT_RING_PARAMS,
	DIAL_SWEEP_DEG,
	edgeRoom,
	fanReach,
	firstRadius,
	fittingFrom,
	fixedFirstRadius,
	hitTest,
	ITEM_GAP,
	LEAST_DIAL_ITEM_SIZE,
	lensFocus,
	lensLayout,
	type LensLayout,
	MAX_DIAL_ITEM_SIZE,
	MAX_LENS_PEAK,
	MIN_DIAL_ITEM_SIZE,
	MIN_LENS_PEAK,
	naturalReach,
	peakSize,
	planRings,
	RING_GAP,
	ringArcs,
	ringCapacity,
	ringParamsFor,
	ringPitch,
	ringSlots,
	ringStep,
	ringUnder,
	slotAngle,
	slotPosition,
	TAP_FOCUS_BELOW,
	type DialGeometry,
	type DialLayoutMode,
	type DialRing,
	type DialRingParams,
	type DialSlot,
} from "../src/dial/layout";
import type { DialCorner } from "../src/types";

const EDGE = 12;
/** Obsidian's mobile view header, which the breadcrumb pill normally sits below. */
const HEADER = 44;
/** The breadcrumb pill: 8px below whatever is above it, 59px tall with its two lines of text (as Obsidian 1.15 lays it out). */
const PILL_HEIGHT = 67;
/** Obsidian's editing toolbar slot above the keyboard, as the DOM layer measures it. */
const TOOLBAR = 52;
/** Items keep this far from the screen's edges, the pill, and the chrome below the anchor (the DOM layer's EDGE_MARGIN). */
const MARGIN = 4;

const FIT = ringParamsFor(DEFAULT_DIAL_ITEM_SIZE, { rule: "fit" });
const FIXED = DEFAULT_RING_PARAMS;

/**
 * The geometry the DOM layer would measure on a phone of `width` x `height` with a status bar
 * or notch inset of `topInset` px, the anchor pinned `EDGE` px off the two edges of `corner`,
 * `bottomChrome` px of keyboard and toolbar under it, and the breadcrumb pill in its normal
 * place below the view header. Items may reach below the anchor's own bottom edge, but only
 * as far as `MARGIN` above whatever the anchor keeps `EDGE` clear of.
 */
function phone(width: number, height: number, corner: DialCorner = "bottom-right", bottomChrome = 0, topInset = 0): DialGeometry {
	const anchorY = height - bottomChrome - EDGE - ANCHOR_RADIUS;
	const anchorX = corner === "bottom-right" ? width - EDGE - ANCHOR_RADIUS : EDGE + ANCHOR_RADIUS;
	return {
		corner,
		anchor: { x: anchorX, y: anchorY },
		bounds: { left: MARGIN, top: topInset + HEADER + PILL_HEIGHT + MARGIN, right: width - MARGIN, bottom: anchorY + ANCHOR_RADIUS + (EDGE - MARGIN) },
	};
}

/** The same phone with the pill raised over the view header. */
function raised(geometry: DialGeometry): DialGeometry {
	return { ...geometry, bounds: { ...geometry.bounds, top: geometry.bounds.top - HEADER } };
}

function measureFor(geometry: DialGeometry): (mode: DialLayoutMode) => DialGeometry {
	return (mode) => (mode === "normal" ? geometry : raised(geometry));
}

/** Rings and slots for `counts`, with the lens of each ring at `focus[ring]` (or at rest). */
function placed(geometry: DialGeometry, params: DialRingParams, counts: number[], focus: (number | null)[] = []) {
	const rings = planRings(geometry, params, counts);
	const peak = peakSize(geometry, params);
	const room = edgeRoom(geometry);
	const slots: DialSlot[] = [];
	rings.forEach((ring, index) => {
		slots.push(...ringSlots(index, ring, counts[index], params, peak, focus[index] ?? null, room));
	});
	return { rings, slots, points: slots.map((slot) => slotPosition(slot, geometry, rings)) };
}

function expectInsideBounds(geometry: DialGeometry, params: DialRingParams, counts: number[], focus: (number | null)[] = []): void {
	const { slots, points } = placed(geometry, params, counts, focus);
	points.forEach((p, i) => {
		const half = slots[i].size / 2;
		expect(p.x - half).toBeGreaterThanOrEqual(geometry.bounds.left - 1e-6);
		expect(p.x + half).toBeLessThanOrEqual(geometry.bounds.right + 1e-6);
		expect(p.y - half).toBeGreaterThanOrEqual(geometry.bounds.top - 1e-6);
		expect(p.y + half).toBeLessThanOrEqual(geometry.bounds.bottom + 1e-6);
	});
}

/** No two circles on the same ring closer than their radii plus `gap`, nor on different rings closer than their radii plus `ringGap`. */
function expectApart(geometry: DialGeometry, params: DialRingParams, counts: number[], focus: (number | null)[], gap: number, ringGap = gap): void {
	const { slots, points } = placed(geometry, params, counts, focus);
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
			expect(distance).toBeGreaterThanOrEqual((slots[i].size + slots[j].size) / 2 + (slots[i].ring === slots[j].ring ? gap : ringGap) - 1e-6);
		}
	}
}

/** The circle whose share of the arc (half way to each neighbour) `theta` falls in. */
function onShare(layout: LensLayout, theta: number): number {
	const count = layout.angles.length;
	for (let i = 0; i < count; i++) {
		const high = i < count - 1 ? (layout.angles[i] + layout.angles[i + 1]) / 2 : Number.POSITIVE_INFINITY;
		if (theta <= high + 1e-6) return i;
	}
	return count - 1;
}

/** The first pair of circles in `layout` (on a ring of `radius`) closer than their radii plus `gap`, described, or null. */
function overlapIn(layout: LensLayout, radius: number, gap: number): string | null {
	const count = layout.angles.length;
	const describe = (i: number): string => `${i} (${layout.sizes[i].toFixed(1)}px at ${layout.angles[i].toFixed(1)}°${layout.offsets[i] ? ` ${layout.offsets[i].toFixed(1)}` : ""}, w ${layout.weights[i].toFixed(2)})`;
	for (let i = 0; i < count; i++) {
		for (let j = i + 1; j < count; j++) {
			const a = { r: radius + layout.offsets[i], t: (layout.angles[i] * Math.PI) / 180 };
			const b = { r: radius + layout.offsets[j], t: (layout.angles[j] * Math.PI) / 180 };
			const distance = Math.hypot(a.r * Math.cos(a.t) - b.r * Math.cos(b.t), a.r * Math.sin(a.t) - b.r * Math.sin(b.t));
			const needed = (layout.sizes[i] + layout.sizes[j]) / 2 + gap;
			if (distance < needed - 1e-6) return `${describe(i)} and ${describe(j)} are ${distance.toFixed(2)} apart, need ${needed.toFixed(2)}`;
		}
	}
	return null;
}

const PHONE = phone(390, 844, "bottom-right", 0, 47);
const SWEEP = Array.from({ length: 101 }, (_, i) => i / 100);

describe("ringCapacity", () => {
	it("holds one item on a ring too small for two", () => {
		expect(ringCapacity(20, 44, 6)).toBe(1);
	});

	it("grows with the radius", () => {
		expect(ringCapacity(97, 44, 6)).toBe(4);
		expect(ringCapacity(151, 44, 6)).toBe(5);
		expect(ringCapacity(205, 44, 6)).toBe(7);
		expect(ringCapacity(256, 44, 6)).toBe(9);
	});

	it("never places two items closer than size plus gap", () => {
		for (let radius = 60; radius <= 400; radius += 7) {
			const capacity = ringCapacity(radius, 44, 6);
			const pitch = capacity > 1 ? DIAL_SWEEP_DEG / (capacity - 1) : 0;
			const chord = 2 * radius * Math.sin(((pitch / 2) * Math.PI) / 180);
			if (capacity > 1) expect(chord).toBeGreaterThanOrEqual(50 - 1e-6);
			expect(ringCapacity(radius, 44, 6)).toBeGreaterThanOrEqual(1);
		}
	});
});

describe("the sizes and rules on offer", () => {
	it("default to Obsidian's touch size, fixed rings and a lens peak of 1.5, with the same gaps at every size", () => {
		expect(DEFAULT_DIAL_ITEM_SIZE).toBe(44);
		expect(MIN_DIAL_ITEM_SIZE).toBe(40);
		expect(MAX_DIAL_ITEM_SIZE).toBe(56);
		expect(DEFAULT_LENS_PEAK).toBe(1.5);
		expect(MIN_LENS_PEAK).toBe(1);
		expect(MAX_LENS_PEAK).toBe(1.5);
		expect(DEFAULT_RING_PARAMS).toEqual({ itemSize: 44, gap: ITEM_GAP, ringGap: RING_GAP, peak: 1.5, rule: "fixed" });
		expect(ringParamsFor(52, { peak: 1.25, rule: "fit" })).toEqual({ itemSize: 52, gap: ITEM_GAP, ringGap: RING_GAP, peak: 1.25, rule: "fit" });
	});

	it("start the fit rule's first ring one ring gap and half an item outside the anchor's rim", () => {
		expect(firstRadius(FIT)).toBe(ANCHOR_RADIUS + RING_GAP + 22);
	});

	it("step the rings one item plus one ring gap apart, or a lens peak plus a lens gap when that is more, so two grown circles on neighbouring rings never meet: 70 at 44px and 1.5", () => {
		expect(ringStep(FIT)).toBe(70);
		expect(ringStep(FIXED)).toBe(70);
		expect(ringStep(ringParamsFor(44, { peak: 1 }))).toBe(54);
		expect(ringStep(ringParamsFor(44, { peak: 1.1 }))).toBe(54);
		expect(ringStep(ringParamsFor(44, { peak: 1.25 }))).toBeCloseTo(59);
		expect(ringStep(ringParamsFor(40))).toBe(64);
		expect(ringStep(ringParamsFor(56))).toBe(88);
		for (const peak of [1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5]) {
			const params = ringParamsFor(44, { peak });
			expect(ringStep(params) - 44 * peak).toBeGreaterThanOrEqual(Math.min(RING_GAP, 4) - 1e-9);
		}
	});

	it("put the fixed rule's first ring where a four-item root fits: 97px at 44px, then 167 and 237", () => {
		expect(fixedFirstRadius(FIXED)).toBe(97);
		expect(fixedFirstRadius(ringParamsFor(40))).toBe(89);
		expect(fixedFirstRadius(ringParamsFor(56))).toBe(120);
		expect(ringCapacity(120, 56, 6)).toBe(4);
		expect(ringCapacity(119, 56, 6)).toBe(3);
		expect(planRings(PHONE, FIXED, [4, 5, 9]).map((ring) => ring.radius)).toEqual([97, 167, 237]);
	});
});

describe("the lens peak against the screen", () => {
	it("grows the circle under the finger to the peak, 66px at 44 and 1.5", () => {
		expect(peakSize(PHONE, FIXED)).toBe(66);
		expect(peakSize(PHONE, ringParamsFor(44, { peak: 1 }))).toBe(44);
	});

	it("caps the peak so a circle at either end of the sweep stays inside the bounds: 36px of room beside the anchor allows 72px", () => {
		expect(edgeRoom(PHONE)).toBe(36);
		expect(peakSize(PHONE, ringParamsFor(56))).toBe(72);
		expect(peakSize(PHONE, ringParamsFor(48))).toBe(72);
		expect(peakSize(PHONE, ringParamsFor(44))).toBe(66);
	});

	it("keeps the outermost ring's grown circle inside the bounds: the reach gives up half the peak, not half an item", () => {
		expect(fanReach(PHONE, FIXED)).toBe(Math.floor(346 - 33));
		expect(fanReach(PHONE, ringParamsFor(44, { peak: 1 }))).toBe(Math.floor(346 - 22));
	});
});

describe("planRings", () => {
	it("under the fixed rule puts every ring at its fixed radius whatever its level holds", () => {
		expect(planRings(PHONE, FIXED, [1, 1, 1]).map((ring) => ring.radius)).toEqual([97, 167, 237]);
		expect(planRings(PHONE, FIXED, [12, 25, 2]).map((ring) => ring.radius)).toEqual([97, 167, 237]);
		expect(planRings(PHONE, FIXED, [4]).map((ring) => ring.capacity)).toEqual([4]);
	});

	it("under the fit rule gives each level the smallest ring that holds it, at least a step outside the ring inside", () => {
		const rings = planRings(PHONE, FIT, [4, 5, 9]);
		expect(rings.map((ring) => ring.radius)).toEqual([97, 167, 256]);
		expect(rings.map((ring) => ring.capacity)).toEqual([4, 6, 9]);
	});

	it("keeps a ring's radius whatever opens outside it, so nothing moves when a deeper level opens", () => {
		for (const params of [FIXED, FIT]) {
			const alone = planRings(PHONE, params, [4]);
			const withChild = planRings(PHONE, params, [4, 5]);
			const withGrandchild = planRings(PHONE, params, [4, 5, 9]);
			expect(withChild[0]).toEqual(alone[0]);
			expect(withGrandchild.slice(0, 2)).toEqual(withChild);
		}
	});

	it("under the fit rule caps the ring at the reach of the bounds, where a level that needs more is crowded", () => {
		const rings = planRings(PHONE, FIT, [12]);
		expect(rings[0].radius).toBe(fanReach(PHONE, FIT));
		expect(rings[0].capacity).toBeLessThan(12);
	});

	it("stops at the first level whose ring would not fit at all", () => {
		expect(planRings(PHONE, FIXED, [4, 5, 9, 9, 9, 9, 9])).toHaveLength(4);
		expect(planRings(PHONE, FIT, [4, 5, 9, 9, 9, 9, 9]).length).toBeLessThan(7);
	});

	it("is limited by whichever of width and height is tighter", () => {
		const wide = planRings(phone(1000, 844, "bottom-right", 0, 47), FIXED, [4, 5, 9, 9, 9, 9, 9, 9]);
		const tall = planRings(phone(390, 2000, "bottom-right", 0, 47), FIXED, [4, 5, 9, 9, 9, 9, 9, 9]);
		expect(wide.length).toBeGreaterThan(4);
		expect(tall).toHaveLength(4);
	});

	it("gives a screen that cannot hold even one ring none", () => {
		const tiny: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 100 }, bounds: { left: 4, top: 60, right: 386, bottom: 136 } };
		expect(planRings(tiny, FIXED, [4])).toEqual([]);
		expect(planRings(tiny, FIT, [4])).toEqual([]);
	});
});

describe("fittingFrom", () => {
	it("draws the whole path when it fits", () => {
		expect(fittingFrom(PHONE, FIXED, [4, 5, 9])).toBe(0);
	});

	it("gives up the innermost levels first when the screen is too short for the path", () => {
		const short = phone(390, 700, "bottom-right", TOOLBAR + 250, 24);
		expect(planRings(short, FIXED, [4, 5, 9])).toHaveLength(2);
		expect(fittingFrom(short, FIXED, [4, 5, 9])).toBe(1);
		expect(planRings(short, FIXED, [5, 9])).toHaveLength(2);
	});

	it("is the path's length when not even its deepest level fits", () => {
		const tiny: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 100 }, bounds: { left: 4, top: 60, right: 386, bottom: 136 } };
		expect(fittingFrom(tiny, FIXED, [4, 5])).toBe(2);
	});
});

describe("lensLayout at rest", () => {
	it("keeps a level that fits at full size on the slot angles of a full ring, centred", () => {
		const layout = lensLayout(4, 4, 97, FIXED, 66, null);
		expect(layout.crowded).toBe(false);
		expect(layout.sizes).toEqual([44, 44, 44, 44]);
		expect(layout.angles).toEqual([0, 30, 60, 90]);
		expect(layout.offsets).toEqual([0, 0, 0, 0]);
		expect(lensLayout(2, 5, 151, FIXED, 66, null).angles).toEqual([33.75, 56.25]);
	});

	it("spreads a crowded level evenly over the whole sweep with circles shrunk to fit: 12 on the second fixed ring are 20px beads, 9 on the third 38px, 8 on the third keep 44", () => {
		const window = lensLayout(12, ringCapacity(151, 44, 6), 151, FIXED, 66, null);
		expect(window.crowded).toBe(true);
		expect(window.angles[0]).toBe(0);
		expect(window.angles[11]).toBeCloseTo(90);
		expect(Math.round(window.base)).toBe(20);
		expect(Math.round(lensLayout(9, ringCapacity(205, 44, 6), 205, FIXED, 66, null).base)).toBe(38);
		expect(lensLayout(8, ringCapacity(205, 44, 6), 205, FIXED, 66, null).base).toBeCloseTo(44, 0);
	});

	it("never shrinks a circle below the floor, and zigzags beads that would still overlap, within their ring's band", () => {
		const layout = lensLayout(40, 4, 97, FIXED, 66, null);
		expect(layout.base).toBe(BEAD_FLOOR);
		expect(layout.offsets.some((offset) => offset > 0)).toBe(true);
		expect(layout.offsets.some((offset) => offset < 0)).toBe(true);
		for (let i = 1; i < 40; i++) expect(Math.sign(layout.offsets[i])).not.toBe(Math.sign(layout.offsets[i - 1]));
		for (const offset of layout.offsets) expect(Math.abs(offset) + BEAD_FLOOR / 2).toBeLessThanOrEqual(ringStep(FIXED) / 2);
	});

	it("marks a bead for the tap rule only on a crowded ring, outside the lens, below the tap size", () => {
		const geometry: DialRing = { radius: 151, capacity: ringCapacity(151, 44, 6) };
		const slots = ringSlots(1, geometry, 12, FIXED, 66, null);
		expect(slots.every((slot) => slot.bead)).toBe(true);
		expect(slots.every((slot) => slot.size < TAP_FOCUS_BELOW)).toBe(true);
		expect(ringSlots(0, { radius: 97, capacity: 4 }, 4, FIXED, 66, null).every((slot) => !slot.bead)).toBe(true);
		expect(ringSlots(2, { radius: 205, capacity: 7 }, 9, FIXED, 66, null).every((slot) => !slot.bead)).toBe(true);
	});
});

describe("lensLayout under the finger", () => {
	it("grows the circle under the finger to the peak and its neighbours part way, on a ring that fits as much as on a crowded one", () => {
		const text = lensLayout(5, 5, 151, FIXED, 66, 0.25);
		[1 / 3, 1, 1 / 3, 0, 0].forEach((weight, i) => expect(text.weights[i]).toBeCloseTo(weight));
		expect(text.sizes[1]).toBeCloseTo(66);
		expect(text.sizes[0]).toBeCloseTo(44 + 22 / 3);
		expect(text.sizes[3]).toBe(44);
		const window = lensLayout(12, 5, 151, FIXED, 66, 5 / 11);
		expect(window.weights[5]).toBe(1);
		expect(window.sizes[5]).toBeGreaterThanOrEqual(TAP_FOCUS_BELOW);
		expect(window.sizes[5]).toBeGreaterThan(55);
		expect(window.sizes[0]).toBeCloseTo(window.base);
	});

	it("keeps the item under the finger where it rests on a ring with room, opening only the gaps beside the grown circles", () => {
		const layout = lensLayout(3, 5, 151, FIXED, 66, 0.5);
		expect(layout.angles[1]).toBeCloseTo(45, 5);
		expect(layout.sizes[1]).toBeCloseTo(66);
		expect(layout.angles[1] - layout.angles[0]).toBeGreaterThan(22.5);
		expect(layout.angles[2] - layout.angles[1]).toBeCloseTo(layout.angles[1] - layout.angles[0], 5);
		const end = lensLayout(3, 5, 151, FIXED, 66, 0.25);
		expect(end.angles[0]).toBeCloseTo(22.5, 5);
		expect(end.angles[2] - end.angles[1]).toBeCloseTo(22.5, 5);
		expect(end.angles[2]).toBeLessThanOrEqual(90 + 1e-6);
	});

	it("on a full innermost ring closes the other gap, runs the arc past the sweep's ends, and only then grows the lens less, never overlapping", () => {
		const layout = lensLayout(4, 4, 97, FIXED, 66, 1 / 3);
		expect(layout.growth).toBeGreaterThan(0.6);
		expect(layout.growth).toBeLessThan(1);
		expect(layout.sizes[1]).toBeCloseTo(44 + 22 * layout.growth);
		expect(layout.sizes[0]).toBeCloseTo(44 + (22 * layout.growth) / 3);
		expect(layout.angles[1]).toBeCloseTo(30, 0);
		expect(layout.angles[0]).toBeCloseTo(-4, 3);
		expect(layout.angles[3]).toBeCloseTo(94, 3);
		expect(overlapIn(layout, 97, 2 - 1e-6)).toBeNull();
		// At the end of the sweep the whole lens fits: the gaps after it close up and the arc runs a little past the far end.
		const end = lensLayout(4, 4, 97, FIXED, 66, 0);
		expect(end.growth).toBe(1);
		expect(end.sizes[0]).toBe(66);
		expect(end.angles[0]).toBeGreaterThanOrEqual(-2);
		expect(end.angles[0]).toBeLessThanOrEqual(0);
		expect(end.angles[3]).toBeLessThanOrEqual(94 + 1e-6);
		expect(overlapIn(end, 97, 2 - 1e-6)).toBeNull();
		// With a finger-sized room beside the anchor the end circles may not run past the ends as far, so the lens grows a little less.
		const tight = lensLayout(4, 4, 97, FIXED, 60, 1 / 3, 30);
		expect(tight.growth).toBeGreaterThan(0.6);
		expect(tight.angles[0]).toBeGreaterThanOrEqual(-4 - 1e-6);
		expect(overlapIn(tight, 97, 2 - 1e-6)).toBeNull();
	});

	it("anchors the circle under the finger under it on a crowded ring: the finger stays on one of the two circles it grew most, the beads it has passed pile two deep, and the arc stays on the sweep", () => {
		for (const focus of SWEEP) {
			const layout = lensLayout(12, 6, 167, FIXED, 66, focus, 36);
			const theta = focus * 90;
			const position = theta / ringPitch(12, 6);
			const nearest = layout.weights.indexOf(Math.max(...layout.weights));
			const hit = onShare(layout, theta);
			// The finger is on one of the two circles of the gap it is in (the two the lens grew most); mid-ring, where the beads on either side have room to pile, on the one it grew most.
			expect(Math.abs(hit - position)).toBeLessThanOrEqual(1 + 1e-9);
			if (focus >= 0.3 && focus <= 0.7) expect(hit).toBe(nearest);
			if (focus >= 0.45 && focus <= 0.55) {
				expect(layout.angles[0]).toBeCloseTo(0, 5);
				expect(layout.angles[11]).toBeCloseTo(90, 5);
			}
			expect(layout.angles[0]).toBeGreaterThanOrEqual(-4 - 1e-6);
			expect(layout.angles[11]).toBeLessThanOrEqual(94 + 1e-6);
			// The lens grows the whole way: the beads the finger has passed give way instead, two deep.
			expect(layout.growth).toBe(1);
			layout.sizes.forEach((size, i) => expect(size).toBeCloseTo(layout.base + (66 - layout.base) * layout.weights[i]));
			expect(Math.max(...layout.sizes)).toBeGreaterThan(48);
			expect(overlapIn(layout, 167, 2 - 1e-6)).toBeNull();
		}
	});

	it("never lets two circles on a ring overlap, at rest or with the finger anywhere, for any level its ring holds two deep, at any size and peak, and keeps the finger on the circle it grew", () => {
		const violations: string[] = [];
		const grid = Array.from({ length: 41 }, (_, i) => i / 40);
		for (const itemSize of [40, 44, 56]) {
			for (const peakFactor of [1, 1.25, 1.5]) {
				const params = ringParamsFor(itemSize, { peak: peakFactor });
				const peak = peakSize(PHONE, params);
				for (const { radius, capacity } of planRings(PHONE, params, [4, 5, 9])) {
					// Up to what the ring holds two deep at the floor size, the inner row (stepped in as far as the band allows) being the tighter; more beads than that overlap by necessity.
					const inner = radius - Math.max(0, Math.min(ringStep(params) / 2, peak / 2) - BEAD_FLOOR / 2);
					const twoDeepPitch = (Math.asin((BEAD_FLOOR + 2) / (2 * inner)) * 180) / Math.PI;
					const most = Math.min(25, 1 + Math.floor(90 / twoDeepPitch + 1e-9));
					for (let count = 1; count <= most; count++) {
						for (const focus of [null, ...grid]) {
							const layout = lensLayout(count, capacity, radius, params, peak, focus, 36);
							const bad = overlapIn(layout, radius, 2 - 0.01);
							if (bad) violations.push(`${count} at ${itemSize}px, peak ${peakFactor}, on r${radius} at focus ${focus}: ${bad}`);
							if (focus !== null && count > 1 && violations.length < 5) {
								// Within the arc the finger is on one of the two circles of the gap it is in, the two the lens grew most: a shift toward an end never puts a third circle under it.
								const theta = focus * 90;
								const rest0 = layout.crowded ? 0 : slotAngle(0, count, capacity);
								const position = (theta - rest0) / ringPitch(count, capacity);
								if (position >= 0 && position <= count - 1) {
									const hit = onShare(layout, theta);
									if (Math.abs(hit - position) > 1 + 1e-9) violations.push(`${count} at ${itemSize}px, peak ${peakFactor}, on r${radius} at focus ${focus}: the finger at ${theta.toFixed(1)}° (position ${position.toFixed(2)}) is on circle ${hit} (w ${layout.weights[hit].toFixed(2)}), not one of the two it grew`);
								}
							}
						}
					}
				}
			}
		}
		expect(violations.slice(0, 5)).toEqual([]);
	});

	it("never lets a circle on one ring reach a circle on the next, whatever the lenses of the two rings do: the step keeps the lens gap between two grown circles", () => {
		for (const params of [FIXED, ringParamsFor(56), ringParamsFor(40, { peak: 1.25 }), ringParamsFor(44, { peak: 1 })]) {
			for (const counts of [
				[4, 5, 9],
				[4, 12, 9],
				[12, 25, 25],
			]) {
				for (const inner of [null, 0, 0.3, 0.5, 0.7, 1]) {
					for (const outer of [null, 0, 0.3, 0.5, 0.7, 1]) {
						expectApart(PHONE, params, counts, [inner, outer, inner], 2 - 1e-6, 4 - 1e-6);
					}
				}
			}
		}
	});

	it("at a peak of 1 grows nothing on a ring that fits and only brings beads back to full size", () => {
		const text = lensLayout(5, 5, 151, ringParamsFor(44, { peak: 1 }), 44, 0.25);
		expect(text.sizes).toEqual([44, 44, 44, 44, 44]);
		expect(text.angles).toEqual([0, 22.5, 45, 67.5, 90]);
		const window = lensLayout(12, 5, 151, ringParamsFor(44, { peak: 1 }), 44, 5 / 11);
		expect(window.sizes[5]).toBe(44);
	});

	it("keeps every circle inside the bounds at the largest size and peak, whatever the finger does, both corners", () => {
		for (const corner of ["bottom-right", "bottom-left"] as const) {
			const geometry = phone(390, 844, corner, TOOLBAR + 300, 59);
			const params = ringParamsFor(56, { peak: 1.5 });
			const counts = [4, 12, 9];
			expectInsideBounds(geometry, params, counts);
			for (const focus of SWEEP) {
				expectInsideBounds(geometry, params, counts, [focus, focus, focus]);
			}
		}
	});
});

describe("item placement on real phone sizes", () => {
	const cases: [string, DialGeometry][] = [
		["iPhone 14 (390x844), keyboard down", phone(390, 844, "bottom-right", 0, 47)],
		["iPhone 14, keyboard up", phone(390, 844, "bottom-right", TOOLBAR + 300, 47)],
		["iPhone SE (375x667), keyboard up", phone(375, 667, "bottom-right", TOOLBAR + 260, 20)],
		["small Android (360x640), keyboard up", phone(360, 640, "bottom-right", TOOLBAR + 250, 24)],
		["320x568, keyboard up", phone(320, 568, "bottom-right", TOOLBAR + 216, 20)],
		["tablet (820x1180)", phone(820, 1180, "bottom-right", 0, 24)],
		["left corner, keyboard up", phone(390, 844, "bottom-left", TOOLBAR + 300, 47)],
	];

	it.each(cases)("%s: every item stays on screen and apart under both rules, for levels of 1 to 25 items", (_name, geometry) => {
		for (const params of [FIXED, FIT]) {
			for (const count of [1, 2, 4, 7, 12, 25]) {
				const counts = [4, count, 9];
				expectInsideBounds(geometry, params, counts);
				expectInsideBounds(geometry, params, counts, [0.5, 0.5, 0.5]);
				expectApart(geometry, params, counts, [], 2 - 0.01);
			}
		}
	});

	it("walks the default keymap's deepest path (root, Text, Heading) on three fixed rings on a 390px phone, keyboard up or down", () => {
		for (const geometry of [phone(390, 844, "bottom-right", 0, 47), phone(390, 844, "bottom-right", TOOLBAR + 300, 47)]) {
			expect(planRings(geometry, FIXED, [4, 5, 9]).map((ring) => ring.radius)).toEqual([97, 167, 237]);
			expect(fittingFrom(geometry, FIXED, [4, 5, 9])).toBe(0);
		}
	});

	it("holds a 12-item level whole on its ring as beads instead of paging it", () => {
		const { slots } = placed(phone(390, 844, "bottom-right", TOOLBAR + 300, 47), FIXED, [4, 12]);
		expect(slots.filter((slot) => slot.ring === 1)).toHaveLength(12);
		expect(slots.filter((slot) => slot.ring === 1).every((slot) => slot.size < 44)).toBe(true);
	});

	it("on an iPhone SE with the keyboard up, raises the pill; the Heading ring waits for the release, then opens in the root's place", () => {
		const geometry = phone(375, 667, "bottom-right", TOOLBAR + 260, 20);
		const need = naturalReach(FIXED, [4, 5, 9]);
		const chosen = chooseMode(need, measureFor(geometry), FIXED);
		expect(chosen.mode).toBe("raised");
		expect(planRings(chosen.geometry, FIXED, [4, 5, 9])).toHaveLength(2);
		expect(fittingFrom(chosen.geometry, FIXED, [4, 5, 9])).toBe(1);
	});

	it("mirrors the rings for the bottom-left corner", () => {
		const right = placed(phone(390, 844, "bottom-right", 0, 47), FIXED, [4, 5]);
		const left = placed(phone(390, 844, "bottom-left", 0, 47), FIXED, [4, 5]);
		right.points.forEach((p, i) => {
			expect(left.points[i].x).toBeCloseTo(390 - p.x);
			expect(left.points[i].y).toBeCloseTo(p.y);
		});
	});
});

describe("chooseMode", () => {
	it("keeps the pill in its place when the widest path fits under it", () => {
		expect(chooseMode(naturalReach(FIXED, [4, 5, 9]), measureFor(PHONE), FIXED).mode).toBe("normal");
	});

	it("raises the pill when the widest path needs the header's strip, even before that path opens", () => {
		const geometry = phone(375, 667, "bottom-right", TOOLBAR + 260, 20);
		const need = naturalReach(FIXED, [4, 5, 9]);
		expect(need).toBeGreaterThan(fanReach(geometry, FIXED));
		expect(chooseMode(need, measureFor(geometry), FIXED).mode).toBe("raised");
	});

	it("keeps the pill in place when raising it would not reach farther, because the width is the limit", () => {
		const geometry = phone(320, 2000, "bottom-right", 0, 20);
		const measured: DialLayoutMode[] = [];
		const measure = (mode: DialLayoutMode): DialGeometry => {
			measured.push(mode);
			return measureFor(geometry)(mode);
		};
		const chosen = chooseMode(1000, measure, FIXED);
		expect(chosen.mode).toBe("normal");
		expect(measured).toEqual(["normal", "raised", "normal"]);
	});

	it("shrinks the dial, never reaching behind the pill, when not even the root ring fits under the raised pill: the largest circles whose first ring fits between the pill and the anchor", () => {
		const geometry = phone(390, 300, "bottom-right", TOOLBAR, 20);
		const chosen = chooseMode(1000, measureFor(geometry), FIXED);
		expect(chosen.mode).toBe("raised");
		expect(chosen.geometry).toEqual(raised(geometry));
		const { itemSize } = chosen.params;
		expect(itemSize).toBeLessThan(44);
		expect(itemSize).toBeGreaterThanOrEqual(LEAST_DIAL_ITEM_SIZE);
		expect(chosen.params).toEqual({ ...FIXED, itemSize });
		expect(fixedFirstRadius(chosen.params)).toBeLessThanOrEqual(fanReach(chosen.geometry, chosen.params));
		const larger = { ...chosen.params, itemSize: itemSize + 1 };
		expect(fixedFirstRadius(larger)).toBeGreaterThan(fanReach(chosen.geometry, larger));
		expect(planRings(chosen.geometry, chosen.params, [4, 6, 9])).toHaveLength(1);
		for (const focus of [null, 0, 0.5, 1]) {
			expectInsideBounds(chosen.geometry, chosen.params, [9], [focus]);
			expectApart(chosen.geometry, chosen.params, [9], [focus], 2 - 1e-6);
		}
		// Under the fit rule the first ring sits closer in and still fits here, so nothing shrinks.
		expect(chooseMode(1000, measureFor(geometry), FIT)).toMatchObject({ mode: "raised", params: FIT });
	});

	it("gives a screen too short even for the smallest dial no ring at all, rather than one behind the pill", () => {
		const geometry = phone(390, 200, "bottom-right", TOOLBAR, 20);
		const chosen = chooseMode(1000, measureFor(geometry), FIXED);
		expect(chosen.params.itemSize).toBe(LEAST_DIAL_ITEM_SIZE);
		expect(planRings(chosen.geometry, chosen.params, [4])).toEqual([]);
	});

	it("measures the chosen mode last, so the mode in effect is the one measured", () => {
		const measured: DialLayoutMode[] = [];
		const measure = (mode: DialLayoutMode): DialGeometry => {
			measured.push(mode);
			return measureFor(PHONE)(mode);
		};
		chooseMode(10, measure, FIXED);
		expect(measured).toEqual(["normal"]);
	});
});

describe("naturalReach", () => {
	it("under the fixed rule is the last ring's fixed radius, however many items the levels hold", () => {
		expect(naturalReach(FIXED, [4, 5, 9])).toBe(237);
		expect(naturalReach(FIXED, [25, 25, 25])).toBe(237);
		expect(naturalReach(FIXED, [4])).toBe(97);
		expect(naturalReach(FIXED, [])).toBe(0);
	});

	it("under the fit rule is where the outermost ring of a chain lands with no screen in the way", () => {
		expect(naturalReach(FIT, [4, 5, 9])).toBe(256);
		expect(naturalReach(FIT, [4])).toBe(97);
		expect(naturalReach(FIT, [1])).toBe(firstRadius(FIT));
	});
});

describe("ringArcs", () => {
	const rings = planRings(PHONE, FIXED, [4, 5]);
	const { slots } = placed(PHONE, FIXED, [4, 5]);

	it("draws one arc per ring with two or more slots, from its first slot to its last, clockwise for the right corner", () => {
		const arcs = ringArcs(PHONE, rings, slots);
		expect(arcs).toHaveLength(2);
		expect(arcs[0].radius).toBe(97);
		expect(arcs[0].clockwise).toBe(true);
		expect(arcs[0].from).toEqual(slotPosition(slots[0], PHONE, rings));
		expect(arcs[0].to).toEqual(slotPosition(slots[3], PHONE, rings));
	});

	it("runs counter-clockwise, mirrored, for the left corner and skips rings with one slot or none", () => {
		const left = phone(390, 844, "bottom-left", 0, 47);
		const leftRings = planRings(left, FIXED, [4, 1]);
		const leftSlots = placed(left, FIXED, [4, 1]).slots;
		const arcs = ringArcs(left, leftRings, leftSlots);
		expect(arcs).toHaveLength(1);
		expect(arcs[0].clockwise).toBe(false);
	});

	it("follows the lens: the arc ends move with the end slots", () => {
		const moved = placed(PHONE, FIXED, [4, 12], [null, 0.5]);
		const arcs = ringArcs(PHONE, moved.rings, moved.slots);
		expect(arcs[1].from).toEqual(slotPosition({ ...moved.slots[4], offset: 0 }, PHONE, moved.rings));
	});
});

describe("ringUnder and lensFocus", () => {
	const { rings, slots } = placed(PHONE, FIXED, [4, 5]);
	const at = (radius: number, angleDeg: number) => ({ x: PHONE.anchor.x - radius * Math.cos((angleDeg * Math.PI) / 180), y: PHONE.anchor.y - radius * Math.sin((angleDeg * Math.PI) / 180) });

	it("picks the ring by radial band, none inside the dead zone or beyond the reach", () => {
		expect(ringUnder(at(97, 45), PHONE, rings, slots)).toBe(0);
		expect(ringUnder(at(131, 45), PHONE, rings, slots)).toBe(0);
		expect(ringUnder(at(133, 45), PHONE, rings, slots)).toBe(1);
		expect(ringUnder(at(210, 45), PHONE, rings, slots)).toBe(1);
		expect(ringUnder(at(215, 45), PHONE, rings, slots)).toBeNull();
		expect(ringUnder(at(20, 45), PHONE, rings, slots)).toBeNull();
	});

	it("reads the finger's place along the sweep, held at the ends", () => {
		expect(lensFocus(at(97, 0), PHONE)).toBeCloseTo(0);
		expect(lensFocus(at(97, 45), PHONE)).toBeCloseTo(0.5);
		expect(lensFocus(at(97, 90), PHONE)).toBeCloseTo(1);
		expect(lensFocus(at(97, -20), PHONE)).toBe(0);
		expect(lensFocus(at(97, 110), PHONE)).toBe(1);
		expect(lensFocus(at(97, 45), phone(390, 844, "bottom-left", 0, 47))).toBeCloseTo(0.5, 0);
	});
});

describe("hitTest", () => {
	const { rings, slots, points } = placed(PHONE, FIXED, [4, 5]);
	const at = (radius: number, angleDeg: number) => ({ x: PHONE.anchor.x - radius * Math.cos((angleDeg * Math.PI) / 180), y: PHONE.anchor.y - radius * Math.sin((angleDeg * Math.PI) / 180) });

	it("arms nothing inside the dead zone around the anchor", () => {
		expect(hitTest({ x: PHONE.anchor.x - 20, y: PHONE.anchor.y - 20 }, PHONE, rings, slots)).toBeNull();
	});

	it("arms the item whose centre the pointer is on", () => {
		points.forEach((p, i) => {
			expect(hitTest(p, PHONE, rings, slots)).toBe(i);
		});
	});

	it("picks the ring by radial band and the slot by its share of the arc", () => {
		expect(hitTest(at(151, 10), PHONE, rings, slots)).toBe(4);
		expect(hitTest(at(151, 50), PHONE, rings, slots)).toBe(6);
		expect(hitTest(at(140, 85), PHONE, rings, slots)).toBe(8);
	});

	it("still arms the outer ring when the pointer overshoots it a little, but not by a lot", () => {
		expect(hitTest(at(167 + 40, 45), PHONE, rings, slots)).toBe(6);
		expect(hitTest(at(167 + 50, 45), PHONE, rings, slots)).toBeNull();
	});

	it("arms nothing far from the rings, so a tap elsewhere can cancel", () => {
		expect(hitTest({ x: 50, y: 300 }, PHONE, rings, slots)).toBeNull();
	});

	it("arms nothing when the pointer is far outside the sweep", () => {
		expect(hitTest(at(151, -30), PHONE, rings, slots)).toBeNull();
		expect(hitTest(at(151, 120), PHONE, rings, slots)).toBeNull();
	});

	it("works mirrored for the bottom-left corner", () => {
		const left = phone(390, 844, "bottom-left", 0, 47);
		const mirrored = placed(left, FIXED, [4, 5]);
		mirrored.points.forEach((p, i) => {
			expect(hitTest(p, left, mirrored.rings, mirrored.slots)).toBe(i);
		});
	});

	it("arms nothing when there are no slots", () => {
		expect(hitTest(at(97, 45), PHONE, rings, [])).toBeNull();
	});

	it("gives a slot the arc half way to each neighbour, so a slot grown by the lens owns the room it took", () => {
		const moved = placed(PHONE, FIXED, [4, 12], [null, 0.5]);
		const own = moved.slots.filter((slot) => slot.ring === 1);
		const focus = own.reduce((a, b) => (b.weight > a.weight ? b : a));
		const next = own[focus.index + 1];
		const between = (focus.angleDeg + next.angleDeg) / 2;
		expect(hitTest(at(151, between - 0.5), PHONE, moved.rings, moved.slots)).toBe(4 + focus.index);
		expect(hitTest(at(151, between + 0.5), PHONE, moved.rings, moved.slots)).toBe(4 + next.index);
	});

	it("lets the end slots of a partly used ring own a little of the arc beside them, not all of it", () => {
		const partial = placed(PHONE, FIXED, [4, 2]);
		expect(partial.slots.filter((slot) => slot.ring === 1).map((slot) => slot.angleDeg)).toEqual([36, 54]);
		expect(hitTest(at(167, 22), PHONE, partial.rings, partial.slots)).toBe(4);
		expect(hitTest(at(167, 16), PHONE, partial.rings, partial.slots)).toBeNull();
	});

	it("arms nothing more than half a slot pitch past a lone item, so a tap on blank space inside the fan cancels", () => {
		const lone = placed(PHONE, FIXED, [4, 1]);
		expect(hitTest(at(151, 45), PHONE, lone.rings, lone.slots)).toBe(4);
		expect(hitTest(at(151, 60), PHONE, lone.rings, lone.slots)).toBe(4);
		expect(hitTest(at(151, 80), PHONE, lone.rings, lone.slots)).toBeNull();
	});

	it("arms a bead by its own small circle, or by its share of the arc on the outermost ring", () => {
		const beads = placed(PHONE, FIXED, [4, 12]);
		const bead = beads.slots[4 + 5];
		expect(bead.size).toBeLessThan(TAP_FOCUS_BELOW);
		expect(hitTest(beads.points[4 + 5], PHONE, beads.rings, beads.slots)).toBe(4 + 5);
		expect(hitTest(at(151, bead.angleDeg + 2), PHONE, beads.rings, beads.slots)).toBe(4 + 5);
	});

	it("on an inner ring only the circles arm, so the band between the rings is blank and a thumb heading outward swaps nothing", () => {
		expect(hitTest(at(107, 45), PHONE, rings, slots)).toBeNull();
		expect(hitTest(at(85, 45), PHONE, rings, slots)).toBeNull();
		expect(hitTest(at(97, 30), PHONE, rings, slots)).toBe(1);
		expect(hitTest(at(97 + 22 + 3, 30), PHONE, rings, slots)).toBe(1);
		expect(hitTest(at(97 + 22 + 4.5, 30), PHONE, rings, slots)).toBeNull();
	});

	it("keeps the sticky slot's angular share on an inner ring, and only that slot's", () => {
		expect(hitTest(at(97, 45), PHONE, rings, slots, undefined, undefined, 1)).toBe(1);
		expect(hitTest(at(97, 45), PHONE, rings, slots, undefined, undefined, 2)).toBe(2);
		expect(hitTest(at(112, 15), PHONE, rings, slots, undefined, undefined, 2)).toBeNull();
		expect(hitTest(at(112, 15), PHONE, rings, slots, undefined, undefined, 1)).toBe(1);
		expect(hitTest(at(97, 10), PHONE, rings, slots, undefined, undefined, 2)).toBe(0);
		expect(hitTest(at(112, 15), PHONE, rings, slots, undefined, undefined, 6)).toBeNull();
	});

	it("arms an end item anywhere inside its own circle, even outside the sweep", () => {
		expect(hitTest(at(151, -5), PHONE, rings, slots)).toBe(4);
	});

	it("arms nothing between the anchor rim and the innermost ring's inner edge", () => {
		expect(hitTest(at(60, 45), PHONE, rings, slots)).toBeNull();
	});

	it("measures the armed inner circle at its grown size, so the finger that grew it stays on it, but a grown sibling only at the item size, so a thumb heading out does not catch it", () => {
		const grown = placed(PHONE, FIXED, [4, 5], [1 / 3, null]);
		// The full root ring has room for most of the lens, not all of it (see the lens tests).
		expect(grown.slots[1].size).toBeGreaterThan(56);
		expect(grown.slots[0].size).toBeCloseTo(44 + (grown.slots[1].size - 44) / 3);
		expect(hitTest(at(97 + 30, 30), PHONE, grown.rings, grown.slots, undefined, undefined, 1)).toBe(1);
		expect(hitTest(at(97 + 30, 30), PHONE, grown.rings, grown.slots)).not.toBe(1);
		const sibling = grown.points[0];
		const outward = (distance: number) => ({ x: sibling.x + ((sibling.x - PHONE.anchor.x) / 97) * distance, y: sibling.y + ((sibling.y - PHONE.anchor.y) / 97) * distance });
		expect(hitTest(outward(26.5), PHONE, grown.rings, grown.slots)).toBeNull();
		expect(hitTest(outward(25), PHONE, grown.rings, grown.slots)).toBe(0);
	});
});

describe("slotAngle", () => {
	it("spans the sweep end to end on a full ring and centres a partly used one", () => {
		expect([0, 1, 2, 3].map((i) => slotAngle(i, 4, 4))).toEqual([0, 30, 60, 90]);
		expect([0, 1].map((i) => slotAngle(i, 2, 5))).toEqual([33.75, 56.25]);
		expect(slotAngle(0, 1, 5)).toBe(45);
	});
});
