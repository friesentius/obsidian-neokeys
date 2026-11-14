import { App, Notice, Scope, setIcon } from "obsidian";
import {
	DialController,
	type DialArmedView,
	type DialChange,
	type DialHost,
	type DialItemView,
	type DialRingView,
	type DialView,
} from "../dial/controller";
import { cardFits, cardTop, placeBubble, type CoveredCircle } from "../dial/description";
import { ANCHOR_RADIUS, ringParamsFor, type DialArc, type DialGeometry, type DialLayoutMode } from "../dial/layout";
import { getCommandName, hasCommand } from "../obsidianCommands";
import type { DialCorner, DialDescription, DialRadiusRule, DialRingAnimation, GroupEntry, GroupNode } from "../types";

export interface MobileDialCallbacks {
	executeCommand(id: string): void;
	openFile(path: string): void;
}

export interface MobileDialAnimation {
	/** Any motion at all (the backdrop's fade, the lens easing); off when the OS prefers reduced motion. */
	enabled: boolean;
	durationMs: number;
	/** How a ring appears as it opens, or null for no entrance (the setting off, or reduced motion). */
	ring: DialRingAnimation | null;
}

export interface MobileDialOptions {
	corner: DialCorner;
	/** Diameter of the dial's items in px, from the settings (MIN_DIAL_ITEM_SIZE to MAX_DIAL_ITEM_SIZE). */
	itemSize: number;
	/** Where the rings sit: at fixed radii, or each as far out as its level needs. */
	radiusRule: DialRadiusRule;
	/** How large the circle under the thumb grows, as a multiple of the item size. */
	lensPeak: number;
	/** Where the armed item is described beyond the pill's own line. */
	description: DialDescription;
	/** Read on every open, so a settings change (or the OS's reduced-motion preference) applies next time. */
	animation(): MobileDialAnimation;
}

/** Items keep this far from the screen's side edges, from the breadcrumb pill, and from whatever is below the anchor. */
const EDGE_MARGIN = 4;

/** How far the anchor sits from the screen's edges and from the chrome below it (the stylesheet's --neokeys-dial-edge). */
const ANCHOR_EDGE = 12;

/**
 * Where the view header is when none can be measured (no note open): Obsidian's own variables,
 * which it defines on phones; tablets leave the offset undefined, hence the measuring.
 */
const HEADER_TOP_FALLBACK = "var(--view-header-top-offset, var(--safe-area-inset-top, 0px))";
const HEADER_BOTTOM_FALLBACK = `calc(${HEADER_TOP_FALLBACK} + var(--view-header-height, 44px))`;

/** A haptic tick where the platform offers one; never relied on (iOS WebKit has no vibrate()). */
function vibrate(): void {
	const nav = activeWindow.navigator;
	if (typeof nav.vibrate !== "function") return;
	try {
		nav.vibrate(8);
	} catch {
		// Blocked or unsupported: the armed highlight is the feedback that always works.
	}
}

/** The item nodes of one ring on screen, kept while the ring shows the same items of the same group. */
interface RingNodes {
	group: GroupNode;
	el: HTMLElement;
	items: { identity: GroupEntry; el: HTMLElement }[];
}

/**
 * The mobile dial's DOM: a fixed, full-screen layer holding the pinned anchor button, the rings
 * of key circles, the breadcrumb pill with its Back and Close buttons, the optional description
 * card or bubble, and a backdrop that only exists while the dial is open (so an idle dial claims
 * nothing beyond the anchor itself, and Obsidian's edge swipes keep working). All geometry and
 * gesture logic lives in DialController; this class measures, forwards pointer and key events,
 * and renders the controller's view.
 */
export class MobileDial {
	private readonly layerEl: HTMLElement;
	private readonly backdropEl: HTMLElement;
	private readonly pillEl: HTMLElement;
	private readonly arcsEl: SVGElement;
	private readonly crumbsEl: HTMLElement;
	private readonly descEl: HTMLElement;
	private readonly fanEl: HTMLElement;
	private readonly cardEl: HTMLElement;
	private readonly bubbleEl: HTMLElement;
	private readonly anchorEl: HTMLElement;
	private readonly controller: DialController;
	private rings: RingNodes[] = [];
	/** The one pointer the dial is tracking; any other pointer is ignored until it is released. */
	private activePointerId: number | null = null;
	/** The keyboard scope that owns every key while the dial is open; null while it is closed. */
	private scope: Scope | null = null;
	/** A pending re-measure, so a burst of observer callbacks produces one relayout per frame. */
	private frame: number | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private mutationObserver: MutationObserver | null = null;
	private classObserver: MutationObserver | null = null;
	private readonly teardown: (() => void)[] = [];

