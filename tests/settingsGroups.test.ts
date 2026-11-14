import { visibleSettingsGroups } from "../src/settingsGroups";

describe("visibleSettingsGroups", () => {
	it("shows every group on desktop, in the order the tab lays them out", () => {
		expect(visibleSettingsGroups(false)).toEqual(["leader", "popup", "dial", "keymap"]);
	});

	it("hides the leader key group on mobile, which has no hotkeys to bind or combo to type, and nothing else", () => {
		expect(visibleSettingsGroups(true)).toEqual(["popup", "dial", "keymap"]);
	});
});
