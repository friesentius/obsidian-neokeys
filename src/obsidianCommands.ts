import type { App, Hotkey } from "obsidian";
import { Platform } from "obsidian";
import { hotkeyToParsedKey, type CommandKeyBinding } from "./hotkeyConflict";
import { macroCommandLabel } from "./macros/model";
import { REPEAT_COMMAND_ID, REPEAT_ITEM_LABEL } from "./repeat";
import type { ParsedKey } from "./types";

interface CommandsApi {
	executeCommandById(id: string): boolean;
	findCommand(id: string): { checkCallback?: (checking: boolean) => unknown } | undefined;
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

/**
 * Whether a command can run right now, asked the way Obsidian's own command palette asks before
 * listing it: `checkCallback(true)`. Obsidian wraps every editor command in a checkCallback that
 * says no when no note is open; `executeCommandById` itself never asks and reports success anyway.
 */
export function canRunCommand(app: App, id: string): boolean {
	const command = commandsApi(app).findCommand(id);
	if (!command) return false;
	return command.checkCallback ? Boolean(command.checkCallback(true)) : true;
}

/**
 * A command's name as a keymap item shows it. Obsidian names a plugin's commands
 * "<plugin>: <name>"; a Neokeys macro is shown by its own name, as the user called it, and
 * "Repeat last action" as "Repeat" (the item adds what it would repeat after it).
 */
export function getCommandName(app: App, id: string): string | undefined {
	if (id === REPEAT_COMMAND_ID && hasCommand(app, id)) return REPEAT_ITEM_LABEL;
	const name = commandsApi(app).commands[id]?.name;
	return name === undefined ? undefined : macroCommandLabel(id, name);
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

/** The effective key binding(s) (custom if set, else default) currently bound to `id`. */
export function getCommandHotkeys(app: App, id: string): ParsedKey[] {
	const manager = hotkeyManagerApi(app);
	const hotkeys = manager.getHotkeys(id) ?? manager.getDefaultHotkeys(id) ?? [];
	return hotkeys.map((h) => hotkeyToParsedKey(h, Platform.isMacOS));
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
			bindings.push({ id: command.id, name: command.name, key: hotkeyToParsedKey(hotkey, Platform.isMacOS) });
		}
	}
	return bindings;
}
