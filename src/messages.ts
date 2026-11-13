/** User-facing texts shared by the keyboard popup and the mobile dial, so the two paths cannot drift apart. */

/** The notice when the mobile dial has nothing to show: every command in the keymap is unknown on this device. */
export function dialEmptyMessage(): string {
	return "Neokeys: nothing in the keymap is available on this device";
}

/** The notice for a keymap entry whose command Obsidian does not currently know. */
export function commandUnavailableMessage(commandId: string): string {
	return `Neokeys: command "${commandId}" is not available`;
}
