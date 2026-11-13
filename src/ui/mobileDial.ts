import { App, Notice, Scope, setIcon } from "obsidian";
import { DialController, type DialChange, type DialHost, type DialItemView, type DialView } from "../dial/controller";
import { ringParamsFor, type DialArc, type DialGeometry, type DialLayoutMode } from "../dial/layout";
import { getCommandName, hasCommand } from "../obsidianCommands";
import type { DialCorner, GroupNode } from "../types";

export interface MobileDialCallbacks {
	executeCommand(id: string): void;
	openFile(path: string): void;
}

export interface MobileDialAnimation {
	enabled: boolean;
	durationMs: number;
}

export interface MobileDialOptions {
	corner: DialCorner;
	/** Diameter of the dial's items in px, from the settings (MIN_DIAL_ITEM_SIZE to MAX_DIAL_ITEM_SIZE). */
	itemSize: number;
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

/** A label as the item shows it: a slash gets a break opportunity after it, so "bullet/checkbox" wraps there rather than mid-word. */
function itemLabelText(label: string): string {
	return label.replace(/\//g, "/​");
}

/** Label sizes to try, largest first, until the label fits its item; compact items start smaller. */
const LABEL_SIZES = [12, 11, 10, 9];
const COMPACT_LABEL_SIZES = [10, 9, 8];
const LABEL_LINES = 3;
const COMPACT_LABEL_LINES = 2;
const LABEL_LINE_HEIGHT = 1.1;
/** Distance kept between the label box's corners and the inside of the circle. */
const LABEL_INSET = 1;
/** A second line narrower than this share of the widest line is a lone tiny word (a digit), to be avoided when a smaller size fits on one line. */
const MIN_LAST_LINE_SHARE = 0.2;

/** Where an item's key chip sits: inline before the label's first word, or up in the circle's cap with the label below it. */
type ChipPlace = "inline" | "cap";

/**
 * The fitter's passes: strict refuses a two-line split that strands a lone tiny word on the
 * second line (a smaller size on one line wins over "Heading" / "6"; "Close" / "tab" and a short
 * last word under a three-line stack are fine); loose takes anything that fits with whole words;
 * break lets a word longer than the widest box split (hyphenated where the platform has a
 * dictionary for the interface language, anywhere otherwise).
 */
type FitPass = "strict" | "loose" | "break";

/**
 * Fit one label into its circle: the largest size, on the fewest lines, whose box fits, in the
 * earliest pass that manages it. The box for n lines is the chord that keeps the box's corners
 * LABEL_INSET inside the circle (below the chip, in the cap layout). Measured on the live
 * element, so the font and the platform's wrapping decide, not an estimate. Returns whether a
 * pass fit; with strictOnly, only the strict pass runs. If even the break pass fails the label
 * stays at the smallest size and the line clamp ellipsizes what is left, so no text ever touches
 * the edge.
 */
function fitLabel(el: HTMLElement, labelEl: HTMLElement, size: number, compact: boolean, place: ChipPlace, strictOnly: boolean): boolean {
	const sizes = compact ? COMPACT_LABEL_SIZES : LABEL_SIZES;
	const maxLines = compact ? COMPACT_LABEL_LINES : LABEL_LINES;
	const center = size / 2 - 1;
	const radius = center - LABEL_INSET;
	const passes: FitPass[] = strictOnly ? ["strict"] : ["strict", "loose", "break"];
	el.toggleClass("neokeys-dial-key-cap", place === "cap");
	el.setCssProps({ "--neokeys-dial-label-lines": `${maxLines}` });
	// Layout offsets, not client rects, so the pop-in scale does not skew the chip's extent.
	const keyEl = place === "cap" ? el.querySelector<HTMLElement>(".neokeys-dial-item-key") : null;
	const top = keyEl ? keyEl.offsetTop + keyEl.offsetHeight : 0;
	for (const pass of passes) {
		el.toggleClass("neokeys-dial-label-break", pass === "break");
		for (const font of sizes) {
			const lineHeight = Math.round(font * LABEL_LINE_HEIGHT * 10) / 10;
			for (let lines = 1; lines <= maxLines; lines++) {
				const half = (lines * lineHeight) / 2;
				if (half >= radius || center - half < top) continue;
				const box = Math.floor(2 * Math.sqrt(radius * radius - half * half));
				el.setCssProps({
					"--neokeys-dial-label-size": `${font}px`,
					"--neokeys-dial-label-width": `${box}px`,
					"--neokeys-dial-line-height": `${lineHeight}px`,
				});
				const count = Math.round(labelEl.scrollHeight / lineHeight);
				const overflowX = labelEl.scrollWidth > labelEl.clientWidth + 1;
				if (count > lines || overflowX) continue;
				if (pass !== "strict" || count !== 2 || lastLineShare(labelEl) >= MIN_LAST_LINE_SHARE) return true;
			}
		}
	}
	return false;
}

/**
 * The width of the label's last line as a share of its widest line, from the text's own line
 * boxes (the inline key chip counts as part of the first line). Line boxes are compared with each
 * other, not with the element's layout width, so the pop-in scale transform cancels out.
 */
function lastLineShare(labelEl: HTMLElement): number {
	const range = labelEl.ownerDocument.createRange();
	range.selectNodeContents(labelEl);
	const rects = Array.from(range.getClientRects());
	if (rects.length === 0) return 1;
	const lines = new Map<number, { left: number; right: number }>();
	for (const rect of rects) {
		const top = Math.round(rect.top);
		const line = lines.get(top);
		if (line) {
			line.left = Math.min(line.left, rect.left);
			line.right = Math.max(line.right, rect.right);
		} else {
			lines.set(top, { left: rect.left, right: rect.right });
		}
	}
	const widths = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line.right - line.left);
	const widest = Math.max(...widths);
	return widest > 0 ? widths[widths.length - 1] / widest : 1;
}

/**
 * The mobile dial's DOM: a fixed, full-screen layer holding the pinned anchor button, the fan of
 * items, the breadcrumb pill with its Back and Close buttons, and a backdrop that only exists
 * while the dial is open (so an idle dial claims nothing beyond the anchor itself, and Obsidian's
 * edge swipes keep working). All geometry and gesture logic lives in DialController; this class
 * measures, forwards pointer and key events, and renders the controller's view.
 */
export class MobileDial {
	private readonly layerEl: HTMLElement;
	private readonly backdropEl: HTMLElement;
	private readonly pillEl: HTMLElement;
	private readonly arcsEl: SVGElement;
	private readonly crumbsEl: HTMLElement;
	private readonly fanEl: HTMLElement;
	private readonly anchorEl: HTMLElement;
	private readonly controller: DialController;
	private itemEls: HTMLElement[] = [];
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
		this.controller = new DialController(host, (mode) => this.measure(mode), ringParamsFor(options.itemSize));
		this.controller.onChange((change) => this.render(change));

