import {
	deviceFromPlatform,
	entryNeeds,
	hasKeyField,
	keyDescription,
	keyIsOptional,
	validateKeyAndIcon,
} from "../src/entryValidation";

describe("deviceFromPlatform", () => {
	it("reads Obsidian's own flags, tablet and phone before desktop", () => {
		expect(deviceFromPlatform({ isPhone: true, isTablet: false })).toBe("phone");
		expect(deviceFromPlatform({ isPhone: false, isTablet: true })).toBe("tablet");
		expect(deviceFromPlatform({ isPhone: false, isTablet: false })).toBe("desktop");
	});
});

describe("what the key row offers", () => {
	it("gives phones and tablets a text field, and desktop none", () => {
		expect([hasKeyField("phone"), hasKeyField("tablet"), hasKeyField("desktop")]).toEqual([true, true, false]);
	});
});

describe("validateKeyAndIcon", () => {
	it("on a phone accepts a key, an icon, or both, and refuses neither", () => {
		expect(validateKeyAndIcon("phone", "f", "")).toBeNull();
		expect(validateKeyAndIcon("phone", "", "folder")).toBeNull();
		expect(validateKeyAndIcon("phone", "f", "folder")).toBeNull();
		expect(validateKeyAndIcon("phone", "", "")).toBe("Set a key or an icon first.");
		expect(validateKeyAndIcon("phone", "  ", "  ")).toMatch(/key or an icon/);
	});

	it.each(["tablet", "desktop"] as const)("on a %s requires a key, and an icon is optional", (device) => {
		expect(validateKeyAndIcon(device, "f", "")).toBeNull();
		expect(validateKeyAndIcon(device, "f", "folder")).toBeNull();
		expect(validateKeyAndIcon(device, "", "")).toBe("Set a key first.");
		// An icon does not stand in for the key here.
		expect(validateKeyAndIcon(device, "", "folder")).toBe("Set a key first.");
		expect(validateKeyAndIcon(device, " ", "folder")).toBe("Set a key first.");
	});

	it("only a phone lets the key go", () => {
		expect([keyIsOptional("phone"), keyIsOptional("tablet"), keyIsOptional("desktop")]).toEqual([true, false, false]);
	});
});

describe("entryNeeds: the tree editor's note on an existing entry", () => {
	it("never notes an entry that has a key", () => {
		for (const device of ["phone", "tablet", "desktop"] as const) expect(entryNeeds(device, true, undefined)).toBeNull();
	});

	it("notes a keyless entry on a tablet or desktop, icon or not", () => {
		for (const device of ["tablet", "desktop"] as const) {
			expect(entryNeeds(device, false, "star")).toBe("Needs a key");
			expect(entryNeeds(device, false, undefined)).toBe("Needs a key");
		}
	});

	it("accepts a keyless entry with an icon on a phone, and notes one without", () => {
		expect(entryNeeds("phone", false, "star")).toBeNull();
		expect(entryNeeds("phone", false, undefined)).toBe("Needs a key or an icon");
		expect(entryNeeds("phone", false, " ")).toBe("Needs a key or an icon");
	});
});

describe("keyDescription", () => {
	it("tells a phone that a key does nothing there and is kept for desktop and tablet", () => {
		const text = keyDescription("phone");
		expect(text).toMatch(/^Optional on phones/);
		expect(text).toMatch(/only labels the circle when the item has no icon/);
		expect(text).toMatch(/desktop and tablet leader keys after sync/);
	});

	it("does not call the key optional on a tablet or desktop", () => {
		expect(keyDescription("tablet")).not.toMatch(/optional on phones/i);
		expect(keyDescription("desktop")).not.toMatch(/optional on phones/i);
	});
});
