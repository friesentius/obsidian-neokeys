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

export interface BubbleScreen {
	width: number;
	height: number;
	/** The bubble never reaches above this: the pill's bottom edge. */
	top: number;
}

/** Side margin the bubble keeps from the screen's edges, and from the pill and the bottom. */
const BUBBLE_MARGIN = 8;

/** Gap kept between the bubble and the armed circle's rim. */
const BUBBLE_GAP = 10;

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

/**
 * The bubble beside the thumb: radially outward from the armed circle when there is room, else
 * diagonally outward and up, above, toward the far side edge, inward, below, and as a last
 * resort under the pill, whichever covers the fewest circles once kept on screen and clear of
 * the pill. `half` is the armed circle's radius as drawn (it is scaled up while armed),
 * `sideways` points into the screen from the anchor's corner (-1 for bottom-right).
 */
export function placeBubble(
	armed: DialPoint,
	half: number,
	box: DescriptionBox,
	screen: BubbleScreen,
	circles: readonly CoveredCircle[],
	anchor: DialPoint,
	sideways: 1 | -1,
): { left: number; top: number } {
	const dx = armed.x - anchor.x;
	const dy = armed.y - anchor.y;
	const length = Math.hypot(dx, dy) || 1;
	const outward = { x: dx / length, y: dy / length };
	/** How far the box's centre must be from a point along `direction` for the box's edge to clear it. */
	const extent = (direction: DialPoint): number =>
		Math.min(
			Math.abs(direction.x) > 1e-6 ? box.width / 2 / Math.abs(direction.x) : Number.POSITIVE_INFINITY,
			Math.abs(direction.y) > 1e-6 ? box.height / 2 / Math.abs(direction.y) : Number.POSITIVE_INFINITY,
		);
	const far = { x: sideways, y: 0 };
	const diagonalLength = Math.hypot(outward.x + far.x, outward.y - 1) || 1;
	const diagonal = { x: (outward.x + far.x) / diagonalLength, y: (outward.y - 1) / diagonalLength };
	const along = (direction: DialPoint, sign: 1 | -1): DialPoint => {
		const distance = half + BUBBLE_GAP + extent(direction);
		return { x: armed.x + sign * direction.x * distance, y: armed.y + sign * direction.y * distance };
	};
	const candidates: DialPoint[] = [
		along(outward, 1),
		along(diagonal, 1),
		{ x: armed.x, y: armed.y - (half + BUBBLE_MARGIN + box.height / 2) },
		{ x: armed.x + far.x * (half + BUBBLE_MARGIN + box.width / 2), y: armed.y },
		along(outward, -1),
		{ x: armed.x, y: armed.y + (half + BUBBLE_MARGIN + box.height / 2) },
		{ x: screen.width / 2, y: screen.top + BUBBLE_MARGIN + box.height / 2 },
	];
	let best: { left: number; top: number; score: number } | null = null;
	for (const candidate of candidates) {
		const left = Math.max(BUBBLE_MARGIN, Math.min(screen.width - box.width - BUBBLE_MARGIN, candidate.x - box.width / 2));
		const top = Math.max(screen.top + CARD_GAP_PILL, Math.min(screen.height - box.height - BUBBLE_MARGIN, candidate.y - box.height / 2));
		let score = 0;
		for (const circle of circles) {
			const nearestX = Math.max(left, Math.min(left + box.width, circle.x));
			const nearestY = Math.max(top, Math.min(top + box.height, circle.y));
			if (Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.radius - 2) score += circle.weight;
		}
		if (!best || score < best.score) best = { left, top, score };
		if (score === 0) break;
	}
	return best ? { left: best.left, top: best.top } : { left: BUBBLE_MARGIN, top: screen.top + CARD_GAP_PILL };
}
