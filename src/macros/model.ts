/**
 * Macros: named lists of steps, each registered as an Obsidian command `neokeys:macro-<id>` that
 * a keymap item (or a hotkey, the palette, the mobile toolbar) runs. They live in data.json next
 * to the keymap, not in the keymap's YAML, so the keymap schema an older Neokeys reads is unchanged.
 * Kept free of Obsidian imports so the sanitising and naming rules are unit-tested.
 */

/** Runs one Obsidian command by id. */
export interface CommandStep {
	type: "command";
	command: string;
}

/** Inserts text at the cursor, replacing the selection; see text.ts for its placeholders. */
export interface TextStep {
	type: "text";
	text: string;
}

/** A step this version of Neokeys can run. */
export type KnownStep = CommandStep | TextStep;

/**
 * A step as stored. A newer Neokeys on another synced device may have saved a kind this version
 * does not know: it is kept exactly as stored (so saving here never drops it) and the macro
 * refuses to run until Neokeys is updated.
 */
export type MacroStep = KnownStep | ({ type: string } & Record<string, unknown>);

export interface Macro {
	/** A slug fixed when the macro is made; renaming never changes it, so hotkeys and keymap items keep pointing at it. */
	id: string;
	name: string;
	/** A Lucide icon id (Obsidian's own icon set), or absent for none. */
	icon?: string;
	steps: MacroStep[];
}

/** The id Neokeys' own Leader command runs under; a macro step may never open it. */
export const LEADER_COMMAND_ID = "neokeys:leader";

/** What Obsidian prefixes every macro command id with (the plugin id, then the local id's `macro-`). */
export const MACRO_COMMAND_PREFIX = "neokeys:macro-";

/** What Obsidian puts before the name of every Neokeys command (the plugin's name from manifest.json). */
export const MACRO_COMMAND_NAME_PREFIX = "Neokeys: ";

/** How deep macros may run other macros, so a cycle that slips past every other guard still stops. */
export const MAX_MACRO_DEPTH = 8;

/** How many steps one run may take in all, counting the steps of every macro it runs. */
export const MAX_MACRO_STEPS = 200;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The id passed to `Plugin.addCommand` for a macro; Obsidian prefixes it with "neokeys:". */
export function macroLocalCommandId(macroId: string): string {
	return `macro-${macroId}`;
}

/** The full command id a keymap item uses to run a macro, e.g. "neokeys:macro-tidy-note". */
export function macroCommandId(macroId: string): string {
	return MACRO_COMMAND_PREFIX + macroId;
}

/** The macro id a command id runs, or null when it is not a macro command. */
export function macroIdFromCommand(commandId: string): string | null {
	if (!commandId.startsWith(MACRO_COMMAND_PREFIX)) return null;
	const id = commandId.slice(MACRO_COMMAND_PREFIX.length);
	return ID_PATTERN.test(id) ? id : null;
}

/**
 * The label a keymap item gives a command: a macro command's own name without the "Neokeys: "
 * Obsidian puts before every plugin command's name, any other command's name as it is.
 */
export function macroCommandLabel(commandId: string, obsidianName: string): string {
	if (macroIdFromCommand(commandId) === null) return obsidianName;
	return obsidianName.startsWith(MACRO_COMMAND_NAME_PREFIX) ? obsidianName.slice(MACRO_COMMAND_NAME_PREFIX.length) : obsidianName;
}

/** The step as one this version can run, or null for a kind a newer Neokeys saved. */
export function knownStep(step: MacroStep): KnownStep | null {
	if (step.type === "command" && typeof step.command === "string") return step as CommandStep;
	if (step.type === "text" && typeof step.text === "string") return step as TextStep;
	return null;
}

/**
 * A fresh id for a macro called `name`: its words as a lowercase slug ("Tidy note" is
 * "tidy-note"), "macro" when nothing usable is left, and a number added when the id is taken.
 */
export function newMacroId(name: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	const base =
		name
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40)
			.replace(/-+$/g, "") || "macro";
	if (!used.has(base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base}-${n}`;
		if (!used.has(candidate)) return candidate;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeStep(value: unknown): MacroStep | null {
	if (!isRecord(value) || typeof value.type !== "string" || value.type.length === 0) return null;
	// A known kind must carry its field; anything else is a newer Neokeys' step and kept untouched.
	if (value.type === "command") return typeof value.command === "string" && value.command.trim().length > 0 ? ({ ...value, command: value.command.trim() } as MacroStep) : null;
	if (value.type === "text") return typeof value.text === "string" ? (value as MacroStep) : null;
	return value as MacroStep;
}

/**
 * The macros to run with, given whatever data.json holds under `macros`. Entries without a usable
 * id or name, or with a duplicate id, are dropped, as are steps that are not objects with a type
 * or that miss a known kind's own field. Anything else a newer Neokeys stored (fields of a macro,
 * steps of a kind this version does not know) is kept as it was, so saving here loses nothing.
 */
export function sanitizeMacros(value: unknown): Macro[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const macros: Macro[] = [];
	for (const entry of value) {
		if (!isRecord(entry)) continue;
		const { id, name, icon, steps } = entry;
		if (typeof id !== "string" || !ID_PATTERN.test(id) || seen.has(id)) continue;
		if (typeof name !== "string" || name.trim().length === 0) continue;
		seen.add(id);
		const macro: Macro = { ...entry, id, name: name.trim(), steps: [] };
		if (typeof icon === "string" && icon.length > 0) macro.icon = icon;
		else delete macro.icon;
		if (Array.isArray(steps)) {
			for (const step of steps) {
				const clean = sanitizeStep(step);
				if (clean) macro.steps.push(clean);
			}
		}
		macros.push(macro);
	}
	return macros;
}
