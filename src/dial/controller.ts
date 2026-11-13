import { keyGlyph } from "../keys";
import { breadcrumbTrail, entryLabel, sortEntries } from "../tree";
import type { GroupEntry, GroupNode } from "../types";
import {
	chooseLayout,
	COMPACT_RING_PARAMS,
	DEFAULT_DEAD_ZONE,
	hitTest,
	paging,
	placeSlots,
	slotPosition,
	totalCapacity,
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
	/** A command entry whose id Obsidian does not currently know; shown the way the which-key popup shows it. */
	invalid: boolean;
	armed: boolean;
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
	/** One label per group descended into below the root. */
	crumbs: string[];
	/** The label of the item under the pointer, shown at the end of the breadcrumb while pressing. */
	armedLabel: string | null;
	armedInvalid: boolean;
	items: DialItemView[];
	/** Items are at the minimum thumb size with tighter spacing, so the renderer can simplify them. */
	compact: boolean;
	/** Where the breadcrumb pill sits for this layout. */
	mode: DialLayoutMode;
	page: number;
	pages: number;
}

/** Which part of the view a change touched, so the renderer can skip rebuilding what did not move. */
export type DialChange = "structure" | "armed";

type DialTarget = { kind: "entry"; entry: GroupEntry } | { kind: "more" };

/**
 * How the current press started, which decides what a release on nothing means: the press that
 * opened the dial leaves it open (a tap on the anchor opens it); a later tap on the anchor goes
 * back up one level, or closes at the root, the way Backspace does in the which-key popup; a
 * press anywhere else that ends on nothing closes (a tap outside cancels).
 */
type PressOrigin = "anchor-opened" | "anchor" | "backdrop";

/**
 * The dial's state machine: which level of the keymap is showing, which page of it, what the
 * pointer is currently over, and what a release does. Nothing acts until the pointer is released:
 * dragging across an item only arms it, releasing on it commits (a group opens, a command runs, a
 * file opens, "More" turns the page). A pointer that is cancelled never acts.
 */
export class DialController {
	private path: GroupNode[] = [];
	private page = 0;
	private opened = false;
	private pressOrigin: PressOrigin | null = null;
	private armed: number | null = null;
	private geometry: DialGeometry | null = null;
	private params: DialRingParams | null = null;
	private mode: DialLayoutMode = "normal";
	private rings: DialRing[] = [];
	private slots: DialSlot[] = [];
	private targets: DialTarget[] = [];
	private pages = 0;
	private listener: ((change: DialChange) => void) | null = null;

	constructor(
		private readonly host: DialHost,
		/**
		 * Measures the anchor and the screen with the breadcrumb pill in the given mode; called on
		 * open, on descend and on relayout, possibly several times while the layout is chosen. The
		 * mode measured last is the one in effect.
		 */
		private readonly measure: (mode: DialLayoutMode) => DialGeometry,
		private readonly deadZone: number = DEFAULT_DEAD_ZONE,
	) {}

	onChange(listener: (change: DialChange) => void): void {
		this.listener = listener;
	}

	get isOpen(): boolean {
		return this.opened;
	}

	get isPressing(): boolean {
		return this.pressOrigin !== null;
	}

	/** Open at the root of `root`, replacing whatever was showing. */
	open(root: GroupNode): void {
		this.path = [root];
		this.page = 0;
		this.opened = true;
		this.armed = null;
		this.pressOrigin = null;
		this.relayout();
	}

	close(): void {
		if (!this.opened) return;
		this.opened = false;
		this.pressOrigin = null;
		this.armed = null;
		this.emit("structure");
	}

	/** Up one level; at the root, closes (the same thing Backspace does in the which-key popup). */
	back(): void {
		if (!this.opened) return;
		if (this.path.length <= 1) {
			this.close();
			return;
		}
		this.path.pop();
		this.page = 0;
		this.armed = null;
		this.relayout();
	}

	/** Re-measure and re-place the current level, e.g. after the keyboard or the window changed size. */
	relayout(): void {
		if (!this.opened) return;
		const count = sortEntries(this.currentGroup).length;
		const layout = chooseLayout(count, this.measure);
		this.measure(layout.mode);
		this.mode = layout.mode;
		this.geometry = layout.geometry;
		this.params = layout.params;
		this.rings = layout.rings;
		this.rebuildSlots();
		this.emit("structure");
	}

	/** Pointer down on the anchor: opens a closed dial; on an open one, starts a drag that may arm items. */
	pressAnchor(root: GroupNode): void {
		if (this.pressOrigin !== null) return;
		if (!this.opened) {
			this.open(root);
			this.pressOrigin = "anchor-opened";
			return;
		}
		this.pressOrigin = "anchor";
		this.armed = null;
		this.emit("armed");
	}

