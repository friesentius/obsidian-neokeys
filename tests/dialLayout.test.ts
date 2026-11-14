import {
	ANCHOR_RADIUS,
	chooseMode,
	DEFAULT_DIAL_ITEM_SIZE,
	DEFAULT_RING_PARAMS,
	DIAL_SWEEP_DEG,
	fanReach,
	firstRadius,
	fittingFrom,
	hitTest,
	ITEM_GAP,
	MAX_DIAL_ITEM_SIZE,
	MIN_DIAL_ITEM_SIZE,
	naturalReach,
	paging,
	planRings,
	RING_GAP,
	ringArcs,
	ringCapacity,
	ringParamsFor,
	ringSlots,
	ringStep,
	slotAngle,
	slotPosition,
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

/** The default keymap's widest path on a phone: root (4), Text (5), Heading (9), whose outermost ring naturally sits at 256px at 44px. */
const DEFAULT_NEED = naturalReach(DEFAULT_RING_PARAMS, [4, 5, 9]);

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

/** The same phone with the rings allowed up behind the pill, to its top edge. */
function overlap(geometry: DialGeometry): DialGeometry {
	return { ...geometry, bounds: { ...geometry.bounds, top: geometry.bounds.top - HEADER - PILL_HEIGHT + 8 } };
}

function measureFor(geometry: DialGeometry): (mode: DialLayoutMode) => DialGeometry {
	return (mode) => (mode === "normal" ? geometry : mode === "raised" ? raised(geometry) : overlap(geometry));
}

/** Rings for `counts`, with every ring fully used (paged levels fill their ring with items plus More). */
function placed(geometry: DialGeometry, params: DialRingParams, counts: number[]) {
	const rings = planRings(geometry, params, counts);
	const slots: DialSlot[] = [];
	rings.forEach((ring, index) => {
		const split = paging(counts[index], ring.capacity);
		slots.push(...ringSlots(index, ring.capacity, split.pages > 1 ? split.perPage + 1 : split.perPage));
	});
	return { rings, slots, points: slots.map((slot) => slotPosition(slot, geometry, rings)) };
}

function expectInsideBounds(geometry: DialGeometry, params: DialRingParams, counts: number[]): void {
	const { points } = placed(geometry, params, counts);
	const half = params.itemSize / 2;
	for (const p of points) {
		expect(p.x - half).toBeGreaterThanOrEqual(geometry.bounds.left);
		expect(p.x + half).toBeLessThanOrEqual(geometry.bounds.right);
		expect(p.y - half).toBeGreaterThanOrEqual(geometry.bounds.top);
		expect(p.y + half).toBeLessThanOrEqual(geometry.bounds.bottom);
	}
}

function expectNoOverlap(geometry: DialGeometry, params: DialRingParams, counts: number[]): void {
	const { points } = placed(geometry, params, counts);
	for (let i = 0; i < points.length; i++) {
		for (let j = i + 1; j < points.length; j++) {
			const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
			expect(distance).toBeGreaterThanOrEqual(params.itemSize + params.gap - 1e-6);
		}
	}
}

const PHONE = phone(390, 844, "bottom-right", 0, 47);

describe("ringCapacity", () => {
	it("holds one item on a ring too small for two", () => {
		expect(ringCapacity(20, 44, 6)).toBe(1);
	});

	it("grows with the radius", () => {
		expect(ringCapacity(97, 44, 6)).toBe(4);
		expect(ringCapacity(151, 44, 6)).toBe(5);
		expect(ringCapacity(256, 44, 6)).toBe(9);
	});

	it("never places two items closer than size plus gap", () => {
		for (const radius of [60, 97, 151, 256, 400]) {
			const capacity = ringCapacity(radius, 44, 6);
			if (capacity < 2) continue;
			const pitch = (DIAL_SWEEP_DEG / (capacity - 1)) * (Math.PI / 180);
			const chord = 2 * radius * Math.sin(pitch / 2);
			expect(chord).toBeGreaterThanOrEqual(44 + 6 - 1e-6);
		}
	});
});

describe("the sizes on offer", () => {
	it("default to Obsidian's touch size and run from 40 to 56px with the same gaps", () => {
		expect(DEFAULT_DIAL_ITEM_SIZE).toBe(44);
		expect(MIN_DIAL_ITEM_SIZE).toBe(40);
		expect(MAX_DIAL_ITEM_SIZE).toBe(56);
		expect(DEFAULT_RING_PARAMS).toEqual(ringParamsFor(44));
		expect(ringParamsFor(50)).toEqual({ itemSize: 50, gap: ITEM_GAP, ringGap: RING_GAP });
	});

	it("start the first ring one ring gap and half an item outside the anchor's rim, and step one item plus one ring gap per ring", () => {
		expect(firstRadius(ringParamsFor(44))).toBe(ANCHOR_RADIUS + RING_GAP + 22);
		expect(ringStep(ringParamsFor(44))).toBe(44 + RING_GAP);
	});
});

describe("planRings", () => {
	it("gives each level the smallest ring that holds it, at least a step outside the ring inside", () => {
		const rings = planRings(PHONE, DEFAULT_RING_PARAMS, [4, 5, 9]);
		expect(rings.map((ring) => ring.radius)).toEqual([97, 151, 256]);
		expect(rings.map((ring) => ring.capacity)).toEqual([4, 5, 9]);
	});

	it("keeps a ring's radius whatever opens outside it, so nothing moves when a deeper level opens", () => {
		const alone = planRings(PHONE, DEFAULT_RING_PARAMS, [4]);
		const withChild = planRings(PHONE, DEFAULT_RING_PARAMS, [4, 5]);
		const withTwo = planRings(PHONE, DEFAULT_RING_PARAMS, [4, 5, 12]);
		expect(withChild[0]).toEqual(alone[0]);
		expect(withTwo.slice(0, 2)).toEqual(withChild);
	});

	it("caps the ring at the reach of the bounds, where a level that needs more pages", () => {
		const geometry = phone(390, 844, "bottom-right", 300 + TOOLBAR, 47);
		const params = ringParamsFor(MAX_DIAL_ITEM_SIZE);
		const rings = planRings(geometry, params, [4, 5, 9]);
		expect(rings).toHaveLength(3);
		expect(rings[2].radius).toBe(fanReach(geometry, params));
		expect(rings[2].capacity).toBeLessThan(9);
		expect(paging(9, rings[2].capacity).pages).toBe(2);
	});

	it("stops at the first level whose ring would not fit at all", () => {
		const geometry = phone(375, 667, "bottom-right", 260 + TOOLBAR, 20);
		expect(planRings(raised(geometry), DEFAULT_RING_PARAMS, [4, 5, 9])).toHaveLength(2);
	});

	it("is limited by whichever of width and height is tighter", () => {
		const wide = planRings(phone(1000, 844), DEFAULT_RING_PARAMS, [4, 12, 9]);
		const narrow = planRings(phone(320, 844), DEFAULT_RING_PARAMS, [4, 12, 9]);
		expect(wide[1].capacity).toBe(12);
		expect(narrow[1].capacity).toBeLessThan(12);
		expect(narrow[1].radius).toBe(fanReach(phone(320, 844), DEFAULT_RING_PARAMS));
	});

	it("gives a screen that cannot hold even one ring none", () => {
		const geometry: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 100 }, bounds: { left: 4, top: 60, right: 386, bottom: 136 } };
		expect(planRings(geometry, DEFAULT_RING_PARAMS, [4])).toEqual([]);
	});
});

