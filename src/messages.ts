/** User-facing texts shared by the keyboard popup and the mobile dial, so the two paths cannot drift apart. */

/** The notice when the mobile dial has nothing to show: every command in the keymap is unknown on this device. */
export function dialEmptyMessage(): string {
	return "Neokeys: nothing in the keymap is available on this device";
}

/** The notice for a keymap entry whose command Obsidian does not currently know. */
export function commandUnavailableMessage(commandId: string): string {
	return `Neokeys: command "${commandId}" is not available`;
}

/** A macro that did not start: `reason` says what in it cannot run. */
function macroRefused(macroName: string, reason: string): string {
	return `Neokeys: "${macroName}" did not run: ${reason}`;
}

/** A macro step names a command Obsidian does not have on this device, so the macro never starts. */
export function macroMissingCommandMessage(macroName: string, commandId: string): string {
	return macroRefused(macroName, `command "${commandId}" is not available`);
}

/** A macro would reach itself again, through other macros or another plugin's command. `names` is the loop, first and last the same. */
export function macroLoopMessage(names: string[]): string {
	return macroRefused(names[0], `it would run itself (${names.join(" → ")})`);
}

/** A macro step would open Neokeys' own Leader, which a macro may not do. */
export function macroLeaderMessage(macroName: string): string {
	return macroRefused(macroName, "a macro can't open the Leader");
}

/** A macro holds a step kind that a newer Neokeys saved on another device. */
export function macroNeedsNewerMessage(macroName: string, stepMacroName: string, stepNumber: number): string {
	const where = stepMacroName === macroName ? `step ${stepNumber}` : `step ${stepNumber} of "${stepMacroName}"`;
	return macroRefused(macroName, `${where} needs a newer version of Neokeys`);
}

export function macroEmptyMessage(macroName: string): string {
	return macroRefused(macroName, "it has no steps yet");
}

/** A macro command whose macro no longer exists (deleted on another device after this one registered it). */
export function macroNotFoundMessage(macroId: string): string {
	return `Neokeys: there is no macro "${macroId}" any more`;
}

export function macroDepthMessage(macroName: string, maxDepth: number): string {
	return `Neokeys: "${macroName}" stopped: macros run each other more than ${maxDepth} deep`;
}

export function macroStepLimitMessage(macroName: string, maxSteps: number): string {
	return `Neokeys: "${macroName}" stopped after ${maxSteps} steps`;
}

/** A macro stopped at a step that could not run at its turn; the steps before it have run. */
export function macroStoppedMessage(macroName: string, stepNumber: number, stepCount: number, reason: string): string {
	return `Neokeys: "${macroName}" stopped at step ${stepNumber} of ${stepCount}: ${reason}`;
}
