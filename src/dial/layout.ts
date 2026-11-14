import type { DialCorner } from "../types";

/**
 * Pure geometry for the mobile dial: concentric quarter-rings around an anchor button pinned in
 * a bottom corner, one ring per open level of the keymap. The root's items sit on the innermost
 * ring; arming a group opens its items as the next ring out, so the rings a thumb sees are the
 * path it has taken, innermost first. Nothing here touches the DOM, so it is unit-tested
 * directly; the DOM layer only measures the anchor and the screen, then renders what this
 * returns.
 *
 * Coordinates are screen pixels with y growing downward. Angles are measured from the ray that
 * points horizontally into the screen (left for a bottom-right anchor, right for a bottom-left
 * one): 0 degrees is that horizontal ray and DIAL_SWEEP_DEG is straight up.
 */

export interface DialPoint {
	x: number;
	y: number;
}

export interface DialBounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface DialGeometry {
	corner: DialCorner;
	/** Centre of the anchor button. Must sit at least half an item inside `bounds`. */
	anchor: DialPoint;
	/** Every item must stay inside this rectangle: the screen less the breadcrumb pill and a margin. */
	bounds: DialBounds;
}

/**
 * Where the breadcrumb pill sits, which decides how much of the screen the rings may use:
 * `normal` keeps it below the view header; `raised` moves it up over the header to win back
 * that strip; `overlap` is the last resort for a screen so short that no ring fits under the
 * raised pill, and lets the rings reach up behind it.
 */
export type DialLayoutMode = "normal" | "raised" | "overlap";

export const DIAL_LAYOUT_MODES: readonly DialLayoutMode[] = ["normal", "raised", "overlap"];

export interface DialRingParams {
	/** Diameter of one item target. */
	itemSize: number;
	/** Edge-to-edge gap kept between neighbours on a ring. */
	gap: number;
	/** Edge-to-edge gap between a ring's items and the next ring's. */
	ringGap: number;
}

export interface DialRing {
	radius: number;
	/** How many items fit on this ring without two of them overlapping. */
	capacity: number;
}

export interface DialSlot {
	ring: number;
	/** Position along the ring, from the horizontal ray toward the vertical one. */
	index: number;
	angleDeg: number;
}

export interface DialPaging {
	pages: number;
	/** Real items shown per page; the dial adds a "More" slot after them when `pages > 1`. */
	perPage: number;
}

/** The fan spans one quarter turn: from pointing sideways into the screen to pointing straight up. */
export const DIAL_SWEEP_DEG = 90;

/** Half the anchor button (the stylesheet's --neokeys-dial-anchor-size), which the innermost ring keeps clear of. */
export const ANCHOR_RADIUS = 28;

/** Edge-to-edge gap between neighbours on a ring. */
export const ITEM_GAP = 6;

/** Edge-to-edge gap between one ring's items and the next ring's, and between the anchor and the first ring. */
export const RING_GAP = 10;

/**
 * The item diameters the settings offer. A circle shows only its item's key, so it can be
 * small: 44px is Obsidian's own touch size (--touch-size-m) and the default. A thumb hits a
 * whole slot (the ring's band by its share of the arc), which is larger than the circle.
 */
export const MIN_DIAL_ITEM_SIZE = 40;
export const MAX_DIAL_ITEM_SIZE = 56;
export const DEFAULT_DIAL_ITEM_SIZE = 44;

export function ringParamsFor(itemSize: number): DialRingParams {
	return { itemSize, gap: ITEM_GAP, ringGap: RING_GAP };
}

export const DEFAULT_RING_PARAMS: DialRingParams = ringParamsFor(DEFAULT_DIAL_ITEM_SIZE);

/** A pointer this close to the anchor centre arms nothing, so a resting thumb never selects. */
export const DEFAULT_DEAD_ZONE = 36;

/** Angular reach past a slot's own share of the ring, so a slot is not hard to hit without blank space beside it arming it. */
const HIT_ANGLE_SLACK_DEG = 8;

