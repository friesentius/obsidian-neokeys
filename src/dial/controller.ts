import { keyFromEvent, keyGlyph, type KeyboardEventLike } from "../keys";
import { commandUnavailableMessage, dialEmptyMessage } from "../messages";
import { breadcrumbTrail, entryLabel, findEntry, sortEntries } from "../tree";
import type { GroupEntry, GroupNode } from "../types";
import {
	chooseMode,
	DEFAULT_DEAD_ZONE,
	DEFAULT_RING_PARAMS,
	firstRadius,
	fittingFrom,
	hitTest,
	paging,
	planRings,
	radiusFor,
	ringArcs,
	ringSlots,
	ringStep,
	slotPosition,
	type DialArc,
	type DialGeometry,
	type DialLayoutMode,
	type DialPoint,
	type DialRing,
	type DialRingParams,
	type DialSlot,
} from "./layout";

/** What the dial needs from the app; supplied by the plugin so the controller stays Obsidian-free and testable. */
export interface DialHost {
	isCommandKnown(id: string): boolean;
	resolveCommandName(id: string): string | undefined;
	executeCommand(id: string): void;
	openFile(path: string): void;
	notify(message: string): void;
	/** A short haptic tick when the armed item changes; the caller feature-detects it, so it may be absent. */
	vibrate?(): void;
}

export type DialItemKind = "group" | "command" | "file" | "more";

export interface DialItemView {
	kind: DialItemKind;
	/** The key glyph shown on the item: the entry's key, or an ellipsis for "More". */
	key: string;
	label: string;
	/** What identifies the item across renders: its keymap entry, or "more" for the page turner. */
	identity: GroupEntry | "more";
	armed: boolean;
	/** The group whose items are on the ring outside this one. */
	open: boolean;
	x: number;
	y: number;
	size: number;
}

export interface DialRingView {
	/** How deep in the path this ring's group is: 0 for the root's own items. */
	level: number;
	/** The group whose items this ring shows. */
	group: GroupNode;
	radius: number;
	items: DialItemView[];
	page: number;
	pages: number;
}

export interface DialArmedView {
	kind: DialItemKind;
	key: string;
	label: string;
	/** A group that is in the path: its ring is open outside its own, or waiting for the release to open. Its crumb is the last of the trail. */
	open: boolean;
	/** The armed group's ring has no room outside the current rings, so it opens on the release instead. */
	waiting: boolean;
	/** What there is to say about the item beyond its label: a group's description or, failing that, its items; a file's path; nothing for a command; a cue to let go for a waiting group. */
	description: string;
	/** For a group, how many items it holds on this device; null for anything else. */
	count: number | null;
	x: number;
	y: number;
	size: number;
}

export interface DialView {
	open: boolean;
	/** A pointer is currently held down on the dial. */
	pressing: boolean;
	/** The root group's title, shown first in the breadcrumb. */
	title: string;
	/** One label per group opened below the root, in order. */
	crumbs: string[];
	/** The item under the pointer, if any. */
	armed: DialArmedView | null;
	/** What the deepest ring's group has to say for itself, for the pill while nothing is armed. */
	description: string;
	/** The rings on screen, innermost first. Deeper levels of the path than the first ring's are open but undrawn (a short screen). */
	rings: DialRingView[];
	/** A guide arc through the items of each ring that holds more than one. */
	arcs: DialArc[];
	/** Where the breadcrumb pill sits for this opening. */
	mode: DialLayoutMode;
	/** The outermost ring's page and page count; 0 pages when nothing is drawn. */
	page: number;
	pages: number;
}

/**
 * Which part of the view a change touched, so the renderer can skip rebuilding what did not
 * change: `structure` means the set of rings or items is different (open, close, a ring opening
 * or closing, a page turn), `layout` that the same items moved (a relayout), `armed` that only
 * the highlight and the pill changed.
 */
export type DialChange = "structure" | "layout" | "armed";

