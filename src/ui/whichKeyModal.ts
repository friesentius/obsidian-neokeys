import { App, getIcon, Modal, Notice, setIcon } from "obsidian";
import type { RepeatableAction } from "../repeat";
import { ShowDelayGate } from "../delay";
import { keyFromEvent } from "../keys";
import { commandUnavailableMessage } from "../messages";
import { getCommandName, hasCommand } from "../obsidianCommands";
import { breadcrumbTrail, entryKeyGlyph, entryLabel, entryPopupIcon, findEntry, keyedEntries, keylessGroupNote, sortEntries } from "../tree";
import type { GroupEntry, GroupNode } from "../types";

/** What the popup and the dial need from the plugin to act on a chosen item. */
export interface WhichKeyCallbacks {
	/** Run the command a keymap item chose; `label` is the item's label, for Repeat to show. */
	executeCommand(id: string, label: string): void;
	/** Open the file a keymap item chose; `label` is the item's label, for Repeat to show. */
	openFile(path: string, label: string): void;
	/** Whether the deepest group of a navigation stack (the root first) is sticky: it stays open after an item runs. */
	isSticky(path: readonly GroupNode[]): boolean;
	/** Extra words a command's row shows after its label, such as what Repeat would run; undefined for none. */
	commandDetail(id: string): string | undefined;
}

/** Modifier keys pressed on their own: they never close a sticky group (they start a combination). */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "Fn"]);

/** What ran in the open sticky group: the entry, and how many times in a row. */
interface Ran {
	entry: GroupEntry;
	count: number;
}

/** A keymap item's action, as Repeat records it. */
export function actionOf(node: GroupEntry["node"], label: string): RepeatableAction | null {
	if (node.kind === "command") return { kind: "command", command: node.command, label };
	if (node.kind === "file") return { kind: "file", file: node.file, label };
	return null;
}

export interface WhichKeyAnimationOptions {
	enabled: boolean;
	durationMs: number;
}

export class WhichKeyModal extends Modal {
	private path: GroupNode[];
	private delayGate!: ShowDelayGate;
	private contentWrapperEl!: HTMLElement;
	private breadcrumbEl!: HTMLElement;
	private headerTitleEl!: HTMLElement;
	private descEl!: HTMLElement;
	private gridEl!: HTMLElement;
	private hintEl!: HTMLElement;
	/** Bumped on every navigation so a deferred crossfade step can detect it has been superseded. */
	private crossfadeToken = 0;
	/** The item that last ran while this sticky group stayed open; forgotten on navigation. */
	private ran: Ran | null = null;

	constructor(
		app: App,
		private readonly root: GroupNode,
		private readonly showDelayMs: number,
		private readonly animation: WhichKeyAnimationOptions,
		private readonly callbacks: WhichKeyCallbacks,
	) {
		super(app);
		this.path = [root];
	}

	onOpen(): void {
		this.containerEl.addClass("neokeys-modal-container", "neokeys-modal-collapsed");
		this.modalEl.addClass("neokeys-modal");
		if (this.animation.enabled) {
			this.containerEl.addClass("neokeys-animate");
			this.containerEl.style.setProperty("--neokeys-anim-duration", `${this.animation.durationMs}ms`);
		}

		this.contentWrapperEl = this.contentEl.createDiv({ cls: "neokeys-content" });
		const header = this.contentWrapperEl.createDiv({ cls: "neokeys-header" });
		this.headerTitleEl = header.createDiv({ cls: "neokeys-header-title" });
		this.descEl = header.createDiv({ cls: "neokeys-header-desc" });
		this.breadcrumbEl = this.contentWrapperEl.createDiv({ cls: "neokeys-breadcrumb" });
		this.gridEl = this.contentWrapperEl.createDiv({ cls: "neokeys-grid" });
		this.hintEl = this.contentWrapperEl.createDiv({ cls: "neokeys-sticky-hint" });

		this.scope.register(null, null, (evt) => this.handleKey(evt));

		this.render();

		// Force a style flush with the collapsed class applied before the gate can remove it, so a
		// 0ms (or otherwise same-tick) show-delay still gets a committed "before" state to slide in
		// from, instead of the add+remove collapsing into a no-op the browser never renders.
		if (this.animation.enabled) void this.containerEl.offsetHeight;

		this.delayGate = new ShowDelayGate(this.showDelayMs, () => {
			this.containerEl.removeClass("neokeys-modal-collapsed");
		});
		this.delayGate.poke();
	}

