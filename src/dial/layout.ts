import type { DialCorner } from "../types";

/**
 * Pure geometry for the mobile dial: items sit on concentric quarter-rings around an anchor
 * button pinned in a bottom corner, inner rings filled first, every ring one item plus one gap
 * farther out than the one inside it, so the bands are evenly spaced and each holds more than
 * the last. Nothing here touches the DOM, so it is unit-tested directly; the DOM layer only
 * measures the anchor and the screen, then renders what this returns.
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

export interface DialRingParams {
	/** Diameter of one item target. */
	itemSize: number;
	/** Edge-to-edge gap: the minimum between neighbours on a ring, and exactly the gap between rings. */
	gap: number;
	/** Radius of the innermost ring, anchor centre to item centre. */
	firstRadius: number;
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

export interface DialLayout {
	mode: DialLayoutMode;
	geometry: DialGeometry;
	params: DialRingParams;
	rings: DialRing[];
}

/** The fan spans one quarter turn: from pointing sideways into the screen to pointing straight up. */
export const DIAL_SWEEP_DEG = 90;

/** Thumb-sized targets: Obsidian's own --touch-size-m. */
export const MIN_ITEM_SIZE = 44;

/**
 * Comfortable spacing, used whenever the screen has room for it. 60px holds a key chip and three
 * short lines of label; with a 6px gap the first ring at 88px still takes three items, so a
 * 390px phone with its keyboard up keeps 3 + 4 + 6 = 13 targets, one more than the default
 * keymap's Window group.
 */
export const DEFAULT_RING_PARAMS: DialRingParams = {
	itemSize: 60,
	gap: 6,
	firstRadius: 88,
};

/** Tighter spacing at the minimum thumb size, tried when the default layout cannot hold a level. */
export const COMPACT_RING_PARAMS: DialRingParams = {
	itemSize: MIN_ITEM_SIZE,
	gap: 6,
	firstRadius: 74,
};

/** A pointer this close to the anchor centre arms nothing, so a resting thumb never selects. */
export const DEFAULT_DEAD_ZONE = 36;

/** Angular reach past a slot's own share of the ring, so a slot is not hard to hit without blank space beside it arming it. */
const HIT_ANGLE_SLACK_DEG = 8;

/** Radial reach inside the innermost ring's inner edge; closer to the anchor than that arms nothing. */
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

/**
 * Every ring that fits inside the bounds, innermost first. A ring fits when its farthest item
 * edge stays inside the bounds both sideways and upward; rings are one item plus one gap apart.
 */
export function computeRings(geometry: DialGeometry, params: DialRingParams): DialRing[] {
	const room = fanRoom(geometry);
	const limit = Math.min(room.horizontal, room.vertical);
	const rings: DialRing[] = [];
	for (let radius = params.firstRadius; radius + params.itemSize / 2 <= limit; radius += params.itemSize + params.gap) {
		rings.push({ radius, capacity: ringCapacity(radius, params.itemSize, params.gap) });
	}
	return rings;
}

