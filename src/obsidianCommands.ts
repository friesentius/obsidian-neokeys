import type { App } from "obsidian";

interface CommandsApi {
	executeCommandById(id: string): boolean;
	commands: Record<string, { name?: string } | undefined>;
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

export function executeCommandById(app: App, id: string): void {
	commandsApi(app).executeCommandById(id);
}

export function getCommandName(app: App, id: string): string | undefined {
	return commandsApi(app).commands[id]?.name;
}
