import {
	ANCHOR_RADIUS,
	BEAD_FLOOR,
	chooseMode,
	pillClearance,
	DEFAULT_DEAD_ZONE,
	DEFAULT_DIAL_ITEM_SIZE,
	DEFAULT_LENS_PEAK,
	DEFAULT_RING_PARAMS,
	DIAL_LEGIBLE_SIZE,
	DIAL_SWEEP_DEG,
	edgeRoom,
	fanReach,
	firstRadius,
	fittingFrom,
	fixedFirstRadius,
	HIT_PRESENCE,
	READABLE_SIZE,
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
		// A circle less than half there is mostly faded out (not hit, and a few pixels at most); only the ones that are there count.
		if (slots[i].presence < HIT_PRESENCE) return;
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
			// A gone circle is not drawn (it is parked at the end of the sweep), so it overlaps nothing; every drawn one, faint or not, is held apart.
			if (slots[i].presence === 0 || slots[j].presence === 0) continue;
			const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
			expect(distance).toBeGreaterThanOrEqual((slots[i].size + slots[j].size) / 2 + (slots[i].ring === slots[j].ring ? gap : ringGap) - 1e-6);
		}
	}
}

/** The circle whose share of the arc (half way to each neighbour) `theta` falls in. */
/** The circle the finger at `theta` degrees is on by share of the arc, among the circles that are there to be hit (as `hitTest` shares the arc out). */
function onShare(layout: LensLayout, theta: number): number {
	const there = layout.angles.map((_, i) => i).filter((i) => layout.presences[i] >= HIT_PRESENCE);
	for (let k = 0; k < there.length; k++) {
		const high = k < there.length - 1 ? (layout.angles[there[k]] + layout.angles[there[k + 1]]) / 2 : Number.POSITIVE_INFINITY;
		if (theta <= high + 1e-6) return there[k];
	}
	return there[there.length - 1];
}
/** Whether two circles of the layout, as drawn, are closer than their radii plus `gap` (the gap scaled by how much of the smaller-presence one is there); a gone circle is not drawn, so it overlaps nothing. */
function overlapIn(layout: LensLayout, radius: number, gap: number): string | null {
	const count = layout.angles.length;
	const describe = (i: number): string => `${i} (${layout.sizes[i].toFixed(1)}px at ${layout.angles[i].toFixed(1)}°, w ${layout.weights[i].toFixed(2)}, presence ${layout.presences[i].toFixed(2)})`;
	for (let i = 0; i < count; i++) {
		for (let j = i + 1; j < count; j++) {
			if (layout.presences[i] <= 0 || layout.presences[j] <= 0) continue;
			const a = (layout.angles[i] * Math.PI) / 180;
			const b = (layout.angles[j] * Math.PI) / 180;
			const distance = Math.hypot(radius * Math.cos(a) - radius * Math.cos(b), radius * Math.sin(a) - radius * Math.sin(b));
			const needed = (layout.sizes[i] + layout.sizes[j]) / 2 + gap * Math.min(layout.presences[i], layout.presences[j]);
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

	it("never shrinks a circle below the floor at rest: a level with more circles than the floor holds overlaps there (the lens, once the finger is on the ring, fades the far circles instead of shrinking them below the readable size)", () => {
		const layout = lensLayout(40, 4, 97, FIXED, 66, null);
		expect(layout.base).toBe(BEAD_FLOOR);
		expect(layout.sizes.every((size) => size === BEAD_FLOOR)).toBe(true);
		expect(layout.presences.every((presence) => presence === 1)).toBe(true);
		expect(layout.angles[0]).toBe(0);
		expect(layout.angles[39]).toBeCloseTo(90);
		const pressed = lensLayout(40, 4, 97, FIXED, 66, 0.5, 36);
		// Circles fully there are never below the readable size (no blank dots with the finger on the ring); the rest are fading out, shrinking as they go.
		pressed.sizes.forEach((size, i) => {
			if (pressed.presences[i] === 1) expect(size).toBeGreaterThanOrEqual(READABLE_SIZE - 1e-9);
			else expect(size).toBeLessThanOrEqual(READABLE_SIZE * pressed.presences[i] + 0.01);
		});
		// The circles that are fully there stay inside the sweep and its slack; the ones fading out sit just past it, and the gone ones at its end.
		pressed.angles.forEach((angle, i) => {
			if (pressed.presences[i] === 1) expect(angle).toBeGreaterThanOrEqual(-4 - 1e-6);
			if (pressed.presences[i] === 1) expect(angle).toBeLessThanOrEqual(94 + 1e-6);
			if (pressed.presences[i] === 0) expect(Math.abs(angle - 45)).toBeLessThanOrEqual(49 + 1e-6);
		});
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
	it("grows the lone circle on a one-item ring under the finger and leaves it at the base size with no finger on the ring", () => {
		const geometry = { radius: 151, capacity: 5 };
		const [under] = ringSlots(1, geometry, 1, FIXED, 66, 0.5);
		expect(under.angleDeg).toBe(45);
		expect(under.weight).toBe(1);
		expect(under.size).toBeCloseTo(66);
		const [rest] = ringSlots(1, geometry, 1, FIXED, 66, null);
		expect(rest.size).toBe(44);
		expect(rest.weight).toBe(0);
	});

	it("grows the circle under the finger to the peak and its neighbours part way, on a ring that fits; a crowded ring grows it as far and shrinks the circles past it", () => {
		const text = lensLayout(5, 5, 151, FIXED, 66, 0.25);
		[1 / 3, 1, 1 / 3, 0, 0].forEach((weight, i) => expect(text.weights[i]).toBeCloseTo(weight));
		expect(text.sizes[1]).toBeCloseTo(66);
		expect(text.sizes[0]).toBeCloseTo(44 + 22 / 3);
		expect(text.sizes[3]).toBe(44);
		const window = lensLayout(8, 5, 151, FIXED, 66, 3 / 7);
		expect(window.weights[3]).toBeCloseTo(1, 9);
		expect(window.sizes[3]).toBeGreaterThanOrEqual(TAP_FOCUS_BELOW);
		expect(window.sizes[3]).toBeGreaterThan(55);
		expect(window.presences.every((presence) => presence > 1 - 1e-9)).toBe(true);
		// The farther from the finger, the smaller: past the circle under it, never below the readable size.
		expect(window.sizes[0]).toBeLessThan(window.base);
		expect(window.sizes[0]).toBeGreaterThanOrEqual(READABLE_SIZE - 1e-9);
		for (let i = 0; i < 3; i++) expect(window.sizes[i]).toBeLessThanOrEqual(window.sizes[i + 1]);
		for (let i = 3; i < 7; i++) expect(window.sizes[i]).toBeGreaterThanOrEqual(window.sizes[i + 1]);
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

	it("anchors the circle under the finger under it on a crowded ring: the finger stays on one of the two circles it grew most and the arc spans the sweep, running a little past its ends only as far as the circles need", () => {
		for (const focus of SWEEP) {
			const layout = lensLayout(9, 6, 167, FIXED, 66, focus, 36);
			const theta = focus * 90;
			const position = theta / ringPitch(9, 6);
			const hit = onShare(layout, theta);
			expect(Math.abs(hit - position)).toBeLessThanOrEqual(1 + 1e-9);
			expect(layout.angles[0]).toBeGreaterThanOrEqual(-4 - 1e-6);
			expect(layout.angles[0]).toBeLessThanOrEqual(1e-6);
			expect(layout.angles[8]).toBeLessThanOrEqual(94 + 1e-6);
			expect(layout.angles[8]).toBeGreaterThanOrEqual(90 - 1e-6);
			// The lens grows the whole way: the circles it needs room from shrink instead.
			expect(layout.growth).toBe(1);
			expect(Math.max(...layout.sizes)).toBeGreaterThan(48);
			expect(overlapIn(layout, 167, 2 - 1e-6)).toBeNull();
		}
	});

	it("keeps every circle on its ring's own radius and shrinks the circles the farther they are from the finger: 66px under it, down to nothing at the far end of a 12-item ring (the circles that would be dots fade out instead)", () => {
		const layout = lensLayout(12, 6, 167, FIXED, 66, 0, 36);
		expect(layout.sizes[0]).toBeCloseTo(66);
		expect(layout.sizes[11]).toBeLessThan(TAP_FOCUS_BELOW / 2);
		for (let i = 0; i < 11; i++) expect(layout.sizes[i]).toBeGreaterThanOrEqual(layout.sizes[i + 1]);
		// Nothing is placed off the ring: the layout has no radial offsets to apply, only angles and sizes.
		expect(Object.keys(layout).sort()).toEqual(["angles", "base", "crowded", "growth", "presences", "sizes", "weights"]);
		expect(Object.keys(ringSlots(1, { radius: 167, capacity: 6 }, 12, FIXED, 66, 0.3)[0]).sort()).toEqual(["angleDeg", "bead", "index", "presence", "ring", "size", "weight"]);
	});

	it("shrinks the circles past the finger by more the more the ring is crowded, and by none at rest or on a ring that fits", () => {
		const farthest = (count: number, radius: number): number => {
			const layout = lensLayout(count, ringCapacity(radius, 44, 6), radius, FIXED, 66, 0, 36);
			return layout.sizes[count - 1];
		};
		expect(farthest(8, 205)).toBeGreaterThan(farthest(9, 205));
		expect(farthest(9, 205)).toBeGreaterThan(farthest(12, 205));
		expect(lensLayout(9, 7, 205, FIXED, 66, null).sizes.every((size) => size === lensLayout(9, 7, 205, FIXED, 66, null).base)).toBe(true);
		expect(lensLayout(4, 4, 97, FIXED, 66, 0.5, 36).sizes[3]).toBeCloseTo(44, 0);
	});

	it("moves smoothly as the finger crosses a crowded ring: no circle jumps more than a few pixels or degrees per 1/400 of the sweep (the far circles may step a few degrees as the finger passes a circle, which the dial's 80ms ease smooths), for the levels a ring may plausibly hold (up to twice its capacity)", () => {
		const worst: string[] = [];
		for (const radius of [151, 167, 205, 237]) {
			const capacity = ringCapacity(radius, 44, 6);
			for (let count = capacity + 1; count <= 2 * capacity; count++) {
				let previous: LensLayout | null = null;
				for (let step = 0; step <= 400; step++) {
					const layout = lensLayout(count, capacity, radius, FIXED, 66, step / 400, 36);
					if (previous) {
						for (let i = 0; i < count; i++) {
							// A circle too small to see in both frames (a gone one is parked at the end of the sweep) may move as it likes.
							if (layout.sizes[i] < 2 && previous.sizes[i] < 2) continue;
							const size = Math.abs(layout.sizes[i] - previous.sizes[i]);
							const angle = Math.abs(layout.angles[i] - previous.angles[i]);
							if (size > 8 || angle > 6.5) worst.push(`${count} on r${radius} at ${step / 400}: circle ${i} moved ${size.toFixed(1)}px, ${angle.toFixed(1)} degrees`);
						}
					}
					previous = layout;
				}
			}
		}
		expect(worst.slice(0, 5)).toEqual([]);
	});

	it("never lets two circles on a ring overlap: at rest for any level its ring holds at the floor size, and with the finger anywhere for any level at all (the far circles fade out), at any size and peak, never grows a circle the farther it is from the finger, and keeps the finger on a circle it grew", () => {
		const violations: string[] = [];
		const grid = Array.from({ length: 41 }, (_, i) => i / 40);
		// Every level size up to the ring's capacity, then a spread of larger ones (a crowded ring's fade ends are worked out once per level and ring, so this sweep costs most in how many levels it visits).
		const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24, 28, 34];
		for (const itemSize of [40, 44, 56]) {
			for (const peakFactor of [1, 1.5]) {
				const params = ringParamsFor(itemSize, { peak: peakFactor });
				const peak = peakSize(PHONE, params);
				for (const { radius, capacity } of planRings(PHONE, params, [4, 5, 9])) {
					// At rest a ring holds its level without overlap only up to what fits at the floor size; with the finger on it, any level is held (the far circles fade out).
					const floorPitch = (Math.asin((BEAD_FLOOR + 2) / (2 * radius)) * 2 * 180) / Math.PI;
					const most = Math.min(25, 1 + Math.floor(90 / floorPitch + 1e-9));
					for (const count of levels) {
						for (const focus of [null, ...grid]) {
							if (focus === null && count > most) continue;
							const layout = lensLayout(count, capacity, radius, params, peak, focus, 36);
							const bad = overlapIn(layout, radius, 2 - 0.01);
							if (bad) violations.push(`${count} at ${itemSize}px, peak ${peakFactor}, on r${radius} at focus ${focus}: ${bad}`);
							if (focus === null || count <= 1 || violations.length >= 5) continue;
							const theta = focus * 90;
							const rest0 = layout.crowded ? 0 : slotAngle(0, count, capacity);
							const position = (theta - rest0) / ringPitch(count, capacity);
							if (layout.crowded) {
								// On a crowded ring a circle is never larger than one nearer the finger.
								for (let i = 0; i + 1 < count; i++) {
									const here = Math.abs(i - position);
									const next = Math.abs(i + 1 - position);
									if (layout.presences[i] < 1 || layout.presences[i + 1] < 1) continue;
									if (here < next - 1e-9 && layout.sizes[i] < layout.sizes[i + 1] - 1e-6) violations.push(`${count} at ${itemSize}px, peak ${peakFactor}, on r${radius} at focus ${focus}: circle ${i + 1} (${layout.sizes[i + 1].toFixed(1)}px) is larger than the nearer circle ${i} (${layout.sizes[i].toFixed(1)}px)`);
									if (next < here - 1e-9 && layout.sizes[i + 1] < layout.sizes[i] - 1e-6) violations.push(`${count} at ${itemSize}px, peak ${peakFactor}, on r${radius} at focus ${focus}: circle ${i} (${layout.sizes[i].toFixed(1)}px) is larger than the nearer circle ${i + 1} (${layout.sizes[i + 1].toFixed(1)}px)`);
								}
							}
							// Within the arc the finger is on one of the two circles of the gap it is in, the two the lens grew most: a shift toward an end never puts a third circle under it.
							if (position >= 0 && position <= count - 1) {
								const hit = onShare(layout, theta);
								if (Math.abs(hit - position) > 1 + 1e-9) violations.push(`${count} at ${itemSize}px, peak ${peakFactor}, on r${radius} at focus ${focus}: the finger at ${theta.toFixed(1)}° (position ${position.toFixed(2)}) is on circle ${hit} (w ${layout.weights[hit].toFixed(2)}), not one of the two it grew`);
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
				[10, 16, 25],
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
			for (const count of [1, 2, 4, 7, 12, 18]) {
				const counts = [4, count, 9];
				expectInsideBounds(geometry, params, counts);
				expectInsideBounds(geometry, params, counts, [0.5, 0.5, 0.5]);
				expectApart(geometry, params, counts, [], 2 - 0.01);
			}
			// More circles than a ring holds at the floor size overlap, but still stay on the screen.
			expectInsideBounds(geometry, params, [4, 25, 9]);
			expectInsideBounds(geometry, params, [4, 25, 9], [0.5, 0.5, 0.5]);
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
		const moved = placed(PHONE, FIXED, [4, 9], [null, 0.5]);
		const arcs = ringArcs(PHONE, moved.rings, moved.slots);
		expect(arcs[1].from).toEqual(slotPosition(moved.slots[4], PHONE, moved.rings));
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

describe("a crowded ring with the finger on it: a few readable circles beside the thumb, the rest faded out instead of shrunk to blank dots", () => {
	const FINGERS = Array.from({ length: 201 }, (_, i) => i / 200);
	const rings: [number, number][] = [[97, 4], [167, 6], [237, 8]];
	/** The circles there to be hit (at least half there) and the one the finger is on by share of the arc. */
	function thereAt(layout: LensLayout, focus: number): { there: number[]; armed: number } {
		const there = layout.angles.map((_, i) => i).filter((i) => layout.presences[i] >= HIT_PRESENCE);
		return { there, armed: onShare(layout, focus * DIAL_SWEEP_DEG) };
	}

	it.each([[7], [9], [12], [16], [24], [40]])("%i items on any ring: every circle that is fully there is at least the readable size, so no circle is drawn as a blank dot except while it fades at an end of the sweep", (count) => {
		const problems: string[] = [];
		for (const itemSize of [40, 44, 56]) {
			for (const peakFactor of [1, 1.5]) {
				const params = ringParamsFor(itemSize, { peak: peakFactor });
				for (const [radius] of rings) {
					const capacity = ringCapacity(radius, itemSize, 6);
					if (count <= capacity) continue;
					for (const focus of FINGERS) {
						const layout = lensLayout(count, capacity, radius, params, itemSize * peakFactor, focus, 36);
						layout.sizes.forEach((size, i) => {
							if (layout.presences[i] > 1 - 1e-9 && size < READABLE_SIZE - 1e-6) problems.push(`${itemSize}px peak ${peakFactor} r${radius} at ${focus}: circle ${i} is fully there at ${size.toFixed(1)}px`);
						});
					}
				}
			}
		}
		expect(problems.slice(0, 5)).toEqual([]);
	});

	it.each([[16], [24], [40]])("%i items on the first ring: at least five circles are there at every finger place, and with the finger in the middle of the sweep the circle under it and its neighbours on both sides show their keys", (count) => {
		const params = ringParamsFor(DEFAULT_DIAL_ITEM_SIZE);
		const problems: string[] = [];
		for (const focus of FINGERS) {
			const layout = lensLayout(count, 4, 97, params, peakSize(PHONE, params), focus, edgeRoom(PHONE));
			const { there, armed } = thereAt(layout, focus);
			if (there.length < 5) problems.push(`at ${focus}: only ${there.length} circles are there`);
			if (focus < 0.3 || focus > 0.7) continue;
			for (const circle of [armed - 1, armed, armed + 1]) {
				if (circle < 0 || circle >= count) continue;
				if (layout.sizes[circle] < DIAL_LEGIBLE_SIZE || layout.presences[circle] < HIT_PRESENCE) problems.push(`at ${focus}: circle ${circle} beside the thumb (armed ${armed}) is ${layout.sizes[circle].toFixed(1)}px, ${layout.presences[circle].toFixed(2)} there`);
			}
		}
		expect(problems.slice(0, 5)).toEqual([]);
	});

	it.each([[16], [24], [40]])("%i items on a ring of a group (second ring): the circle under the finger and the ones beside it are fully there at the readable size or more, wherever the finger is in the middle of the sweep", (count) => {
		const params = ringParamsFor(DEFAULT_DIAL_ITEM_SIZE);
		const problems: string[] = [];
		for (const [radius, capacity] of rings.slice(1)) {
			for (const focus of FINGERS) {
				if (focus < 0.3 || focus > 0.7) continue;
				const layout = lensLayout(count, capacity, radius, params, 66, focus, 36);
				const { armed } = thereAt(layout, focus);
				for (const circle of [armed - 1, armed, armed + 1]) {
					if (layout.presences[circle] < 1 - 1e-9 || layout.sizes[circle] < READABLE_SIZE - 1e-6) problems.push(`r${radius} at ${focus}: circle ${circle} beside the thumb (armed ${armed}) is ${layout.sizes[circle].toFixed(1)}px, ${layout.presences[circle].toFixed(2)} there`);
				}
			}
		}
		expect(problems.slice(0, 5)).toEqual([]);
	});

	it("starts fading levels sooner than it used to: a level that fits its ring whole (the default keymap's largest group of nine on its ring) is still shown whole, and one only a little bigger loses its far circles instead of drawing them as dots", () => {
		const params = ringParamsFor(DEFAULT_DIAL_ITEM_SIZE);
		const sweepMin = (count: number, radius: number, capacity: number): number => Math.min(...FINGERS.map((focus) => lensLayout(count, capacity, radius, params, 66, focus, 36).presences.reduce((a, b) => a + b, 0)));
		expect(sweepMin(9, 167, 6)).toBeCloseTo(9, 6);
		expect(sweepMin(9, 237, 8)).toBeCloseTo(9, 6);
		expect(sweepMin(5, 97, 4)).toBeCloseTo(5, 6);
		expect(sweepMin(7, 97, 4)).toBeLessThan(6.9);
		expect(sweepMin(12, 167, 6)).toBeLessThan(11);
	});

	it("keeps rest as it was: with no finger on the ring every circle is there, whatever the level", () => {
		for (const [radius, capacity] of rings) {
			for (const count of [capacity + 1, 12, 24, 40]) {
				const layout = lensLayout(count, capacity, radius, FIXED, 66, null, 36);
				expect(layout.presences.every((presence) => presence === 1)).toBe(true);
				expect(layout.sizes.every((size) => size === layout.base)).toBe(true);
			}
		}
	});
});

describe("a level too big for its ring, with the finger on it: the far circles fade out instead of overlapping", () => {
	const geometry = PHONE;
	const params = FIXED;
	const room = edgeRoom(geometry);
	const peak = peakSize(geometry, params);
	/** The finger on the ring of level `counts.length - 1`, `angleDeg` into the sweep, at the ring's own radius. */
	function fingerAt(counts: number[], ring: number, angleDeg: number) {
		const rings = planRings(geometry, params, counts);
		const focus = angleDeg / DIAL_SWEEP_DEG;
		const slots = rings.flatMap((r, index) => ringSlots(index, r, counts[index], params, peak, index === ring ? focus : null, room));
		const point = slotPosition({ ring, index: 0, angleDeg, size: 0, weight: 0, bead: false, presence: 1 }, geometry, rings);
		const armed = hitTest(point, geometry, rings, slots, DEFAULT_DEAD_ZONE, params.itemSize, null);
		return { rings, slots, point, armed };
	}
	const SWEEP_DEGREES = Array.from({ length: 181 }, (_, i) => i / 2);

	it.each([[16], [24], [30]])("%i items on the first ring: no drawn circle ever overlaps another, the circle under the finger always shows its key, and a gone circle takes no room", (count) => {
		const problems: string[] = [];
		for (const degrees of SWEEP_DEGREES) {
			const { slots, armed } = fingerAt([count], 0, degrees);
			const layout = lensLayout(count, 4, 97, params, peak, degrees / DIAL_SWEEP_DEG, room);
			const bad = overlapIn(layout, 97, 2 - 0.01);
			if (bad) problems.push(`at ${degrees}°: ${bad}`);
			if (armed === null) problems.push(`at ${degrees}°: the finger is on nothing`);
			else {
				if (slots[armed].size < DIAL_LEGIBLE_SIZE) problems.push(`at ${degrees}°: the armed circle ${armed} is ${slots[armed].size.toFixed(1)}px, too small to show its key`);
				if (slots[armed].presence < HIT_PRESENCE) problems.push(`at ${degrees}°: the armed circle ${armed} is mostly gone`);
			}
			for (const slot of slots) if (slot.presence === 0 && slot.size !== 0) problems.push(`at ${degrees}°: circle ${slot.index} is gone but has a size`);
		}
		expect(problems.slice(0, 5)).toEqual([]);
	});

	it.each([[16], [24], [30]])("%i items on the first ring: every item can be brought under the finger by sweeping along the ring, from either end", (count) => {
		for (const sweep of [SWEEP_DEGREES, [...SWEEP_DEGREES].reverse()]) {
			const reached = new Set<number>();
			for (const degrees of sweep) {
				const { armed } = fingerAt([count], 0, degrees);
				if (armed !== null) reached.add(armed);
			}
			expect([...reached].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
		}
	});

	it("never arms a circle that is mostly gone, not even with the finger right where the gone circles wait at the end of the sweep", () => {
		for (const [counts, ring] of [[[16], 0], [[24], 0], [[8, 22], 1]] as [number[], number][]) {
			for (const degrees of SWEEP_DEGREES) {
				const { slots, armed } = fingerAt(counts, ring, degrees);
				if (armed !== null) expect(slots[armed].presence).toBeGreaterThanOrEqual(HIT_PRESENCE);
			}
			// The finger at the very ends of the sweep, with the lens at the other end.
			for (const [focusDegrees, pointDegrees] of [[0, 90], [90, 0], [45, 0], [45, 90]]) {
				const rings = planRings(geometry, params, counts);
				const slots = rings.flatMap((r, index) => ringSlots(index, r, counts[index], params, peak, index === ring ? focusDegrees / DIAL_SWEEP_DEG : null, room));
				const point = slotPosition({ ring, index: 0, angleDeg: pointDegrees, size: 0, weight: 0, bead: false, presence: 1 }, geometry, rings);
				const armed = hitTest(point, geometry, rings, slots, DEFAULT_DEAD_ZONE, params.itemSize, null);
				if (armed !== null) expect(slots[armed].presence).toBeGreaterThanOrEqual(HIT_PRESENCE);
			}
		}
	});

	it("fades the far circles out on the side the finger is moving away from and in on the side it is moving toward: with the finger at the first end the last circles are gone, and the other way round", () => {
		for (const count of [16, 24]) {
			const start = lensLayout(count, 4, 97, params, peak, 0, room);
			const end = lensLayout(count, 4, 97, params, peak, 1, room);
			expect(start.presences[0]).toBe(1);
			expect(start.presences[count - 1]).toBe(0);
			expect(end.presences[count - 1]).toBe(1);
			expect(end.presences[0]).toBe(0);
			// The circle under the finger gets the whole lens, at either end.
			expect(start.sizes[0]).toBeCloseTo(peak);
			expect(end.sizes[count - 1]).toBeCloseTo(peak);
			// Part of the level is there and part is not: that is the point. The circle under the finger and a few circles beside it are there.
			expect(start.presences.filter((p) => p === 1).length).toBeGreaterThanOrEqual(4);
			expect(start.presences.filter((p) => p === 0).length).toBeGreaterThan(count / 2);
		}
	});

	it.each([[16], [24], [30]])("%i items: the fade is smooth as the finger moves: per 1/400 of the sweep no circle's presence changes by more than a third, and the circles that stay (more than 15% there) move and grow by no more than the crowded rings' usual few pixels and degrees", (count) => {
		const worst: string[] = [];
		let previous: LensLayout | null = null;
		for (let step = 0; step <= 400; step++) {
			const layout = lensLayout(count, 4, 97, params, peak, step / 400, room);
			if (previous) {
				for (let i = 0; i < count; i++) {
					const presence = Math.abs(layout.presences[i] - previous.presences[i]);
					if (presence > 0.34) worst.push(`${count} at ${step / 400}: circle ${i} faded ${presence.toFixed(2)}`);
					if (layout.presences[i] < 0.15 || previous.presences[i] < 0.15) continue;
					const size = Math.abs(layout.sizes[i] - previous.sizes[i]);
					const angle = Math.abs(layout.angles[i] - previous.angles[i]);
					if (size > 8 || angle > 6.5) worst.push(`${count} at ${step / 400}: circle ${i} moved ${size.toFixed(1)}px, ${angle.toFixed(1)} degrees`);
				}
			}
			previous = layout;
		}
		expect(worst.slice(0, 5)).toEqual([]);
	});

	it.each([[16], [24], [30]])("%i items: as the finger sweeps one way a circle fades in ahead of it and out behind it, never out and back in (no pulsing at the ends of what is there)", (count) => {
		const problems: string[] = [];
		for (const forward of [true, false]) {
			const steps = Array.from({ length: 801 }, (_, i) => (forward ? i : 800 - i) / 800);
			const trend = new Array<number>(count).fill(0);
			let previous: LensLayout | null = null;
			for (const focus of steps) {
				const layout = lensLayout(count, 4, 97, params, peak, focus, room);
				if (previous) {
					for (let i = 0; i < count; i++) {
						const change = layout.presences[i] - previous.presences[i];
						if (Math.abs(change) < 1e-6) continue;
						const direction = Math.sign(change);
						// Fading in ahead of the finger and later out behind it is the point; fading out and then back in is the pulse.
						if (trend[i] < 0 && direction > 0) problems.push(`${forward ? "forward" : "backward"} at ${focus.toFixed(4)}: circle ${i} turned from fading ${trend[i] > 0 ? "in" : "out"} to fading ${direction > 0 ? "in" : "out"} (${previous.presences[i].toFixed(2)} to ${layout.presences[i].toFixed(2)})`);
						trend[i] = direction;
					}
				}
				previous = layout;
			}
		}
		expect(problems.slice(0, 5)).toEqual([]);
	});

	it("keeps rest as it was: with no finger on the ring every circle is there, whatever the level", () => {
		for (const count of [5, 16, 24, 40]) {
			const layout = lensLayout(count, 4, 97, params, peak, null, room);
			expect(layout.presences.every((presence) => presence === 1)).toBe(true);
			expect(layout.angles[0]).toBeCloseTo(0);
			expect(layout.angles[count - 1]).toBeCloseTo(DIAL_SWEEP_DEG);
		}
		expect(ringSlots(0, { radius: 97, capacity: 4 }, 24, params, peak, null, room).every((slot) => slot.presence === 1)).toBe(true);
	});

	it("has no cliff between a level that still fits with the lens on it and one circle more: over a sweep of the finger the number of circles there grows by about one per circle added", () => {
		for (const { radius, capacity } of planRings(geometry, params, [4, 5, 9])) {
			let previous: number | null = null;
			for (let count = capacity + 1; count <= 34; count++) {
				// Averaged over the finger's places: with the finger right on a circle the lens takes a little more room than between two.
				let there = 0;
				for (let step = 0; step <= 40; step++) there += lensLayout(count, capacity, radius, params, peak, step / 40, room).presences.reduce((total, presence) => total + presence, 0) / 41;
				// One more circle adds at most one to what is there (nothing, once the ring is full), and never takes away more than a fraction of one.
				if (previous !== null) {
					expect(there - previous).toBeLessThanOrEqual(1 + 1e-6);
					expect(there - previous).toBeGreaterThanOrEqual(-0.5);
				}
				previous = there;
			}
		}
	});

	it("never lets the circle under the finger be a small one on any ring, whatever the level: from a level that fits to one far too big", () => {
		const problems: string[] = [];
		for (const ring of planRings(geometry, params, [4, 5, 9]).map((r, index) => ({ ...r, index }))) {
			for (let count = ring.capacity + 1; count <= 34; count++) {
				for (const degrees of SWEEP_DEGREES) {
					const layout = lensLayout(count, ring.capacity, ring.radius, params, peak, degrees / DIAL_SWEEP_DEG, room);
					const position = (degrees / DIAL_SWEEP_DEG) * (count - 1);
					const nearest = Math.round(position);
					if (layout.sizes[nearest] < DIAL_LEGIBLE_SIZE) problems.push(`${count} on ring ${ring.index} at ${degrees}°: the circle nearest the finger is ${layout.sizes[nearest].toFixed(1)}px`);
				}
			}
		}
		expect(problems.slice(0, 5)).toEqual([]);
	});

	it("draws the guide arc between the circles that are there, not out to the gone ones", () => {
		const counts = [24];
		const rings = planRings(geometry, params, counts);
		const slots = ringSlots(0, rings[0], 24, params, peak, 0.5, room);
		const [arc] = ringArcs(geometry, rings, slots);
		const gone = slots.filter((slot) => slot.presence === 0);
		expect(gone.length).toBeGreaterThan(0);
		// Both ends are inside the sweep and its slack (a gone circle waits at the end of the sweep, never beyond it).
		const angleOf = (point: { x: number; y: number }) => (Math.atan2(geometry.anchor.y - point.y, geometry.anchor.x - point.x) * 180) / Math.PI;
		const fromAngle = angleOf(arc.from);
		const toAngle = angleOf(arc.to);
		for (const angle of [fromAngle, toAngle]) {
			expect(angle).toBeGreaterThanOrEqual(-4 - 1e-6);
			expect(angle).toBeLessThanOrEqual(94 + 1e-6);
		}
	});
});

describe("pillClearance", () => {
	const box = (top: number, bottom: number, width = 330) => ({ top, bottom, height: bottom - top, width });

	it("clears a title that sits below the header", () => {
		expect(pillClearance(104, [box(119, 225)])).toBe(225);
	});

	it("keeps the header's bottom when there is no title", () => {
		expect(pillClearance(104, [])).toBe(104);
	});

	it("keeps the header's bottom for a hidden or empty title", () => {
		expect(pillClearance(104, [box(0, 0, 0)])).toBe(104);
		expect(pillClearance(104, [box(119, 119)])).toBe(104);
	});

	it("clears the showing title when the hidden view's title comes first", () => {
		expect(pillClearance(104, [box(0, 0, 0), box(119, 225)])).toBe(225);
		expect(pillClearance(104, [box(119, 225), box(0, 0, 0)])).toBe(225);
	});

	it("keeps the header's bottom when the title has scrolled up under the header", () => {
		expect(pillClearance(104, [box(-60, 40)])).toBe(104);
	});
});