describe("fittingFrom", () => {
	it("draws the whole path when it fits", () => {
		expect(fittingFrom(PHONE, DEFAULT_RING_PARAMS, [4, 5, 9])).toBe(0);
	});

	it("gives up the innermost levels first when the screen is too short for the path", () => {
		const geometry = raised(phone(375, 667, "bottom-right", 260 + TOOLBAR, 20));
		expect(fittingFrom(geometry, DEFAULT_RING_PARAMS, [4, 5, 9])).toBe(1);
		expect(planRings(geometry, DEFAULT_RING_PARAMS, [5, 9])).toHaveLength(2);
		const shorter = raised(phone(360, 640, "bottom-right", 250 + TOOLBAR, 24));
		expect(fittingFrom(shorter, DEFAULT_RING_PARAMS, [4, 5, 9])).toBe(2);
		expect(planRings(shorter, DEFAULT_RING_PARAMS, [9])).toHaveLength(1);
	});

	it("is the path's length when not even its deepest level fits", () => {
		const geometry: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 100 }, bounds: { left: 4, top: 60, right: 386, bottom: 136 } };
		expect(fittingFrom(geometry, DEFAULT_RING_PARAMS, [4, 5])).toBe(2);
	});
});

describe("ringSlots", () => {
	it("spans the sweep end to end on a full ring", () => {
		const slots = ringSlots(0, 4, 4);
		expect(slots.map((slot) => slot.angleDeg)).toEqual([0, 30, 60, 90]);
		expect(slots.every((slot) => slot.ring === 0)).toBe(true);
	});

	it("keeps a partly used ring at the full ring's pitch, centred on the sweep", () => {
		expect(ringSlots(1, 5, 3).map((slot) => slot.angleDeg)).toEqual([22.5, 45, 67.5]);
		expect(slotAngle(0, 2, 4)).toBe(30);
	});

	it("puts a lone item on a ring in the middle of the sweep", () => {
		expect(ringSlots(2, 9, 1)[0].angleDeg).toBe(45);
		expect(slotAngle(0, 1, 1)).toBe(45);
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

	it.each(cases)("%s: every item stays on screen and apart, for paths of 1 to 15 items per level", (_name, geometry) => {
		for (const params of [DEFAULT_RING_PARAMS, ringParamsFor(MIN_DIAL_ITEM_SIZE), ringParamsFor(MAX_DIAL_ITEM_SIZE)]) {
			for (let count = 1; count <= 15; count++) {
				for (const counts of [[count], [4, count], [4, 5, count]]) {
					for (const mode of [geometry, raised(geometry), overlap(geometry)]) {
						expectInsideBounds(mode, params, counts);
						expectNoOverlap(mode, params, counts);
					}
				}
			}
		}
	});

	it("walks the default keymap's deepest path (root, Text, Heading) on three whole rings on a 390px phone, keyboard up or down", () => {
		for (const geometry of [phone(390, 844, "bottom-right", 0, 47), phone(390, 844, "bottom-right", 300 + TOOLBAR, 47)]) {
			const chosen = chooseMode(DEFAULT_NEED, measureFor(geometry));
			expect(chosen.mode).toBe("normal");
			const rings = planRings(chosen.geometry, DEFAULT_RING_PARAMS, [4, 5, 9]);
			expect(rings.map((ring) => ring.radius)).toEqual([97, 151, 256]);
			expect(rings.map((ring) => paging([4, 5, 9][rings.indexOf(ring)], ring.capacity).pages)).toEqual([1, 1, 1]);
		}
	});

	it("holds a 12-item level whole on one ring on a 390px phone only at the smallest size, keyboard down: the width limits the ring", () => {
		const geometry = phone(390, 844, "bottom-right", 0, 47);
		for (let size = MIN_DIAL_ITEM_SIZE; size <= MAX_DIAL_ITEM_SIZE; size += 2) {
			const params = ringParamsFor(size);
			const chosen = chooseMode(naturalReach(params, [4, 5, 9]), measureFor(geometry), params);
			const rings = planRings(chosen.geometry, params, [4, 12]);
			expect(rings).toHaveLength(2);
			expect(paging(12, rings[1].capacity).pages).toBe(size === MIN_DIAL_ITEM_SIZE ? 1 : 2);
			expect(rings[1].radius).toBeLessThanOrEqual(geometry.anchor.x - MARGIN - size / 2);
		}
	});

	it("pages a 12-item level in two on a 390px phone with the keyboard up at every size: the height limits the ring", () => {
		const geometry = phone(390, 844, "bottom-right", 300 + TOOLBAR, 47);
		for (let size = MIN_DIAL_ITEM_SIZE; size <= MAX_DIAL_ITEM_SIZE; size += 2) {
			const params = ringParamsFor(size);
			const chosen = chooseMode(naturalReach(params, [4, 5, 9]), measureFor(geometry), params);
			const rings = planRings(chosen.geometry, params, [4, 12]);
			expect(rings).toHaveLength(2);
			expect(paging(12, rings[1].capacity).pages).toBe(2);
		}
	});

	it("on an iPhone SE with the keyboard up, raises the pill; the Heading ring waits for the release, then opens in the root's place, paged", () => {
		const geometry = phone(375, 667, "bottom-right", 260 + TOOLBAR, 20);
		const chosen = chooseMode(DEFAULT_NEED, measureFor(geometry));
		expect(chosen.mode).toBe("raised");
		const onArm = planRings(chosen.geometry, DEFAULT_RING_PARAMS, [4, 5, 9]);
		expect(onArm.map((ring) => ring.radius)).toEqual([97, 151]);
		expect(fittingFrom(chosen.geometry, DEFAULT_RING_PARAMS, [4, 5, 9])).toBe(1);
		const onRelease = planRings(chosen.geometry, DEFAULT_RING_PARAMS, [5, 9]);
		expect(onRelease).toHaveLength(2);
		expect(paging(9, onRelease[1].capacity).pages).toBe(2);
	});

	it("on a small Android phone with the keyboard up, the Heading ring waits for the release and then stands alone, paged", () => {
		const geometry = phone(360, 640, "bottom-right", 250 + TOOLBAR, 24);
		const chosen = chooseMode(DEFAULT_NEED, measureFor(geometry));
		expect(chosen.mode).toBe("raised");
		expect(planRings(chosen.geometry, DEFAULT_RING_PARAMS, [4, 5, 9])).toHaveLength(2);
		expect(fittingFrom(chosen.geometry, DEFAULT_RING_PARAMS, [4, 5, 9])).toBe(2);
		expect(paging(9, planRings(chosen.geometry, DEFAULT_RING_PARAMS, [9])[0].capacity).pages).toBe(2);
	});

	it("mirrors the rings for the bottom-left corner", () => {
		const right = placed(phone(390, 844, "bottom-right"), DEFAULT_RING_PARAMS, [4, 8]);
		const left = placed(phone(390, 844, "bottom-left"), DEFAULT_RING_PARAMS, [4, 8]);
		right.points.forEach((p, i) => {
			expect(left.points[i].x).toBeCloseTo(390 - p.x, 6);
			expect(left.points[i].y).toBeCloseTo(p.y, 6);
		});
	});
});

describe("chooseMode", () => {
	it("keeps the pill in its place when the widest path fits under it", () => {
		expect(chooseMode(DEFAULT_NEED, measureFor(PHONE)).mode).toBe("normal");
	});

	it("raises the pill when the widest path needs the header's strip, even before that path opens", () => {
		const geometry = phone(375, 667, "bottom-right", 260 + TOOLBAR, 20);
		expect(chooseMode(naturalReach(DEFAULT_RING_PARAMS, [4]), measureFor(geometry)).mode).toBe("normal");
		expect(chooseMode(DEFAULT_NEED, measureFor(geometry)).mode).toBe("raised");
	});

	it("raises the pill for the room a whole Heading ring needs at 48px on a 390px phone with the keyboard up", () => {
		const geometry = phone(390, 844, "bottom-right", 300 + TOOLBAR, 47);
		const params = ringParamsFor(48);
		const chosen = chooseMode(naturalReach(params, [4, 5, 9]), measureFor(geometry), params);
		expect(chosen.mode).toBe("raised");
		expect(paging(9, planRings(chosen.geometry, params, [4, 5, 9])[2].capacity).pages).toBe(1);
	});

	it("keeps the pill in place when raising it would not reach farther, because the width is the limit", () => {
		const measured: DialLayoutMode[] = [];
		const geometry = phone(320, 568, "bottom-right", 0, 20);
		const params = ringParamsFor(MAX_DIAL_ITEM_SIZE);
		const chosen = chooseMode(
			naturalReach(params, [4, 5, 9]),
			(mode) => {
				measured.push(mode);
				return measureFor(geometry)(mode);
			},
			params,
		);
		expect(naturalReach(params, [4, 5, 9])).toBeGreaterThan(fanReach(geometry, params));
		expect(chosen.mode).toBe("normal");
		expect(measured).toEqual(["normal", "raised", "normal"]);
	});

	it("lets the rings reach up behind the pill only when not even the root ring fits under the raised pill", () => {
		const short: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 160 }, bounds: { left: 4, top: 130, right: 386, bottom: 196 } };
		expect(chooseMode(naturalReach(DEFAULT_RING_PARAMS, [4]), measureFor(short)).mode).toBe("overlap");
		expect(planRings(overlap(short), DEFAULT_RING_PARAMS, [4])).toHaveLength(1);
	});

	it("measures the chosen mode last, so the mode in effect is the one measured", () => {
		const measured: DialLayoutMode[] = [];
		const geometry = phone(375, 667, "bottom-right", 260 + TOOLBAR, 20);
		const chosen = chooseMode(DEFAULT_NEED, (mode) => {
			measured.push(mode);
			return measureFor(geometry)(mode);
		});
		expect(measured[measured.length - 1]).toBe(chosen.mode);
		expect(chosen.geometry).toEqual(raised(geometry));
	});
});