		this.layerEl = createDiv({ cls: "neokeys-dial" });
		this.backdropEl = this.layerEl.createDiv({ cls: "neokeys-dial-backdrop" });

		this.pillEl = this.layerEl.createDiv({ cls: "neokeys-dial-pill" });
		const backEl = this.pillEl.createEl("button", {
			cls: "neokeys-dial-pill-button",
			attr: { type: "button", "aria-label": "Back", tabindex: "-1" },
		});
		setIcon(backEl, "arrow-left");
		// The breadcrumb is what a screen reader hears change: the level, the page and the armed item.
		this.crumbsEl = this.pillEl.createDiv({ cls: "neokeys-dial-crumbs", attr: { "aria-live": "polite", "aria-atomic": "true" } });
		const closeEl = this.pillEl.createEl("button", {
			cls: "neokeys-dial-pill-button",
			attr: { type: "button", "aria-label": "Close", tabindex: "-1" },
		});
		setIcon(closeEl, "x");

		// The ring arcs sit under the fan in the stacking order, so they show only between items.
		this.arcsEl = this.layerEl.createSvg("svg", { cls: "neokeys-dial-arcs", attr: { "aria-hidden": "true" } });
		this.fanEl = this.layerEl.createDiv({ cls: "neokeys-dial-fan", attr: { role: "group", "aria-label": "Neokeys dial items" } });
		this.anchorEl = this.layerEl.createEl("button", {
			cls: "neokeys-dial-anchor",
			attr: { type: "button", "aria-label": "Neokeys leader", tabindex: "-1" },
		});
		setIcon(this.anchorEl, "command");

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

