import { diffRings, swapRing, type RingShape } from "../src/dial/ringDiff";

const f = { name: "File" };
const t = { name: "Text" };
const w = { name: "Window" };
const root = { name: "root" };
const entries = (...names: string[]): Record<string, string>[] => names.map((name) => ({ name }));

function ring(group: object, items: readonly object[]): RingShape<object, object> {
	return { group, items };
}

describe("diffRings", () => {
	const rootItems = entries("f", "t", "w", "p");
	const fileItems = entries("n", "s", "d");
	const textItems = entries("f", "h", "l");
	const windowItems = entries("c", "x");

	it("keeps a ring that shows the same items of the same group", () => {
		const before = [ring(root, rootItems), ring(f, fileItems)];
		expect(diffRings(before, [ring(root, rootItems), ring(f, fileItems)])).toEqual(["keep", "keep"]);
	});

	it("enters a ring that opens outside the rings on screen, as from the root, and keeps the ones inside it", () => {
		expect(diffRings([ring(root, rootItems)], [ring(root, rootItems), ring(f, fileItems)])).toEqual(["keep", "enter"]);
		expect(diffRings([], [ring(root, rootItems)])).toEqual(["enter"]);
	});

	it("swaps the ring outside the thumb when it moves to a sibling group, the f, t, w case: the old ring leaves as the new one enters, the ring inside is kept", () => {
		const onF = [ring(root, rootItems), ring(f, fileItems)];
		const onT = [ring(root, rootItems), ring(t, textItems)];
		const onW = [ring(root, rootItems), ring(w, windowItems)];
		expect(diffRings(onF, onT)).toEqual(["keep", "swap"]);
		expect(diffRings(onT, onW)).toEqual(["keep", "swap"]);
		expect(diffRings(onW, onF)).toEqual(["keep", "swap"]);
	});

	it("swaps even when two sibling groups hold the same number of items, since only identity tells them apart", () => {
		expect(diffRings([ring(root, rootItems), ring(f, entries("a", "b"))], [ring(root, rootItems), ring(t, entries("a", "b"))])).toEqual(["keep", "swap"]);
	});

	it("swaps a ring whose group is the same but whose items are not, as after the keymap changed", () => {
		expect(diffRings([ring(f, fileItems)], [ring(f, entries("n", "s", "d"))])).toEqual(["swap"]);
		expect(diffRings([ring(f, fileItems)], [ring(f, fileItems.slice(0, 2))])).toEqual(["swap"]);
	});

	it("drops the rings outside the thumb when it moves to an item that opens nothing", () => {
		expect(diffRings([ring(root, rootItems), ring(f, fileItems), ring(t, textItems)], [ring(root, rootItems), ring(f, fileItems)])).toEqual(["keep", "keep"]);
		expect(diffRings([ring(root, rootItems), ring(f, fileItems)], [])).toEqual([]);
	});

	it("swaps a ring in the middle; the rings deeper than any there are now are simply absent from the result", () => {
		const before = [ring(root, rootItems), ring(f, fileItems), ring(t, textItems)];
		const after = [ring(root, rootItems), ring(w, windowItems)];
		expect(diffRings(before, after)).toEqual(["keep", "swap"]);
	});
});

/** A ring node with just the DOM's sibling rules: `after` on a node with no parent does nothing. */
class FakeRing {
	parent: FakeRing[] | null = null;
	constructor(readonly name: string) {}
	after(node: FakeRing): void {
		if (!this.parent) return;
		this.parent.splice(this.parent.indexOf(this) + 1, 0, node);
		node.parent = this.parent;
	}
	remove(): void {
		if (!this.parent) return;
		this.parent.splice(this.parent.indexOf(this), 1);
		this.parent = null;
	}
}

function fanOf(...names: string[]): FakeRing[] {
	const fan: FakeRing[] = [];
	for (const name of names) {
		const node = new FakeRing(name);
		node.parent = fan;
		fan.push(node);
	}
	return fan;
}

describe("swapRing", () => {
	it("shows the new ring when the old one is removed at once (ring animation off)", () => {
		const fan = fanOf("root", "File");
		const text = new FakeRing("Text");
		swapRing(fan[1], text, (old) => old.remove());
		expect(fan.map((node) => node.name)).toEqual(["root", "Text"]);
	});

	it("stacks the new ring above the old one while the old one animates out", () => {
		const fan = fanOf("root", "File", "File > New");
		const text = new FakeRing("Text");
		const retired: string[] = [];
		swapRing(fan[1], text, (old) => retired.push(old.name));
		expect(fan.map((node) => node.name)).toEqual(["root", "File", "Text", "File > New"]);
		expect(retired).toEqual(["File"]);
	});
});