export function totalCapacity(rings: DialRing[]): number {
	return rings.reduce((sum, ring) => sum + ring.capacity, 0);
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

/**
 * Lay out `count` items over the rings, filling the innermost ring to capacity before starting
 * the next. Returns fewer slots than `count` when the rings cannot hold them all; see `paging`.
 */
export function placeSlots(rings: DialRing[], count: number): DialSlot[] {
	const slots: DialSlot[] = [];
	let remaining = count;
	for (let ring = 0; ring < rings.length && remaining > 0; ring++) {
		const n = Math.min(rings[ring].capacity, remaining);
		for (let index = 0; index < n; index++) {
			slots.push({ ring, index, angleDeg: slotAngle(index, n, rings[ring].capacity) });
		}
		remaining -= n;
	}
	return slots;
}

/** Screen position of a slot's centre. */
export function slotPosition(slot: DialSlot, geometry: DialGeometry, rings: DialRing[]): DialPoint {
	const radius = rings[slot.ring].radius;
	const angle = degToRad(slot.angleDeg);
	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	return {
		x: geometry.anchor.x + sideways * radius * Math.cos(angle),
		y: geometry.anchor.y - radius * Math.sin(angle),
	};
}

/**
 * How a level of `count` items splits across pages of a dial that holds `capacity` at once. A level
 * that fits is a single page; otherwise each page gives up one slot to a "More" item that turns
 * to the next page, so every page keeps the same shape.
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
 * `outerReach` past the outermost ring so a slight overshoot still counts, and the innermost
 * band starts just inside that ring's inner edge), then the slot on that ring nearest in angle,
 * as long as the pointer is within half a slot pitch plus a little slack of that slot, or anywhere
 * inside that slot's own item circle (`outerReach` is the item size). Between
 * two neighbours the band is still split at the midpoint, so a drag is as forgiving as before,
 * but blank space past the end of a short arc, or far from a lone item, arms nothing. Only rings
 * that actually hold a slot take part, so a half-empty dial stays as forgiving as a full one;
 * beyond the reach, outside the sweep, or inside the dead zone around the anchor, nothing is
 * armed, which is what lets a tap elsewhere on the screen cancel.
 */
export function hitTest(
	point: DialPoint,
	geometry: DialGeometry,
	rings: DialRing[],
	slots: DialSlot[],
	deadZone: number = DEFAULT_DEAD_ZONE,
	outerReach: number = DEFAULT_RING_PARAMS.itemSize,
): number | null {
	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	const u = (point.x - geometry.anchor.x) * sideways;
	const v = geometry.anchor.y - point.y;
	const distance = Math.hypot(u, v);
	if (distance < deadZone) return null;

	const usedRings = [...new Set(slots.map((slot) => slot.ring))].sort((a, b) => a - b);
	if (usedRings.length === 0) return null;

	const outermost = usedRings[usedRings.length - 1];
	if (distance > rings[outermost].radius + outerReach) return null;
	const innermost = usedRings[0];
	if (distance < rings[innermost].radius - outerReach / 2 - HIT_INNER_SLACK) return null;

	let ring = outermost;
	for (let i = 0; i < usedRings.length - 1; i++) {
		const boundary = (rings[usedRings[i]].radius + rings[usedRings[i + 1]].radius) / 2;
		if (distance < boundary) {
			ring = usedRings[i];
			break;
		}
	}

	const radius = rings[ring].radius;
	const inside = slots.findIndex((slot) => {
		if (slot.ring !== ring) return false;
		const slotAngleRad = degToRad(slot.angleDeg);
		return Math.hypot(u - radius * Math.cos(slotAngleRad), v - radius * Math.sin(slotAngleRad)) <= outerReach / 2;
	});
	if (inside !== -1) return inside;

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

/**
 * The ring parameters to use for a level of `count` items: the comfortable default unless it
 * would need paging and the compact spacing would not, in which case compact wins; when both
 * need paging, whichever holds more per page (the default on a tie).
 */
export function chooseRingParams(geometry: DialGeometry, count: number): DialRingParams {
	const defaultCapacity = totalCapacity(computeRings(geometry, DEFAULT_RING_PARAMS));
	if (defaultCapacity >= count) return DEFAULT_RING_PARAMS;
	const compactCapacity = totalCapacity(computeRings(geometry, COMPACT_RING_PARAMS));
	return compactCapacity > defaultCapacity ? COMPACT_RING_PARAMS : DEFAULT_RING_PARAMS;
}

/**
 * The layout for a level of `count` items, given a way to measure the screen in each pill mode.
 * Normal placement wins whenever it holds the whole level; otherwise the raised pill is tried and
 * kept if it holds more; and if even that leaves no ring at all, the rings may overlap the pill.
 */
export function chooseLayout(count: number, measure: (mode: DialLayoutMode) => DialGeometry): DialLayout {
	const layoutFor = (mode: DialLayoutMode): DialLayout => {
		const geometry = measure(mode);
		const params = chooseRingParams(geometry, count);
		return { mode, geometry, params, rings: computeRings(geometry, params) };
	};
	let best = layoutFor("normal");
	if (totalCapacity(best.rings) < count) {
		const raised = layoutFor("raised");
		if (totalCapacity(raised.rings) > totalCapacity(best.rings)) best = raised;
	}
	if (best.rings.length === 0) best = layoutFor("overlap");
	return best;
}
