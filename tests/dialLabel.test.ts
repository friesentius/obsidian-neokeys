import { itemLabelText, splitItemLabel } from "../src/dial/label";

const ZWSP = "​";

describe("itemLabelText", () => {
	it("adds a break opportunity after every slash", () => {
		expect(itemLabelText("a/b/c")).toBe(`a/${ZWSP}b/${ZWSP}c`);
	});
});

describe("splitItemLabel", () => {
	it("ends the head at the first space", () => {
		expect(splitItemLabel("Close tab")).toEqual({ head: "Close", tail: " tab" });
	});

	it("keeps a later slash in the tail when a space comes first", () => {
		expect(splitItemLabel("Toggle bullet/checkbox")).toEqual({ head: "Toggle", tail: ` bullet/${ZWSP}checkbox` });
	});

	it("ends the head at the break after a slash in the first word", () => {
		expect(splitItemLabel("Projects/Roadmap.md")).toEqual({ head: "Projects/", tail: `${ZWSP}Roadmap.md` });
	});

	it("ends the head at a slash that comes before the first space", () => {
		expect(splitItemLabel("Notes/Daily log")).toEqual({ head: "Notes/", tail: `${ZWSP}Daily log` });
	});

	it("keeps a label with no break opportunity whole in the head", () => {
		expect(splitItemLabel("Strikethrough")).toEqual({ head: "Strikethrough", tail: "" });
	});
});
