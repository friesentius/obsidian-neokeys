import { knownStep, type Macro, type MacroStep } from "./model";

/** How a text step reads on one line: its text, with each line break drawn as ⏎. */
function oneLine(text: string): string {
	return text.replace(/\r?\n/g, " ⏎ ");
}

/** One step as the macro list and editor name it: the command's name (or id), the text itself, or a note for a newer Neokeys' step. */
export function stepSummary(step: MacroStep, commandName: (id: string) => string | undefined): string {
	const known = knownStep(step);
	if (known === null) return "A step from a newer version of Neokeys";
	if (known.type === "text") return oneLine(known.text);
	return commandName(known.command) ?? known.command;
}

/** The kind of a step, as the editor's rows title it. */
export function stepKindLabel(step: MacroStep): string {
	const known = knownStep(step);
	if (known === null) return "Newer step";
	return known.type === "text" ? "Text" : "Command";
}

/** "3 steps: Toggle bold, **{{date}}**, QuickAdd: Log", the line the macro list shows under a macro's name. */
export function macroStepsLine(macro: Macro, commandName: (id: string) => string | undefined): string {
	const count = macro.steps.length;
	if (count === 0) return "No steps yet";
	return `${count} ${count === 1 ? "step" : "steps"}: ${macro.steps.map((step) => stepSummary(step, commandName)).join(", ")}`;
}

/** Where the keymap runs a macro, from the key paths of the items that do ("i d"), for the macro list. */
export function macroUsesLine(paths: string[][]): string {
	if (paths.length === 0) return "Not in the keymap. Run it from a hotkey or the command palette.";
	return `In the keymap: ${paths.map((path) => path.join(" › ")).join(", ")}`;
}