	onClose(): void {
		this.delayGate?.cancel();
		this.crossfadeToken++;
		this.contentEl.empty();
	}

	private get currentGroup(): GroupNode {
		return this.path[this.path.length - 1];
	}

	private get sticky(): boolean {
		return this.callbacks.isSticky(this.path);
	}

	private render(): void {
		const group = this.currentGroup;
		const sticky = this.sticky;
		this.headerTitleEl.setText(group.title ?? "Neokeys");
		if (sticky) {
			const badge = this.headerTitleEl.createSpan({ cls: "neokeys-sticky-badge" });
			setIcon(badge.createSpan({ cls: "neokeys-sticky-badge-icon", attr: { "aria-hidden": "true" } }), "pin");
			badge.appendText("Sticky");
		}
		this.hintEl.empty();
		this.hintEl.toggleClass("neokeys-hidden", !sticky);
		if (sticky) {
			this.hintEl.appendText("Stays open after each item. ");
			this.hintEl.createEl("kbd", { text: "Esc" });
			this.hintEl.appendText(" closes, ");
			this.hintEl.createEl("kbd", { text: "Backspace" });
			this.hintEl.appendText(" goes up, any other key closes and types into the note.");
		}
		this.descEl.setText(group.description ?? "");
		this.descEl.toggleClass("neokeys-hidden", !group.description);

		this.breadcrumbEl.empty();
		this.breadcrumbEl.toggleClass("neokeys-hidden", this.path.length <= 1);
		const labels = breadcrumbTrail(this.path, (id) => getCommandName(this.app, id));
		labels.forEach((label, i) => {
			if (i > 0) this.breadcrumbEl.createSpan({ text: ">", cls: "neokeys-breadcrumb-sep" });
			this.breadcrumbEl.createSpan({ text: label, cls: "neokeys-breadcrumb-key" });
		});

		this.gridEl.empty();
		// A keyless entry (made on a phone) has no key to press, so the keyboard popup leaves it out.
		const shown = keyedEntries(sortEntries(group));
		const iconOf = (entry: (typeof shown)[number]) => entryPopupIcon(entry, (id) => getIcon(id) !== null);
		// When any entry in the group has an icon, an entry without one gets an empty slot of the same size so the labels line up.
		const anyIcon = shown.some((entry) => iconOf(entry) !== null);
		for (const entry of shown) {
			const invalid = entry.node.kind === "command" && !hasCommand(this.app, entry.node.command);
			const ran = this.ran !== null && this.ran.entry === entry ? this.ran.count : 0;
			const row = this.gridEl.createDiv({
				cls: `neokeys-row neokeys-row-${entry.node.kind}${invalid ? " neokeys-row-invalid" : ""}${ran > 0 ? " neokeys-row-ran" : ""}`,
			});
			row.createSpan({ text: entryKeyGlyph(entry), cls: "neokeys-key" });
			// An entry's icon sits right after its key.
			const icon = iconOf(entry);
			if (icon !== null) setIcon(row.createSpan({ cls: "neokeys-icon", attr: { "aria-hidden": "true" } }), icon);
			else if (anyIcon) row.createSpan({ cls: "neokeys-icon neokeys-icon-empty", attr: { "aria-hidden": "true" } });
			const label = entryLabel(entry, (id) => getCommandName(this.app, id));
			const labelEl = row.createSpan({
				text: entry.node.kind === "group" ? `+${label}` : label,
				cls: "neokeys-label",
			});
			const detail = entry.node.kind === "command" && !invalid ? this.callbacks.commandDetail(entry.node.command) : undefined;
			if (detail !== undefined) labelEl.createSpan({ text: ` · ${detail}`, cls: "neokeys-label-detail" });
			if (ran > 1) row.createSpan({ text: `×${ran}`, cls: "neokeys-ran-count" });
			if (invalid) {
				row.createSpan({ text: "Unknown command", cls: "neokeys-invalid-badge" });
			}
		}
		const note = keylessGroupNote(group.entries);
		if (note) this.gridEl.createDiv({ text: note, cls: "neokeys-keyless-note" });
	}

