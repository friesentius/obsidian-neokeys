import type { DialCorner, DialRadiusRule } from "../types";

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

/** How the rings are laid out, from the settings: the circle size, the gaps, the lens peak and the radius rule. */
export interface DialRingParams {
	/** Diameter of one item circle at rest. */
	itemSize: number;
	/** Edge-to-edge gap kept between neighbours on a ring that fits them at full size. */
	gap: number;
	/** Edge-to-edge gap between a ring's items and the next ring's. */
	ringGap: number;
	/** How large the circle under the finger grows, as a multiple of `itemSize` (the lens peak). */
	peak: number;
	/** Where the rings sit: at fixed radii, or each as far out as its level needs. */
	rule: DialRadiusRule;
}

export interface DialRing {
	radius: number;
	/** How many items fit on this ring at full size without two of them overlapping. */
	capacity: number;
}

export interface DialSlot {
	ring: number;
	/** Position along the ring, from the horizontal ray toward the vertical one. */
	index: number;
	angleDeg: number;
	/** The circle's diameter as drawn: the item size, less on a crowded ring, more inside the lens. */
	size: number;
	/** Radial offset from the ring, for beads that zigzag so as not to overlap. */
	offset: number;
	/** How far inside the lens the slot is: 1 right under the finger, 0 outside it. */
	weight: number;
	/** A shrunk circle outside the lens on a crowded ring, which a tap brings into the lens rather than selecting. */
	bead: boolean;
}

/** The fan spans one quarter turn: from pointing sideways into the screen to pointing straight up. */
export const DIAL_SWEEP_DEG = 90;

/** Half the anchor button (the stylesheet's --neokeys-dial-anchor-size), which the innermost ring keeps clear of. */
export const ANCHOR_RADIUS = 28;

/** Edge-to-edge gap between neighbours on a ring that fits them at full size. */
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

/**
 * The lens peak the settings offer: how large the circle under the finger grows, as a multiple
 * of the item size. At 1 a ring that fits its level does not grow at all (only shrunk beads
 * grow, back to the item size); at 1.5 the circle under the finger is half as large again.
 */
export const MIN_LENS_PEAK = 1;
export const MAX_LENS_PEAK = 1.5;
export const DEFAULT_LENS_PEAK = 1.5;
export const LENS_PEAK_STEP = 0.05;

export const DEFAULT_RADIUS_RULE: DialRadiusRule = "fixed";

/** How many items the innermost ring holds at full size under the fixed rule: the default keymap's root. */
export const FIXED_FIRST_HOLDS = 4;

/** How far the lens reaches, in items: the circle under the finger grows fully, its neighbours by half that, the next ones not at all. */
export const LENS_WIDTH = 1.5;

/** Edge-to-edge gap kept between two circles that are both inside the lens. */
const LENS_GAP = 4;

/** The smallest a circle shrinks to on a ring that cannot hold its level at full size. */
export const BEAD_FLOOR = 14;

/** Edge-to-edge gap between beads on a crowded ring; beads that would still overlap zigzag radially instead. */
const BEAD_GAP = 2;

/** A tap on a circle smaller than this brings it into the lens first; a larger circle is selected by the tap itself. */
export const TAP_FOCUS_BELOW = 32;

/** How far past an end of the sweep a crowded ring's arc may be pushed so the circle under the finger stays under it. */
const END_SLACK_DEG = 4;

/** The least two beads the finger has passed are apart when they pile up toward an end of the sweep: a fanned hand, not one bead on top of another. */
const PILE_GAP_DEG = 1.5;

export function ringParamsFor(itemSize: number, options: Partial<Pick<DialRingParams, "peak" | "rule">> = {}): DialRingParams {
	return { itemSize, gap: ITEM_GAP, ringGap: RING_GAP, peak: options.peak ?? DEFAULT_LENS_PEAK, rule: options.rule ?? DEFAULT_RADIUS_RULE };
}

export const DEFAULT_RING_PARAMS: DialRingParams = ringParamsFor(DEFAULT_DIAL_ITEM_SIZE);

/** A pointer this close to the anchor centre arms nothing, so a resting thumb never selects. */
export const DEFAULT_DEAD_ZONE = 36;

