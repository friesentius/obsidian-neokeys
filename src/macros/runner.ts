import {
	macroDepthMessage,
	macroEmptyMessage,
	macroLeaderMessage,
	macroLoopMessage,
	macroMissingCommandMessage,
	macroNeedsNewerMessage,
	macroNotFoundMessage,
	macroStepLimitMessage,
	macroStoppedMessage,
} from "../messages";
import { knownStep, LEADER_COMMAND_ID, macroIdFromCommand, MAX_MACRO_DEPTH, MAX_MACRO_STEPS, type Macro } from "./model";

/**
 * What the runner needs from Obsidian, so the runner itself stays Obsidian-free and unit-tested
 * with a fake (obsidianHost.ts is the real one).
 */
export interface MacroHost {
	macros(): readonly Macro[];
	/** Whether Obsidian has a command with this id on this device right now. */
	commandExists(id: string): boolean;
	/** The command's name as Obsidian shows it, for notices. */
	commandName(id: string): string | undefined;
	/**
	 * Whether the command can run here and now: its `checkCallback(true)`, which is false for an
	 * editor command with no note open. Obsidian's own dispatcher never asks, so the runner must.
	 */
	canRunCommand(id: string): boolean;
	/** Run the command; false when it threw. Obsidian does not wait for a command's async work. */
	runCommand(id: string): boolean;
	/** Insert a text step into the active note as one undo step; false when no note can take it. */
	insertText(template: string): boolean;
	notify(message: string): void;
}

/** How a run ended: every step ran, it never started, or it stopped part way through. */
export type MacroRunResult = "done" | "refused" | "stopped";

/**
 * Runs macros. A command step that runs another macro is run here directly rather than through
 * Obsidian, so its failures stop the outer macro too. Every run checks its whole tree before the
 * first step (a missing command, the Leader, a loop, a step kind this version does not know) and
 * refuses with one notice rather than doing half of it. While running it stops at the first step
 * that cannot run.
 *
 * One runner serves the whole plugin: the stack of running macros is shared, so a macro reached
 * again through another plugin's command (which runs synchronously inside the step that called
 * it) is caught as a loop, and depth and step caps bound anything that escapes even that.
 */
export class MacroRunner {
	/** Macros running now, outermost first. */
	private readonly stack: Macro[] = [];
	private stepsTaken = 0;

	constructor(private readonly host: MacroHost) {}

	run(macroId: string): MacroRunResult {
		const macro = this.find(macroId);
		if (!macro) {
			this.host.notify(macroNotFoundMessage(macroId));
			return "refused";
		}
		if (this.stack.some((running) => running.id === macro.id)) {
			this.host.notify(macroLoopMessage([...this.stack.slice(this.stack.findIndex((running) => running.id === macro.id)), macro].map((m) => m.name)));
			return "refused";
		}
		if (this.stack.length >= MAX_MACRO_DEPTH) {
			this.host.notify(macroDepthMessage(this.stack[0].name, MAX_MACRO_DEPTH));
			return "refused";
		}
		if (this.stack.length === 0) {
			const refusal = macro.steps.length === 0 ? macroEmptyMessage(macro.name) : this.preflight(macro, [macro]);
			if (refusal !== null) {
				this.host.notify(refusal);
				return "refused";
			}
			this.stepsTaken = 0;
		}

		this.stack.push(macro);
		try {
			return this.runSteps(macro);
		} finally {
			this.stack.pop();
		}
	}

	private find(id: string): Macro | undefined {
		return this.host.macros().find((macro) => macro.id === id);
	}

	/** The macro a command step runs, when it names one of ours. */
	private nestedMacro(commandId: string): Macro | undefined {
		const id = macroIdFromCommand(commandId);
		return id === null ? undefined : this.find(id);
	}

	/** Why `macro` (reached through `path`) must not start, or null when every step it could reach is runnable. */
	private preflight(macro: Macro, path: Macro[]): string | null {
		for (const [index, raw] of macro.steps.entries()) {
			const step = knownStep(raw);
			if (step === null) return macroNeedsNewerMessage(path[0].name, macro.name, index + 1);
			if (step.type !== "command") continue;
			if (step.command === LEADER_COMMAND_ID) return macroLeaderMessage(path[0].name);
			const nested = this.nestedMacro(step.command);
			if (nested) {
				if (path.some((m) => m.id === nested.id)) return macroLoopMessage([...path.slice(path.findIndex((m) => m.id === nested.id)), nested].map((m) => m.name));
				const inner = this.preflight(nested, [...path, nested]);
				if (inner !== null) return inner;
			} else if (!this.host.commandExists(step.command)) {
				return macroMissingCommandMessage(path[0].name, step.command);
			}
		}
		return null;
	}

	private runSteps(macro: Macro): MacroRunResult {
		const total = macro.steps.length;
		for (const [index, raw] of macro.steps.entries()) {
			if (++this.stepsTaken > MAX_MACRO_STEPS) {
				this.host.notify(macroStepLimitMessage(this.stack[0].name, MAX_MACRO_STEPS));
				return "stopped";
			}
			const step = knownStep(raw);
			// Pre-flight refused unknown kinds already; one can only appear here if the settings changed mid-run.
			if (step === null) {
				this.host.notify(macroNeedsNewerMessage(this.stack[0].name, macro.name, index + 1));
				return "stopped";
			}
			if (step.type === "text") {
				if (!this.host.insertText(step.text)) {
					this.host.notify(macroStoppedMessage(macro.name, index + 1, total, "text needs an open note"));
					return "stopped";
				}
				continue;
			}
			const nested = this.nestedMacro(step.command);
			if (nested) {
				// The nested run has said why it did not finish; this macro just stops there too.
				if (this.run(nested.id) !== "done") return "stopped";
				continue;
			}
			const name = this.host.commandName(step.command) ?? step.command;
			if (!this.host.commandExists(step.command)) {
				this.host.notify(macroStoppedMessage(macro.name, index + 1, total, `"${name}" is not available`));
				return "stopped";
			}
			if (!this.host.canRunCommand(step.command)) {
				this.host.notify(macroStoppedMessage(macro.name, index + 1, total, `"${name}" can't run here`));
				return "stopped";
			}
			if (!this.host.runCommand(step.command)) {
				this.host.notify(macroStoppedMessage(macro.name, index + 1, total, `"${name}" failed`));
				return "stopped";
			}
		}
		return "done";
	}
}
