import type { Macro } from "../src/macros/model";
import { checkMacro, findMacroLoop } from "../src/macros/validation";

const cmd = (command: string) => ({ type: "command", command });

describe("findMacroLoop", () => {
	const a: Macro = { id: "a", name: "Daily setup", steps: [cmd("neokeys:macro-b")] };
	const b: Macro = { id: "b", name: "Tidy", steps: [cmd("editor:toggle-bold"), cmd("neokeys:macro-c")] };
	const c: Macro = { id: "c", name: "Stamp", steps: [{ type: "text", text: "x" }] };

	it("finds no loop in a chain", () => {
		expect(findMacroLoop([a, b, c], "a")).toBeNull();
	});

	it("names the loop with the repeated macro at both ends", () => {
		const looping = { ...c, steps: [cmd("neokeys:macro-a")] };
		expect(findMacroLoop([a, b, looping], "a")).toEqual(["Daily setup", "Tidy", "Stamp", "Daily setup"]);
		expect(findMacroLoop([{ id: "s", name: "Self", steps: [cmd("neokeys:macro-s")] }], "s")).toEqual(["Self", "Self"]);
	});

	it("finds a loop further down that running the macro would walk into", () => {
		const looping = { ...c, steps: [cmd("neokeys:macro-b")] };
		expect(findMacroLoop([a, b, looping], "a")).toEqual(["Tidy", "Stamp", "Tidy"]);
	});

	it("ignores a step naming a macro that does not exist, and an unknown start", () => {
		expect(findMacroLoop([{ id: "a", name: "A", steps: [cmd("neokeys:macro-gone")] }], "a")).toBeNull();
		expect(findMacroLoop([a], "zzz")).toBeNull();
	});
});

describe("checkMacro", () => {
	const existing: Macro[] = [
		{ id: "a", name: "Daily setup", steps: [cmd("neokeys:macro-b")] },
		{ id: "b", name: "Tidy", steps: [cmd("editor:toggle-bold")] },
	];

	it("accepts a valid macro, including commands this device does not have", () => {
		const macro = { id: "n", name: "New", steps: [cmd("app:go-back"), cmd("linter:lint-file"), cmd("neokeys:macro-b"), { type: "text", text: "x" }] };
		expect(checkMacro(macro, existing)).toBeNull();
	});

	it("wants a name, a unique name, and a step", () => {
		expect(checkMacro({ id: "n", name: " ", steps: [cmd("app:go-back")] }, existing)).toBe("Give the macro a name.");
		expect(checkMacro({ id: "n", name: "tidy", steps: [cmd("app:go-back")] }, existing)).toBe('Another macro is already called "tidy".');
		expect(checkMacro({ id: "b", name: "Tidy", steps: [cmd("app:go-back")] }, existing)).toBeNull();
		expect(checkMacro({ id: "n", name: "New", steps: [] }, existing)).toBe("Add a step first.");
	});

	it("refuses an empty text step and the Leader", () => {
		expect(checkMacro({ id: "n", name: "New", steps: [cmd("app:go-back"), { type: "text", text: "" }] }, existing)).toBe("Step 2 has no text.");
		expect(checkMacro({ id: "n", name: "New", steps: [cmd("neokeys:leader")] }, existing)).toBe("Step 1 opens the Leader, which a macro can't do.");
	});

	it("refuses Repeat last action, which could be the macro itself", () => {
		expect(checkMacro({ id: "n", name: "New", steps: [cmd("app:go-back"), cmd("neokeys:repeat-last")] }, existing)).toBe("Step 2 repeats the last action, which a macro can't do: it could be the macro itself.");
	});

	it("refuses a step that closes a loop, judging the edited macro rather than its saved copy", () => {
		const edited = { id: "b", name: "Tidy", steps: [cmd("neokeys:macro-a")] };
		expect(checkMacro(edited, existing)).toBe('"Tidy" would run itself: Tidy → Daily setup → Tidy. Remove the step that leads back to it.');
		expect(checkMacro({ id: "n", name: "Self", steps: [cmd("neokeys:macro-n")] }, existing)).toBe('"Self" would run itself: Self → Self. Remove the step that leads back to it.');
	});

	it("keeps a step kind a newer Neokeys saved without judging it", () => {
		expect(checkMacro({ id: "n", name: "New", steps: [{ type: "wait", ms: 5 }] }, existing)).toBeNull();
	});
});
