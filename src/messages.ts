/** User-facing texts shared by the keyboard popup and the mobile dial, so the two paths cannot drift apart. */

/** The notice for a keymap entry whose command Obsidian does not currently know. */
export function commandUnavailableMessage(commandId: string): string {
	return `Neokeys: command "${commandId}" is not available`;
}