type DialTarget = { kind: "entry"; entry: GroupEntry; level: number } | { kind: "more"; level: number };

/** What was armed, by identity rather than position, so it survives the rings around it changing. */
interface ArmedKey {
	level: number;
	identity: GroupEntry | "more";
}

/**
 * How far a pointer may wander from where its press began before the press counts as a drag:
 * a tap jitters by a few pixels, and the rings a tap on a group opens must not turn that jitter
 * into a move onto one of the group's items.
 */
const TAP_SLOP = 8;

/**
 * What a release on nothing means for the current press: the press that opened the dial leaves
 * it open (a tap on the anchor opens it), as does a press whose layout moved under the finger; a
 * later tap on the anchor goes back up one level, or closes at the root, the way Backspace does
 * in the which-key popup; a press anywhere else that ends on nothing closes (a tap outside
 * cancels).
 */
type ReleaseOnNothing = "stay" | "back" | "close";

/**
 * The dial's state machine: the path of open groups (one ring each, innermost first), the page
 * each ring is on, what the pointer is over, and what a release does. Arming a group opens its
 * items as the next ring out, so a single drag can walk the keymap; arming anything else closes
 * the rings outside it. Nothing acts until the pointer is released: a command runs, a file opens,
 * "More" turns the page, a group simply stays open. A pointer that is cancelled never acts. A
 * hardware keyboard drives the same state the way it drives the popup: a key picks the entry it
 * is bound to in the deepest open group, Backspace goes back, Escape closes.
 *
 * While a finger is down nothing moves: the pill mode is chosen once per opening, a ring's
 * radius depends only on the rings inside it, and a ring that has no room outside the current
 * ones waits (the group is armed, its items are not shown) until the release, when the dial
 * redraws from the deepest levels that fit.
 */
export class DialController {
	/** The open groups: the root first, then each group opened below it. Level k's items are path[k]'s. */
	private path: GroupNode[] = [];
	/** The page each level is on. */
	private pages: number[] = [];
	/** The first level that has a ring; earlier levels are open but undrawn. */
	private from = 0;
	private opened = false;
	private pressing: ReleaseOnNothing | null = null;
	/** Where the pointer last was during the current press, so a relayout can re-arm what is under it. */
	private lastPoint: DialPoint | null = null;
	/** Where the current press began, until the pointer has moved past TAP_SLOP from it; null for a press on the anchor. */
	private pressStart: DialPoint | null = null;
	private armed: ArmedKey | null = null;
	private geometry: DialGeometry | null = null;
	private mode: DialLayoutMode = "normal";
	private rings: DialRing[] = [];
	private slots: DialSlot[] = [];
	private targets: DialTarget[] = [];
	private listener: ((change: DialChange) => void) | null = null;

	constructor(
		private readonly host: DialHost,
		/**
		 * Measures the anchor and the screen with the breadcrumb pill in the given mode; called on
		 * open and on relayout, possibly several times while the mode is chosen. The mode measured
		 * last is the one in effect.
		 */
		private readonly measure: (mode: DialLayoutMode) => DialGeometry,
		/** The ring spacing, from the item size setting. */
		private readonly params: DialRingParams = DEFAULT_RING_PARAMS,
		private readonly deadZone: number = DEFAULT_DEAD_ZONE,
	) {}

	onChange(listener: (change: DialChange) => void): void {
		this.listener = listener;
	}

	get isOpen(): boolean {
		return this.opened;
	}

	get isPressing(): boolean {
		return this.pressing !== null;
	}

	/** Open at the root of `root`, replacing whatever was showing. */
	open(root: GroupNode): void {
		this.openAt(root, null);
	}

	close(): void {
		if (!this.opened) return;
		this.opened = false;
		this.pressing = null;
		this.lastPoint = null;
		this.armed = null;
		this.emit("structure");
	}

