import {
	chooseLayout,
	chooseRingParams,
	COMPACT_RING_PARAMS,
	computeRings,
	DEFAULT_RING_PARAMS,
	DIAL_SWEEP_DEG,
	hitTest,
	MIN_ITEM_SIZE,
	paging,
	placeSlots,
	ringCapacity,
	slotAngle,
	slotPosition,
	totalCapacity,
	type DialGeometry,
	type DialRingParams,
} from "../src/dial/layout";
import type { DialCorner } from "../src/types";

const ANCHOR_RADIUS = 28;
const EDGE = 12;
/** Obsidian's mobile view header, which the breadcrumb pill normally sits below. */
const HEADER = 44;
/** The breadcrumb pill: 8px below whatever is above it, 46px tall. */
const PILL_HEIGHT = 54;
/** Obsidian's editing toolbar slot above the keyboard, as the DOM layer measures it. */
const TOOLBAR = 52;

/** Items keep this far from the screen's edges, the pill, and the chrome below the anchor (the DOM layer's EDGE_MARGIN). */
const MARGIN = 4;

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

function placed(geometry: DialGeometry, params: DialRingParams, count: number) {
	const rings = computeRings(geometry, params);
	const slots = placeSlots(rings, count);
	return { rings, slots, points: slots.map((slot) => slotPosition(slot, geometry, rings)) };
}

function expectInsideBounds(geometry: DialGeometry, params: DialRingParams, count: number): void {
	const { points } = placed(geometry, params, count);
	const half = params.itemSize / 2;
	for (const p of points) {
		expect(p.x - half).toBeGreaterThanOrEqual(geometry.bounds.left);
		expect(p.x + half).toBeLessThanOrEqual(geometry.bounds.right);
		expect(p.y - half).toBeGreaterThanOrEqual(geometry.bounds.top);
		expect(p.y + half).toBeLessThanOrEqual(geometry.bounds.bottom);
	}
}

function expectNoOverlap(geometry: DialGeometry, params: DialRingParams, count: number): void {
	const { points } = placed(geometry, params, count);
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
			expect(distance).toBeGreaterThanOrEqual(params.itemSize + params.gap - 1e-6);
		}
	}
}

describe("ringCapacity", () => {
	it("holds one item on a ring too small for two", () => {
		expect(ringCapacity(20, 60, 6)).toBe(1);
	});

	it("grows with the radius", () => {
		const sizes = [88, 154, 220, 286].map((r) => ringCapacity(r, 60, 6));
		expect(sizes).toEqual([3, 4, 6, 7]);
	});

	it("never places two items closer than size plus gap", () => {
		for (const radius of [60, 88, 100, 154, 220, 300]) {
			const n = ringCapacity(radius, 60, 6);
			if (n < 2) continue;
			const chord = 2 * radius * Math.sin(((DIAL_SWEEP_DEG / (n - 1)) * Math.PI) / 360);
			expect(chord).toBeGreaterThanOrEqual(62 - 1e-6);
		}
	});
});

describe("computeRings", () => {
	it("spaces the rings one item plus one gap apart, each holding more than the one inside it", () => {
		const rings = computeRings(phone(390, 844), DEFAULT_RING_PARAMS);
		expect(rings.length).toBeGreaterThanOrEqual(3);
		expect(rings[0].radius).toBe(DEFAULT_RING_PARAMS.firstRadius);
		for (let i = 1; i < rings.length; i++) {
			expect(rings[i].radius - rings[i - 1].radius).toBe(DEFAULT_RING_PARAMS.itemSize + DEFAULT_RING_PARAMS.gap);
			expect(rings[i].capacity).toBeGreaterThan(rings[i - 1].capacity);
		}
	});

	it("stops adding rings once the next would leave the bounds", () => {
		const geometry = phone(390, 844);
		const rings = computeRings(geometry, DEFAULT_RING_PARAMS);
		const outer = rings[rings.length - 1];
		const nextRadius = outer.radius + (rings.length >= 2 ? outer.radius - rings[rings.length - 2].radius : 0);
		expect(outer.radius + DEFAULT_RING_PARAMS.itemSize / 2).toBeLessThanOrEqual(geometry.anchor.x - geometry.bounds.left);
		expect(nextRadius + DEFAULT_RING_PARAMS.itemSize / 2).toBeGreaterThan(geometry.anchor.x - geometry.bounds.left);
	});

	it("is limited by whichever of width and height is tighter", () => {
		// Plenty of width but almost no height above the anchor: the first ring needs 88 + 30 px.
		const squat: DialGeometry = { corner: "bottom-right", anchor: { x: 700, y: 110 }, bounds: { left: 0, top: 0, right: 740, bottom: 150 } };
		expect(computeRings(squat, DEFAULT_RING_PARAMS)).toEqual([]);
		const tallerSquat = { ...squat, anchor: { x: 700, y: 120 }, bounds: { ...squat.bounds, bottom: 160 } };
		expect(computeRings(tallerSquat, DEFAULT_RING_PARAMS)).toHaveLength(1);
	});
});