/** Radial reach inside the innermost ring's inner edge, and around an inner ring's circles; closer to the anchor than that arms nothing. */
const HIT_INNER_SLACK = 4;

function degToRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
	return (rad * 180) / Math.PI;
}

/**
 * How many items of `itemSize` fit on a quarter-ring of `radius` with at least `gap` between
 * neighbours. Items are placed inclusive of both end rays, so the chord between neighbours is
 * what limits the count; a ring too small for even two items still holds one.
 */
export function ringCapacity(radius: number, itemSize: number, gap: number): number {
	const spacing = itemSize + gap;
	if (2 * radius <= spacing) return 1;
	const minAngle = 2 * Math.asin(spacing / (2 * radius));
	return 1 + Math.floor(degToRad(DIAL_SWEEP_DEG) / minAngle + 1e-9);
}

/** Distance from the anchor centre to the far edge of the bounds, horizontally into the screen and straight up. */
export function fanRoom(geometry: DialGeometry): { horizontal: number; vertical: number } {
	const { corner, anchor, bounds } = geometry;
	const horizontal = corner === "bottom-right" ? anchor.x - bounds.left : bounds.right - anchor.x;
	const vertical = anchor.y - bounds.top;
	return { horizontal, vertical };
}

/** The largest radius a ring may have and keep its items inside the bounds, in whole pixels. */
export function fanReach(geometry: DialGeometry, params: DialRingParams): number {
	const room = fanRoom(geometry);
	return Math.floor(Math.min(room.horizontal, room.vertical) - params.itemSize / 2);
}

/** The radius of the innermost ring: one ring gap and half an item outside the anchor's rim. */
export function firstRadius(params: DialRingParams): number {
	return ANCHOR_RADIUS + params.ringGap + params.itemSize / 2;
}

/** How much farther out each ring sits than the one inside it, at the least. */
export function ringStep(params: DialRingParams): number {
	return params.itemSize + params.ringGap;
}

/** The smallest radius at or beyond `from` whose quarter-ring holds `count` items. */
export function radiusFor(count: number, params: DialRingParams, from: number): number {
	let radius = Math.ceil(from);
	while (ringCapacity(radius, params.itemSize, params.gap) < count) radius++;
	return radius;
}

/**
 * One ring per level, innermost first, for levels of `counts` items. A ring is the smallest
 * that holds its level, at least one item and one ring gap outside the ring it opens from,
 * capped at the reach of the bounds (a level that needs more than that pages on the ring it
 * gets). A ring's radius depends only on the rings inside it and its own count, never on what
 * opens outside it, so a ring never moves when a deeper level opens. The rings stop at the
 * first level whose ring would not fit at all, so the result may be shorter than `counts`; a
 * screen that cannot hold even one ring gets none.
 */
export function planRings(geometry: DialGeometry, params: DialRingParams, counts: readonly number[]): DialRing[] {
	const reach = fanReach(geometry, params);
	const step = ringStep(params);
	const rings: DialRing[] = [];
	for (const count of counts) {
		const previous = rings[rings.length - 1];
		const min = previous ? previous.radius + step : firstRadius(params);
		if (min > reach) break;
		const radius = Math.min(reach, radiusFor(count, params, min));
		rings.push({ radius, capacity: ringCapacity(radius, params.itemSize, params.gap) });
	}
	return rings;
}

/**
 * The first level of `counts` to draw so that every level from it on gets a ring: 0 when the
 * whole chain fits, more when the screen is too short for it (the innermost levels give up their
 * rings first; they stay open and in the breadcrumb, just not on screen), `counts.length` when
 * not even the last level alone fits.
 */
export function fittingFrom(geometry: DialGeometry, params: DialRingParams, counts: readonly number[]): number {
	for (let from = 0; from < counts.length; from++) {
		if (planRings(geometry, params, counts.slice(from)).length === counts.length - from) return from;
	}
	return counts.length;
}

/**
 * Angle of slot `index` among `used` slots on a ring that holds `capacity`. Slots keep the pitch
 * of a full ring (the sweep divided into `capacity - 1` steps, end rays included), so a ring that
 * is only partly used shows a shorter arc of evenly spaced items centred on the sweep rather
 * than items strewn across it; a lone slot sits mid-sweep.
 */
