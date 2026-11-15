import { App, getIcon, Modal, Notice, setIcon } from "obsidian";
import { ShowDelayGate } from "../delay";
import { keyFromEvent } from "../keys";
import { commandUnavailableMessage } from "../messages";
import { getCommandName, hasCommand } from "../obsidianCommands";
import { breadcrumbTrail, entryKeyGlyph, entryLabel, entryPopupIcon, findEntry, keyedEntries, keylessGroupNote, sortEntries } from "../tree";
import type { GroupNode } from "../types";

export interface WhichKeyCallbacks {
	executeCommand(id: string): void;
	openFile(path: string): void;
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
	/** Bumped on every navigation so a deferred crossfade step can detect it has been superseded. */
	private crossfadeToken = 0;

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

	private render(): void {
		const group = this.currentGroup;
		this.headerTitleEl.setText(group.title ?? "Neokeys");
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
			const row = this.gridEl.createDiv({
				cls: `neokeys-row neokeys-row-${entry.node.kind}${invalid ? " neokeys-row-invalid" : ""}`,
			});
			row.createSpan({ text: entryKeyGlyph(entry), cls: "neokeys-key" });
			// An entry's icon sits right after its key.
			const icon = iconOf(entry);
			if (icon !== null) setIcon(row.createSpan({ cls: "neokeys-icon", attr: { "aria-hidden": "true" } }), icon);
			else if (anyIcon) row.createSpan({ cls: "neokeys-icon neokeys-icon-empty", attr: { "aria-hidden": "true" } });
			const label = entryLabel(entry, (id) => getCommandName(this.app, id));
			row.createSpan({
				text: entry.node.kind === "group" ? `+${label}` : label,
				cls: "neokeys-label",
			});
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

	private handleKey(evt: KeyboardEvent): false {
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
				this.renderCrossfade();
			} else {
				this.close();
			}
			return false;
		}

		const pressed = keyFromEvent(evt);
		const entry = findEntry(this.currentGroup, pressed);
		if (!entry) {
			return false;
		}

		this.delayGate.poke();

		if (entry.node.kind === "group") {
			this.path.push(entry.node);
			this.renderCrossfade();
			return false;
		}

		if (entry.node.kind === "command" && !hasCommand(this.app, entry.node.command)) {
			new Notice(commandUnavailableMessage(entry.node.command), 6000);
			return false;
		}

		this.close();
		if (entry.node.kind === "command") {
			this.callbacks.executeCommand(entry.node.command);
		} else {
			this.callbacks.openFile(entry.node.file);
		}
		return false;
	}
}
