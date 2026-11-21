import { visibleSettingsGroups } from "../src/settingsGroups";

describe("visibleSettingsGroups", () => {
	it("hides the mobile dial group on desktop, where there is no dial, and nothing else", () => {
		expect(visibleSettingsGroups(false)).toEqual(["leader", "popup", "macros", "keymap"]);
	});

	it("hides the leader key group on mobile, which has no hotkeys to bind or combo to type, and nothing else", () => {
		expect(visibleSettingsGroups(true)).toEqual(["popup", "dial", "macros", "keymap"]);
	});
});