	/** Assistive-technology activation of an item: select it the way a tap on its centre would. */
	private onItemClick(evt: MouseEvent): void {
		if (this.controller.isPressing || !this.controller.isOpen) return;
		const target = evt.target;
		if (!target || !(target instanceof Element)) return;
		const itemEl = target.closest(".neokeys-dial-item");
		const index = this.itemEls.findIndex((el) => el === itemEl);
		const item = this.controller.view().items[index];
		if (!item) return;
		this.controller.pressAt({ x: item.x, y: item.y });
		this.controller.release();
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
		this.layerEl.setCssProps({ "--neokeys-anim-duration": `${animation.durationMs}ms` });
	}

	/**
	 * The anchor and the screen as they are right now, with the pill placed for `mode` first so
	 * its extent can be measured: the pill is always laid out (hidden, not removed). Normal keeps
	 * the whole pill clear; raised moves it up over the view header and keeps it clear there;
	 * overlap keeps only its top edge clear and lets the rings reach up behind it. Items may
	 * reach a little below the anchor (they are bigger than it) but stay a margin above the
	 * toolbar, keyboard or safe area the anchor itself keeps clear of.
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
		this.layerEl.toggleClass("neokeys-dial-compact", view.compact);
		if (view.open) {
			this.layerEl.setAttribute("role", "dialog");
			this.layerEl.setAttribute("aria-label", "Neokeys dial");
		} else {
			this.layerEl.removeAttribute("role");
			this.layerEl.removeAttribute("aria-label");
		}
		this.syncScope(view.open);
		this.renderCrumbs(view);
		if (change === "structure" || this.itemEls.length !== view.items.length) {
			this.renderItems(view.items);
		} else {
			// The same items: move them (a relayout) or restyle them (the armed one changed) in
			// place, so nothing is rebuilt and the pop-in does not replay.
			view.items.forEach((item, index) => this.placeItem(this.itemEls[index], item, change === "layout"));
		}
		if (change !== "armed") {
			this.renderArcs(view.arcs);
			this.fitLabels(view);
		}
	}

	/**
	 * Fit the level's labels. The key chip leads each label's first word; when any label on the
	 * level cannot fit that way without a lone tiny word or a cut, the whole level moves its chips
	 * up into the circles' caps, so a ring never mixes the two placements. Compact items always
	 * use the cap, having no width to spare beside the first word.
	 */
	private fitLabels(view: DialView): void {
		const labels = this.itemEls.map((el, index) => ({
			el,
			labelEl: el.querySelector<HTMLElement>(".neokeys-dial-item-label"),
			size: view.items[index].size,
		}));
		const inline = !view.compact && labels.every(({ el, labelEl, size }) => labelEl === null || fitLabel(el, labelEl, size, false, "inline", true));
		if (inline) return;
		for (const { el, labelEl, size } of labels) if (labelEl) fitLabel(el, labelEl, size, view.compact, "cap", false);
	}

	private renderArcs(arcs: DialArc[]): void {
		this.arcsEl.empty();
		for (const arc of arcs) {
			const d = `M ${arc.from.x} ${arc.from.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.clockwise ? 1 : 0} ${arc.to.x} ${arc.to.y}`;
			this.arcsEl.createSvg("path", { attr: { d } });
		}
	}

