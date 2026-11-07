import type { App, Hotkey } from "obsidian";
import { Platform } from "obsidian";
import type { CommandKeyBinding } from "./hotkeyConflict";
import type { ParsedKey } from "./types";

interface CommandsApi {
	executeCommandById(id: string): boolean;
	commands: Record<string, { id: string; name?: string } | undefined>;
}

interface HotkeyManagerApi {
	getHotkeys(id: string): Hotkey[] | undefined;
	getDefaultHotkeys(id: string): Hotkey[] | undefined;
}

/**
 * `app.commands` is not part of the public Obsidian API, but it is the
 * standard community idiom both for invoking an arbitrary registered command
 * by ID and for reading a command's display name (there is no supported
 * alternative); Spacekeys relies on the same object.
 */
function commandsApi(app: App): CommandsApi {
	// @ts-expect-error: `commands` is not declared on the public App type.
	return app.commands as CommandsApi;
}

/**
 * `app.hotkeyManager` is likewise not part of the public API, but it is the only way to read the
 * effective hotkeys (user-customized, falling back to a plugin's own default) bound to an
 * arbitrary command id - the same lookup Obsidian's own Hotkeys settings tab uses.
 */
function hotkeyManagerApi(app: App): HotkeyManagerApi {
	// @ts-expect-error: `hotkeyManager` is not declared on the public App type.
	return app.hotkeyManager as HotkeyManagerApi;
}

export function executeCommandById(app: App, id: string): boolean {
	return commandsApi(app).executeCommandById(id);
}

export function getCommandName(app: App, id: string): string | undefined {
	return commandsApi(app).commands[id]?.name;
}

export function hasCommand(app: App, id: string): boolean {
	return commandsApi(app).commands[id] !== undefined;
}

/** Every currently registered command, for the tree editor's command picker. */
export function listCommands(app: App): { id: string; name: string }[] {
	return Object.values(commandsApi(app).commands)
		.filter((c): c is { id: string; name?: string } => c !== undefined)
		.map((c) => ({ id: c.id, name: c.name ?? c.id }));
}

/**
 * Convert an Obsidian `Hotkey` (modifiers + a base key, "Mod" meaning the platform modifier) into
 * a Neokeys `ParsedKey`, folding shift into a single letter's case the same way keys.ts does for
 * every other key source, so `keysEqual`/`findHotkeyConflicts` can compare them directly.
 */
export function hotkeyToParsedKey(hotkey: Hotkey): ParsedKey {
	const mods = { ctrl: false, shift: false, alt: false, meta: false };
	for (const modifier of hotkey.modifiers) {
		switch (modifier) {
			case "Mod":
				if (Platform.isMacOS) mods.meta = true;
				else mods.ctrl = true;
				break;
			case "Ctrl":
				mods.ctrl = true;
				break;
			case "Meta":
				mods.meta = true;
				break;
			case "Alt":
				mods.alt = true;
				break;
			case "Shift":
				mods.shift = true;
				break;
		}
	}

	let key = hotkey.key;
	if (key.length === 1 && mods.shift) key = key.toUpperCase();
	else if (key.length > 1) key = key.toLowerCase();

	return { key, ctrl: mods.ctrl, shift: mods.shift, alt: mods.alt, meta: mods.meta };
}

/** The effective key binding(s) (custom if set, else default) currently bound to `id`. */
export function getCommandHotkeys(app: App, id: string): ParsedKey[] {
	const manager = hotkeyManagerApi(app);
	const hotkeys = manager.getHotkeys(id) ?? manager.getDefaultHotkeys(id) ?? [];
	return hotkeys.map(hotkeyToParsedKey);
}

/**
 * Every other command's effective key binding (custom if set, else the plugin's own default),
 * for conflict-checking the Neokeys leader hotkey/combo against. `excludeId` leaves out Neokeys'
 * own leader command so it never "conflicts" with itself.
 */
export function listOtherCommandHotkeys(app: App, excludeId: string): CommandKeyBinding[] {
	const manager = hotkeyManagerApi(app);
	const bindings: CommandKeyBinding[] = [];
	for (const command of listCommands(app)) {
		if (command.id === excludeId) continue;
		const hotkeys = manager.getHotkeys(command.id) ?? manager.getDefaultHotkeys(command.id) ?? [];
		for (const hotkey of hotkeys) {
			bindings.push({ id: command.id, name: command.name, key: hotkeyToParsedKey(hotkey) });
		}
	}
	return bindings;
}