export function slotAngle(index: number, used: number, capacity: number): number {
	if (used <= 1 || capacity <= 1) return DIAL_SWEEP_DEG / 2;
	const pitch = DIAL_SWEEP_DEG / (capacity - 1);
	const start = (DIAL_SWEEP_DEG - pitch * (used - 1)) / 2;
	return start + index * pitch;
}

/** The slots for `used` items on ring `ring`, which holds `capacity`, in order along the sweep. */
export function ringSlots(ring: number, capacity: number, used: number): DialSlot[] {
	const slots: DialSlot[] = [];
	for (let index = 0; index < used; index++) {
		slots.push({ ring, index, angleDeg: slotAngle(index, used, capacity) });
	}
	return slots;
}

/** Screen position of a slot's centre. */
export function slotPosition(slot: DialSlot, geometry: DialGeometry, rings: readonly DialRing[]): DialPoint {
	const radius = rings[slot.ring].radius;
	const angle = degToRad(slot.angleDeg);
	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	return {
		x: geometry.anchor.x + sideways * radius * Math.cos(angle),
		y: geometry.anchor.y - radius * Math.sin(angle),
	};
}

export interface DialArc {
	radius: number;
	from: DialPoint;
	to: DialPoint;
	/** The arc runs clockwise on screen from `from` to `to` for a bottom-right anchor (left ray toward straight up), counter-clockwise mirrored. */
	clockwise: boolean;
}

/**
 * One guide arc per ring that holds two or more slots, through their centres from the first slot
 * to the last, so the renderer can draw the ring the items sit on: hidden behind the items
 * themselves, it shows only between them. A lone item gets no arc.
 */
export function ringArcs(geometry: DialGeometry, rings: readonly DialRing[], slots: readonly DialSlot[]): DialArc[] {
	const arcs: DialArc[] = [];
	rings.forEach((ring, index) => {
		const own = slots.filter((slot) => slot.ring === index);
		if (own.length < 2) return;
		const first = own.reduce((a, b) => (b.angleDeg < a.angleDeg ? b : a));
		const last = own.reduce((a, b) => (b.angleDeg > a.angleDeg ? b : a));
		arcs.push({
			radius: ring.radius,
			from: slotPosition(first, geometry, rings),
			to: slotPosition(last, geometry, rings),
			clockwise: geometry.corner === "bottom-right",
		});
	});
	return arcs;
}

/**
 * How a level of `count` items splits across pages of a ring that holds `capacity` at once. A
 * level that fits is a single page; otherwise each page gives up one slot to a "More" item that
 * turns to the next page, so every page keeps the same shape.
 */
export function paging(count: number, capacity: number): DialPaging {
	if (capacity <= 0) return { pages: 0, perPage: 0 };
	if (count <= capacity) return { pages: 1, perPage: count };
	const perPage = Math.max(1, capacity - 1);
	return { pages: Math.ceil(count / perPage), perPage };
}

/**
 * Which slot a pointer at `point` arms, or null when it arms nothing. The pointer picks a ring by
 * radial distance (bands meet halfway between neighbouring rings, the outermost band reaches
 * `itemSize` past the outermost ring so a slight overshoot still counts, and the innermost band
 * starts just inside that ring's inner edge). On the outermost ring, the ring in play, it then
 * arms the slot nearest in angle, as long as the pointer is within half a slot pitch plus a
 * little slack of that slot, or anywhere inside that slot's own item circle, so a drag is
 * forgiving but blank space past the end of a short arc, or far from a lone item, arms nothing.
 * On an inner ring only the circles themselves arm, so a thumb crossing that ring's band on its
 * way out to the next ring does not swap the rings outside it unless it actually touches a
 * sibling. Only rings that hold a slot take part; beyond the reach, outside the sweep, or inside
 * the dead zone around the anchor, nothing is armed, which is what lets a tap elsewhere on the
 * screen cancel.
 */
