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
 * that strip. The rings never reach behind the pill: a screen so short that not even the first
 * ring fits under the raised pill gets a smaller dial instead (see `chooseMode`).
 */
export type DialLayoutMode = "normal" | "raised";

/** How the rings are laid out, from the settings: the circle size, the gaps, the lens peak and the radius rule. */
export interface DialRingParams {
	/** Diameter of one item circle at rest. */
	itemSize: number;
	/** Edge-to-edge gap kept between neighbours on a ring that fits them at full size. */
	gap: number;
	/** Edge-to-edge gap between a ring's items and the next ring's, at the least (see `ringStep`). */
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
	/** The circle's diameter as drawn: the item size, less on a crowded ring (the farther from the finger, the less), more inside the lens. */
	size: number;
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

/** The smallest the dial shrinks its circles to, below the settings' range, so that a short screen still gets a ring: a key still reads at this size. */
export const LEAST_DIAL_ITEM_SIZE = 28;

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

/** The smallest a circle shrinks to on a ring that cannot hold its level at full size. Below DIAL_LEGIBLE_SIZE a circle is only a dot: it shows no key until the lens grows it. */
export const BEAD_FLOOR = 10;

/** Edge-to-edge gap between circles on a crowded ring. */
const BEAD_GAP = 2;

/**
 * How flat the top of the lens is on a crowded ring: a circle at distance k from the finger,
 * in items, is shrunk by falloff^(k^FALLOFF_SHAPE). Above 1 the circles right beside the finger
 * stay close to the circle under it (so the lens does not pulse as the finger passes from one
 * circle to the next) and the ones past them shrink faster.
 */
const FALLOFF_SHAPE = 1.5;

/** The smallest circle that still shows its key (or icon): the key is drawn at 10px at the least, and a smaller circle would clip it. */
export const DIAL_LEGIBLE_SIZE = 18;

/** A tap on a circle smaller than this brings it into the lens first; a larger circle is selected by the tap itself. */
export const TAP_FOCUS_BELOW = 32;

/** How far past an end of the sweep a ring's arc may be pushed so the circle under the finger stays under it. */
const END_SLACK_DEG = 4;

/** How far inside a circle's share of the arc (half way to each neighbour) the finger is kept when the arc has to shift, so the share is never a toss-up. */
const SHARE_MARGIN_DEG = 1;


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

/**
 * How much farther out each ring sits than the one inside it, at the least: an item and a ring
 * gap, or more when the lens peak asks for it, so that two circles grown to the peak on
 * neighbouring rings at the same angle (the armed group keeps its lens, and the finger is on
 * its child right outside it) still keep the lens gap between them, and so a circle the lens
 * has grown never covers a circle on the next ring. At 44px the step is 54 up to a peak of
 * about 1.14 and 70 at the default 1.5.
 */
export function ringStep(params: DialRingParams): number {
	return Math.max(params.itemSize + params.ringGap, params.itemSize * params.peak + LENS_GAP);
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
	/** The level does not fit its ring at full size, so its circles are shrunk and spread over the whole sweep. */
	crowded: boolean;
	/** The diameter of a circle at rest on this ring: the item size, or the shrunk size a crowded level is spread at. */
	base: number;
	/** How much of the way to the peak the lens grew: 1 unless the ring had no room for all of it. */
	growth: number;
}

/**
 * Where a level of `count` items sits on a ring of `radius` that holds `capacity` at full size,
 * and how large each circle is, with the finger at `focus` along the sweep (0 at the horizontal
 * ray, 1 straight up; null while no finger has been on the ring). Every circle stays on the
 * ring's own radius, whatever the level holds.
 *
 * At rest a ring that fits its level keeps the full-size circles at their slot angles; a crowded
 * ring spreads its level evenly over the whole sweep with circles shrunk to the chord between
 * neighbours (never below BEAD_FLOOR).
 *
 * A ring that fits, with a finger on it: the circle nearest the finger and its neighbours
 * (LENS_WIDTH items either way) grow toward `peak`, and no two circles on the ring ever overlap:
 * the gaps beside the grown circles open to what they need, and the lens takes that room from
 * the other gaps on the ring, which close up to what keeps their circles apart. The finger stays
 * on the circle it grew: that circle sits where the finger keeps its place between it and the
 * next, and the arc shifts only as far as leaves the finger inside that circle's share of the
 * ring. In that order, when the room runs out: the arc runs past the ends of the sweep, by
 * END_SLACK_DEG at most and never with an end circle outside `edgeRoom` of the anchor; the
 * finger moves onto the other circle of its gap; the lens grows less.
 *
 * A crowded ring, with a finger on it, has no room to spare, so the farther a circle is from
 * the finger the more it shrinks (see `crowdedLayout`): the circle under the finger grows to
 * the peak, and each circle past it is a constant fraction smaller than the one before, down to
 * BEAD_FLOOR, by as little as lets every circle fit on the ring's own radius without touching
 * its neighbours. The level still spans the whole sweep with the finger on the circle it grew.
 * Only a level with more circles than the ring holds even at the floor size overlaps, as it must.
 */
export function lensLayout(count: number, capacity: number, radius: number, params: DialRingParams, peak: number, focus: number | null, edgeRoom = Number.POSITIVE_INFINITY): LensLayout {
	const full = params.itemSize;
	const crowded = count > capacity;
	const pitch = ringPitch(count, capacity);
	const restAngle = (index: number): number => (crowded ? pitch * index : slotAngle(index, count, capacity));
	const base = crowded ? clamp(chord(radius, pitch) - BEAD_GAP, BEAD_FLOOR, full) : full;
	const theta = focus === null ? null : clamp(focus, 0, 1) * DIAL_SWEEP_DEG;
	const position = theta === null ? null : (theta - restAngle(0)) / pitch;
	const weights = Array.from({ length: count }, (_, i) => (position === null ? 0 : Math.max(0, 1 - Math.abs(i - position) / LENS_WIDTH)));

	if (theta === null || position === null || count <= 1) {
		// At rest: the slot angles at the rest size; a lone circle mid-sweep has room for the whole lens.
		const angles = Array.from({ length: count }, (_, i) => restAngle(i));
		return { angles, sizes: weights.map((weight) => base + (peak - base) * weight), weights, crowded, base, growth: 1 };
	}

	if (crowded) {
		const layout = crowdedLayout(count, radius, peak, theta, edgeRoom, base, weights);
		return { ...layout, weights, crowded, base };
	}

	const sum = (values: readonly number[], from = 0, to = values.length): number => values.slice(from, to).reduce((total, value) => total + value, 0);
	/** The sizes with the lens grown `growth` of the way to the peak, the least each gap may then be, and how far past the sweep's ends the arc may run. */
	const squeeze = (growth: number): { sizes: number[]; least: number[]; low: number; high: number } => {
		const sizes = weights.map((weight) => base + (peak - base) * weight * growth);
		const least = Array.from({ length: count - 1 }, (_, gap) => angleOnRing(radius, clearance(sizes, weights, gap, gap + 1)));
		// Circles two apart need room too: each of the two gaps between them carries half of what they need.
		for (let i = 0; i + 2 < count; i++) {
			const half = angleOnRing(radius, clearance(sizes, weights, i, i + 2)) / 2;
			least[i] = Math.max(least[i], half);
			least[i + 1] = Math.max(least[i + 1], half);
		}
		return { sizes, least, low: -endSlack(sizes[0], radius, edgeRoom), high: DIAL_SWEEP_DEG + endSlack(sizes[count - 1], radius, edgeRoom) };
	};

	const f = clamp(position, 0, count - 1);
	/** The gap the finger is in, how far along it the finger is, and which of its two circles the finger is nearer (the one grown the more); past either end of the arc, how many pitches beyond. */
	const whole = Math.min(Math.floor(f), count - 2);
	const fraction = f - whole;
	const nearest = fraction <= 0.5 ? whole : whole + 1;
	const beyond = position - f;
	/**
	 * Where the circle before the finger's gap may sit at this squeeze: where the finger keeps
	 * its place in the gap (past the arc's end, where the rest mapping puts it), or as near that
	 * as leaves the circles on each side room to the sweep's end (past it by the slack, with
	 * `slack`) and keeps the finger inside the share of the circle it is nearest (`strict`) or
	 * of either of its gap's two circles, the two the lens grew most, so that a shift never puts
	 * a third circle under it.
	 */
	const place = (squeezed: ReturnType<typeof squeeze>, strict: boolean, slack: boolean): { under: number; mid: number; feasible: boolean } => {
		const { least } = squeezed;
		const low = slack ? squeezed.low : 0;
		const high = slack ? squeezed.high : DIAL_SWEEP_DEG;
		const mid = Math.max(least[whole], pitch);
		const before = sum(least, 0, whole);
		const after = sum(least, whole + 1);
		const wanted = theta - mid * fraction - beyond * pitch;
		const inArc = beyond === 0;
		const shareLow = !inArc ? Number.NEGATIVE_INFINITY : strict && nearest === whole ? theta - mid / 2 + SHARE_MARGIN_DEG : whole + 2 < count ? theta - mid - least[whole + 1] / 2 + SHARE_MARGIN_DEG : Number.NEGATIVE_INFINITY;
		const shareHigh = !inArc ? Number.POSITIVE_INFINITY : strict && nearest === whole + 1 ? theta - mid / 2 - SHARE_MARGIN_DEG : whole > 0 ? theta + least[whole - 1] / 2 - SHARE_MARGIN_DEG : Number.POSITIVE_INFINITY;
		const underLow = Math.max(shareLow, low + before);
		const underHigh = Math.min(shareHigh, high - mid - after);
		if (underLow <= underHigh + 1e-9) return { under: clamp(wanted, underLow, underHigh), mid, feasible: true };
		// Not even with the arc shifted: the finger's circle keeps the circles on each side inside the slack, on the finger or not.
		return { under: Math.max(low + before, Math.min(wanted, high - mid - after)), mid, feasible: false };
	};
	const feasible = (growth: number, strict: boolean, slack: boolean): boolean => place(squeeze(growth), strict, slack).feasible;
	// In order, as the room runs out: the arc runs past the sweep's ends; it shifts the finger onto the other circle of its gap; the lens grows less.
	let growth = 1;
	let strict = true;
	let slack = false;
	if (!feasible(1, true, false)) {
		slack = true;
		if (!feasible(1, true, true)) {
			strict = false;
			if (!feasible(1, false, true)) growth = largest((g) => feasible(g, false, true)) ?? 0;
		}
	}
	const squeezed = squeeze(growth);
	const { sizes, least } = squeezed;
	const { under, mid } = place(squeezed, strict, slack);
	// The other gaps open from their least toward what they want (the pitch), as far as the room between the finger's circle and the sweep's end on their side allows.
	const want = least.map((gap) => Math.max(gap, pitch));
	const leastBefore = sum(least, 0, whole);
	const leastAfter = sum(least, whole + 1);
	const lo = Math.min(0, under - leastBefore);
	const hi = Math.max(DIAL_SWEEP_DEG, under + mid + leastAfter);
	const share = (from: number, to: number, room: number): number => {
		const give = sum(want, from, to) - sum(least, from, to);
		return give > 1e-9 ? clamp((room - sum(least, from, to)) / give, 0, 1) : 0;
	};
	const before = share(0, whole, under - lo);
	const after = share(whole + 1, count - 1, hi - under - mid);
	let gaps = least.map((gap, g) => (g === whole ? mid : gap + (want[g] - gap) * (g < whole ? before : after)));
	let start = under - sum(gaps, 0, whole);
	const total = sum(gaps);
	if (total > hi - lo + 1e-6) {
		// Not even the least the gaps need fits (only a ring too small for its own slot count): every gap gives alike.
		gaps = gaps.map((gap) => (gap * (hi - lo)) / total);
		start = lo;
	}
	const angles: number[] = [];
	let at = start;
	for (let i = 0; i < count; i++) {
		angles.push(at);
		at += gaps[i] ?? 0;
	}
	return { angles, sizes, weights, crowded, base, growth };
}

/** The least angle around the anchor between two circles on a ring of `radius` whose centres must be `distance` apart, in degrees. */
function angleOnRing(radius: number, distance: number): number {
	return radToDeg(2 * Math.asin(clamp(distance / (2 * radius), 0, 1)));
}

/** How far apart the centres of circles `i` and `j` of a ring must be: their radii, a gap, and the wider lens gap between two circles inside the lens. */
function clearance(sizes: readonly number[], weights: readonly number[], i: number, j: number): number {
	return (sizes[i] + sizes[j]) / 2 + BEAD_GAP + (LENS_GAP - BEAD_GAP) * Math.max(weights[i], weights[j]);
}

/** How far past an end of the sweep the arc may run for an end circle of `size`: END_SLACK_DEG, less when that would put the circle outside the room beside the anchor. */
function endSlack(size: number, radius: number, edgeRoom: number): number {
	return Math.min(END_SLACK_DEG, radToDeg(Math.asin(clamp((edgeRoom - size / 2 - BEAD_GAP / 2) / radius, 0, 1))));
}

/** The largest `x` from 0 to 1 at which `fits` holds, if it holds at 0; bisection, since a larger `x` never needs less room. */
function largest(fits: (x: number) => boolean): number | null {
	if (fits(1)) return 1;
	if (!fits(0)) return null;
	let can = 0;
	let cannot = 1;
	for (let step = 0; step < 24; step++) {
		const mid = (can + cannot) / 2;
		if (fits(mid)) can = mid;
		else cannot = mid;
	}
	return can;
}

/**
 * The layout of a crowded ring with the finger on it at `theta` degrees along the sweep, which
 * is `theta / (the rest pitch)` circles along the level (the finger's `position`, a fraction
 * between two circles when it is in a gap). Every circle stays on the ring; there is no room to
 * spare, so the circles shrink with their distance from the finger instead: the circle at
 * distance k from the position is
 *
 *     BEAD_FLOOR + (top - BEAD_FLOOR) * falloff^(k^FALLOFF_SHAPE)
 *
 * where `top` is the lens peak (growth 1) and `falloff`, between 0 and 1, is as large as lets
 * every circle fit (`distance` is raised to FALLOFF_SHAPE first). The farther a circle is from
 * the finger, the smaller it is, down to the floor; the nearer the finger, the closer a circle
 * is to the peak.
 *
 * Neighbours sit exactly as far apart as their sizes need (see `clearance`), scaled up evenly
 * on each side of the finger so the level spans the whole sweep, and the finger keeps its
 * place in its gap: its position along the level maps to its angle, so the circle under it
 * stays under it, or, where the ends of the sweep leave no room for that, as near it as keeps
 * the finger inside the share of one of its gap's two circles. The arc may run past an end of
 * the sweep by END_SLACK_DEG (never with an end circle outside `edgeRoom` of the anchor) when
 * the circles need the room. When even the floor size does not fit (the lens next to an end of
 * the sweep), the lens grows less. A level with more circles than fit at the floor size
 * overlaps, as it must: it is laid out at rest.
 */
function crowdedLayout(count: number, radius: number, peak: number, theta: number, edgeRoom: number, base: number, weights: readonly number[]): { angles: number[]; sizes: number[]; growth: number } {
	const restPitch = DIAL_SWEEP_DEG / (count - 1);
	const position = clamp(theta / restPitch, 0, count - 1);
	const whole = Math.min(Math.floor(position), count - 2);
	const fraction = position - whole;
	const distances = Array.from({ length: count }, (_, i) => Math.abs(i - position));
	const sizesFor = (falloff: number, growth: number): number[] => {
		const top = base + (Math.max(peak, base) - base) * growth;
		return distances.map((distance) => BEAD_FLOOR + (top - BEAD_FLOOR) * falloff ** distance ** FALLOFF_SHAPE);
	};
	const rest = (): { angles: number[]; sizes: number[]; growth: number } => ({
		angles: Array.from({ length: count }, (_, i) => restPitch * i),
		sizes: Array.from({ length: count }, () => base),
		growth: 0,
	});
	const sum = (values: readonly number[], from = 0, to = values.length): number => values.slice(from, to).reduce((total, value) => total + value, 0);
	/** The layout at this falloff and growth, or null when the circles do not fit the sweep (the arc may run past its ends by the slack). */
	const build = (falloff: number, growth: number): { angles: number[]; sizes: number[]; growth: number } | null => {
		const sizes = sizesFor(falloff, growth);
		const least = Array.from({ length: count - 1 }, (_, gap) => angleOnRing(radius, clearance(sizes, weights, gap, gap + 1)));
		const low = -endSlack(sizes[0], radius, edgeRoom);
		const high = DIAL_SWEEP_DEG + endSlack(sizes[count - 1], radius, edgeRoom);
		const mid = least[whole];
		const rested = theta - fraction * mid;
		const needBefore = sum(least, 0, whole);
		const needAfter = sum(least, whole + 1);
		// Where the circle before the finger's gap sits when the finger keeps its exact place in the gap, and how far the arc may shift from there: by half the local pitch (so the finger stays inside the share of one of its gap's two circles), and by no more than two thirds of the radius of the circle the lens grew (so the finger stays on it), and while the circles at each end keep inside the sweep and its slack. The pitch and the radius are blended between the gap's two circles, so the limit moves smoothly as the finger passes from one gap to the next.
		const pitch = (i: number): number => (least[Math.max(0, i - 1)] + least[Math.min(count - 2, i)]) / 2;
		const blend = (at: (i: number) => number): number => (1 - fraction) * at(whole) + fraction * at(whole + 1);
		const bound = Math.max(0, Math.min(blend(pitch) / 2 - SHARE_MARGIN_DEG, (blend((i) => radToDeg(sizes[i] / 2 / radius)) * 2) / 3));
		const shiftLow = Math.max(-bound, needBefore - (rested - low));
		const shiftHigh = Math.min(bound, high - rested - mid - needAfter);
		if (shiftLow > shiftHigh + 1e-9) return null;
		const under = rested + clamp(0, shiftLow, shiftHigh);
		// The circles on each side of the gap spread to fill the sweep up to its end, or, when they need more than that, exactly what they need (into the slack).
		const roomBefore = Math.max(under, needBefore);
		const roomAfter = Math.max(DIAL_SWEEP_DEG - (under + mid), needAfter);
		const scaleBefore = needBefore > 0 ? roomBefore / needBefore : 1;
		const scaleAfter = needAfter > 0 ? roomAfter / needAfter : 1;
		const gaps = least.map((gap, g) => (g === whole ? mid : gap * (g < whole ? scaleBefore : scaleAfter)));
		const angles: number[] = [];
		let at = under - sum(gaps, 0, whole);
		for (let i = 0; i < count; i++) {
			angles.push(at);
			at += gaps[i] ?? 0;
		}
		return { angles, sizes, growth };
	};
	const grown = largest((falloff) => build(falloff, 1) !== null);
	if (grown !== null) return build(grown, 1) ?? rest();
	const least = largest((growth) => build(0, growth) !== null);
	return (least !== null ? build(0, least) : null) ?? rest();
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
			weight,
			bead: layout.crowded && weight < 1 && size < TAP_FOCUS_BELOW,
		});
	}
	return slots;
}

