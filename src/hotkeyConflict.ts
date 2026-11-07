import { keysEqual } from "./keys";
import type { ParsedKey } from "./types";

export interface CommandKeyBinding {
	id: string;
	name: string;
	key: ParsedKey;
}

export interface HotkeyConflict {
	id: string;
	name: string;
}

/**
 * Pure: which of `bindings` collide with `leaderKey` (the leader hotkey or the combo leader)?
 * `bindings` is one entry per Obsidian hotkey actually bound to some other command - the live
 * lookup over `app.hotkeyManager` that builds this list is Obsidian-API-touching and lives in
 * obsidianCommands.ts instead, deliberately not unit-tested per this project's test strategy.
 */
export function findHotkeyConflicts(leaderKey: ParsedKey, bindings: CommandKeyBinding[]): HotkeyConflict[] {
	return bindings.filter((b) => keysEqual(b.key, leaderKey)).map((b) => ({ id: b.id, name: b.name }));
}
