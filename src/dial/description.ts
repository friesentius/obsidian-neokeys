import type { DialPoint } from "./layout";

/**
 * Where the optional description of the armed item goes, as pure arithmetic over measured
 * sizes: a card between the pill and the rings, or a bubble beside the thumb. The DOM layer
 * measures the elements and the screen and renders what this returns.
 */

export interface DescriptionBox {
	width: number;
	height: number;
}

/** A circle the bubble should not cover, weighted by how much covering it would cost. */
export interface CoveredCircle {
	x: number;
	y: number;
	radius: number;
	weight: number;
}

/** The room the bubble may use: the screen less its margins, below the pill and above whatever the anchor keeps clear of. */
export interface BubbleArea {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface BubblePlacement {
	left: number;
	top: number;
	/** How many circles' keys the bubble hides at this spot (it comes within a key's reach of their centres); the DOM layer drops to a shorter bubble when this is not zero. */
	hidden: number;
	/** What the spot cost: the DOM layer compares the full bubble's with the short form's. */
	cost: number;
	/** How far past the thumb's keep-out circle and gap the bubble is, in pixels: beyond `BESIDE_REACH` it is no longer beside the thumb. */
	away: number;
}

/** Margin the bubble keeps from the edges of the area it is placed in. */
export const BUBBLE_MARGIN = 8;

/** Gap kept between the bubble and the thumb's keep-out circle. */
const BUBBLE_GAP = 10;

/** The radius the thumb itself covers around the contact point: the bubble stays out of it even when the armed circle is smaller. */
const THUMB_PAD = 30;

/** The width of the hand's shadow, either side of the line from the thumb back to the anchor in the corner, which the bubble avoids. */
const HAND_PAD = 28;

/** Gap kept between the card and the pill above it and the rings below it. */
const CARD_GAP_PILL = 6;
const CARD_GAP_RINGS = 8;
/** The card prefers to hang this far below the pill, when the rings leave the room. */
const CARD_DROP = 40;

/**
 * Whether the card at its full height fits between the pill's bottom edge and the top of the
 * rings; when not, the DOM layer switches it to its compact one-row form and asks again.
 */
export function cardFits(pillBottom: number, ringTop: number, height: number): boolean {
	return pillBottom + CARD_GAP_PILL + height + CARD_GAP_RINGS <= ringTop;
}

/** The card's top edge: a little below the pill, lifted as far as the rings require, never above the pill's bottom gap. */
export function cardTop(pillBottom: number, ringTop: number, height: number): number {
	return Math.max(pillBottom + CARD_GAP_PILL, Math.min(pillBottom + CARD_DROP, ringTop - CARD_GAP_RINGS - height));
}

/** How the placement scores the spots it tries: a point of cost per this many pixels the bubble is from the thumb, per circle covered (times its weight), for the hand, and per pixel moved from where it was. */
const COST_PER_NEAR_PX = 1.6 / 100;
/** Past this far from the thumb's keep-out circle the bubble is no longer beside it, and each further pixel costs this much more. */
export const BESIDE_REACH = 60;
const COST_PER_FAR_PX = 5 / 100;
const COST_COVER = 2;
const COST_HAND = 2.5;
const COST_PER_MOVED_PX = 0.6 / 100;
/** Between spots that are otherwise as good, the one away from the hand wins: the thumb is on that side. */
const COST_TOWARD_HAND = 0.4;
/** A circle's key is hidden when the bubble comes this close to its centre. */
const KEY_CLEARANCE = 12;
const COST_HIDES_KEY = 2;
/** The grid of spots tried over the whole area, in pixels. */
const GRID_STEP = 10;
/** A spot that puts the bubble on the thumb is worse than any spot that does not. */
const COST_ON_THUMB = 1000;
/** Where no spot clears the thumb, the one that sits least on it wins, whatever else it covers. */
const COST_PER_PX_ON_THUMB = 100;
/** Between the keep-out circle and the gap beyond it the bubble is allowed but looks cramped: a little cost for each pixel short of the gap. */
const COST_PER_PX_SNUG = 4 / 100;

/** The distance from `point` to the rectangle (0 inside it). */
function distanceToBox(point: DialPoint, left: number, top: number, box: DescriptionBox): number {
	const nearestX = Math.max(left, Math.min(left + box.width, point.x));
	const nearestY = Math.max(top, Math.min(top + box.height, point.y));
	return Math.hypot(point.x - nearestX, point.y - nearestY);
}

/** The distance from the segment `from`-`to` to the rectangle (0 when they meet). */
function segmentDistanceToBox(from: DialPoint, to: DialPoint, left: number, top: number, box: DescriptionBox): number {
	let nearest = Number.POSITIVE_INFINITY;
	const steps = 12;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		nearest = Math.min(nearest, distanceToBox({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, left, top, box));
	}
	return nearest;
}

/** How much of `circle` the rectangle covers, 0 to 1: half once the rim touches the centre, all of it once the centre is as deep inside as the radius. */
function coverage(circle: CoveredCircle, left: number, top: number, box: DescriptionBox): number {
	const outside = distanceToBox(circle, left, top, box);
	if (outside > 0) return Math.max(0, (circle.radius - outside) / (2 * circle.radius));
	const depth = Math.min(circle.x - left, left + box.width - circle.x, circle.y - top, top + box.height - circle.y);
	return Math.min(1, 0.5 + depth / (2 * circle.radius));
}

/**
 * The bubble beside the thumb: the spot next to the thumb that costs least. Around the thumb
 * (the armed circle's centre, which the finger is on) it tries every 15 degrees, at a few
 * distances from the keep-out circle the thumb covers plus a gap, kept inside `area`, and scores
 * each by how far from the thumb it ends up (the bubble belongs beside the finger, however
 * crowded that is), the circles it would cover (the outermost ring's circles weigh more, the
 * thumb's own keep-out circle is never covered at all), the hand it would sit under (the strip
 * from the thumb back to `hand`, the anchor in the corner, and, between spots otherwise as good,
 * the side the hand is on), and, when `previous` is given, how
 * far it has moved from where it was, so a finger sliding along a ring does not make the bubble
 * jump between sides. `half` is the armed circle's radius as drawn (it is scaled up while armed).
 * Pure arithmetic over measured sizes, so the DOM layer only measures and applies.
 */
export function placeBubble(
	thumb: DialPoint,
	half: number,
	box: DescriptionBox,
	area: BubbleArea,
	circles: readonly CoveredCircle[],
	hand: DialPoint,
	previous: BubblePlacement | null = null,
): BubblePlacement {
	const keepOut = Math.max(half, THUMB_PAD);
	const toHand = Math.hypot(hand.x - thumb.x, hand.y - thumb.y) || 1;
	const handward = { x: (hand.x - thumb.x) / toHand, y: (hand.y - thumb.y) / toHand };
	/** How far the box's centre must be from a point along `direction` for the box's edge to clear it. */
	const extent = (direction: DialPoint): number =>
		Math.min(
			Math.abs(direction.x) > 1e-6 ? box.width / 2 / Math.abs(direction.x) : Number.POSITIVE_INFINITY,
			Math.abs(direction.y) > 1e-6 ? box.height / 2 / Math.abs(direction.y) : Number.POSITIVE_INFINITY,
		);
	const room = {
		left: area.left,
		top: area.top,
		right: Math.max(area.left, area.right - box.width),
		bottom: Math.max(area.top, area.bottom - box.height),
	};
	let best: BubblePlacement = { left: room.left, top: room.top, cost: Number.POSITIVE_INFINITY, away: 0, hidden: 0 };
	/** Scores the spot, giving up as soon as it cannot beat the best so far (every cost term is at least 0). */
	const consider = (left: number, top: number, direction: DialPoint | null): void => {
		const rim = distanceToBox(thumb, left, top, box);
		const away = Math.max(0, rim - (keepOut + BUBBLE_GAP));
		let cost = away * COST_PER_NEAR_PX + Math.max(0, away - BESIDE_REACH) * COST_PER_FAR_PX;
		if (rim < keepOut) cost += COST_ON_THUMB + (keepOut - rim) * COST_PER_PX_ON_THUMB;
		else cost += Math.max(0, keepOut + BUBBLE_GAP - rim) * COST_PER_PX_SNUG;
		if (direction) cost += COST_TOWARD_HAND * Math.max(0, direction.x * handward.x + direction.y * handward.y);
		if (previous) cost += Math.hypot(left - previous.left, top - previous.top) * COST_PER_MOVED_PX;
		if (cost >= best.cost) return;
		for (const circle of circles) {
			cost += circle.weight * coverage(circle, left, top, box) * COST_COVER;
			// A circle whose key the bubble hides is lost to the thumb altogether, however little of its rim is covered.
			if (distanceToBox(circle, left, top, box) < KEY_CLEARANCE) cost += circle.weight * COST_HIDES_KEY;
			if (cost >= best.cost) return;
		}
		if (segmentDistanceToBox(thumb, hand, left, top, box) < HAND_PAD) cost += COST_HAND;
		if (cost < best.cost - 1e-9) best = { left, top, cost, away, hidden: circles.filter((circle) => distanceToBox(circle, left, top, box) < KEY_CLEARANCE).length };
	};
	// First the spots snug against the thumb, in every direction and a few distances out: where the bubble belongs when there is room.
	for (const extra of [0, 22, 48, 80]) {
		for (let degrees = 0; degrees < 360; degrees += 15) {
			const direction = { x: Math.cos((degrees * Math.PI) / 180), y: -Math.sin((degrees * Math.PI) / 180) };
			const distance = keepOut + BUBBLE_GAP + extent(direction) + extra;
			consider(
				Math.max(room.left, Math.min(room.right, thumb.x + direction.x * distance - box.width / 2)),
				Math.max(room.top, Math.min(room.bottom, thumb.y + direction.y * distance - box.height / 2)),
				direction,
			);
		}
	}
	// Then every spot of a grid over the whole area, so a crowded dial's one free patch is found wherever it is, not only where a ray from the thumb happens to land.
	for (let top = room.top; ; top += GRID_STEP) {
		const y = Math.min(top, room.bottom);
		for (let left = room.left; ; left += GRID_STEP) {
			consider(Math.min(left, room.right), y, null);
			if (left >= room.right) break;
		}
		if (top >= room.bottom) break;
	}
	return best;
}

/** What the short form costs the reader: it drops the description, so it must be clearly better placed to be worth it. */
const COST_SHORT_FORM = 1;

/**
 * Whether to show the short bubble (key and label alone) rather than the full one. It is tried
 * when the full bubble hides circles' keys or cannot sit beside the thumb, and taken when it
 * does better by more than what it gives up.
 */
export function preferShortBubble(full: BubblePlacement, short: BubblePlacement): boolean {
	return short.cost + COST_SHORT_FORM < full.cost;
}

/** Whether the full bubble is worth trying a short one against: it hides a key, or it landed away from the thumb. */
export function bubbleNeedsShortForm(full: BubblePlacement): boolean {
	return full.hidden > 0 || full.away > BESIDE_REACH;
}
