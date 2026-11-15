import { iconName, searchIcons, shownIcon } from "../src/icons";

const IDS = ["lucide-file", "lucide-file-text", "lucide-text-file", "lucide-folder", "lucide-folder-open", "lucide-star", "lucide-search", "lucide-file-search", "plugin-icon", "star"];

describe("iconName", () => {
	it("strips Obsidian's lucide- prefix and leaves any other id as it is", () => {
		expect(iconName("lucide-file-text")).toBe("file-text");
		expect(iconName("file-text")).toBe("file-text");
		expect(iconName("plugin-icon")).toBe("plugin-icon");
	});
});

describe("searchIcons", () => {
	it("lists the first names, bare and without duplicates, for an empty query", () => {
		expect(searchIcons(IDS, "")).toEqual(["file", "file-search", "file-text", "folder", "folder-open", "plugin-icon", "search", "star", "text-file"]);
		expect(searchIcons(IDS, "  ", 3)).toEqual(["file", "file-search", "file-text"]);
	});

	it("ranks an exact name first, then names that start with the query, then the rest in order", () => {
		expect(searchIcons(IDS, "file")).toEqual(["file", "file-search", "file-text", "text-file"]);
		expect(searchIcons(IDS, "star")).toEqual(["star"]);
		expect(searchIcons(IDS, "fol")).toEqual(["folder", "folder-open"]);
	});

	it("needs every word of the query to appear in the name, in any order", () => {
		expect(searchIcons(IDS, "text file")).toEqual(["text-file", "file-text"]);
		expect(searchIcons(IDS, "file search")).toEqual(["file-search"]);
		expect(searchIcons(IDS, "zzz")).toEqual([]);
	});

	it("is case-insensitive and caps the results", () => {
		expect(searchIcons(IDS, "FILE", 2)).toEqual(["file", "file-search"]);
	});
});

describe("shownIcon", () => {
	const known = (id: string): boolean => id === "star" || id === "file-text";

	it("draws an item's icon in place of its key when the icon is known, and so the pill adds the key beside the name", () => {
		expect(shownIcon("star", known)).toBe("star");
		expect(shownIcon("file-text", known)).toBe("file-text");
	});

	it("leaves the key on the circle, and no key chip in the pill, for an unknown icon or none", () => {
		expect(shownIcon("not-an-icon", known)).toBeNull();
		expect(shownIcon(null, known)).toBeNull();
	});
});