	/** Close the deepest open group; at the root, close the dial (what Backspace does in the which-key popup). */
	back(): void {
		if (!this.opened) return;
		if (this.path.length <= 1) {
			this.close();
			return;
		}
		this.path.pop();
		this.armed = null;
		this.plan();
		this.emit("structure");
	}

	/**
	 * Re-measure and re-place the open rings, e.g. after the keyboard or the window changed
	 * size. A press in progress keeps going, but what it arms is looked up again under the
	 * pointer, since the item that was there may have moved away, and a release on nothing then
	 * leaves the dial open rather than closing it under the user's finger.
	 */
	relayout(): void {
		if (!this.opened) return;
		const before = this.targets;
		this.chooseGeometry();
		if (this.pressing !== null) {
			this.pressing = "stay";
			this.armed = null;
		}
		this.plan(true);
		if (this.pressing !== null && this.lastPoint) {
			const index = this.hit(this.lastPoint);
			if (index !== null) this.arm(index);
		}
		this.emit(sameTargets(before, this.targets) ? "layout" : "structure");
	}

	/**
	 * Pointer down on the anchor: opens a closed dial (which needs the keymap's root); on an open
	 * one, starts a drag that may arm items.
	 */
	pressAnchor(root?: GroupNode): void {
		if (this.pressing !== null) return;
		if (!this.opened) {
			if (root) this.openAt(root, "stay");
			return;
		}
		this.pressing = "back";
		this.lastPoint = null;
		this.pressStart = null;
		this.armed = null;
		this.emit("armed");
	}

	/** Pointer down anywhere else while open: arms whatever is under it (a direct tap on an item). */
	pressAt(point: DialPoint): void {
		if (!this.opened || this.pressing !== null) return;
		this.pressing = "close";
		this.lastPoint = point;
		this.pressStart = point;
		this.setArmed(this.hit(point));
	}

	/** Pointer movement during a press. A tap's jitter around where it began changes nothing. */
	moveTo(point: DialPoint): void {
		if (this.pressing === null) return;
		if (this.pressStart && Math.hypot(point.x - this.pressStart.x, point.y - this.pressStart.y) <= TAP_SLOP) return;
		this.pressStart = null;
		this.lastPoint = point;
		this.setArmed(this.hit(point));
	}

	/** Pointer up: commit the armed item, or settle what a release on nothing means for this press. */
	release(): void {
		if (this.pressing === null) return;
		const onNothing = this.pressing;
		const armed = this.armed;
		this.pressing = null;
		this.lastPoint = null;
		this.pressStart = null;
		this.armed = null;
		const target = armed ? this.findTarget(armed) : null;
		if (target) {
			this.commit(target);
			return;
		}
		if (onNothing === "stay") {
			this.settle();
			return;
		}
		if (onNothing === "back") {
			this.back();
			return;
		}
		this.close();
	}

	/** The pointer was taken away (pointercancel, lost capture): forget the press without acting. */
	cancelPress(): void {
		if (this.pressing === null) return;
		this.pressing = null;
		this.lastPoint = null;
		this.pressStart = null;
		this.armed = null;
		this.settle();
	}

	/**
	 * A key typed while the dial is open, with the popup's semantics: Escape closes, Backspace
	 * closes the deepest open group (the dial at the root), any key bound in the deepest open
	 * group picks that entry exactly as a release on it would, and anything else does nothing.
	 * Every key is consumed by the caller either way, so nothing typed at an open dial lands in
	 * the note. A press in progress is dropped first, so the key and the finger cannot both act.
	 */
	typeKey(evt: KeyboardEventLike): void {
		if (!this.opened) return;
		if (this.pressing !== null) this.cancelPress();
		if (evt.key === "Escape") {
			this.close();
			return;
		}
		if (evt.key === "Backspace") {
			this.back();
			return;
		}
		const level = this.path.length - 1;
		const entry = findEntry(this.path[level], keyFromEvent(evt));
		if (entry && this.isVisible(entry)) this.commit({ kind: "entry", entry, level });
	}