/** Angular reach past an end slot's own share of the ring, so it is not hard to hit without blank space beside it arming it. */
const HIT_ANGLE_SLACK_DEG = 8;

/** Radial reach inside the innermost ring's inner edge (closer to the anchor than that arms nothing), and around an inner ring's circles. */
const HIT_INNER_SLACK = 4;

function degToRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
	return (rad * 180) / Math.PI;
}

function clamp(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value));
}

/** The straight-line distance between two points `angleDeg` apart on a ring of `radius`. */
function chord(radius: number, angleDeg: number): number {
	return 2 * radius * Math.sin(degToRad(angleDeg) / 2);
}

/** The angle two points on a ring of `radius` must be apart for their chord to be `distance`, or the whole sweep when the ring is too small. */
function angleForChord(radius: number, distance: number): number {
	if (2 * radius <= distance) return DIAL_SWEEP_DEG;
	return radToDeg(2 * Math.asin(distance / (2 * radius)));
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
 * The room at the two ends of the sweep: from the anchor centre down to the bottom bound (an
 * item at 0 degrees sits level with the anchor) and sideways to the corner's own edge (an item
 * at 90 degrees sits straight above it). A circle at either end can be no larger than twice this.
 */
export function edgeRoom(geometry: DialGeometry): number {
	const { corner, anchor, bounds } = geometry;
	const sideways = corner === "bottom-right" ? bounds.right - anchor.x : anchor.x - bounds.left;
	return Math.max(0, Math.min(bounds.bottom - anchor.y, sideways));
}

/** The diameter the circle under the finger grows to: the peak from the settings, capped so a circle at either end of the sweep stays inside the bounds. */
export function peakSize(geometry: DialGeometry, params: DialRingParams): number {
	return Math.max(params.itemSize, Math.min(params.itemSize * params.peak, 2 * edgeRoom(geometry)));
}

/** The largest radius a ring may have and keep its items inside the bounds even when grown by the lens, in whole pixels. */
export function fanReach(geometry: DialGeometry, params: DialRingParams): number {
	const room = fanRoom(geometry);
	return Math.floor(Math.min(room.horizontal, room.vertical) - peakSize(geometry, params) / 2);
}

/** The radius of the innermost ring under the fit rule: one ring gap and half an item outside the anchor's rim. */
export function firstRadius(params: DialRingParams): number {
	return ANCHOR_RADIUS + params.ringGap + params.itemSize / 2;
}

/** How much farther out each ring sits than the one inside it, at the least. */
export function ringStep(params: DialRingParams): number {
	return params.itemSize + params.ringGap;
}

/** The smallest radius at or beyond `from` whose quarter-ring holds `count` items at full size. */
export function radiusFor(count: number, params: DialRingParams, from: number): number {
	let radius = Math.ceil(from);
	while (ringCapacity(radius, params.itemSize, params.gap) < count) radius++;
	return radius;
}

/** The radius of the innermost ring under the fixed rule: where a root of FIXED_FIRST_HOLDS items fits at full size (97px at 44px). */
export function fixedFirstRadius(params: DialRingParams): number {
	return radiusFor(FIXED_FIRST_HOLDS, params, firstRadius(params));
}

/**
 * One ring per level, innermost first, for levels of `counts` items. Under the fixed rule every
 * ring sits at a fixed radius whatever its level holds: the innermost where a four-item root
 * fits, each next one a step farther out. Under the fit rule a ring is the smallest that holds
 * its level at full size, at least one step outside the ring it opens from, capped at the reach
 * of the bounds. Either way a level with more items than its ring holds shrinks its circles to
 * fit (see `lensLayout`), and a ring's radius depends only on the rings inside it and its own
 * count, never on what opens outside it, so a ring never moves when a deeper level opens. The
 * rings stop at the first level whose ring would not fit at all, so the result may be shorter
 * than `counts`; a screen that cannot hold even one ring gets none.
 */
