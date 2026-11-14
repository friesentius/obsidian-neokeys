import { keyFromEvent, keyGlyph, type KeyboardEventLike } from "../keys";
import { commandUnavailableMessage, dialEmptyMessage } from "../messages";
import { breadcrumbTrail, entryLabel, findEntry, sortEntries } from "../tree";
import type { GroupEntry, GroupNode } from "../types";
import {
	chooseMode,
	DEFAULT_DEAD_ZONE,
	DEFAULT_RING_PARAMS,
	edgeRoom,
	fittingFrom,
	hitTest,
	lensFocus,
	naturalReach,
	peakSize,
	planRings,
	ringArcs,
	ringSlots,
	ringUnder,
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

export type DialItemKind = "group" | "command" | "file";

export interface DialItemView {
	kind: DialItemKind;
	/** The key glyph shown on the item. */
	key: string;
	label: string;
	/** What identifies the item across renders: its keymap entry. */
	identity: GroupEntry;
	armed: boolean;
	/** The group whose items are on the ring outside this one. */
	open: boolean;
	x: number;
	y: number;
	/** The circle's diameter as drawn right now: shrunk on a crowded ring, grown inside the lens. */
	size: number;
	/** How far inside the lens the circle is, 0 to 1, so a grown circle is drawn above the ones it crowds. */
	weight: number;
}

export interface DialRingView {
	/** How deep in the path this ring's group is: 0 for the root's own items. */
	level: number;
	/** The group whose items this ring shows. */
	group: GroupNode;
	radius: number;
	items: DialItemView[];
	/** The item on the ring inside whose group this ring shows, for a ring that flies out from it; null for the innermost ring on screen. */
	parent: { x: number; y: number } | null;
}

export interface DialArmedView {
	kind: DialItemKind;
	key: string;
	label: string;
	/** A group that is in the path: its ring is open outside its own, or waiting for the release to open. Its crumb is the last of the trail. */
	open: boolean;
	/** The armed group's ring has no room outside the current rings, so it opens on the release instead. */
	waiting: boolean;
	/** What there is to say about the item beyond its label: a group's description or, failing that, its items; a file's path; a command's name in Obsidian when the label is something else; a cue to let go for a waiting group. */
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
}

/**
 * Which part of the view a change touched, so the renderer can skip rebuilding what did not
 * change: `structure` means the set of rings or items is different (open, close, a ring opening
 * or closing), `layout` that the same items moved (a relayout), `armed` that the highlight and
 * the pill changed (the items may also have moved, since the lens moves with the finger), `lens`
 * that only the lens moved: the same items, nothing newly armed, no change to the pill.
 */
export type DialChange = "structure" | "layout" | "armed" | "lens";

interface DialTarget {
	entry: GroupEntry;
	level: number;
}

/** What was armed, by identity rather than position, so it survives the rings around it changing. */
interface ArmedKey {
	level: number;
	identity: GroupEntry;
}

/**
 * How far a pointer may wander from where its press began before the press counts as a drag:
 * a tap jitters by a few pixels, and the rings a tap on a group opens must not turn that jitter
 * into a move onto one of the group's items. A tap never moves the lens either.
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
 * The dial's state machine: the path of open groups (one ring each, innermost first), where the
 * lens sits on each ring, what the pointer is over, and what a release does. Arming a group
 * opens its items as the next ring out, so a single drag can walk the keymap; arming anything
 * else closes the rings outside it. Nothing acts until the pointer is released: a command runs,
 * a file opens, a group simply stays open, a shrunk bead comes into the lens. A pointer that is
 * cancelled never acts. A hardware keyboard drives the same state the way it drives the popup:
 * a key picks the entry it is bound to in the deepest open group, Backspace goes back, Escape
 * closes.
 *
 * The rings themselves never move while a finger is down: the pill mode is chosen once per
 * opening, a ring's radius depends only on the rings inside it, and a ring that has no room
 * outside the current ones waits (the group is armed, its items are not shown) until the
 * release, when the dial redraws from the deepest levels that fit. The circles on a ring do
 * move: the lens follows the finger along the ring it is on, growing the circles under it and
 * making room around them, and a ring the finger has left keeps its lens where it was.
 */
export class DialController {
	/** The open groups: the root first, then each group opened below it. Level k's items are path[k]'s. */
	private path: GroupNode[] = [];
	/** Where the lens sits on each level's ring, 0 to 1 along the sweep, or null while no finger has been on it. */
	private focus: (number | null)[] = [];
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
		/** The ring layout: item size, lens peak and radius rule, from the settings. */
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
		this.focus.length = this.path.length;
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

	/** Pointer down anywhere else while open: arms whatever is under it (a direct tap on an item). The lens stays where it is. */
	pressAt(point: DialPoint): void {
		if (!this.opened || this.pressing !== null) return;
		this.pressing = "close";
		this.lastPoint = point;
		this.pressStart = point;
		this.setArmed(this.hit(point));
	}

	/**
	 * Pointer movement during a press. A tap's jitter around where it began changes nothing;
	 * once past it, the lens on the ring under the pointer follows the pointer, and whatever is
	 * under the pointer in the layout that gives is armed.
	 */
	moveTo(point: DialPoint): void {
		if (this.pressing === null) return;
		if (this.pressStart && Math.hypot(point.x - this.pressStart.x, point.y - this.pressStart.y) <= TAP_SLOP) return;
		this.pressStart = null;
		this.lastPoint = point;
		const lensMoved = this.follow(point);
		if (!this.setArmed(this.hit(point)) && lensMoved) this.emit("lens");
	}

	/**
	 * Pointer up: commit the armed item, or settle what a release on nothing means for this
	 * press. A tap (a press that never moved) on a shrunk bead outside the lens brings the bead
	 * into the lens instead of selecting it, so a small target is confirmed by a second tap;
	 * `direct` skips that, for an activation that is not a touch.
	 */
	release(direct = false): void {
		if (this.pressing === null) return;
		const onNothing = this.pressing;
		const armed = this.armed;
		const tapped = this.pressStart !== null;
		this.pressing = null;
		this.lastPoint = null;
		this.pressStart = null;
		this.armed = null;
		const index = armed ? this.indexOf(armed) : -1;
		if (index !== -1) {
			if (tapped && !direct && this.slots[index].bead) {
				this.focusBead(index);
				return;
			}
			this.commit(this.targets[index]);
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
		if (entry && this.isVisible(entry)) this.commit({ entry, level });
	}

	view(): DialView {
		const root = this.path[0];
		const armedIndex = this.armed ? this.indexOf(this.armed) : -1;
		const outermost = this.rings.length > 0 ? this.from + this.rings.length - 1 : null;
		const deepest = outermost !== null ? this.path[outermost] : null;
		return {
			open: this.opened,
			pressing: this.pressing !== null,
			title: root?.title ?? "Neokeys",
			crumbs: this.opened ? breadcrumbTrail(this.path, (id) => this.host.resolveCommandName(id)) : [],
			armed: armedIndex !== -1 ? this.armedView(armedIndex) : null,
			description: deepest ? this.groupDescription(deepest) : "",
			rings: this.opened ? this.rings.map((ring, index) => this.ringView(ring, index)) : [],
			arcs: this.opened && this.geometry ? ringArcs(this.geometry, this.rings, this.slots) : [],
			mode: this.mode,
		};
	}

	private openAt(root: GroupNode, pressing: ReleaseOnNothing | null): void {
		if (this.visibleEntries(root).length === 0) {
			this.host.notify(dialEmptyMessage());
			return;
		}
		this.path = [root];
		this.focus = [];
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
		const chosen = chooseMode(this.chainReach(this.path[0]), this.measure, this.params);
		this.mode = chosen.mode;
		this.geometry = chosen.geometry;
	}

	/** The radius the outermost ring would naturally take along the widest or deepest chain of groups from `group`, below the levels of `counts` above it. */
	private chainReach(group: GroupNode, counts: readonly number[] = []): number {
		const entries = this.visibleEntries(group);
		const chain = [...counts, entries.length];
		let reach = naturalReach(this.params, chain);
		for (const entry of entries) {
			if (entry.node.kind === "group") reach = Math.max(reach, this.chainReach(entry.node, chain));
		}
		return reach;
	}

	/**
	 * Place the open levels onto rings, each level's items laid out around its ring's lens.
	 * Between presses (and on a relayout, when the screen itself changed) the dial draws as much
	 * of the path as fits, from the deepest levels; during a press the first drawn level is
	 * frozen so no ring moves under the finger, and a level that has no room outside the current
	 * rings is left undrawn until the release.
	 */
	private plan(refit = this.pressing === null): void {
		if (!this.geometry) return;
		const counts = this.path.map((group) => this.visibleEntries(group).length);
		if (refit) this.from = fittingFrom(this.geometry, this.params, counts);
		this.rings = planRings(this.geometry, this.params, counts.slice(this.from));
		this.slots = [];
		this.targets = [];
		const peak = peakSize(this.geometry, this.params);
		const room = edgeRoom(this.geometry);
		this.rings.forEach((ring, index) => {
			const level = this.from + index;
			const entries = this.visibleEntries(this.path[level]);
			this.slots.push(...ringSlots(index, ring, entries.length, this.params, peak, this.focus[level] ?? null, room));
			this.targets.push(...entries.map((entry) => ({ entry, level })));
		});
		this.focus.length = this.path.length;
	}

	/**
	 * Move the lens of the ring under `point` to the pointer's angle, and lay that ring out again.
	 * The outermost ring, the one in play, always follows; an inner ring follows only while the
	 * pointer is actually on one of its circles (or the armed slot's share), so a thumb crossing
	 * an inner ring's band on its way out does not pull a sibling under itself and swap the rings
	 * outside. Returns whether anything moved.
	 */
	private follow(point: DialPoint): boolean {
		if (!this.geometry) return false;
		const ring = ringUnder(point, this.geometry, this.rings, this.slots, this.deadZone, this.params.itemSize);
		if (ring === null) return false;
		const outermost = Math.max(...this.slots.map((slot) => slot.ring));
		if (ring !== outermost) {
			const hit = this.hit(point);
			if (hit === null || this.slots[hit].ring !== ring) return false;
		}
		return this.setFocus(this.from + ring, lensFocus(point, this.geometry));
	}

	/** Put the lens of `level`'s ring at `focus`, laying the rings out again when that is a change. */
	private setFocus(level: number, focus: number | null): boolean {
		if ((this.focus[level] ?? null) === focus) return false;
		this.focus[level] = focus;
		this.plan();
		return true;
	}

	/** The lens parameter the pointer would give a ring right now: where it is along the sweep, or null outside a press that has moved. */
	private fingerFocus(): number | null {
		if (!this.geometry || !this.lastPoint || this.pressStart !== null) return null;
		return lensFocus(this.lastPoint, this.geometry);
	}

	/**
	 * Bring the bead at `index` into its ring's lens, which grows it to a size a tap can mean;
	 * nothing is armed, the pill says so, and the dial stays open. The press is over, so the
	 * rings are refitted as well: a group bead whose ring had no room is redrawn from the
	 * deepest levels that fit, which is a new structure.
	 */
	private focusBead(index: number): void {
		const { level } = this.targets[index];
		const own = this.slots.filter((slot) => slot.ring === this.slots[index].ring);
		const position = own.length > 1 ? this.slots[index].index / (own.length - 1) : 0.5;
		const before = this.targets;
		this.setFocus(level, position);
		this.emit(sameTargets(before, this.targets) ? "armed" : "structure");
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
		const sticky = this.armed ? this.indexOf(this.armed) : -1;
		return hitTest(point, this.geometry, this.rings, this.slots, this.deadZone, this.params.itemSize, sticky === -1 ? null : sticky);
	}

	private keyOf(index: number): ArmedKey {
		const target = this.targets[index];
		return { level: target.level, identity: target.entry };
	}

	private indexOf(key: ArmedKey): number {
		return this.targets.findIndex((target) => target.level === key.level && target.entry === key.identity);
	}

	/** Arm the slot at `index`, or nothing for null. Returns whether a change was emitted. */
	private setArmed(index: number | null): boolean {
		const key = index !== null ? this.keyOf(index) : null;
		if (sameKey(key, this.armed)) return false;
		const restructured = index !== null ? this.arm(index) : this.disarm();
		if (index !== null) this.host.vibrate?.();
		this.emit(restructured ? "structure" : "armed");
		return true;
	}

	/** Arm the target at `index`: a group opens its ring outside its own, anything else closes the rings outside its own. Returns whether the items on screen changed. */
	private arm(index: number): boolean {
		const target = this.targets[index];
		this.armed = this.keyOf(index);
		const next = this.path.slice(0, target.level + 1);
		if (target.entry.node.kind === "group") next.push(target.entry.node);
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
		this.usePath(next);
		this.plan();
		return !sameTargets(before, this.targets);
	}

	/**
	 * Take `next` as the path. A level whose group changed, and every level below it, forgets
	 * its lens; a ring that opens under a moving finger starts with its lens where the finger
	 * is, so moving straight out onto it finds the circle there already grown.
	 */
	private usePath(next: GroupNode[]): void {
		const changed = next.findIndex((group, i) => group !== this.path[i]);
		if (changed !== -1) {
			this.focus.length = Math.min(this.focus.length, changed);
			for (let level = changed; level < next.length; level++) this.focus[level] = this.fingerFocus();
		}
		this.path = next;
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
		const { node } = target.entry;
		if (node.kind === "group") {
			const before = this.targets;
			this.usePath([...this.path.slice(0, target.level + 1), node]);
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
		return entryLabel(target.entry, (id) => this.host.resolveCommandName(id));
	}

	/** A group's own description, or its items as "key label" pairs when it has none, so a ring of bare keys can be read. */
	private groupDescription(group: GroupNode): string {
		if (group.description) return group.description;
		return this.visibleEntries(group)
			.map((entry) => `${keyGlyph(entry.key)} ${entryLabel(entry, (id) => this.host.resolveCommandName(id))}`)
			.join(" · ");
	}

	/**
	 * What the pill's second line says about an armed item: always about the item itself, never
	 * about the group it is in. A group gives its description (or its items); a file with a
	 * description of its own gives its path; a command gives its name in Obsidian when the
	 * keymap labels it something else, and nothing more when the label already is that name.
	 */
	private targetDescription(target: DialTarget, waiting: boolean): string {
		const { node } = target.entry;
		if (node.kind === "group") {
			const description = this.groupDescription(node);
			if (!waiting) return description;
			return description === "" ? "Let go to open" : `Let go to open · ${description}`;
		}
		if (node.kind === "file") return node.description ? node.file : "";
		const name = this.host.resolveCommandName(node.command);
		return name !== undefined && name !== this.targetLabel(target) ? name : "";
	}

	private ringView(ring: DialRing, index: number): DialRingView {
		const level = this.from + index;
		const group = this.path[level];
		const items: DialItemView[] = [];
		this.targets.forEach((target, flat) => {
			if (target.level === level) items.push(this.itemView(target, flat));
		});
		const parentIndex = index > 0 ? this.targets.findIndex((target) => target.level === level - 1 && target.entry.node === group) : -1;
		const parent = parentIndex !== -1 && this.geometry ? slotPosition(this.slots[parentIndex], this.geometry, this.rings) : null;
		return { level, group, radius: ring.radius, items, parent };
	}

	private itemView(target: DialTarget, index: number): DialItemView {
		const position = this.geometry ? slotPosition(this.slots[index], this.geometry, this.rings) : { x: 0, y: 0 };
		return {
			kind: target.entry.node.kind,
			key: keyGlyph(target.entry.key),
			label: this.targetLabel(target),
			identity: target.entry,
			armed: sameKey(this.keyOf(index), this.armed),
			open: target.entry.node === this.path[target.level + 1],
			x: position.x,
			y: position.y,
			size: this.slots[index].size,
			weight: this.slots[index].weight,
		};
	}

	private armedView(index: number): DialArmedView {
		const target = this.targets[index];
		const position = this.geometry ? slotPosition(this.slots[index], this.geometry, this.rings) : { x: 0, y: 0 };
		const { node } = target.entry;
		const open = node.kind === "group" && node === this.path[target.level + 1];
		const waiting = open && target.level + 1 >= this.from + this.rings.length;
		return {
			kind: node.kind,
			key: keyGlyph(target.entry.key),
			label: this.targetLabel(target),
			open,
			waiting,
			description: this.targetDescription(target, waiting),
			count: node.kind === "group" ? this.visibleEntries(node).length : null,
			x: position.x,
			y: position.y,
			size: this.slots[index].size,
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
	return a.every((target, i) => target.level === b[i].level && target.entry === b[i].entry);
}