describe("naturalReach", () => {
	it("is where the outermost ring of a chain lands with no screen in the way", () => {
		expect(naturalReach(DEFAULT_RING_PARAMS, [4])).toBe(97);
		expect(naturalReach(DEFAULT_RING_PARAMS, [4, 5, 9])).toBe(256);
		expect(naturalReach(DEFAULT_RING_PARAMS, [4, 12])).toBeGreaterThan(324);
	});
});

describe("ringArcs", () => {
	const rings: DialRing[] = [
		{ radius: 97, capacity: 4 },
		{ radius: 151, capacity: 5 },
	];

	it("draws one arc per ring with two or more slots, from its first slot to its last, clockwise for the right corner", () => {
		const slots = [...ringSlots(0, 4, 4), ...ringSlots(1, 5, 3)];
		const arcs = ringArcs(PHONE, rings, slots);
		expect(arcs).toHaveLength(2);
		expect(arcs[0].radius).toBe(97);
		expect(arcs[0].from).toEqual(slotPosition(slots[0], PHONE, rings));
		expect(arcs[0].to).toEqual(slotPosition(slots[3], PHONE, rings));
		expect(arcs[1].from).toEqual(slotPosition(slots[4], PHONE, rings));
		expect(arcs[1].to).toEqual(slotPosition(slots[6], PHONE, rings));
		expect(arcs.every((arc) => arc.clockwise)).toBe(true);
	});

	it("runs counter-clockwise, mirrored, for the left corner and skips rings with one slot or none", () => {
		const left = phone(390, 844, "bottom-left");
		const slots = [...ringSlots(0, 4, 4), ...ringSlots(1, 5, 1)];
		const arcs = ringArcs(left, rings, slots);
		expect(arcs).toHaveLength(1);
		expect(arcs[0].clockwise).toBe(false);
	});
});