	private renderCrumbs(view: DialView): void {
		this.crumbsEl.empty();
		if (!view.open) return;
		// A leading ellipsis stands in for whatever part of the trail had to be collapsed to fit.
		const collapsedEl = this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-collapsed neokeys-hidden", text: "…" });
		const trail: HTMLElement[] = [];
		const seps: HTMLElement[] = [];
		[view.title, ...view.crumbs].forEach((label, i) => {
			if (i > 0) seps.push(this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb-sep", text: "›" }));
			trail.push(this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-trail", text: label }));
		});
		const pageEl = view.pages > 1 ? this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb-page", text: `${view.page + 1}/${view.pages}` }) : null;
		let armedSepEl: HTMLElement | null = null;
		if (view.armedLabel !== null) {
			armedSepEl = this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb-sep", text: "›" });
			this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-armed", text: view.armedLabel });
		}
		this.fitCrumbs(collapsedEl, trail, seps, pageEl, armedSepEl);
	}

	/**
	 * Collapse the trail from the left while any crumb is cut short, so the pill always prefers
	 * the end of the path: "Neokeys › Text › Heading › Increase heading level" becomes
	 * "… › Heading › Increase heading level" on a narrow phone, then "… › Increase heading level".
	 * The label under the thumb outranks everything else: if it is still cut, the page indicator
	 * goes, then the ellipsis itself, so the label stands alone before the stylesheet ever
	 * shortens it. With nothing armed the current level's own crumb always stays, ellipsized by
	 * the stylesheet when even that does not fit.
	 */
	private fitCrumbs(collapsedEl: HTMLElement, trail: HTMLElement[], seps: HTMLElement[], pageEl: HTMLElement | null, armedSepEl: HTMLElement | null): void {
		const cut = (): boolean => Array.from(this.crumbsEl.querySelectorAll(".neokeys-dial-crumb")).some((el) => el.scrollWidth > el.clientWidth + 1);
		const keep = armedSepEl ? 0 : 1;
		for (let hidden = 0; hidden < trail.length - keep && cut(); hidden++) {
			trail[hidden].addClass("neokeys-hidden");
			if (hidden > 0) seps[hidden - 1].addClass("neokeys-hidden");
			collapsedEl.removeClass("neokeys-hidden");
		}
		if (!armedSepEl) return;
		if (pageEl && cut()) pageEl.addClass("neokeys-hidden");
		if (cut()) {
			collapsedEl.addClass("neokeys-hidden");
			armedSepEl.addClass("neokeys-hidden");
		}
	}

	private renderItems(items: DialItemView[]): void {
		this.fanEl.empty();
		this.itemEls = items.map((item) => {
			const el = this.fanEl.createDiv({
				cls: `neokeys-dial-item neokeys-dial-item-${item.kind}`,
				attr: { role: "button", "aria-label": itemAccessibleName(item) },
			});
			// The key chip leads the label and never parts from its first word: a chip alone on a line reads as nothing.
			const label = el.createSpan({ cls: "neokeys-dial-item-label", attr: { "aria-hidden": "true" } });
			const text = itemLabelText(item.label);
			const space = text.indexOf(" ");
			const head = label.createSpan({ cls: "neokeys-dial-item-head" });
			head.createSpan({ cls: "neokeys-dial-item-key", text: item.key });
			head.appendText(space === -1 ? text : text.slice(0, space));
			if (space !== -1) label.appendText(text.slice(space));
			this.placeItem(el, item, true);
			return el;
		});
	}

	private placeItem(el: HTMLElement, item: DialItemView, moved: boolean): void {
		if (moved) {
			el.setCssProps({
				"--neokeys-dial-x": `${item.x}px`,
				"--neokeys-dial-y": `${item.y}px`,
				"--neokeys-dial-size": `${item.size}px`,
			});
		}
		el.toggleClass("neokeys-dial-item-armed", item.armed);
		el.setAttribute("aria-pressed", item.armed ? "true" : "false");
	}
}

function itemAccessibleName(item: DialItemView): string {
	if (item.kind === "more") return "More items, next page";
	const kind = item.kind === "group" ? ", group" : item.kind === "file" ? ", file" : "";
	return `${item.label}${kind}, key ${item.key}`;
}
