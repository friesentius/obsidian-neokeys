import { knownStep, LEADER_COMMAND_ID, macroIdFromCommand, type Macro } from "./model";

/**
 * The loop that running `startId` would walk into, as macro names with the repeated one at both
 * ends ("Daily setup", "Tidy", "Daily setup"), or null when it reaches no macro twice. Only steps
 * that name another macro count; a loop through another plugin's command is caught at run time.
 */
export function findMacroLoop(macros: readonly Macro[], startId: string): string[] | null {
	const byId = new Map(macros.map((macro) => [macro.id, macro]));
	const done = new Set<string>();

	function walk(path: Macro[]): string[] | null {
		const macro = path[path.length - 1];
		for (const raw of macro.steps) {
			const step = knownStep(raw);
			if (step?.type !== "command") continue;
			const nestedId = macroIdFromCommand(step.command);
			const nested = nestedId === null ? undefined : byId.get(nestedId);
			if (!nested || done.has(nested.id)) continue;
			const at = path.findIndex((m) => m.id === nested.id);
			if (at !== -1) return [...path.slice(at), nested].map((m) => m.name);
			const loop = walk([...path, nested]);
			if (loop) return loop;
		}
		done.add(macro.id);
		return null;
	}

	const start = byId.get(startId);
	return start ? walk([start]) : null;
}

/**
 * Why `macro` cannot be saved alongside `others` (every other macro; an older copy of this one
 * is ignored), or null when it can.
 */
export function checkMacro(macro: Macro, others: readonly Macro[]): string | null {
	const name = macro.name.trim();
	if (name.length === 0) return "Give the macro a name.";
	const rest = others.filter((other) => other.id !== macro.id);
	if (rest.some((other) => other.name.trim().toLowerCase() === name.toLowerCase())) return `Another macro is already called "${name}".`;
	if (macro.steps.length === 0) return "Add a step first.";

	for (const [index, raw] of macro.steps.entries()) {
		const step = knownStep(raw);
		if (step === null) continue; // a newer Neokeys' step, kept as it is
		if (step.type === "text") {
			if (step.text.length === 0) return `Step ${index + 1} has no text.`;
			continue;
		}
		if (step.command === LEADER_COMMAND_ID) return `Step ${index + 1} opens the Leader, which a macro can't do.`;
	}

	const loop = findMacroLoop([...rest, { ...macro, name }], macro.id);
	if (loop) return `"${name}" would run itself: ${loop.join(" → ")}. Remove the step that leads back to it.`;
	return null;
}
