import { App, Notice, Scope, setIcon } from "obsidian";
import { DialController, type DialChange, type DialHost, type DialItemView, type DialView } from "../dial/controller";
import type { DialGeometry, DialLayoutMode } from "../dial/layout";
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
		this.controller = new DialController(host, (mode) => this.measure(mode));
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
			const armedEl = this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-armed", text: view.armedLabel });
			if (view.armedInvalid) {
				armedEl.addClass("neokeys-dial-crumb-invalid");
				// The reason is a separate crumb, so it gives way before the label itself does.
				this.crumbsEl.createSpan({ cls: "neokeys-dial-crumb neokeys-dial-crumb-note neokeys-dial-crumb-invalid", text: "(unknown command)" });
			}
		}
		this.fitCrumbs(collapsedEl, trail, seps, pageEl, armedSepEl);
	}

	/**
	 * Collapse the trail from the left while any crumb is cut short, so the pill always prefers
	 * the end of the path: "Neokeys › Text › Heading › Increase heading level" becomes
	 * "… › Heading › Increase heading level" on a narrow phone, then "… › Increase heading level".
	 * The label under the thumb outranks everything else: if anything is still cut, the
	 * unknown-command note goes (it only ever takes the room the label leaves, so it is the first
	 * thing cut), then the page indicator, then the ellipsis itself, so the label stands alone
	 * before the stylesheet ever shortens it. With nothing armed the current level's own crumb
	 * always stays, ellipsized by the stylesheet when even that does not fit.
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
		const noteEl = this.crumbsEl.querySelector(".neokeys-dial-crumb-note");
		if (noteEl && cut()) noteEl.addClass("neokeys-hidden");
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
				cls: `neokeys-dial-item neokeys-dial-item-${item.kind}${item.invalid ? " neokeys-dial-item-invalid" : ""}`,
				attr: { role: "button", "aria-label": itemAccessibleName(item) },
			});
			el.createSpan({ cls: "neokeys-dial-item-key", text: item.key, attr: { "aria-hidden": "true" } });
			el.createSpan({ cls: "neokeys-dial-item-label", text: itemLabelText(item.label), attr: { "aria-hidden": "true" } });
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
	const kind = item.kind === "group" ? ", group" : item.kind === "file" ? ", file" : item.invalid ? ", unknown command" : "";
	return `${item.label}${kind}, key ${item.key}`;
}
