import { keyFromTyped } from "../src/typedKey";

describe("keyFromTyped", () => {
	it("takes a typed letter in either case, a digit or a symbol as it is", () => {
		expect(keyFromTyped("insertText", "a", "a")).toBe("a");
		expect(keyFromTyped("insertText", "F", "F")).toBe("F");
		expect(keyFromTyped("insertText", "7", "7")).toBe("7");
		expect(keyFromTyped("insertText", "?", "?")).toBe("?");
		expect(keyFromTyped("insertText", "-", "-")).toBe("-");
	});

	it("lets the newest character replace what the field held", () => {
		expect(keyFromTyped("insertText", "x", "fx")).toBe("x");
		expect(keyFromTyped("insertText", null, "c-jx")).toBe("x");
	});

	it("uses the inserted text, not the field's end, when the caret was elsewhere", () => {
		expect(keyFromTyped("insertText", "x", "xf")).toBe("x");
	});

	it("takes the last character of a composed word (a predictive keyboard)", () => {
		expect(keyFromTyped("insertCompositionText", "hello", "hello")).toBe("o");
		expect(keyFromTyped("insertText", null, "ab")).toBe("b");
	});

	it("writes a typed space as the key string for space", () => {
		expect(keyFromTyped("insertText", " ", "f ")).toBe("space");
	});

	it("clears the key when the field is emptied, even from a longer key", () => {
		expect(keyFromTyped("deleteContentBackward", null, "")).toBe("");
		expect(keyFromTyped("deleteContentBackward", null, "spac")).toBe("");
		expect(keyFromTyped("deleteByCut", null, "")).toBe("");
		expect(keyFromTyped("insertText", null, "")).toBe("");
	});

	it("ignores a newline or tab, so the key it had is kept", () => {
		expect(keyFromTyped("insertLineBreak", "\n", "f\n")).toBeNull();
		expect(keyFromTyped("insertText", "\t", "f\t")).toBeNull();
	});

	it("keeps an emoji or other astral character whole", () => {
		expect(keyFromTyped("insertText", "😀", "😀")).toBe("😀");
	});
});
