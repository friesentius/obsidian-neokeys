import { knownStep, macroCommandId, macroCommandLabel, macroIdFromCommand, macroLocalCommandId, newMacroId, sanitizeMacros } from "../src/macros/model";
import { macroStepsLine, macroUsesLine, stepKindLabel } from "../src/macros/summary";
import { expandText, positionAfter } from "../src/macros/text";

describe("macro command ids", () => {
	it("registers macro-<id> under the plugin's prefix and reads the id back", () => {
		expect(macroLocalCommandId("tidy-note")).toBe("macro-tidy-note");
		expect(macroCommandId("tidy-note")).toBe("neokeys:macro-tidy-note");
		expect(macroIdFromCommand("neokeys:macro-tidy-note")).toBe("tidy-note");
		expect(macroIdFromCommand("neokeys:leader")).toBeNull();
		expect(macroIdFromCommand("cmdr:macro-0")).toBeNull();
		expect(macroIdFromCommand("neokeys:macro-")).toBeNull();
	});

	it("labels a macro command by its own name, and every other command as Obsidian names it", () => {
		expect(macroCommandLabel("neokeys:macro-tidy-note", "Neokeys: Tidy note")).toBe("Tidy note");
		expect(macroCommandLabel("neokeys:leader", "Neokeys: Leader")).toBe("Neokeys: Leader");
		expect(macroCommandLabel("editor:toggle-bold", "Toggle bold")).toBe("Toggle bold");
	});
});

describe("newMacroId", () => {
	it("slugs the name and numbers it past taken ids", () => {
		expect(newMacroId("Tidy note", [])).toBe("tidy-note");
		expect(newMacroId("Tidy note", ["tidy-note"])).toBe("tidy-note-2");
		expect(newMacroId("Tidy note", ["tidy-note", "tidy-note-2"])).toBe("tidy-note-3");
		expect(newMacroId("  Café: ** Résumé!! ", [])).toBe("cafe-resume");
		expect(newMacroId("日本語", [])).toBe("macro");
		expect(newMacroId("", ["macro"])).toBe("macro-2");
		expect(newMacroId("a".repeat(60), []).length).toBeLessThanOrEqual(40);
	});
});

describe("sanitizeMacros", () => {
	it("keeps well-formed macros as stored", () => {
		const stored = [{ id: "stamp", name: "Stamp", icon: "calendar", steps: [{ type: "text", text: "{{date}}" }, { type: "command", command: "editor:toggle-bold" }] }];
		expect(sanitizeMacros(stored)).toEqual(stored);
	});

	it("is empty for a file saved before macros existed or a value that is not a list", () => {
		expect(sanitizeMacros(undefined)).toEqual([]);
		expect(sanitizeMacros({ a: 1 })).toEqual([]);
		expect(sanitizeMacros("macros")).toEqual([]);
	});

	it("drops entries without a usable id or name, and a repeated id", () => {
		const stored = [
			null,
			"x",
			{ name: "No id", steps: [] },
			{ id: "Bad Id", name: "Bad", steps: [] },
			{ id: "ok", name: "  ", steps: [] },
			{ id: "ok", name: "First", steps: [] },
			{ id: "ok", name: "Second", steps: [] },
		];
		expect(sanitizeMacros(stored)).toEqual([{ id: "ok", name: "First", steps: [] }]);
	});

	it("drops broken steps of the kinds it knows, and a broken icon", () => {
		const stored = [{ id: "a", name: "A", icon: 3, steps: [{ type: "command" }, { type: "command", command: " " }, { type: "text", text: 5 }, "text", { text: "no type" }, { type: "command", command: " app:go-back " }] }];
		expect(sanitizeMacros(stored)).toEqual([{ id: "a", name: "A", steps: [{ type: "command", command: "app:go-back" }] }]);
	});

	it("keeps steps and fields a newer Neokeys saved, untouched, so saving here loses nothing", () => {
		const stored = [{ id: "a", name: "A", askFirst: true, steps: [{ type: "wait", ms: 200 }, { type: "text", text: "x", mode: "append" }] }];
		const macros = sanitizeMacros(stored);
		expect(macros).toEqual(stored);
		expect(knownStep(macros[0].steps[0])).toBeNull();
		expect(knownStep(macros[0].steps[1])).toEqual({ type: "text", text: "x", mode: "append" });
	});
});

describe("expandText", () => {
	const context = { selection: "beta", formatDate: (format: string) => `<${format}>` };

	it("puts the selection in and the cursor after the text by default", () => {
		expect(expandText("=={{selection}}==", context)).toEqual({ text: "==beta==", cursor: 8 });
		expect(expandText("plain", context)).toEqual({ text: "plain", cursor: 5 });
	});

	it("puts the cursor at the first {{cursor}} and drops any others", () => {
		expect(expandText("[{{cursor}}]({{selection}}){{cursor}}", context)).toEqual({ text: "[](beta)", cursor: 1 });
	});

	it("formats dates, YYYY-MM-DD by default", () => {
		expect(expandText("{{date}} {{date:HH:mm}} {{date: }}", context).text).toBe("<YYYY-MM-DD> <HH:mm> <YYYY-MM-DD>");
	});

	it("leaves anything else in braces as written", () => {
		expect(expandText("{{title}} {{selection:x}} {{cursor:1}} {{ selection }}", context)).toEqual({ text: "{{title}} {{selection:x}} {{cursor:1}} {{ selection }}", cursor: 54 });
	});

	it("handles an empty selection and several lines", () => {
		expect(expandText("- [ ] {{selection}}{{cursor}}\n", { ...context, selection: "" })).toEqual({ text: "- [ ] \n", cursor: 6 });
	});
});

describe("positionAfter", () => {
	it("counts the cursor from where the text went in", () => {
		expect(positionAfter({ line: 2, ch: 6 }, "abc")).toEqual({ line: 2, ch: 9 });
		expect(positionAfter({ line: 2, ch: 6 }, "")).toEqual({ line: 2, ch: 6 });
		expect(positionAfter({ line: 2, ch: 6 }, "ab\ncd\nef")).toEqual({ line: 4, ch: 2 });
	});
});

describe("macro summaries", () => {
	const names = (id: string) => (id === "editor:toggle-bold" ? "Toggle bold" : undefined);

	it("sums up a macro's steps on one line", () => {
		const macro = { id: "a", name: "A", steps: [{ type: "command", command: "editor:toggle-bold" }, { type: "text", text: "**{{date}}**\n- " }, { type: "command", command: "x:y" }, { type: "wait", ms: 1 }] };
		expect(macroStepsLine(macro, names)).toBe("4 steps: Toggle bold, **{{date}}** ⏎ - , x:y, A step from a newer version of Neokeys");
		expect(macroStepsLine({ ...macro, steps: [macro.steps[0]] }, names)).toBe("1 step: Toggle bold");
		expect(macroStepsLine({ ...macro, steps: [] }, names)).toBe("No steps yet");
		expect(macro.steps.map(stepKindLabel)).toEqual(["Command", "Text", "Command", "Newer step"]);
	});

	it("says where the keymap runs a macro", () => {
		expect(macroUsesLine([["i", "d"]])).toBe("In the keymap: i › d");
		expect(macroUsesLine([["i", "d"], ["m"]])).toBe("In the keymap: i › d, m");
		expect(macroUsesLine([])).toBe("Not in the keymap. Run it from a hotkey or the command palette.");
	});
});