describe("paging", () => {
	it("is a single page when the level fits", () => {
		expect(paging(5, 5)).toEqual({ pages: 1, perPage: 5 });
		expect(paging(0, 5)).toEqual({ pages: 1, perPage: 0 });
	});

	it("gives up one slot per page to the More item when the level does not fit", () => {
		expect(paging(9, 7)).toEqual({ pages: 2, perPage: 6 });
		expect(paging(12, 4)).toEqual({ pages: 4, perPage: 3 });
	});

	it("has no pages at all when nothing fits", () => {
		expect(paging(3, 0)).toEqual({ pages: 0, perPage: 0 });
	});
});

describe("hitTest", () => {
	const rings = planRings(PHONE, DEFAULT_RING_PARAMS, [4, 5]);
	const slots = [...ringSlots(0, rings[0].capacity, 4), ...ringSlots(1, rings[1].capacity, 5)];
	const at = (slot: DialSlot) => slotPosition(slot, PHONE, rings);
	const { anchor } = PHONE;

	it("arms nothing inside the dead zone around the anchor", () => {
		expect(hitTest({ x: anchor.x - 20, y: anchor.y - 20 }, PHONE, rings, slots)).toBeNull();
	});

	it("arms the item whose centre the pointer is on", () => {
		slots.forEach((slot, index) => {
			expect(hitTest(at(slot), PHONE, rings, slots)).toBe(index);
		});
	});

	it("picks the ring by radial band and the slot by nearest angle", () => {
		const between = { x: anchor.x - 120 * Math.cos(Math.PI / 6), y: anchor.y - 120 * Math.sin(Math.PI / 6) };
		expect(hitTest(between, PHONE, rings, slots)).toBe(1);
		const outer = { x: anchor.x - 140 * Math.cos(Math.PI / 4), y: anchor.y - 140 * Math.sin(Math.PI / 4) };
		expect(hitTest(outer, PHONE, rings, slots)).toBe(4 + 2);
	});

	it("still arms the outer ring when the pointer overshoots it a little, but not by a lot", () => {
		const radius = rings[1].radius;
		expect(hitTest({ x: anchor.x - (radius + 30), y: anchor.y }, PHONE, rings, slots)).toBe(4);
		expect(hitTest({ x: anchor.x - (radius + 60), y: anchor.y }, PHONE, rings, slots)).toBeNull();
	});

	it("arms nothing far from the rings, so a tap elsewhere can cancel", () => {
		expect(hitTest({ x: 40, y: 200 }, PHONE, rings, slots)).toBeNull();
	});

	it("arms nothing when the pointer is far outside the sweep", () => {
		expect(hitTest({ x: anchor.x - 100, y: anchor.y + 60 }, PHONE, rings, slots)).toBeNull();
		expect(hitTest({ x: anchor.x + 60, y: anchor.y - 100 }, PHONE, rings, slots)).toBeNull();
	});

	it("ignores rings that hold no slots", () => {
		const inner = ringSlots(0, rings[0].capacity, 4);
		expect(hitTest({ x: anchor.x - rings[1].radius, y: anchor.y }, PHONE, rings, inner)).toBeNull();
		expect(hitTest({ x: anchor.x - rings[0].radius, y: anchor.y }, PHONE, rings, inner)).toBe(0);
	});

	it("works mirrored for the bottom-left corner", () => {
		const left = phone(390, 844, "bottom-left");
		const leftRings = planRings(left, DEFAULT_RING_PARAMS, [4]);
		const leftSlots = ringSlots(0, leftRings[0].capacity, 4);
		leftSlots.forEach((slot, index) => {
			expect(hitTest(slotPosition(slot, left, leftRings), left, leftRings, leftSlots)).toBe(index);
		});
		expect(hitTest({ x: left.anchor.x - 100, y: left.anchor.y }, left, leftRings, leftSlots)).toBeNull();
	});

	it("arms nothing when there are no slots", () => {
		expect(hitTest({ x: anchor.x - 100, y: anchor.y }, PHONE, rings, [])).toBeNull();
	});

	it("lets the end slots of a partly used ring own a little of the arc beside them, not all of it", () => {
		const partly = ringSlots(0, rings[0].capacity, 2);
		const radius = rings[0].radius;
		const atAngle = (deg: number) => ({ x: anchor.x - radius * Math.cos((deg * Math.PI) / 180), y: anchor.y - radius * Math.sin((deg * Math.PI) / 180) });
		expect(hitTest(atAngle(30), PHONE, rings, partly)).toBe(0);
		expect(hitTest(atAngle(10), PHONE, rings, partly)).toBe(0);
		expect(hitTest(atAngle(0), PHONE, rings, partly)).toBeNull();
	});

	it("arms nothing more than half a slot pitch past a lone item, so a tap on blank space inside the fan cancels", () => {
		const lone = ringSlots(1, rings[1].capacity, 1);
		const radius = rings[1].radius;
		const atAngle = (deg: number) => ({ x: anchor.x - radius * Math.cos((deg * Math.PI) / 180), y: anchor.y - radius * Math.sin((deg * Math.PI) / 180) });
		expect(hitTest(atAngle(45), PHONE, rings, lone)).toBe(0);
		expect(hitTest(atAngle(45 + 11.25 + 7.9), PHONE, rings, lone)).toBe(0);
		expect(hitTest(atAngle(45 + 11.25 + 9), PHONE, rings, lone)).toBeNull();
		expect(hitTest(atAngle(5), PHONE, rings, lone)).toBeNull();
	});

	it("on an inner ring only the circles arm, so the band between the rings is blank and a thumb heading outward swaps nothing", () => {
		const radius = rings[0].radius;
		const atAngle = (deg: number, distance: number) => ({ x: anchor.x - distance * Math.cos((deg * Math.PI) / 180), y: anchor.y - distance * Math.sin((deg * Math.PI) / 180) });
		// Window sits at 30 degrees on the root ring: inside its circle (plus a little slack) it arms; between Window and Zoom, past the circles' edge but still in the root ring's band, nothing does.
		expect(hitTest(atAngle(30, radius), PHONE, rings, slots)).toBe(1);
		expect(hitTest(atAngle(30, radius + 25), PHONE, rings, slots)).toBe(1);
		expect(hitTest(atAngle(44, radius + 20), PHONE, rings, slots)).toBeNull();
		expect(hitTest(atAngle(44, radius + 20), PHONE, rings, ringSlots(0, rings[0].capacity, 4))).toBe(1);
		// The same angle on the outermost ring's band arms by angle alone.
		expect(hitTest(atAngle(45, (rings[0].radius + rings[1].radius) / 2 + 1), PHONE, rings, slots)).toBe(4 + 2);
	});

	it("keeps the sticky slot's angular share on an inner ring, and only that slot's", () => {
		const radius = rings[0].radius;
		const atAngle = (deg: number, distance: number) => ({ x: anchor.x - distance * Math.cos((deg * Math.PI) / 180), y: anchor.y - distance * Math.sin((deg * Math.PI) / 180) });
		// 10 degrees off Window, 25px past its circle: nothing on its own, Window when Window is the slot already armed, still nothing when File is.
		expect(hitTest(atAngle(40, radius + 25), PHONE, rings, slots)).toBeNull();
		expect(hitTest(atAngle(40, radius + 25), PHONE, rings, slots, undefined, undefined, 1)).toBe(1);
		expect(hitTest(atAngle(40, radius + 25), PHONE, rings, slots, undefined, undefined, 0)).toBeNull();
		// Past the midpoint the outer ring's band takes over, sticky or not: the 45 degree slot of the five on the outer ring.
		expect(hitTest(atAngle(40, (rings[0].radius + rings[1].radius) / 2 + 1), PHONE, rings, slots, undefined, undefined, 1)).toBe(4 + 2);
	});

	it("arms an end item anywhere inside its own circle, even outside the sweep", () => {
		const end = at(slots[0]);
		expect(hitTest({ x: end.x, y: end.y + 20 }, PHONE, rings, slots)).toBe(0);
	});

	it("arms nothing between the anchor rim and the innermost ring's inner edge", () => {
		const radius = rings[0].radius;
		expect(hitTest({ x: anchor.x - (radius - 22 - 10), y: anchor.y }, PHONE, rings, slots)).toBeNull();
		expect(hitTest({ x: anchor.x - (radius - 22), y: anchor.y }, PHONE, rings, slots)).toBe(0);
	});
});