	constructor(
		private readonly app: App,
		/** Parses the current keymap, or reports why it cannot and returns null. */
		private readonly getRoot: () => GroupNode | null,
		private readonly options: MobileDialOptions,
		callbacks: MobileDialCallbacks,
	) {
		const host: DialHost = {
			isCommandKnown: (id) => hasCommand(app, id),
			resolveCommandName: (id) => getCommandName(app, id),
			executeCommand: (id) => callbacks.executeCommand(id),
			openFile: (path) => callbacks.openFile(path),
			notify: (message) => {
				new Notice(message, 6000);
			},
			vibrate,
		};
		this.controller = new DialController(host, (mode) => this.measure(mode), ringParamsFor(options.itemSize, { peak: options.lensPeak, rule: options.radiusRule }));
		this.controller.onChange((change) => this.render(change));

		this.layerEl = createDiv({ cls: "neokeys-dial" });
		this.backdropEl = this.layerEl.createDiv({ cls: "neokeys-dial-backdrop" });

		this.pillEl = this.layerEl.createDiv({ cls: "neokeys-dial-pill" });
		const backEl = this.pillEl.createEl("button", {
			cls: "neokeys-dial-pill-button",
			attr: { type: "button", "aria-label": "Back", tabindex: "-1" },
		});
		setIcon(backEl, "arrow-left");
		// The pill's text is what a screen reader hears change: the path, the armed item and its description.
		const textEl = this.pillEl.createDiv({ cls: "neokeys-dial-pill-text", attr: { "aria-live": "polite", "aria-atomic": "true" } });
		this.crumbsEl = textEl.createDiv({ cls: "neokeys-dial-crumbs" });
		this.descEl = textEl.createDiv({ cls: "neokeys-dial-desc" });
		const closeEl = this.pillEl.createEl("button", {
			cls: "neokeys-dial-pill-button",
			attr: { type: "button", "aria-label": "Close", tabindex: "-1" },
		});
		setIcon(closeEl, "x");

		// The ring arcs sit under the fan in the stacking order, so they show only between items.
		this.arcsEl = this.layerEl.createSvg("svg", { cls: "neokeys-dial-arcs", attr: { "aria-hidden": "true" } });
		this.fanEl = this.layerEl.createDiv({ cls: "neokeys-dial-fan", attr: { role: "group", "aria-label": "Neokeys dial items" } });
		this.cardEl = this.layerEl.createDiv({ cls: "neokeys-dial-card", attr: { "aria-hidden": "true" } });
		this.bubbleEl = this.layerEl.createDiv({ cls: "neokeys-dial-bubble", attr: { "aria-hidden": "true" } });
		this.anchorEl = this.layerEl.createEl("button", {
			cls: "neokeys-dial-anchor",
			attr: { type: "button", "aria-label": "Neokeys leader", tabindex: "-1" },
		});
		setIcon(this.anchorEl, "terminal");

		// Keep the editor (and the on-screen keyboard) exactly as they are: no element of the dial
		// may take focus or let the touch fall through to the note. Obsidian's own mobile toolbar
		// swallows mousedown the same way; touchstart/touchend cover WebKit's focus-on-tap and the
		// long-press callout, and contextmenu covers Android's long-press menu.
		const swallow = (evt: Event): void => evt.preventDefault();
		for (const el of [this.anchorEl, this.backdropEl, this.pillEl]) {
			this.listen(el, "mousedown", swallow);
			this.listen(el, "touchstart", swallow, { passive: false });
			this.listen(el, "touchend", swallow, { passive: false });
			this.listen(el, "contextmenu", swallow);
		}

		this.listen(this.anchorEl, "pointerdown", (evt) => this.onPointerDown(evt, this.anchorEl, "anchor"));
		this.listen(this.backdropEl, "pointerdown", (evt) => this.onPointerDown(evt, this.backdropEl, "backdrop"));
		for (const el of [this.anchorEl, this.backdropEl]) {
			this.listen(el, "pointermove", (evt) => this.onPointerMove(evt));
			this.listen(el, "pointerup", (evt) => this.onPointerUp(evt));
			this.listen(el, "pointercancel", (evt) => this.onPointerCancel(evt));
			this.listen(el, "lostpointercapture", (evt) => this.onPointerCancel(evt));
		}
		this.listen(backEl, "pointerup", () => this.controller.back());
		this.listen(closeEl, "pointerup", () => this.controller.close());

		// Assistive technology and keyboard activation arrive as clicks with no pointer behind them
		// (detail 0). A click that follows a real press (a mouse on a tablet) is ignored, since the
		// pointer path already acted on it; touches never produce one because touchend is swallowed.
		this.listen(backEl, "click", (evt) => {
			if (evt.detail === 0) this.controller.back();
		});
		this.listen(closeEl, "click", (evt) => {
			if (evt.detail === 0) this.controller.close();
		});
		this.listen(this.anchorEl, "click", (evt) => {
			if (evt.detail === 0) this.activateAnchor();
		});
		// Items take no pointer events themselves (the backdrop does, so a drag is hit-tested by
		// geometry), so a click reaching one is an assistive-technology activation.
		this.listen(this.fanEl, "click", (evt) => this.onItemClick(evt));
	}

