import type { Macro } from "../src/macros/model";
import { MAX_MACRO_DEPTH, MAX_MACRO_STEPS } from "../src/macros/model";
import { MacroRunner, type MacroHost } from "../src/macros/runner";

/** A fake Obsidian: a set of commands, which of them can run now, a log of what ran and was said. */
function fakeHost(macros: Macro[], options: { commands?: string[]; cannotRun?: string[]; throws?: string[]; noEditor?: boolean } = {}) {
	const commands = new Set(options.commands ?? ["editor:toggle-bold", "editor:toggle-italics", "app:go-back", "other:runs-macro"]);
	for (const macro of macros) commands.add(`neokeys:macro-${macro.id}`);
	const log: string[] = [];
	const notices: string[] = [];
	let runner: MacroRunner | null = null;
	const host: MacroHost = {
		macros: () => macros,
		commandExists: (id) => commands.has(id),
		commandName: (id) => (id === "editor:toggle-bold" ? "Toggle bold" : undefined),
		canRunCommand: (id) => !(options.cannotRun ?? []).includes(id),
		runCommand: (id) => {
			log.push(`command ${id}`);
			// Another plugin's command that, synchronously, runs a Neokeys macro (as QuickAdd could).
			if (id === "other:runs-macro") runner?.run("a");
			return !(options.throws ?? []).includes(id);
		},
		insertText: (text) => {
			if (options.noEditor) return false;
			log.push(`text ${text}`);
			return true;
		},
		notify: (message) => notices.push(message),
	};
	runner = new MacroRunner(host);
	return { runner, log, notices };
}

const cmd = (command: string) => ({ type: "command", command });
const text = (value: string) => ({ type: "text", text: value });