describe("placeSlots", () => {
	it("fills inner rings first; a full ring spans the sweep end to end", () => {
		const rings = computeRings(phone(390, 844), DEFAULT_RING_PARAMS);
		const slots = placeSlots(rings, 12);
		expect(slots.map((s) => s.ring)).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
		expect(slots.filter((s) => s.ring === 0).map((s) => s.angleDeg)).toEqual([0, 45, 90]);
		expect(slots.filter((s) => s.ring === 1).map((s) => s.angleDeg)).toEqual([0, 30, 60, 90]);
	});

	it("keeps a partly used ring at the full ring's pitch, centred on the sweep", () => {
		const rings = computeRings(phone(390, 844), DEFAULT_RING_PARAMS);
		const slots = placeSlots(rings, 12);
		// Ring 2 holds six at 18 degrees; the five it gets sit 18 apart around 45.
		expect(rings[2].capacity).toBe(6);
		expect(slots.filter((s) => s.ring === 2).map((s) => s.angleDeg)).toEqual([9, 27, 45, 63, 81]);
		expect([0, 1].map((i) => slotAngle(i, 2, 3))).toEqual([22.5, 67.5]);
	});

	it("puts a lone item on a ring in the middle of the sweep", () => {
		expect(slotAngle(0, 1, 3)).toBe(45);
		const rings = computeRings(phone(390, 844), DEFAULT_RING_PARAMS);
		const slots = placeSlots(rings, 4);
		expect(slots[3]).toEqual({ ring: 1, index: 0, angleDeg: 45 });
	});

	it("returns only what the rings can hold", () => {
		const rings = computeRings(phone(390, 844), DEFAULT_RING_PARAMS);
		expect(placeSlots(rings, 100)).toHaveLength(totalCapacity(rings));
		expect(placeSlots([], 3)).toEqual([]);
	});
});

describe("item placement on real phone sizes", () => {
	const cases: [string, DialGeometry][] = [
		["iPhone 14 class (47px notch inset), keyboard down", phone(390, 844, "bottom-right", 0, 47)],
		["iPhone 14 class (47px notch inset), keyboard (300) and toolbar up", phone(390, 844, "bottom-right", 300 + TOOLBAR, 47)],
		["iPhone SE 2/3 (20px status bar), keyboard (260) and toolbar up", phone(375, 667, "bottom-right", 260 + TOOLBAR, 20)],
		["small Android (24px status bar), keyboard down", phone(360, 640, "bottom-right", 0, 24)],
		["small Android (24px status bar), keyboard (250) and toolbar up", phone(360, 640, "bottom-right", 250 + TOOLBAR, 24)],
		["bottom-left corner", phone(390, 844, "bottom-left", 0, 47)],
		["bottom-left corner, keyboard up", phone(390, 844, "bottom-left", 300 + TOOLBAR, 47)],
	];

	it.each(cases)("%s: every item stays on screen and apart, for 1 to 15 items", (_name, geometry) => {
		for (const params of [DEFAULT_RING_PARAMS, COMPACT_RING_PARAMS]) {
			for (let count = 1; count <= 15; count++) {
				expectInsideBounds(geometry, params, count);
				expectNoOverlap(geometry, params, count);
			}
		}
	});

	it.each(cases)("%s: the default keymap's 12-item Window group fits without paging, pill raised at most", (_name, geometry) => {
		const layout = chooseLayout(12, (mode) => (mode === "normal" ? geometry : raised(geometry)));
		expect(layout.mode).not.toBe("overlap");
		expect(totalCapacity(layout.rings)).toBeGreaterThanOrEqual(12);
	});

	it("mirrors the fan for the bottom-left corner", () => {
		const right = placed(phone(390, 844, "bottom-right"), DEFAULT_RING_PARAMS, 8);
		const left = placed(phone(390, 844, "bottom-left"), DEFAULT_RING_PARAMS, 8);
		right.points.forEach((p, i) => {
			expect(left.points[i].x).toBeCloseTo(390 - p.x, 6);
			expect(left.points[i].y).toBeCloseTo(p.y, 6);
		});
	});

	it("keeps every target at least the minimum thumb size", () => {
		expect(DEFAULT_RING_PARAMS.itemSize).toBeGreaterThanOrEqual(MIN_ITEM_SIZE);
		expect(COMPACT_RING_PARAMS.itemSize).toBeGreaterThanOrEqual(MIN_ITEM_SIZE);
	});
});