/** Screen position of a point at `angleDeg` on a ring of `radius` around the anchor. */
function pointAt(geometry: DialGeometry, radius: number, angleDeg: number): DialPoint {
	const angle = degToRad(angleDeg);
	const sideways = geometry.corner === "bottom-right" ? -1 : 1;
	return {
		x: geometry.anchor.x + sideways * radius * Math.cos(angle),
		y: geometry.anchor.y - radius * Math.sin(angle),
	};
}

/** Screen position of a slot's centre. */
export function slotPosition(slot: DialSlot, geometry: DialGeometry, rings: readonly DialRing[]): DialPoint {
	return pointAt(geometry, rings[slot.ring].radius, slot.angleDeg);
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
 * The pill mode and the ring layout for one opening of the dial, chosen once so that nothing
 * moves under a finger while rings open: the normal placement when its reach covers `need`
 * (the radius the deepest or widest path in the keymap would naturally take); else the raised
 * pill, which wins back the header's strip, when that actually reaches farther (it does not
 * when the width is the limit) and at least the first ring fits under it; else the normal
 * placement if the first ring fits there. When not even the first ring fits under the raised
 * pill, the dial shrinks instead of reaching behind it: in whichever placement has the more
 * room, the circles (and with them the rings) are the largest size, down to
 * LEAST_DIAL_ITEM_SIZE, at which the first ring fits between the pill and the anchor; a screen
 * too short even for that gets no ring. The chosen mode is measured last, so it is the one in
 * effect, and the params returned are the ones to lay the rings out with.
 */