export function planRings(geometry: DialGeometry, params: DialRingParams, counts: readonly number[]): DialRing[] {
	const reach = fanReach(geometry, params);
	const step = ringStep(params);
	const rings: DialRing[] = [];
	for (const count of counts) {
		const previous = rings[rings.length - 1];
		const min = previous ? previous.radius + step : params.rule === "fixed" ? fixedFirstRadius(params) : firstRadius(params);
		if (min > reach) break;
		const radius = params.rule === "fixed" ? min : Math.min(reach, radiusFor(count, params, min));
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

/** The angular pitch of a ring's slots at rest: a full ring's pitch, or the whole sweep shared out when the level overflows the ring. */
export function ringPitch(count: number, capacity: number): number {
	if (count > capacity) return DIAL_SWEEP_DEG / Math.max(1, count - 1);
	return capacity > 1 ? DIAL_SWEEP_DEG / (capacity - 1) : DIAL_SWEEP_DEG;
}

export interface LensLayout {
	angles: number[];
	sizes: number[];
	/** How far inside the lens each item is, 0 to 1. */
	weights: number[];
	/** Radial offsets: beads that would overlap zigzag in and out of the ring. */
	offsets: number[];
	/** The level does not fit its ring at full size, so its circles are shrunk and spread over the whole sweep. */
	crowded: boolean;
	/** The diameter of a circle outside the lens. */
	base: number;
}

/**
 * Where a level of `count` items sits on a ring of `radius` that holds `capacity` at full size,
 * and how large each circle is, with the finger at `focus` along the sweep (0 at the horizontal
 * ray, 1 straight up; null while no finger has been on the ring).
 *
 * At rest a ring that fits its level keeps the full-size circles at their slot angles; a crowded
 * ring spreads its level evenly over the whole sweep with circles shrunk to the chord between
 * neighbours (never below BEAD_FLOOR), zigzagging radially when they would still overlap.
 *
 * With a finger on the ring, the circle nearest it and its neighbours (LENS_WIDTH items either
 * way) grow toward `peak`, and the gaps next to the grown circles open just enough for them to
 * sit side by side. On a ring that fits, the other gaps keep their pitch and the whole arc shifts
 * only as far as the sweep's ends allow, so the item under the finger stays where it was; when
 * the grown circles need more than the sweep has (a full innermost ring), every gap gives a
 * little and the grown circle, drawn on top, covers its neighbours' edges rather than growing
 * less. On a crowded ring the circle under the finger stays exactly under it and the other
 * gaps give way so the arc stays the sweep: the beads between the lens and the nearer end pile
 * up two deep when there is no room for them, and only when the lens itself would leave the
 * sweep (past END_SLACK_DEG, and never with the end circle outside `edgeRoom` of the anchor)
 * does it grow less.
 */
export function lensLayout(count: number, capacity: number, radius: number, params: DialRingParams, peak: number, focus: number | null, edgeRoom = Number.POSITIVE_INFINITY): LensLayout {
	const full = params.itemSize;
	const crowded = count > capacity;
	const pitch = ringPitch(count, capacity);
	const restAngle = (index: number): number => (crowded ? pitch * index : slotAngle(index, count, capacity));
	const base = crowded ? clamp(chord(radius, pitch) - BEAD_GAP, BEAD_FLOOR, full) : full;
	/** How far a bead may step off its ring: it stays inside its ring's half of the step to the next ring, and inside what the lens may reach. */
	const band = Math.min(ringStep(params) / 2, peak / 2);
	if (focus === null || count <= 1) {
		const angles = Array.from({ length: count }, (_, i) => restAngle(i));
		const sizes = angles.map(() => base);
		const weights = angles.map(() => 0);
		return { angles, sizes, weights, offsets: crowded ? zigzag(radius, angles, sizes, weights, band) : angles.map(() => 0), crowded, base };
	}

	const theta = clamp(focus, 0, 1) * DIAL_SWEEP_DEG;
	const position = (theta - restAngle(0)) / pitch;
	const weights = Array.from({ length: count }, (_, i) => Math.max(0, 1 - Math.abs(i - position) / LENS_WIDTH));
	const sizesAt = (growth: number): number[] => weights.map((weight) => base + (peak - base) * weight * growth);
	const sideBySide = (sizes: number[], gap: number): number => angleForChord(radius, (sizes[gap] + sizes[gap + 1]) / 2 + LENS_GAP);
	const f = clamp(position, 0, count - 1);
	let sizes: number[];
	let gaps: number[];
	let start: number;
	if (crowded) {
		// The gaps either side of the circle under the finger, and any gap beside a circle grown
		// at least halfway, are what the two circles need side by side, and the finger keeps its
		// place in the gap it is in. A gap at the lens's edge, beside a circle grown less, holds
		// only that much of its room and shares the rest like the gaps outside the lens, so a
		// bead eases out of the pile as the lens reaches it and back in as it leaves. The beads
		// outside the lens share what is left of the sweep: those before the finger get the room
		// that puts the arc's first bead at the sweep's start, those after the room that puts its
		// last at the end. Toward an end of the sweep the beads on that side pile up like a fanned
		// hand of cards (the zigzag keeps them two deep); when even the pile would not fit, the
		// lens's edge on that side slips under the circles it grew, then the circle beside the
		// finger's under the finger's own; and only then does the whole arc shift over the
		// finger's place in its gap. The lens itself never grows less.
		sizes = sizesAt(1);
		const whole = Math.floor(f);
		const fraction = f - whole;
		const nearest = fraction <= 0.5 ? whole : Math.min(whole + 1, count - 1);
		const core = (gap: number): boolean => gap === whole || gap === nearest - 1 || gap === nearest;
		const hold = Array.from({ length: count - 1 }, (_, gap) => (core(gap) ? 1 : clamp(2 * Math.max(weights[gap], weights[gap + 1]), 0, 1)));
		const need = hold.map((share, gap) => share * sideBySide(sizes, gap));
		const sum = (values: readonly number[], from: number, to: number): number => values.slice(from, to).reduce((total, value) => total + value, 0);
		const straddle = whole < count - 1 ? need[whole] : 0;
		const restBefore = sum(hold.map((share) => 1 - share), 0, whole);
		const restAfter = sum(hold.map((share) => 1 - share), whole + 1, count - 1);
		// The gap between the circle under the finger and its neighbour away from the finger's gap, on whichever side it lies.
		const coreBefore = nearest === whole && whole > 0 ? need[whole - 1] : 0;
		const coreAfter = nearest === whole + 1 && whole + 1 < count - 1 ? need[whole + 1] : 0;
		const edgeBefore = sum(need, 0, whole) - coreBefore;
		const edgeAfter = sum(need, whole + 1, count - 1) - coreAfter;
		// How far past an end the arc may go: the end circle, even stepped out by the zigzag as far as a bead outside the lens may be, stays inside the room beside the anchor.
		const slack = (index: number): number => {
			const excursion = sizes[index] / 2 + ((1 - weights[index]) * sizes[index]) / 2 + BEAD_GAP / 2;
			return Math.min(END_SLACK_DEG, radToDeg(Math.asin(clamp((edgeRoom - excursion) / radius, 0, 1))));
		};
		const low = -slack(0);
		const high = DIAL_SWEEP_DEG + slack(count - 1);
		/** What a side gives when `room` is less than its held gaps need: the lens's edge first, then the core, and how far it is still short. */
		const give = (room: number, edge: number, coreNeed: number): { edge: number; core: number; short: number } => {
			if (edge + coreNeed <= room) return { edge: 1, core: 1, short: 0 };
			const edgeScale = edge > 0 ? clamp((room - coreNeed) / edge, 0, 1) : 1;
			if (coreNeed <= room) return { edge: edgeScale, core: 1, short: 0 };
			return { edge: edgeScale, core: coreNeed > 0 ? clamp(room / coreNeed, 0, 1) : 1, short: Math.max(0, -room) };
		};
		let under = theta - straddle * fraction;
		let scaleBefore = { edge: 1, core: 1 };
		const pressBefore = (): void => {
			const gave = give(under - low - PILE_GAP_DEG * restBefore, edgeBefore, coreBefore);
			scaleBefore = gave;
			under += gave.short;
		};
		pressBefore();
		const scaleAfter = give(high - under - straddle - PILE_GAP_DEG * restAfter, edgeAfter, coreAfter);
		if (scaleAfter.short > 0) {
			under -= scaleAfter.short;
			pressBefore();
		}
		const scaleOf = (gap: number): number => {
			if (gap === whole) return 1;
			if (gap < whole) return gap === whole - 1 && coreBefore > 0 ? scaleBefore.core : scaleBefore.edge;
			return gap === whole + 1 && coreAfter > 0 ? scaleAfter.core : scaleAfter.edge;
		};
		const held = need.map((room, gap) => room * scaleOf(gap));
		const before = restBefore > 0 ? Math.max(PILE_GAP_DEG, (under - sum(held, 0, whole)) / restBefore) : 0;
		const after = restAfter > 0 ? Math.max(PILE_GAP_DEG, (DIAL_SWEEP_DEG - under - straddle - sum(held, whole + 1, count - 1)) / restAfter) : 0;
		gaps = held.map((room, gap) => room + (1 - hold[gap]) * (gap < whole ? before : gap > whole ? after : 0));
		start = under - sum(gaps, 0, whole);
		if (start < low - 1e-6) {
			// Not even the piles fit between the ends: everything but the finger's own gap gives, alike.
			const total = sum(gaps, 0, count - 1);
			const scale = Math.max(0, (high - low - straddle) / Math.max(1e-6, total - straddle));
			gaps = gaps.map((gap, i) => (i === whole ? gap : gap * scale));
			start = low;
		}
	} else {
		// The gaps beside the grown circles open to what they need, the rest keep the pitch, and
		// the circle under the finger stays where it rests, the arc shifting only as far as the
		// sweep's ends allow. A full ring that cannot give the lens the room gives a little all
		// round instead, and the grown circle, drawn on top, covers its neighbours' edges.
		sizes = sizesAt(1);
		gaps = Array.from({ length: count - 1 }, (_, gap) => Math.max(pitch, sideBySide(sizes, gap)));
		let total = gaps.reduce((sum, gap) => sum + gap, 0);
		if (total > DIAL_SWEEP_DEG + 1e-6) {
			gaps = gaps.map((gap) => (gap * DIAL_SWEEP_DEG) / total);
			total = DIAL_SWEEP_DEG;
		}
		const whole = Math.floor(f);
		const atFocus = gaps.slice(0, whole).reduce((sum, gap) => sum + gap, 0) + (whole < count - 1 ? gaps[whole] * (f - whole) : 0);
		start = clamp(restAngle(0) + f * pitch - atFocus, 0, Math.max(0, DIAL_SWEEP_DEG - total));
	}
	const angles: number[] = [];
	let at = start;
	for (let i = 0; i < count; i++) {
		angles.push(at);
		at += gaps[i] ?? 0;
	}
	return { angles, sizes, weights, offsets: crowded ? zigzag(radius, angles, sizes, weights, band) : angles.map(() => 0), crowded, base };
}

/**
 * Radial offsets that keep neighbouring beads on a crowded ring apart: where the chord between
 * two beads is shorter than they need side by side, they step in and out of the ring
 * alternately, by just enough (two circles `delta` apart on the ring, one stepped in and one out
 * by `offset`, are sqrt(chord² + 2 offset² (1 + cos delta)) apart) and never farther than keeps
 * them within `band` of the ring. Only beads outside the lens step off the ring in full: a bead
 * the lens has reached eases back onto it as it grows, and is on it by the time it is grown
 * halfway, when its gaps hold all the room it needs.
 */
function zigzag(radius: number, angles: readonly number[], sizes: readonly number[], weights: readonly number[], band: number): number[] {
	const lift = (index: number): number => 1 - clamp(2 * weights[index], 0, 1);
	return angles.map((angle, i) => {
		if (lift(i) === 0) return 0;
		let offset = 0;
		for (const j of [i - 1, i + 1]) {
			if (j < 0 || j >= angles.length || lift(j) === 0) continue;
			const needed = (sizes[i] + sizes[j]) / 2 + BEAD_GAP;
			const delta = Math.abs(angles[j] - angle);
			const apart = chord(radius, delta);
			if (apart < needed) offset = Math.max(offset, Math.sqrt((needed * needed - apart * apart) / (2 * (1 + Math.cos(degToRad(delta))))));
		}
		return Math.min(offset, Math.max(0, band - sizes[i] / 2)) * lift(i) * (i % 2 === 0 ? -1 : 1);
	});
}

/** The slots of a level of `count` items on ring `ring` (`geometry` is that ring), with the lens at `focus`. */
export function ringSlots(ring: number, geometry: DialRing, count: number, params: DialRingParams, peak: number, focus: number | null, edgeRoom = Number.POSITIVE_INFINITY): DialSlot[] {
	const layout = lensLayout(count, geometry.capacity, geometry.radius, params, peak, focus, edgeRoom);
	const slots: DialSlot[] = [];
	for (let index = 0; index < count; index++) {
		const size = layout.sizes[index];
		const weight = layout.weights[index];
		slots.push({
			ring,
			index,
			angleDeg: layout.angles[index],
			size,
			offset: layout.offsets[index],
			weight,
			bead: layout.crowded && weight < 1 && size < TAP_FOCUS_BELOW,
		});
	}
	return slots;
}

/** Screen position of a point at `angleDeg` on a ring of `radius` (offset by `offset`) around the anchor. */
function pointAt(geometry: DialGeometry, radius: number, angleDeg: number, offset = 0): DialPoint {
	const angle = degToRad(angleDeg);
	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	return {
		x: geometry.anchor.x + sideways * (radius + offset) * Math.cos(angle),
		y: geometry.anchor.y - (radius + offset) * Math.sin(angle),
	};
}

/** Screen position of a slot's centre. */
export function slotPosition(slot: DialSlot, geometry: DialGeometry, rings: readonly DialRing[]): DialPoint {
	return pointAt(geometry, rings[slot.ring].radius, slot.angleDeg, slot.offset);
}

/** The lens parameter for a pointer at `point`: where along the sweep it is, 0 at the horizontal ray and 1 straight up, held at the ends beyond them. */
export function lensFocus(point: DialPoint, geometry: DialGeometry): number {
	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	const u = (point.x - geometry.anchor.x) * sideways;
	const v = geometry.anchor.y - point.y;
	return clamp(radToDeg(Math.atan2(v, u)) / DIAL_SWEEP_DEG, 0, 1);
}

export interface DialArc {
	radius: number;
	from: DialPoint;
	to: DialPoint;
	/** The arc runs clockwise on screen from `from` to `to` for a bottom-right anchor (left ray toward straight up), counter-clockwise mirrored. */
	clockwise: boolean;
}

/**
 * One guide arc per ring that holds two or more slots, along the ring from the first slot's
 * angle to the last's, so the renderer can draw the ring the items sit on: hidden behind the
 * items themselves, it shows only between them. A lone item gets no arc.
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
			from: pointAt(geometry, ring.radius, first.angleDeg),
			to: pointAt(geometry, ring.radius, last.angleDeg),
			clockwise: geometry.corner === "bottom-right",
		});
	});
	return arcs;
}

/**
 * Which ring a pointer at `point` is over, by radial distance: the bands meet halfway between
 * neighbouring rings, the outermost band reaches `itemSize` past the outermost ring so a slight
 * overshoot still counts, and the innermost band starts just inside that ring's inner edge.
 * Only rings that hold a slot take part; inside the dead zone around the anchor, or beyond the
 * reach, there is none.
 */
export function ringUnder(point: DialPoint, geometry: DialGeometry, rings: readonly DialRing[], slots: readonly DialSlot[], deadZone: number = DEFAULT_DEAD_ZONE, itemSize: number = DEFAULT_RING_PARAMS.itemSize): number | null {
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
	for (let i = 0; i < usedRings.length - 1; i++) {
		const boundary = (rings[usedRings[i]].radius + rings[usedRings[i + 1]].radius) / 2;
		if (distance < boundary) return usedRings[i];
	}
	return outermost;
}

/**
 * Which slot a pointer at `point` arms, or null when it arms nothing. The pointer must be over
 * a ring at all (see `ringUnder`: beyond the reach, or inside the dead zone around the anchor,
 * nothing is armed, which is what lets a tap elsewhere on the screen cancel). Anywhere inside a
 * slot's own circle arms it, whichever ring it is on: as drawn on the outermost ring (a circle
 * grown by the lens may reach into the next band), but no larger than the item size, plus a
 * little slack, on an inner ring, so a thumb heading out to the next ring does not catch a
 * sibling the lens has grown; the nearest centre wins where circles overlap, and `sticky`, the
 * slot already armed, wins over everything it is inside of, as drawn. Otherwise, on the
 * outermost ring,
 * the ring in play, the pointer arms the slot whose share of the arc it is in (half way to each
 * neighbour, the end slots reaching a little past their own pitch), so a drag is forgiving but
 * blank space past the end of a short arc, or far from a lone item, arms nothing. On an inner
 * ring only the circles themselves arm, so a thumb crossing that ring's band on its way out to
 * the next ring does not swap the rings outside it unless it actually touches a sibling; the one
 * exception is again `sticky`, which keeps its share of its ring's band even once that ring is
 * an inner one, so a group armed through the band does not lose its arm the moment its own ring
 * opens outside it. Outside the sweep nothing arms either.
 */
export function hitTest(
	point: DialPoint,
	geometry: DialGeometry,
	rings: readonly DialRing[],
	slots: readonly DialSlot[],
	deadZone: number = DEFAULT_DEAD_ZONE,
	itemSize: number = DEFAULT_RING_PARAMS.itemSize,
	sticky: number | null = null,
): number | null {
	const ring = ringUnder(point, geometry, rings, slots, deadZone, itemSize);
	if (ring === null) return null;
	const outermost = Math.max(...slots.map((slot) => slot.ring));

	let inside: number | null = null;
	let nearest = Number.POSITIVE_INFINITY;
	slots.forEach((slot, index) => {
		const centre = slotPosition(slot, geometry, rings);
		// On an inner ring a circle arms within the size it has at rest and a little slack: grown by the lens it is drawn larger, but a thumb heading out past it must not catch it; the armed circle itself keeps all it is drawn with.
		const reach = slot.ring === outermost ? slot.size / 2 : (index === sticky ? slot.size : Math.min(slot.size, itemSize)) / 2 + HIT_INNER_SLACK;
		const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
		if (distance > reach) return;
		if (index === sticky) {
			inside = index;
			nearest = Number.NEGATIVE_INFINITY;
		} else if (distance < nearest) {
			inside = index;
			nearest = distance;
		}
	});
	if (inside !== null) return inside;

	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	const angle = radToDeg(Math.atan2(geometry.anchor.y - point.y, (point.x - geometry.anchor.x) * sideways));
	if (angle < -HIT_ANGLE_SLACK_DEG || angle > DIAL_SWEEP_DEG + HIT_ANGLE_SLACK_DEG) return null;
	const own = slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.ring === ring);
	const pitch = ringPitch(own.length, rings[ring].capacity);
	/** The arc a slot owns: half way to each neighbour, the ends reaching half a pitch and a little slack past themselves. */
	const share = (i: number): { low: number; high: number } => {
		const here = own[i].slot.angleDeg;
		const low = i > 0 ? (own[i - 1].slot.angleDeg + here) / 2 : here - pitch / 2 - HIT_ANGLE_SLACK_DEG;
		const high = i < own.length - 1 ? (own[i + 1].slot.angleDeg + here) / 2 : here + pitch / 2 + HIT_ANGLE_SLACK_DEG;
		return { low, high };
	};
	if (ring !== outermost) {
		const kept = sticky !== null ? own.findIndex(({ index }) => index === sticky) : -1;
		if (kept === -1) return null;
		const { low, high } = share(kept);
		return angle >= low && angle <= high ? sticky : null;
	}
	let best: number | null = null;
	let bestDelta = Number.POSITIVE_INFINITY;
	own.forEach(({ slot, index }, i) => {
		const { low, high } = share(i);
		if (angle < low || angle > high) return;
		const delta = Math.abs(angle - slot.angleDeg);
		if (delta < bestDelta) {
			bestDelta = delta;
			best = index;
		}
	});
	return best;
}

/** The radius the outermost ring of a chain of levels of `counts` items would take, unbounded by any screen. */
export function naturalReach(params: DialRingParams, counts: readonly number[]): number {
	if (params.rule === "fixed") return counts.length === 0 ? 0 : fixedFirstRadius(params) + (counts.length - 1) * ringStep(params);
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
	const first = params.rule === "fixed" ? fixedFirstRadius(params) : firstRadius(params);
	const normal = measure("normal");
	const normalReach = fanReach(normal, params);
	if (need <= normalReach) return { mode: "normal", geometry: normal };
	const raised = measure("raised");
	const raisedReach = fanReach(raised, params);
	if (raisedReach > normalReach && raisedReach >= first) return { mode: "raised", geometry: raised };
	if (normalReach >= first) return { mode: "normal", geometry: measure("normal") };
	return { mode: "overlap", geometry: measure("overlap") };
}