export function hitTest(
	point: DialPoint,
	geometry: DialGeometry,
	rings: readonly DialRing[],
	slots: readonly DialSlot[],
	deadZone: number = DEFAULT_DEAD_ZONE,
	itemSize: number = DEFAULT_RING_PARAMS.itemSize,
): number | null {
	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	const u = (point.x - geometry.anchor.x) * sideways;
	const v = geometry.anchor.y - point.y;
	const distance = Math.hypot(u, v);
	if (distance < deadZone) return null;

	const usedRings = [...new Set(slots.map((slot) => slot.ring))].sort((a, b) => a - b);
	if (usedRings.length === 0) return null;

	const outermost = usedRings[usedRings.length - 1];
	if (distance > rings[outermost].radius + itemSize) return null;
	const innermost = usedRings[0];
	if (distance < rings[innermost].radius - itemSize / 2 - HIT_INNER_SLACK) return null;

	let ring = outermost;
	for (let i = 0; i < usedRings.length - 1; i++) {
		const boundary = (rings[usedRings[i]].radius + rings[usedRings[i + 1]].radius) / 2;
		if (distance < boundary) {
			ring = usedRings[i];
			break;
		}
	}

	const radius = rings[ring].radius;
	const circle = ring === outermost ? itemSize / 2 : itemSize / 2 + HIT_INNER_SLACK;
	const inside = slots.findIndex((slot) => {
		if (slot.ring !== ring) return false;
		const slotAngleRad = degToRad(slot.angleDeg);
		return Math.hypot(u - radius * Math.cos(slotAngleRad), v - radius * Math.sin(slotAngleRad)) <= circle;
	});
	if (inside !== -1) return inside;
	if (ring !== outermost) return null;

	const angle = radToDeg(Math.atan2(v, u));
	if (angle < -HIT_ANGLE_SLACK_DEG || angle > DIAL_SWEEP_DEG + HIT_ANGLE_SLACK_DEG) return null;
	const capacity = rings[ring].capacity;
	const pitch = capacity > 1 ? DIAL_SWEEP_DEG / (capacity - 1) : DIAL_SWEEP_DEG;
	let best: number | null = null;
	let bestDelta = pitch / 2 + HIT_ANGLE_SLACK_DEG;
	slots.forEach((slot, index) => {
		if (slot.ring !== ring) return;
		const delta = Math.abs(angle - slot.angleDeg);
		if (delta <= bestDelta) {
			bestDelta = delta;
			best = index;
		}
	});
	return best;
}

/** The radius the outermost ring of a chain of levels of `counts` items would naturally take, unbounded by any screen. */
export function naturalReach(params: DialRingParams, counts: readonly number[]): number {
	let radius = 0;
	counts.forEach((count, index) => {
		radius = radiusFor(count, params, index === 0 ? firstRadius(params) : radius + ringStep(params));
	});
	return radius;
}

/**
 * The pill mode for one opening of the dial, chosen once so that nothing moves under a finger
 * while rings open: the normal placement when its reach covers `need` (the radius the deepest
 * or widest path in the keymap would naturally take); else the raised pill, which wins back the
 * header's strip, when that actually reaches farther (it does not when the width is the limit)
 * and at least the first ring fits under it; else the normal placement if the first ring fits
 * there; else the overlap placement, so a short screen still gets whatever ring it can. The
 * chosen mode is measured last, so it is the one in effect.
 */
export function chooseMode(
	need: number,
	measure: (mode: DialLayoutMode) => DialGeometry,
	params: DialRingParams = DEFAULT_RING_PARAMS,
): { mode: DialLayoutMode; geometry: DialGeometry } {
	const first = firstRadius(params);
	const normal = measure("normal");
	const normalReach = fanReach(normal, params);
	if (need <= normalReach) return { mode: "normal", geometry: normal };
	const raised = measure("raised");
	const raisedReach = fanReach(raised, params);
	if (raisedReach > normalReach && raisedReach >= first) return { mode: "raised", geometry: raised };
	if (normalReach >= first) return { mode: "normal", geometry: measure("normal") };
	return { mode: "overlap", geometry: measure("overlap") };
}