	/** Attach to the document and start following the keyboard, toolbar and window. */
	mount(): void {
		const doc = activeDocument;
		doc.body.appendChild(this.layerEl);
		this.layerEl.toggleClass("neokeys-dial-left", this.options.corner === "bottom-left");

		// Obsidian shrinks .app-container by the on-screen keyboard's height and parents its
		// bottom bars (the editing toolbar, the navigation bar) there, so watching that one
		// element covers the keyboard showing or hiding, the window resizing, and a bar
		// appearing or going away. The bars slide in and out, so re-measure once they settle.
		const appContainer = doc.body.querySelector(".app-container");
		if (appContainer?.instanceOf(HTMLElement)) {
			this.resizeObserver = new ResizeObserver(() => this.onSurroundingsChanged());
			this.resizeObserver.observe(appContainer);
			this.mutationObserver = new MutationObserver(() => this.onSurroundingsChanged());
			this.mutationObserver.observe(appContainer, { childList: true });
			this.listen(appContainer, "transitionend", (evt) => {
				if (evt.target instanceof Element && evt.target.matches(".mobile-toolbar, .mobile-navbar")) this.onSurroundingsChanged();
			});
		}
		const win = activeWindow;
		const onResize = (): void => this.onSurroundingsChanged();
		win.addEventListener("resize", onResize);
		this.teardown.push(() => win.removeEventListener("resize", onResize));

		// A phone's sidebars slide over the whole screen as drawers; Obsidian marks the workspace
		// element while one is open (no workspace event fires for it), so watch its class list.
		// Body classes flag Obsidian's other layout modes (the navigation bar hidden while a note
		// scrolls, a drawer sliding, a theme change); some of them move the bars without any
		// transition, so re-measure on those too.
		this.classObserver = new MutationObserver(() => this.onSurroundingsChanged());
		this.classObserver.observe(doc.body, { attributes: true, attributeFilter: ["class"] });
		const workspace = doc.body.querySelector(".workspace");
		if (workspace?.instanceOf(HTMLElement)) {
			this.classObserver.observe(workspace, { attributes: true, attributeFilter: ["class"] });
		}

		this.syncSurroundings();
	}

	destroy(): void {
		this.cancelFrame();
		// Close first so the last render pops the key scope; then stop listening and pop it again
		// as a belt, since a leaked catch-all scope would swallow every key in the app.
		this.controller.close();
		this.controller.onChange(() => undefined);
		this.popScope();
		this.resizeObserver?.disconnect();
		this.mutationObserver?.disconnect();
		this.classObserver?.disconnect();
		for (const undo of this.teardown.splice(0)) undo();
		this.layerEl.remove();
	}

	/**
	 * Open at the root of the current keymap (the Leader command's mobile path). While a sidebar
	 * drawer hides the dial there is nothing to open onto, so this does nothing then.
	 */
	open(): void {
		this.cancelFrame();
		this.syncSurroundings();
		if (this.layerEl.hasClass("neokeys-dial-hidden")) return;
		const root = this.getRoot();
		if (!root) return;
		this.applyAnimation();
		this.controller.open(root);
	}