export function chooseMode(
	need: number,
	measure: (mode: DialLayoutMode) => DialGeometry,
	params: DialRingParams = DEFAULT_RING_PARAMS,
): { mode: DialLayoutMode; geometry: DialGeometry; params: DialRingParams } {
	const first = (candidate: DialRingParams): number => (candidate.rule === "fixed" ? fixedFirstRadius(candidate) : firstRadius(candidate));
	const normal = measure("normal");
	const normalReach = fanReach(normal, params);
	if (need <= normalReach) return { mode: "normal", geometry: normal, params };
	const raised = measure("raised");
	const raisedReach = fanReach(raised, params);
	if (raisedReach > normalReach && raisedReach >= first(params)) return { mode: "raised", geometry: raised, params };
	if (normalReach >= first(params)) return { mode: "normal", geometry: measure("normal"), params };
	const mode: DialLayoutMode = raisedReach > normalReach ? "raised" : "normal";
	const geometry = mode === "raised" ? raised : measure("normal");
	let shrunk = params;
	for (let itemSize = params.itemSize - 1; itemSize >= LEAST_DIAL_ITEM_SIZE; itemSize--) {
		shrunk = { ...params, itemSize };
		if (first(shrunk) <= fanReach(geometry, shrunk)) break;
	}
	return { mode, geometry, params: shrunk };
}