describe("chooseRingParams", () => {
	it("keeps the comfortable spacing when it holds the level", () => {
		expect(chooseRingParams(phone(390, 844), 12)).toBe(DEFAULT_RING_PARAMS);
	});

	it("switches to compact spacing when only that avoids paging", () => {
		// An iPhone SE (1st gen, 20px status bar) with a 240px keyboard and the toolbar up, pill
		// raised: about 160px of fan above the pill, enough for a second ring only at compact spacing.
		const geometry = raised(phone(320, 568, "bottom-right", 240 + TOOLBAR, 20));
		const defaultCapacity = totalCapacity(computeRings(geometry, DEFAULT_RING_PARAMS));
		const compactCapacity = totalCapacity(computeRings(geometry, COMPACT_RING_PARAMS));
		expect(compactCapacity).toBeGreaterThan(defaultCapacity);
		const count = compactCapacity;
		expect(defaultCapacity).toBeLessThan(count);
		expect(chooseRingParams(geometry, count)).toBe(COMPACT_RING_PARAMS);
	});

	it("falls back to whichever holds more when both would page", () => {
		const geometry = raised(phone(320, 568, "bottom-right", 240 + TOOLBAR, 20));
		const compactCapacity = totalCapacity(computeRings(geometry, COMPACT_RING_PARAMS));
		expect(chooseRingParams(geometry, compactCapacity + 10)).toBe(COMPACT_RING_PARAMS);
	});
});

describe("paging", () => {
	it("is a single page when the level fits", () => {
		expect(paging(12, 15)).toEqual({ pages: 1, perPage: 12 });
		expect(paging(15, 15)).toEqual({ pages: 1, perPage: 15 });
	});

	it("gives up one slot per page to the More item when the level does not fit", () => {
		expect(paging(16, 15)).toEqual({ pages: 2, perPage: 14 });
		expect(paging(12, 8)).toEqual({ pages: 2, perPage: 7 });
		expect(paging(30, 8)).toEqual({ pages: 5, perPage: 7 });
	});

	it("has no pages at all when nothing fits", () => {
		expect(paging(5, 0)).toEqual({ pages: 0, perPage: 0 });
	});
});

