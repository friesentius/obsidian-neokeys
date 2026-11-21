/**
 * "Repeat last action": what was last run through Neokeys, so the `neokeys:repeat-last` command
 * can run it again (Vim's `.`, which-key's repeatMostRecent). Kept in memory only: it is forgotten
 * when Obsidian restarts, and it is never written to data.json, so it does not sync to the user's
 * other devices. Kept free of Obsidian imports so the rules are unit-tested.
 */

/** The id Obsidian registers the command under (the plugin id, then the local id). */
export const REPEAT_COMMAND_ID = "neokeys:repeat-last";

/** The id passed to `Plugin.addCommand`; Obsidian prefixes it with "neokeys:". */
export const REPEAT_LOCAL_COMMAND_ID = "repeat-last";

/** The name the command palette and Settings → Hotkeys show, after Obsidian's "Neokeys: ". */
export const REPEAT_COMMAND_NAME = "Repeat last action";

/** What a keymap item running the command is labelled when it has no description of its own. */
export const REPEAT_ITEM_LABEL = "Repeat";

/** Neokeys' own Leader command, which opens a menu rather than acting, so it is never repeated. */
const LEADER_COMMAND_ID = "neokeys:leader";

/** Something a keymap item ran: a command or a file it opened, with the item's label for display. */
export type RepeatableAction = { kind: "command"; command: string; label: string } | { kind: "file"; file: string; label: string };

/** Whether running `commandId` from a keymap item counts as an action Repeat can run again. */
export function isRepeatableCommand(commandId: string): boolean {
	return commandId !== REPEAT_COMMAND_ID && commandId !== LEADER_COMMAND_ID;
}

/**
 * The last command or file item run through Neokeys: the which-key popup, the mobile dial, or a
 * sticky group. A macro item counts (it is a command, so Repeat runs the whole macro again).
 * Opening a group, the Leader, and Repeat itself do not count, so Repeat never repeats itself.
 */
export class RepeatTracker {
	private last: RepeatableAction | null = null;

	get lastAction(): RepeatableAction | null {
		return this.last;
	}

	/** Note that a keymap item just ran `action`; ignored for the commands that never count. */
	record(action: RepeatableAction): void {
		if (action.kind === "command" && !isRepeatableCommand(action.command)) return;
		this.last = { ...action };
	}
}

/** What the popup row and the dial's pill say Repeat would run: the last action's label, or that there is none yet. */
export function repeatHint(last: RepeatableAction | null): string {
	return last === null ? "nothing yet" : last.label;
}