	/** Pointer down anywhere else while open: arms whatever is under it (a direct tap on an item). */
	pressAt(point: DialPoint): void {
		if (!this.opened || this.pressOrigin !== null) return;
		this.pressOrigin = "backdrop";
		this.setArmed(this.hit(point));
	}

	moveTo(point: DialPoint): void {
		if (this.pressOrigin === null) return;
		this.setArmed(this.hit(point));
	}

	/** Pointer up: commit the armed item, or settle what a release on nothing means for this press. */
	release(): void {
		if (this.pressOrigin === null) return;
		const origin = this.pressOrigin;
		const armed = this.armed;
		this.pressOrigin = null;
		this.armed = null;
		if (armed !== null && armed < this.targets.length) {
			this.commit(this.targets[armed]);
			return;
		}
		if (origin === "anchor-opened") {
			this.emit("armed");
			return;
		}
		if (origin === "anchor") {
			this.back();
			return;
		}
		this.close();
	}

	/** The pointer was taken away (pointercancel, lost capture): forget the press without acting. */
	cancelPress(): void {
		if (this.pressOrigin === null) return;
		this.pressOrigin = null;
		this.armed = null;
		this.emit("armed");
	}

	view(): DialView {
		const root = this.path[0];
		const armedTarget = this.armed !== null ? this.targets[this.armed] : undefined;
		return {
			open: this.opened,
			pressing: this.pressOrigin !== null,
			title: root?.title ?? "Neokeys",
			crumbs: this.opened ? breadcrumbTrail(this.path, (id) => this.host.resolveCommandName(id)) : [],
			armedLabel: armedTarget ? this.targetLabel(armedTarget) : null,
			armedInvalid: armedTarget ? this.targetInvalid(armedTarget) : false,
			items: this.opened ? this.targets.map((target, index) => this.itemView(target, index)) : [],
			compact: this.params === COMPACT_RING_PARAMS,
			mode: this.mode,
			page: this.page,
			pages: this.pages,
		};
	}

	private get currentGroup(): GroupNode {
		return this.path[this.path.length - 1];
	}

	private emit(change: DialChange): void {
		this.listener?.(change);
	}

	private hit(point: DialPoint): number | null {
		if (!this.geometry || !this.params) return null;
		return hitTest(point, this.geometry, this.rings, this.slots, this.deadZone, this.params.itemSize);
	}

	private setArmed(index: number | null): void {
		if (index === this.armed) return;
		this.armed = index;
		if (index !== null) this.host.vibrate?.();
		this.emit("armed");
	}

	/** Place the current page of the current level onto the rings. */
	private rebuildSlots(): void {
		const entries = sortEntries(this.currentGroup);
		const split = paging(entries.length, totalCapacity(this.rings));
		this.pages = split.pages;
		if (this.page >= this.pages) this.page = 0;

		if (split.pages > 1) {
			const start = this.page * split.perPage;
			this.targets = entries.slice(start, start + split.perPage).map((entry) => ({ kind: "entry", entry }));
			this.targets.push({ kind: "more" });
		} else {
			this.targets = entries.map((entry) => ({ kind: "entry", entry }));
		}
		this.slots = placeSlots(this.rings, this.targets.length);
		// Only what the rings could place is reachable; anything beyond is unreachable (no room at all).
		this.targets = this.targets.slice(0, this.slots.length);
	}

	private commit(target: DialTarget): void {
		if (target.kind === "more") {
			this.page = this.pages > 0 ? (this.page + 1) % this.pages : 0;
			this.rebuildSlots();
			this.emit("structure");
			return;
		}

		const { node } = target.entry;
		if (node.kind === "group") {
			this.path.push(node);
			this.page = 0;
			this.relayout();
			return;
		}

		if (node.kind === "command" && !this.host.isCommandKnown(node.command)) {
			this.host.notify(`Neokeys: command "${node.command}" is not available`);
			this.emit("armed");
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

	private targetInvalid(target: DialTarget): boolean {
		if (target.kind !== "entry") return false;
		const { node } = target.entry;
		return node.kind === "command" && !this.host.isCommandKnown(node.command);
	}

	private itemView(target: DialTarget, index: number): DialItemView {
		const slot = this.slots[index];
		const position = this.geometry ? slotPosition(slot, this.geometry, this.rings) : { x: 0, y: 0 };
		return {
			kind: target.kind === "more" ? "more" : target.entry.node.kind,
			key: target.kind === "more" ? "…" : keyGlyph(target.entry.key),
			label: this.targetLabel(target),
			invalid: this.targetInvalid(target),
			armed: index === this.armed,
			x: position.x,
			y: position.y,
			size: this.params?.itemSize ?? 0,
		};
	}
}