describe("hitTest", () => {
	const geometry = phone(390, 844);
	const rings = computeRings(geometry, DEFAULT_RING_PARAMS);
	const slots = placeSlots(rings, 12);
	const at = (index: number) => slotPosition(slots[index], geometry, rings);

	it("arms nothing inside the dead zone around the anchor", () => {
		expect(hitTest(geometry.anchor, geometry, rings, slots)).toBeNull();
		expect(hitTest({ x: geometry.anchor.x - 30, y: geometry.anchor.y - 10 }, geometry, rings, slots)).toBeNull();
	});

	it("arms the item whose centre the pointer is on", () => {
		slots.forEach((_slot, index) => {
			expect(hitTest(at(index), geometry, rings, slots)).toBe(index);
		});
	});

	it("picks the ring by radial band and the slot by nearest angle", () => {
		// Between ring 1's slots 0 (0 deg) and 1 (30 deg), slightly nearer slot 1.
		const radius = rings[1].radius;
		const angle = (17 * Math.PI) / 180;
		const point = { x: geometry.anchor.x - radius * Math.cos(angle), y: geometry.anchor.y - radius * Math.sin(angle) };
		expect(hitTest(point, geometry, rings, slots)).toBe(4);
	});

	it("still arms the outer ring when the pointer overshoots it a little, but not by a lot", () => {
		const outerTop = at(11); // ring 2's last slot, near the top of the sweep
		expect(hitTest({ x: outerTop.x, y: outerTop.y - 40 }, geometry, rings, slots)).toBe(11);
		expect(hitTest({ x: outerTop.x, y: outerTop.y - 80 }, geometry, rings, slots)).toBeNull();
	});

	it("arms nothing far from the rings, so a tap elsewhere can cancel", () => {
		expect(hitTest({ x: 40, y: 300 }, geometry, rings, slots)).toBeNull();
		const few = placeSlots(rings, 4); // three on ring 0, one lone item mid-sweep on ring 1
		expect(hitTest({ x: 40, y: 300 }, geometry, rings, few)).toBeNull();
	});

	it("arms nothing when the pointer is far outside the sweep", () => {
		// Well below the anchor's horizontal, on ring 1's radius: outside every slot's reach.
		const radius = rings[1].radius;
		const angle = (-40 * Math.PI) / 180;
		const point = { x: geometry.anchor.x - radius * Math.cos(angle), y: geometry.anchor.y - radius * Math.sin(angle) };
		expect(hitTest(point, geometry, rings, slots)).toBeNull();
	});

	it("ignores rings that hold no items", () => {
		const few = placeSlots(rings, 2); // both on ring 0, at 22.5 and 67.5 degrees
		const justBeyond = { x: geometry.anchor.x - rings[0].radius - 40, y: geometry.anchor.y };
		expect(hitTest(justBeyond, geometry, rings, few)).toBe(0);
		const farOut = { x: geometry.anchor.x - rings[2].radius, y: geometry.anchor.y };
		expect(hitTest(farOut, geometry, rings, few)).toBeNull();
	});

	it("works mirrored for the bottom-left corner", () => {
		const leftGeometry = phone(390, 844, "bottom-left");
		const leftRings = computeRings(leftGeometry, DEFAULT_RING_PARAMS);
		const leftSlots = placeSlots(leftRings, 12);
		leftSlots.forEach((slot, index) => {
			expect(hitTest(slotPosition(slot, leftGeometry, leftRings), leftGeometry, leftRings, leftSlots)).toBe(index);
		});
	});

	it("arms nothing when there are no slots", () => {
		expect(hitTest({ x: 100, y: 100 }, geometry, rings, [])).toBeNull();
	});

	it("lets the end slots of a partly used ring own a little of the arc beside them, not all of it", () => {
		const five = placeSlots(rings, 12); // ring 2 holds five of six, from 9 to 81 degrees, 18 apart
		const radius = rings[2].radius;
		const atAngle = (deg: number) => ({ x: geometry.anchor.x - radius * Math.cos((deg * Math.PI) / 180), y: geometry.anchor.y - radius * Math.sin((deg * Math.PI) / 180) });
		expect(hitTest(atAngle(0), geometry, rings, five)).toBe(7);
		expect(hitTest(atAngle(90), geometry, rings, five)).toBe(11);
		expect(hitTest(atAngle(-12), geometry, rings, five)).toBeNull();
	});

	it("arms nothing more than half a slot pitch past a lone item, so a tap on blank space inside the fan cancels", () => {
		const few = placeSlots(rings, 4); // three on ring 0; one lone item mid-sweep on ring 1, whose full ring holds four 30 degrees apart
		const onRing1 = (deg: number) => ({ x: geometry.anchor.x - rings[1].radius * Math.cos((deg * Math.PI) / 180), y: geometry.anchor.y - rings[1].radius * Math.sin((deg * Math.PI) / 180) });
		expect(hitTest(onRing1(45), geometry, rings, few)).toBe(3);
		expect(hitTest(onRing1(30), geometry, rings, few)).toBe(3);
		expect(hitTest(onRing1(60), geometry, rings, few)).toBe(3);
		expect(hitTest(onRing1(5), geometry, rings, few)).toBeNull();
		expect(hitTest(onRing1(85), geometry, rings, few)).toBeNull();
		// The reviewer's repro: 185px from the anchor at 3 degrees, 120px from the lone item.
		const rad = (3 * Math.PI) / 180;
		expect(hitTest({ x: geometry.anchor.x - 185 * Math.cos(rad), y: geometry.anchor.y - 185 * Math.sin(rad) }, geometry, rings, few)).toBeNull();
		// Between two neighbours the band still splits at the midpoint, so a drag is as forgiving as before.
		const onRing0 = (deg: number) => ({ x: geometry.anchor.x - rings[0].radius * Math.cos((deg * Math.PI) / 180), y: geometry.anchor.y - rings[0].radius * Math.sin((deg * Math.PI) / 180) });
		expect(hitTest(onRing0(20), geometry, rings, few)).toBe(0);
		expect(hitTest(onRing0(25), geometry, rings, few)).toBe(1);
	});

	it("arms an end item anywhere inside its own circle, even outside the sweep", () => {
		const fromAnchor = (u: number, v: number) => ({ x: geometry.anchor.x - u, y: geometry.anchor.y - v });
		expect(hitTest(fromAnchor(88, -20), geometry, rings, slots)).toBe(0);
		expect(hitTest(fromAnchor(-20, 88), geometry, rings, slots)).toBe(2);
		const compactRings = computeRings(geometry, COMPACT_RING_PARAMS);
		const compactSlots = placeSlots(compactRings, totalCapacity(compactRings));
		expect(compactRings[0].radius).toBe(74);
		expect(hitTest(fromAnchor(74, -15), geometry, compactRings, compactSlots, undefined, COMPACT_RING_PARAMS.itemSize)).toBe(0);
	});

	it("arms nothing between the anchor rim and the innermost ring's inner edge", () => {
		const rad = (45 * Math.PI) / 180;
		const atDistance = (d: number) => ({ x: geometry.anchor.x - d * Math.cos(rad), y: geometry.anchor.y - d * Math.sin(rad) });
		expect(hitTest(atDistance(40), geometry, rings, slots)).toBeNull();
		expect(hitTest(atDistance(50), geometry, rings, slots)).toBeNull();
		expect(hitTest(atDistance(56), geometry, rings, slots)).toBe(1);
	});
});
