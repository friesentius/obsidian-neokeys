import { isRepeatableCommand, REPEAT_COMMAND_ID, repeatHint, RepeatTracker } from "../src/repeat";

describe("RepeatTracker", () => {
	it("remembers nothing until a keymap item runs", () => {
		const tracker = new RepeatTracker();
		expect(tracker.lastAction).toBeNull();
		expect(repeatHint(tracker.lastAction)).toBe("nothing yet");
	});

	it("keeps the last command or file an item ran, with the item's label", () => {
		const tracker = new RepeatTracker();
		tracker.record({ kind: "command", command: "neokeys:increase-heading-level", label: "Increase heading level" });
		expect(tracker.lastAction).toEqual({ kind: "command", command: "neokeys:increase-heading-level", label: "Increase heading level" });
		tracker.record({ kind: "file", file: "Inbox/Today", label: "Today's inbox" });
		expect(tracker.lastAction).toEqual({ kind: "file", file: "Inbox/Today", label: "Today's inbox" });
		expect(repeatHint(tracker.lastAction)).toBe("Today's inbox");
	});

	it("counts a macro item: it is a command, so Repeat runs the whole macro again", () => {
		const tracker = new RepeatTracker();
		tracker.record({ kind: "command", command: "neokeys:macro-tidy-note", label: "Tidy note" });
		expect(tracker.lastAction?.kind === "command" && tracker.lastAction.command).toBe("neokeys:macro-tidy-note");
	});

	it("never records Repeat itself or the Leader, so Repeat cannot repeat itself", () => {
		const tracker = new RepeatTracker();
		tracker.record({ kind: "command", command: "editor:toggle-bold", label: "Bold" });
		tracker.record({ kind: "command", command: REPEAT_COMMAND_ID, label: "Repeat" });
		tracker.record({ kind: "command", command: "neokeys:leader", label: "Leader" });
		expect(tracker.lastAction).toEqual({ kind: "command", command: "editor:toggle-bold", label: "Bold" });
		expect(isRepeatableCommand(REPEAT_COMMAND_ID)).toBe(false);
		expect(isRepeatableCommand("neokeys:leader")).toBe(false);
		expect(isRepeatableCommand("editor:toggle-bold")).toBe(true);
	});

	it("keeps its own copy, so a caller changing the action afterwards changes nothing", () => {
		const tracker = new RepeatTracker();
		const action = { kind: "command" as const, command: "editor:toggle-bold", label: "Bold" };
		tracker.record(action);
		action.label = "Changed";
		expect(tracker.lastAction?.label).toBe("Bold");
	});
});