	view(): DialView {
		const root = this.path[0];
		const armedTarget = this.armed ? this.findTarget(this.armed) : null;
		const outermost = this.rings.length > 0 ? this.from + this.rings.length - 1 : null;
		const deepest = outermost !== null ? this.path[outermost] : null;
		return {
			open: this.opened,
			pressing: this.pressing !== null,
			title: root?.title ?? "Neokeys",
			crumbs: this.opened ? breadcrumbTrail(this.path, (id) => this.host.resolveCommandName(id)) : [],
			armed: armedTarget ? this.armedView(armedTarget) : null,
			description: deepest ? this.groupDescription(deepest) : "",
			rings: this.opened ? this.rings.map((ring, index) => this.ringView(ring, index)) : [],
			arcs: this.opened && this.geometry ? ringArcs(this.geometry, this.rings, this.slots) : [],
			mode: this.mode,
			page: outermost !== null ? this.pages[outermost] : 0,
			pages: outermost !== null ? paging(this.visibleEntries(this.path[outermost]).length, this.rings[this.rings.length - 1].capacity).pages : 0,
		};
	}

	private openAt(root: GroupNode, pressing: ReleaseOnNothing | null): void {
		if (this.visibleEntries(root).length === 0) {
			this.host.notify(dialEmptyMessage());
			return;
		}
		this.path = [root];
		this.pages = [];
		this.from = 0;
		this.opened = true;
		this.armed = null;
		this.pressing = pressing;
		this.lastPoint = null;
		this.pressStart = null;
		this.chooseGeometry();
		this.plan(true);
		this.emit("structure");
	}

	private emit(change: DialChange): void {
		this.listener?.(change);
	}

	/** The pill mode for this opening: once per open and per relayout, never while a ring opens, with room for the keymap's widest path in mind. */
	private chooseGeometry(): void {
		const chosen = chooseMode(this.chainReach(this.path[0], firstRadius(this.params)), this.measure, this.params);
		this.mode = chosen.mode;
		this.geometry = chosen.geometry;
	}

	/** The radius the outermost ring would naturally take along the longest path of groups below `group`, whose own ring starts at `min`. */
	private chainReach(group: GroupNode, min: number): number {
		const entries = this.visibleEntries(group);
		const radius = radiusFor(entries.length, this.params, min);
		let reach = radius;
		for (const entry of entries) {
			if (entry.node.kind === "group") reach = Math.max(reach, this.chainReach(entry.node, radius + ringStep(this.params)));
		}
		return reach;
	}

	/**
	 * Place the open levels onto rings. Between presses (and on a relayout, when the screen
	 * itself changed) the dial draws as much of the path as fits, from the deepest levels; during
	 * a press the first drawn level is frozen so nothing moves under the finger, and a level that
	 * has no room outside the current rings is left undrawn until the release.
	 */
	private plan(refit = this.pressing === null): void {
		if (!this.geometry) return;
		const counts = this.path.map((group) => this.visibleEntries(group).length);
		if (refit) this.from = fittingFrom(this.geometry, this.params, counts);
		this.rings = planRings(this.geometry, this.params, counts.slice(this.from));
		this.slots = [];
		this.targets = [];
		this.rings.forEach((ring, index) => {
			const level = this.from + index;
			const entries = this.visibleEntries(this.path[level]);
			const split = paging(entries.length, ring.capacity);
			const page = split.pages > 0 ? (this.pages[level] ?? 0) % split.pages : 0;
			this.pages[level] = page;
			let targets: DialTarget[];
			if (split.pages > 1) {
				const start = page * split.perPage;
				targets = entries.slice(start, start + split.perPage).map((entry) => ({ kind: "entry", entry, level }));
				targets.push({ kind: "more", level });
			} else {
				targets = entries.map((entry) => ({ kind: "entry", entry, level }));
			}
			this.slots.push(...ringSlots(index, ring.capacity, targets.length));
			this.targets.push(...targets);
		});
		this.pages.length = this.path.length;
	}