describe("MacroRunner", () => {
	it("runs every step in order and says nothing when all went well", () => {
		const { runner, log, notices } = fakeHost([{ id: "a", name: "A", steps: [cmd("editor:toggle-bold"), text("x{{cursor}}"), cmd("editor:toggle-italics")] }]);
		expect(runner.run("a")).toBe("done");
		expect(log).toEqual(["command editor:toggle-bold", "text x{{cursor}}", "command editor:toggle-italics"]);
		expect(notices).toEqual([]);
	});

	it("refuses the whole macro before any step when a command does not exist", () => {
		const { runner, log, notices } = fakeHost([{ id: "a", name: "Tidy", steps: [cmd("editor:toggle-bold"), cmd("linter:lint-file")] }]);
		expect(runner.run("a")).toBe("refused");
		expect(log).toEqual([]);
		expect(notices).toEqual(['Neokeys: "Tidy" did not run: command "linter:lint-file" is not available']);
	});

	it("refuses when a macro it runs holds a missing command, naming the outer macro", () => {
		const macros = [
			{ id: "a", name: "Outer", steps: [cmd("editor:toggle-bold"), cmd("neokeys:macro-b")] },
			{ id: "b", name: "Inner", steps: [cmd("nope:missing")] },
		];
		const { runner, log, notices } = fakeHost(macros);
		expect(runner.run("a")).toBe("refused");
		expect(log).toEqual([]);
		expect(notices).toEqual(['Neokeys: "Outer" did not run: command "nope:missing" is not available']);
	});

	it("stops at the first step that cannot run here, after the earlier steps ran", () => {
		const { runner, log, notices } = fakeHost([{ id: "a", name: "Tidy", steps: [cmd("app:go-back"), cmd("editor:toggle-bold"), cmd("editor:toggle-italics")] }], { cannotRun: ["editor:toggle-bold"] });
		expect(runner.run("a")).toBe("stopped");
		expect(log).toEqual(["command app:go-back"]);
		expect(notices).toEqual(['Neokeys: "Tidy" stopped at step 2 of 3: "Toggle bold" can\'t run here']);
	});

	it("names a step by its id when Obsidian gives no name", () => {
		const { runner, notices } = fakeHost([{ id: "a", name: "A", steps: [cmd("editor:toggle-italics")] }], { cannotRun: ["editor:toggle-italics"] });
		runner.run("a");
		expect(notices).toEqual(['Neokeys: "A" stopped at step 1 of 1: "editor:toggle-italics" can\'t run here']);
	});

	it("stops when a command throws", () => {
		const { runner, log, notices } = fakeHost([{ id: "a", name: "A", steps: [cmd("editor:toggle-bold"), cmd("app:go-back")] }], { throws: ["editor:toggle-bold"] });
		expect(runner.run("a")).toBe("stopped");
		expect(log).toEqual(["command editor:toggle-bold"]);
		expect(notices).toEqual(['Neokeys: "A" stopped at step 1 of 2: "Toggle bold" failed']);
	});

	it("stops at a text step when no note is open", () => {
		const { runner, log, notices } = fakeHost([{ id: "a", name: "Stamp", steps: [cmd("app:go-back"), text("{{date}}"), cmd("app:go-back")] }], { noEditor: true });
		expect(runner.run("a")).toBe("stopped");
		expect(log).toEqual(["command app:go-back"]);
		expect(notices).toEqual(['Neokeys: "Stamp" stopped at step 2 of 3: text needs a note open for editing']);
	});

	it("runs a macro step's macro in place, and stops the outer one when the inner one stops", () => {
		const macros = [
			{ id: "a", name: "Outer", steps: [cmd("neokeys:macro-b"), cmd("app:go-back")] },
			{ id: "b", name: "Inner", steps: [text("hi"), cmd("editor:toggle-bold"), text("never")] },
		];
		const ok = fakeHost(macros);
		expect(ok.runner.run("a")).toBe("done");
		expect(ok.log).toEqual(["text hi", "command editor:toggle-bold", "text never", "command app:go-back"]);
		expect(ok.log).not.toContain("command neokeys:macro-b");

		const stopped = fakeHost(macros, { cannotRun: ["editor:toggle-bold"] });
		expect(stopped.runner.run("a")).toBe("stopped");
		expect(stopped.log).toEqual(["text hi"]);
		expect(stopped.notices).toEqual(['Neokeys: "Inner" stopped at step 2 of 3: "Toggle bold" can\'t run here']);
	});

	it("refuses a loop between macros before it starts, with the path", () => {
		const macros = [
			{ id: "a", name: "Daily setup", steps: [cmd("neokeys:macro-b")] },
			{ id: "b", name: "Tidy", steps: [text("x"), cmd("neokeys:macro-a")] },
		];
		const { runner, log, notices } = fakeHost(macros);
		expect(runner.run("a")).toBe("refused");
		expect(log).toEqual([]);
		expect(notices).toEqual(['Neokeys: "Daily setup" did not run: it would run itself (Daily setup → Tidy → Daily setup)']);
	});

	it("catches a loop that goes through another plugin's command at run time", () => {
		const { runner, log, notices } = fakeHost([{ id: "a", name: "A", steps: [text("1"), cmd("other:runs-macro"), text("2")] }]);
		expect(runner.run("a")).toBe("done");
		expect(log).toEqual(["text 1", "command other:runs-macro", "text 2"]);
		expect(notices).toEqual(['Neokeys: "A" did not run: it would run itself (A → A)']);
	});

	it("is free to run the same macro again once a run has finished", () => {
		const { runner, notices } = fakeHost([{ id: "a", name: "A", steps: [text("1")] }]);
		expect(runner.run("a")).toBe("done");
		expect(runner.run("a")).toBe("done");
		expect(notices).toEqual([]);
	});

	it("refuses a step that opens the Leader", () => {
		const { runner, log, notices } = fakeHost([{ id: "a", name: "A", steps: [text("1"), cmd("neokeys:leader")] }], { commands: ["neokeys:leader"] });
		expect(runner.run("a")).toBe("refused");
		expect(log).toEqual([]);
		expect(notices).toEqual(['Neokeys: "A" did not run: a macro can\'t open the Leader']);
	});

	it("refuses a step kind saved by a newer Neokeys instead of skipping it", () => {
		const macros: Macro[] = [{ id: "a", name: "A", steps: [text("1"), { type: "wait", ms: 200 }] }];
		const { runner, log, notices } = fakeHost(macros);
		expect(runner.run("a")).toBe("refused");
		expect(log).toEqual([]);
		expect(notices).toEqual(['Neokeys: "A" did not run: step 2 needs a newer version of Neokeys']);
	});

	it("refuses an empty macro and an unknown one", () => {
		const { runner, notices } = fakeHost([{ id: "a", name: "A", steps: [] }]);
		expect(runner.run("a")).toBe("refused");
		expect(runner.run("gone")).toBe("refused");
		expect(notices).toEqual(['Neokeys: "A" did not run: it has no steps yet', 'Neokeys: there is no macro "gone" any more']);
	});

	it(`stops macros nested more than ${MAX_MACRO_DEPTH} deep`, () => {
		const macros: Macro[] = Array.from({ length: MAX_MACRO_DEPTH + 2 }, (_, i) => ({
			id: `m${i}`,
			name: `M${i}`,
			steps: i === MAX_MACRO_DEPTH + 1 ? [text("deep")] : [cmd(`neokeys:macro-m${i + 1}`)],
		}));
		const { runner, log, notices } = fakeHost(macros);
		expect(runner.run("m0")).toBe("stopped");
		expect(log).toEqual([]);
		expect(notices).toEqual([`Neokeys: "M0" stopped: macros run each other more than ${MAX_MACRO_DEPTH} deep`]);
	});

	it(`stops a run after ${MAX_MACRO_STEPS} steps in all`, () => {
		const leaf = { id: "leaf", name: "Leaf", steps: Array.from({ length: 50 }, () => text("x")) };
		const top = { id: "top", name: "Top", steps: Array.from({ length: 5 }, () => cmd("neokeys:macro-leaf")) };
		const { runner, log, notices } = fakeHost([top, leaf]);
		expect(runner.run("top")).toBe("stopped");
		// Every macro step counts as one, and so does each step it runs: 4 x (1 + 50) = 204 > 200.
		expect(log.length).toBe(MAX_MACRO_STEPS - 4);
		expect(notices).toEqual([`Neokeys: "Top" stopped after ${MAX_MACRO_STEPS} steps`]);
		// The count starts again for the next run.
		const again = fakeHost([{ id: "a", name: "A", steps: [text("1")] }]);
		expect(again.runner.run("a")).toBe("done");
	});
});