	/**
	 * Re-renders for a navigation (push/pop group), crossfading the old menu into the new one when
	 * animations are on. The logical path has already been updated by the caller, so this is purely
	 * visual: a rapid sequence of keypresses each update `this.path` immediately and just restart or
	 * supersede the in-flight crossfade, never delaying or dropping a keypress.
	 */
	private renderCrossfade(): void {
		if (!this.animation.enabled || this.animation.durationMs <= 0 || !this.delayGate.isShown) {
			this.render();
			return;
		}

		const token = ++this.crossfadeToken;
		const halfDuration = this.animation.durationMs / 2;
		this.contentWrapperEl.addClass("neokeys-crossfade-out");

		window.setTimeout(() => {
			if (token !== this.crossfadeToken) return; // superseded by a later navigation

			this.render();
			this.contentWrapperEl.removeClass("neokeys-crossfade-out");
			this.contentWrapperEl.addClass("neokeys-crossfade-in");

			// Force the "faded out" state to paint before removing it, so the browser has something
			// to transition from; otherwise the add+remove in the same tick could collapse into no-op.
			window.requestAnimationFrame(() => {
				if (token !== this.crossfadeToken) return;
				this.contentWrapperEl.removeClass("neokeys-crossfade-in");
			});
		}, halfDuration);
	}

	/** False consumes the key; true lets it through to the note (a sticky group closing as the user types on). */
	private handleKey(evt: KeyboardEvent): boolean {
		if (evt.isComposing) {
			return false;
		}

		if (evt.key === "Escape") {
			this.close();
			return false;
		}

		if (evt.key === "Backspace") {
			if (this.path.length > 1) {
				this.path.pop();
				this.ran = null;
				this.renderCrossfade();
			} else {
				this.close();
			}
			return false;
		}

		const pressed = keyFromEvent(evt);
		const entry = findEntry(this.currentGroup, pressed);
		if (!entry) {
			// A sticky group is left by just carrying on typing: the popup closes and the key goes
			// through to the note (the editor has its focus back by the time the key lands).
			if (this.sticky && !MODIFIER_KEYS.has(evt.key)) {
				this.close();
				// Closing hands the focus back to the note, but the editor's own selection only comes
				// back with its focus(): without it the key would land at the start of the note.
				this.app.workspace.activeEditor?.editor?.focus();
				return true;
			}
			return false;
		}

		this.delayGate.poke();

		if (entry.node.kind === "group") {
			this.path.push(entry.node);
			this.ran = null;
			this.renderCrossfade();
			return false;
		}

		if (entry.node.kind === "command" && !hasCommand(this.app, entry.node.command)) {
			new Notice(commandUnavailableMessage(entry.node.command), 6000);
			return false;
		}

		if (this.sticky) {
			this.runSticky(entry);
			return false;
		}

		this.close();
		this.run(entry);
		return false;
	}

	private run(entry: GroupEntry): void {
		const label = entryLabel(entry, (id) => getCommandName(this.app, id));
		if (entry.node.kind === "command") {
			this.callbacks.executeCommand(entry.node.command, label);
		} else if (entry.node.kind === "file") {
			this.callbacks.openFile(entry.node.file, label);
		}
	}

	/**
	 * Run an item of a sticky group with the popup left open (editor commands act on the note
	 * behind it), then light up its row. An item that opens something of its own that takes focus
	 * (the quick switcher, a prompt) closes the popup, so only that dialog is left; the focus it
	 * took is handed back after the popup's close restores the note's.
	 */
	private runSticky(entry: GroupEntry): void {
		const doc = this.containerEl.doc;
		this.run(entry);
		this.ran = { entry, count: this.ran !== null && this.ran.entry === entry ? this.ran.count + 1 : 1 };
		const tookFocus = (): boolean => {
			const focused = doc.activeElement;
			return focused?.instanceOf(HTMLElement) === true && focused.closest(".modal-container") !== null && !this.containerEl.contains(focused);
		};
		if (tookFocus()) {
			this.closeKeepingFocus();
			return;
		}
		this.render();
		window.setTimeout(() => {
			if (this.containerEl.isConnected && tookFocus()) this.closeKeepingFocus();
		}, 0);
	}

	private closeKeepingFocus(): void {
		const focused = this.containerEl.doc.activeElement;
		this.close();
		if (focused?.instanceOf(HTMLElement) && focused.isConnected) focused.focus();
	}
}