	/** After a press ends without acting: drop any level left undrawn (never the root) and redraw from the deepest levels that fit. */
	private settle(): void {
		const before = this.targets;
		this.path.length = Math.max(1, Math.min(this.path.length, this.from + this.rings.length));
		this.plan();
		this.emit(sameTargets(before, this.targets) ? "armed" : "structure");
	}

	/** The slot under `point`, with the armed slot keeping its share of its ring's band even once that ring is an inner one. */
	private hit(point: DialPoint): number | null {
		if (!this.geometry) return null;
		const sticky = this.armed ? this.targets.findIndex((_, i) => sameKey(this.keyOf(i), this.armed)) : -1;
		return hitTest(point, this.geometry, this.rings, this.slots, this.deadZone, this.params.itemSize, sticky === -1 ? null : sticky);
	}

	private keyOf(index: number): ArmedKey {
		const target = this.targets[index];
		return { level: target.level, identity: target.kind === "more" ? "more" : target.entry };
	}

	private findTarget(key: ArmedKey): DialTarget | null {
		const index = this.targets.findIndex((_, i) => sameKey(this.keyOf(i), key));
		return index === -1 ? null : this.targets[index];
	}

	/** Arm the slot at `index`, or nothing for null. */
	private setArmed(index: number | null): void {
		const key = index !== null ? this.keyOf(index) : null;
		if (sameKey(key, this.armed)) return;
		const restructured = index !== null ? this.arm(index) : this.disarm();
		if (index !== null) this.host.vibrate?.();
		this.emit(restructured ? "structure" : "armed");
	}

	/** Arm the target at `index`: a group opens its ring outside its own, anything else closes the rings outside its own. Returns whether the items on screen changed. */
	private arm(index: number): boolean {
		const target = this.targets[index];
		this.armed = this.keyOf(index);
		const next = this.path.slice(0, target.level + 1);
		if (target.kind === "entry" && target.entry.node.kind === "group") next.push(target.entry.node);
		return this.setPath(next);
	}

	/** Arm nothing: the open rings stay, but a group left undrawn (no room for its ring) is let go. */
	private disarm(): boolean {
		this.armed = null;
		return this.setPath(this.path.slice(0, this.from + this.rings.length));
	}

	private setPath(next: GroupNode[]): boolean {
		if (next.length === this.path.length && next.every((group, i) => group === this.path[i])) return false;
		const before = this.targets;
		this.path = next;
		this.plan();
		return !sameTargets(before, this.targets);
	}

	/**
	 * The entries the dial shows, in the popup's order: files, commands Obsidian knows on this
	 * device, and groups with at least one such entry below them. The keyboard popup lists an
	 * unknown command in red; on a touch screen it would only take a slot from the ones that
	 * work (several of the default keymap's window commands do not exist on phones).
	 */
	private visibleEntries(group: GroupNode): GroupEntry[] {
		return sortEntries(group).filter((entry) => this.isVisible(entry));
	}

	private isVisible(entry: GroupEntry): boolean {
		const { node } = entry;
		if (node.kind === "command") return this.host.isCommandKnown(node.command);
		if (node.kind === "group") return node.entries.some((child) => this.isVisible(child));
		return true;
	}

	private commit(target: DialTarget): void {
		if (target.kind === "more") {
			this.pages[target.level] = (this.pages[target.level] ?? 0) + 1;
			this.path.length = target.level + 1;
			this.plan();
			this.emit("structure");
			return;
		}

		const { node } = target.entry;
		if (node.kind === "group") {
			const before = this.targets;
			this.path.length = target.level + 1;
			this.path.push(node);
			this.plan();
			this.emit(sameTargets(before, this.targets) ? "armed" : "structure");
			return;
		}

		if (node.kind === "command" && !this.host.isCommandKnown(node.command)) {
			this.host.notify(commandUnavailableMessage(node.command));
			this.settle();
			return;
		}

		this.close();
		if (node.kind === "command") {
			this.host.executeCommand(node.command);
		} else {
			this.host.openFile(node.file);
		}
	}