	get isOpen(): boolean {
		return this.controller.isOpen;
	}

	private listen<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		handler: (evt: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void {
		el.addEventListener(type, handler, options);
		this.teardown.push(() => el.removeEventListener(type, handler, options));
	}

	private onPointerDown(evt: PointerEvent, captureEl: HTMLElement, origin: "anchor" | "backdrop"): void {
		if (!evt.isPrimary || this.activePointerId !== null) return;
		// A mouse's secondary buttons (a tablet with a mouse or trackpad) open nothing.
		if (evt.pointerType === "mouse" && evt.button !== 0) return;
		evt.preventDefault();
		// The keymap is parsed only when a press opens the dial; an open dial already holds it.
		let root: GroupNode | undefined;
		if (origin === "anchor" && !this.controller.isOpen) {
			const parsed = this.getRoot();
			if (!parsed) return;
			root = parsed;
			this.applyAnimation();
		}
		this.activePointerId = evt.pointerId;
		try {
			captureEl.setPointerCapture(evt.pointerId);
		} catch {
			// A pointer that is already gone cannot be captured; the press still proceeds and ends normally.
		}
		if (origin === "anchor") {
			this.controller.pressAnchor(root);
		} else {
			this.controller.pressAt({ x: evt.clientX, y: evt.clientY });
		}
	}

	private onPointerMove(evt: PointerEvent): void {
		if (evt.pointerId !== this.activePointerId) return;
		evt.preventDefault();
		this.controller.moveTo({ x: evt.clientX, y: evt.clientY });
	}

	private onPointerUp(evt: PointerEvent): void {
		if (evt.pointerId !== this.activePointerId) return;
		evt.preventDefault();
		this.activePointerId = null;
		this.controller.release();
	}

	private onPointerCancel(evt: PointerEvent): void {
		if (evt.pointerId !== this.activePointerId) return;
		this.activePointerId = null;
		this.controller.cancelPress();
	}

	/** Keyboard or assistive-technology activation of the anchor: what a tap on it does. */
	private activateAnchor(): void {
		if (this.controller.isPressing) return;
		if (this.controller.isOpen) {
			this.controller.back();
			return;
		}
		this.open();
	}

	/** Assistive-technology activation of an item: select it the way a release on its centre would, however small the circle is. */
	private onItemClick(evt: MouseEvent): void {
		if (this.controller.isPressing || !this.controller.isOpen) return;
		const target = evt.target;
		if (!target || !(target instanceof Element)) return;
		const itemEl = target.closest(".neokeys-dial-item");
		const view = this.controller.view();
		for (const [ringIndex, ring] of this.rings.entries()) {
			const index = ring.items.findIndex((item) => item.el === itemEl);
			const item = index === -1 ? undefined : view.rings[ringIndex]?.items[index];
			if (!item) continue;
			this.controller.pressAt({ x: item.x, y: item.y });
			this.controller.release(true);
			return;
		}
	}

	private onSurroundingsChanged(): void {
		if (this.frame !== null) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.syncSurroundings();
		});
	}

	private cancelFrame(): void {
		if (this.frame === null) return;
		window.cancelAnimationFrame(this.frame);
		this.frame = null;
	}

	/** Measure Obsidian's chrome and drawers right now, and re-place an open dial accordingly. */
	private syncSurroundings(): void {
		this.updateChrome();
		this.updateDrawerState();
		if (this.controller.isOpen) this.controller.relayout();
	}

	/**
	 * Step aside while a sidebar drawer covers the screen: the anchor would otherwise float over
	 * the file explorer or whatever the drawer shows. Obsidian flags the open side on the
	 * workspace element; only a workspace that actually has drawers counts, so a tablet whose
	 * sidebars are docked splits keeps the dial.
	 */
	private updateDrawerState(): void {
		const workspace = activeDocument.body.querySelector(".workspace");
		const drawerOpen =
			workspace !== null &&
			workspace.querySelector(".workspace-drawer") !== null &&
			(workspace.classList.contains("is-left-sidedock-open") || workspace.classList.contains("is-right-sidedock-open"));
		this.layerEl.toggleClass("neokeys-dial-hidden", drawerOpen);
		if (drawerOpen) this.controller.close();
	}

	/**
	 * Keep the anchor clear of whatever Obsidian shows along the bottom of a phone: the editing
	 * toolbar while a note has focus (it rides on top of the keyboard) and the floating
	 * navigation bar the rest of the time. Both come and go from the DOM and move with the
	 * keyboard and the safe area, so measure how far up the window they reach instead of
	 * mirroring Obsidian's layout rules; a bar slid off screen or hidden measures as nothing.
	 */
	private updateChrome(): void {
		const windowBottom = activeWindow.innerHeight;
		let chrome = 0;
		for (const bar of Array.from(activeDocument.body.querySelectorAll(".mobile-toolbar, .mobile-navbar"))) {
			const rect = bar.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) continue;
			chrome = Math.max(chrome, windowBottom - rect.top);
		}
		this.layerEl.setCssProps({ "--neokeys-dial-chrome": `${Math.round(chrome)}px` });
	}

	/**
	 * Where the active note's view header is, so the pill sits just below it (or exactly over it
	 * when raised). Measured rather than taken from Obsidian's variables because a tablet shows a
	 * tab strip above the header and defines no header offset at all; the variables are only the
	 * fallback when no header is on screen.
	 */
	private updateHeaderOffsets(): void {
		const visible = (el: Element): boolean => {
			const rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 && rect.bottom > 0;
		};
		const body = activeDocument.body;
		const active = body.querySelector(".mod-root .workspace-leaf.mod-active .view-header");
		const header = active && visible(active) ? active : Array.from(body.querySelectorAll(".mod-root .view-header")).find(visible);
		const rect = header?.getBoundingClientRect();
		this.layerEl.setCssProps({
			"--neokeys-dial-header-top": rect ? `${Math.round(rect.top)}px` : HEADER_TOP_FALLBACK,
			"--neokeys-dial-header-bottom": rect ? `${Math.round(rect.bottom)}px` : HEADER_BOTTOM_FALLBACK,
		});
	}

	private applyAnimation(): void {
		const animation = this.options.animation();
		this.layerEl.toggleClass("neokeys-animate", animation.enabled);
		this.layerEl.toggleClass("neokeys-dial-ring-fade", animation.ring === "fade");
		this.layerEl.toggleClass("neokeys-dial-ring-fly", animation.ring === "fly");
		this.layerEl.setCssProps({ "--neokeys-anim-duration": `${animation.durationMs}ms` });
	}

	/**
	 * The anchor and the screen as they are right now, with the pill placed for `mode` first so
	 * its extent can be measured: the pill is always laid out (hidden, not removed) and always
	 * two lines tall (the stylesheet reserves the description line whether or not it has text),
	 * so what is measured here holds for the whole opening. Normal keeps the whole pill clear;
	 * raised moves it up over the view header and keeps it clear there; overlap keeps only its
	 * top edge clear and lets the rings reach up behind it. Items may reach a little below the
	 * anchor (they are bigger than it) but stay a margin above the toolbar, keyboard or safe
	 * area the anchor itself keeps clear of.
	 */
	private measure(mode: DialLayoutMode): DialGeometry {
		this.updateHeaderOffsets();
		this.layerEl.toggleClass("neokeys-dial-raised", mode !== "normal");
		const anchor = this.anchorEl.getBoundingClientRect();
		const pill = this.pillEl.getBoundingClientRect();
		return {
			corner: this.options.corner,
			anchor: { x: anchor.left + anchor.width / 2, y: anchor.top + anchor.height / 2 },
			bounds: {
				left: EDGE_MARGIN,
				top: (mode === "overlap" ? pill.top : pill.bottom) + EDGE_MARGIN,
				right: activeWindow.innerWidth - EDGE_MARGIN,
				bottom: anchor.bottom + (ANCHOR_EDGE - EDGE_MARGIN),
			},
		};
	}

	/** Every key goes to the dial while it is open, exactly as it does to the which-key popup. */
	private syncScope(open: boolean): void {
		if (open && this.scope === null) {
			const scope = new Scope(this.app.scope);
			scope.register(null, null, (evt) => {
				if (!evt.isComposing) this.controller.typeKey(evt);
				return false;
			});
			this.app.keymap.pushScope(scope);
			this.scope = scope;
		} else if (!open) {
			this.popScope();
		}
	}

	private popScope(): void {
		if (this.scope === null) return;
		this.app.keymap.popScope(this.scope);
		this.scope = null;
	}

	private render(change: DialChange): void {
		const view = this.controller.view();
		this.layerEl.toggleClass("neokeys-dial-open", view.open);
		if (view.open) {
			this.layerEl.setAttribute("role", "dialog");
			this.layerEl.setAttribute("aria-label", "Neokeys dial");
		} else {
			this.layerEl.removeAttribute("role");
			this.layerEl.removeAttribute("aria-label");
		}
		this.syncScope(view.open);
		// A move of the lens alone touches only the circles and the arcs: the pill, with its
		// text layout, and the card are left alone, so a finger sliding along a ring costs little.
		if (change !== "lens") this.renderPill(view);
		if (change === "armed" || change === "lens") {
			this.placeItems(view);
		} else {
			this.reconcileRings(view);
		}
		this.renderArcs(view.arcs);
		this.renderDescription(view, change !== "lens");
	}

	/**
	 * Keep each ring's nodes while it shows the same items of the same group, so a ring opening
	 * outside the current ones appears on its own and the rings under the thumb do not replay
	 * their entrance; a kept ring is re-placed, since a relayout or the lens may have moved its
	 * items; a ring whose group changed is rebuilt in place, flying out from its own group.
	 */
	private reconcileRings(view: DialView): void {
		view.rings.forEach((ring, index) => {
			const existing = this.rings[index];
			if (existing && existing.group === ring.group && sameItems(existing, ring)) {
				ring.items.forEach((item, i) => this.placeItem(existing.items[i].el, item));
				return;
			}
			const el = createDiv({ cls: "neokeys-dial-ring" });
			// Where the ring's items fly out from, when the animation setting says so: the circle of
			// the group they belong to, or the anchor for the innermost ring on screen.
			const anchor = this.anchorEl.getBoundingClientRect();
			const from = ring.parent ?? { x: anchor.left + anchor.width / 2, y: anchor.top + anchor.height / 2 };
			el.setCssProps({ "--neokeys-dial-from-x": `${from.x}px`, "--neokeys-dial-from-y": `${from.y}px` });
			if (existing) {
				existing.el.replaceWith(el);
			} else {
				this.fanEl.appendChild(el);
			}
			this.rings[index] = {
				group: ring.group,
				el,
				items: ring.items.map((item) => ({ identity: item.identity, el: this.createItem(el, item) })),
			};
		});
		for (const extra of this.rings.splice(view.rings.length)) extra.el.remove();
	}

	/** Re-place and restyle the items already on screen: the lens moved them, or the armed one changed. */
	private placeItems(view: DialView): void {
		view.rings.forEach((ring, index) => {
			const nodes = this.rings[index];
			if (!nodes) return;
			ring.items.forEach((item, i) => {
				const node = nodes.items[i];
				if (node) this.placeItem(node.el, item);
			});
		});
	}

	private createItem(ringEl: HTMLElement, item: DialItemView): HTMLElement {
		const el = ringEl.createDiv({
			cls: `neokeys-dial-item neokeys-dial-item-${item.kind}`,
			attr: { role: "button", "aria-label": itemAccessibleName(item) },
		});
		el.createSpan({ cls: "neokeys-dial-item-key", text: item.key, attr: { "aria-hidden": "true" } });
		el.setCssProps({ "--neokeys-dial-key-scale": keyScale(item.key) });
		this.placeItem(el, item);
		return el;
	}

	/** Position and size come from the controller as custom properties; the stylesheet owns everything else. */
	private placeItem(el: HTMLElement, item: DialItemView): void {
		el.setCssProps({
			"--neokeys-dial-x": `${item.x}px`,
			"--neokeys-dial-y": `${item.y}px`,
			"--neokeys-dial-size": `${item.size}px`,
			"--neokeys-dial-lens": `${Math.round(item.weight * 10)}`,
		});
		el.toggleClass("neokeys-dial-item-armed", item.armed);
		el.toggleClass("neokeys-dial-item-open", item.open);
		el.setAttribute("aria-pressed", item.armed ? "true" : "false");
	}

	/** One path per arc, kept and re-pointed while the count holds, since the arcs' ends follow the lens on every move. */
	private renderArcs(arcs: DialArc[]): void {
		const paths = Array.from(this.arcsEl.children);
		for (const extra of paths.splice(arcs.length)) extra.remove();
		arcs.forEach((arc, i) => {
			const d = `M ${arc.from.x} ${arc.from.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.clockwise ? 1 : 0} ${arc.to.x} ${arc.to.y}`;
			const path = paths[i] ?? this.arcsEl.createSvg("path");
			path.setAttribute("d", d);
		});
	}

	/**
	 * The pill: the path, the armed item at its end (an armed group that is in the path is the
	 * path's own last crumb, highlighted), and a line about the armed item when there is one
	 * (about that item itself, even when it has nothing to say), else about the deepest open
	 * group.
	 */
	private renderPill(view: DialView): void {
		this.crumbsEl.empty();
		this.descEl.setText(view.open ? (view.armed ? view.armed.description : view.description) : "");
		if (!view.open) return;
		// A leading ellipsis stands in for whatever part of the trail had to be collapsed to fit.
		const collapsedEl = this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-collapsed neokeys-hidden", text: "…" });
		const trail: HTMLElement[] = [];
		const seps: HTMLElement[] = [];
		[view.title, ...view.crumbs].forEach((label, i) => {
			if (i > 0) seps.push(this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb-sep", text: "›" }));
			trail.push(this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-trail", text: label }));
		});
		let armedSepEl: HTMLElement | null = null;
		if (view.armed?.open) {
			trail[trail.length - 1].addClass("neokeys-dial-crumb-armed");
		} else if (view.armed) {
			armedSepEl = this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb-sep", text: "›" });
			this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-armed", text: view.armed.label });
		}
		this.fitCrumbs(collapsedEl, trail, seps, armedSepEl);
	}

	/**
	 * Collapse the trail from the left while any crumb is cut short, so the pill always prefers
	 * the end of the path: "Neokeys › Text › Heading › Increase heading level" becomes
	 * "… › Heading › Increase heading level" on a narrow phone, then "… › Increase heading level".
	 * The label under the thumb outranks everything else: if it is still cut, the ellipsis itself
	 * goes, so the label stands alone before the stylesheet ever shortens it. When the armed item
	 * is the last crumb of the trail, or nothing is armed, that crumb always stays, ellipsized by
	 * the stylesheet when even it does not fit.
	 */
	private fitCrumbs(collapsedEl: HTMLElement, trail: HTMLElement[], seps: HTMLElement[], armedSepEl: HTMLElement | null): void {
		const cut = (): boolean => Array.from(this.crumbsEl.querySelectorAll(".neokeys-dial-crumb")).some((el) => el.scrollWidth > el.clientWidth + 1);
		const keep = armedSepEl ? 0 : 1;
		for (let hidden = 0; hidden < trail.length - keep && cut(); hidden++) {
			trail[hidden].addClass("neokeys-hidden");
			if (hidden > 0) seps[hidden - 1].addClass("neokeys-hidden");
			collapsedEl.removeClass("neokeys-hidden");
		}
		if (!armedSepEl) return;
		if (cut()) {
			collapsedEl.addClass("neokeys-hidden");
			armedSepEl.addClass("neokeys-hidden");
		}
	}

	/**
	 * The optional description of the armed item: a card between the pill and the rings, or a
	 * bubble beside the thumb. Its text is rebuilt when the armed item changes; a move of the
	 * lens alone only places it again, since the circles it keeps clear of have moved.
	 */
	private renderDescription(view: DialView, rebuild: boolean): void {
		const armed = view.open ? view.armed : null;
		const placement = this.options.description;
		const card = placement === "card" && armed !== null;
		const bubble = placement === "thumb" && armed !== null;
		this.cardEl.toggleClass("neokeys-dial-card-shown", card);
		this.bubbleEl.toggleClass("neokeys-dial-bubble-shown", bubble);
		if (card && armed) this.renderCard(view, armed, rebuild);
		if (bubble && armed) this.renderBubble(view, armed, rebuild);
	}

	/**
	 * The card hangs a little below the pill, lifted as far as the rings need it to. When its
	 * full height does not fit between the pill and the outermost ring, it drops to a compact
	 * form (key and label on one row, the text under them), and when even that does not fit, to
	 * the row alone.
	 */
	private renderCard(view: DialView, armed: DialArmedView, rebuild: boolean): void {
		if (rebuild) {
			this.cardEl.empty();
			const head = this.cardEl.createDiv({ cls: "neokeys-dial-card-head" });
			head.createSpan({ cls: "neokeys-dial-card-key", text: armed.key });
			head.createSpan({ cls: "neokeys-dial-card-label", text: armed.label });
			if (armed.description !== "") this.cardEl.createDiv({ cls: "neokeys-dial-card-text", text: armed.description });
			this.cardEl.createDiv({ cls: "neokeys-dial-card-meta", text: armedMeta(armed) });
		}
		const pillBottom = this.pillEl.getBoundingClientRect().bottom;
		const ringTop = Math.min(...view.rings.flatMap((ring) => ring.items.map((item) => item.y - item.size / 2)));
		this.cardEl.removeClass("neokeys-dial-card-compact");
		this.cardEl.removeClass("neokeys-dial-card-brief");
		if (!cardFits(pillBottom, ringTop, this.cardEl.offsetHeight)) this.cardEl.addClass("neokeys-dial-card-compact");
		if (!cardFits(pillBottom, ringTop, this.cardEl.offsetHeight)) this.cardEl.addClass("neokeys-dial-card-brief");
		this.cardEl.setCssProps({ "--neokeys-dial-card-top": `${Math.round(cardTop(pillBottom, ringTop, this.cardEl.offsetHeight))}px` });
	}

	/** The bubble sits beside the armed circle wherever it covers the fewest other circles. */
	private renderBubble(view: DialView, armed: DialArmedView, rebuild: boolean): void {
		if (rebuild) {
			this.bubbleEl.empty();
			const head = this.bubbleEl.createDiv({ cls: "neokeys-dial-bubble-head" });
			head.createSpan({ cls: "neokeys-dial-bubble-key", text: armed.key });
			head.createSpan({ cls: "neokeys-dial-bubble-label", text: armed.label });
			if (armed.description !== "") this.bubbleEl.createDiv({ cls: "neokeys-dial-bubble-text", text: armed.description });
		}
		const anchorRect = this.anchorEl.getBoundingClientRect();
		const anchor = { x: anchorRect.left + anchorRect.width / 2, y: anchorRect.top + anchorRect.height / 2 };
		// The armed circle itself weighs most: a spot that would cover it once kept on screen is the last choice.
		const circles: CoveredCircle[] = [
			{ x: anchor.x, y: anchor.y, radius: ANCHOR_RADIUS, weight: 2 },
			{ x: armed.x, y: armed.y, radius: armed.size / 2, weight: 3 },
		];
		view.rings.forEach((ring, index) => {
			const weight = index === view.rings.length - 1 ? 2 : 1;
			for (const item of ring.items) if (!item.armed) circles.push({ x: item.x, y: item.y, radius: item.size / 2, weight });
		});
		const placed = placeBubble(
			{ x: armed.x, y: armed.y },
			armed.size / 2,
			{ width: this.bubbleEl.offsetWidth, height: this.bubbleEl.offsetHeight },
			{ width: activeWindow.innerWidth, height: activeWindow.innerHeight, top: this.pillEl.getBoundingClientRect().bottom },
			circles,
			anchor,
			this.options.corner === "bottom-right" ? -1 : 1,
		);
		this.bubbleEl.setCssProps({ "--neokeys-dial-bubble-left": `${Math.round(placed.left)}px`, "--neokeys-dial-bubble-top": `${Math.round(placed.top)}px` });
	}
}

/** The same items in the same order, by identity. */
function sameItems(nodes: RingNodes, ring: DialRingView): boolean {
	return nodes.items.length === ring.items.length && nodes.items.every((node, i) => node.identity === ring.items[i].identity);
}

/** A key glyph longer than a letter or two ("Esc", "Space", "Ctrl+B") is drawn smaller so it stays inside its circle. */
function keyScale(key: string): string {
	const length = [...key].length;
	if (length <= 2) return "1";
	if (length <= 4) return "0.72";
	return "0.55";
}

function itemAccessibleName(item: DialItemView): string {
	const kind = item.kind === "group" ? ", group" : item.kind === "file" ? ", file" : "";
	return `${item.label}${kind}, key ${item.key}`;
}

function armedMeta(armed: DialArmedView): string {
	switch (armed.kind) {
		case "group":
			return `Group · ${armed.count ?? 0} ${armed.count === 1 ? "item" : "items"}`;
		case "file":
			return "File";
		case "command":
			return "Command";
	}
}
