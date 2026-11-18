import { MarkdownView, moment, Notice, type App } from "obsidian";
import { canRunCommand, executeCommandById, getCommandName, hasCommand } from "../obsidianCommands";
import type { Macro } from "./model";
import type { MacroHost } from "./runner";
import { expandText, positionAfter } from "./text";

/**
 * Obsidian's bundled moment.js. The package types it as `typeof import("moment")`, a namespace
 * that TypeScript 6 (esModuleInterop on by default) does not let be called, though at run time it
 * is moment's own function.
 */
const momentNow = moment as unknown as () => { format(format: string): string };

/** How long a macro's notice stays up: long enough to read a step name. */
const NOTICE_MS = 8000;

/** The runner's view of Obsidian: live commands, the active note's editor, notices. */
export function obsidianMacroHost(app: App, macros: () => readonly Macro[]): MacroHost {
	return {
		macros,
		commandExists: (id) => hasCommand(app, id),
		commandName: (id) => getCommandName(app, id),
		canRunCommand: (id) => canRunCommand(app, id),
		runCommand: (id) => executeCommandById(app, id),
		insertText: (template) => insertTextStep(app, template),
		notify: (message) => {
			new Notice(message, NOTICE_MS);
		},
	};
}

/**
 * Replace the active note's selection with a text step, as one editor transaction so one undo
 * takes it back, and put the cursor where `{{cursor}}` was (after the text without one). False
 * when there is no note being edited: no note open, or the note in reading view.
 */
function insertTextStep(app: App, template: string): boolean {
	const active = app.workspace.activeEditor;
	const editor = active?.editor;
	if (!editor) return false;
	if (active instanceof MarkdownView && active.getMode() === "preview") return false;

	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	const { text, cursor } = expandText(template, {
		selection: editor.getRange(from, to),
		formatDate: (format) => momentNow().format(format),
	});
	editor.transaction({ changes: [{ from, to, text }], selection: { from: positionAfter(from, text.slice(0, cursor)) } });
	return true;
}