	private targetLabel(target: DialTarget): string {
		if (target.kind === "more") return "More";
		return entryLabel(target.entry, (id) => this.host.resolveCommandName(id));
	}

	/** A group's own description, or its items as "key label" pairs when it has none, so a ring of bare keys can be read. */
	private groupDescription(group: GroupNode): string {
		if (group.description) return group.description;
		return this.visibleEntries(group)
			.map((entry) => `${keyGlyph(entry.key)} ${entryLabel(entry, (id) => this.host.resolveCommandName(id))}`)
			.join(" · ");
	}

	private targetDescription(target: DialTarget, waiting: boolean): string {
		if (target.kind === "more") return "Next page";
		const { node } = target.entry;
		if (node.kind === "group") {
			const description = this.groupDescription(node);
			if (!waiting) return description;
			return description === "" ? "Let go to open" : `Let go to open · ${description}`;
		}
		if (node.kind === "file") return node.description ? node.file : "";
		return "";
	}

	private ringView(ring: DialRing, index: number): DialRingView {
		const level = this.from + index;
		const group = this.path[level];
		const items: DialItemView[] = [];
		this.targets.forEach((target, flat) => {
			if (target.level === level) items.push(this.itemView(target, flat));
		});
		return {
			level,
			group,
			radius: ring.radius,
			items,
			page: this.pages[level] ?? 0,
			pages: paging(this.visibleEntries(group).length, ring.capacity).pages,
		};
	}

	private itemView(target: DialTarget, index: number): DialItemView {
		const position = this.geometry ? slotPosition(this.slots[index], this.geometry, this.rings) : { x: 0, y: 0 };
		const identity = target.kind === "more" ? "more" : target.entry;
		return {
			kind: target.kind === "more" ? "more" : target.entry.node.kind,
			key: target.kind === "more" ? "…" : keyGlyph(target.entry.key),
			label: this.targetLabel(target),
			identity,
			armed: sameKey(this.keyOf(index), this.armed),
			open: target.kind === "entry" && target.entry.node === this.path[target.level + 1],
			x: position.x,
			y: position.y,
			size: this.params.itemSize,
		};
	}

	private armedView(target: DialTarget): DialArmedView {
		const index = this.targets.indexOf(target);
		const position = this.geometry ? slotPosition(this.slots[index], this.geometry, this.rings) : { x: 0, y: 0 };
		const node = target.kind === "entry" ? target.entry.node : null;
		const open = node?.kind === "group" && node === this.path[target.level + 1];
		const waiting = open && target.level + 1 >= this.from + this.rings.length;
		return {
			kind: target.kind === "more" ? "more" : target.entry.node.kind,
			key: target.kind === "more" ? "…" : keyGlyph(target.entry.key),
			label: this.targetLabel(target),
			open,
			waiting,
			description: this.targetDescription(target, waiting),
			count: node?.kind === "group" ? this.visibleEntries(node).length : null,
			x: position.x,
			y: position.y,
			size: this.params.itemSize,
		};
	}
}

function sameKey(a: ArmedKey | null, b: ArmedKey | null): boolean {
	if (a === null || b === null) return a === b;
	return a.level === b.level && a.identity === b.identity;
}

/** The same entries on the same levels in the same order (by identity), so the renderer may keep its item nodes. */
function sameTargets(a: DialTarget[], b: DialTarget[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((target, i) => {
		const other = b[i];
		if (target.kind !== other.kind || target.level !== other.level) return false;
		return target.kind !== "entry" || other.kind !== "entry" || target.entry === other.entry;
	});
}
