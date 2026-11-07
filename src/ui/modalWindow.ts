import type { Modal } from "obsidian";

/**
 * Opens `modal`, then makes sure it actually ends up in `win`. Modal.open() always shows the
 * modal "on the active window" (Obsidian's own wording), which tracks workspace/leaf focus, not
 * where the triggering click happened - so when Settings is popped out into its own window,
 * Obsidian's active window stays the main one and a Modal opened from the popout's tree editor
 * appears there instead, invisibly, behind whichever window the user is actually looking at.
 * Reparenting the modal's DOM into the right document fixes that regardless of which window
 * Modal.open() happened to pick; event listeners already attached to that DOM (background-click
 * to close, button handlers) move with it, and Escape-to-close keeps working since Obsidian's
 * keymap scope handling isn't tied to a single window's listeners.
 */
export function openModalInWindow(modal: Modal, win: Window): void {
	modal.open();
	if (modal.containerEl.ownerDocument !== win.document) {
		win.document.body.appendChild(modal.containerEl);
	}
}
