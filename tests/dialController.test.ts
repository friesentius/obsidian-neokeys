import { DialController, type DialHost } from "../src/dial/controller";
import { computeRings, DEFAULT_RING_PARAMS, placeSlots, slotPosition, type DialGeometry } from "../src/dial/layout";
import { parseKeymapSource } from "../src/keymap";

const SOURCE = `
title: Neokeys
items:
  f:
    title: File
    items:
      n: file-explorer:new-file New file
      o:
        file: Inbox/Today
        description: Today's inbox
  w:
    title: Window
    items:
      c: workspace:new-tab New tab
      x: workspace:close Close tab
      n: workspace:next-tab Next tab
      p: workspace:previous-tab Previous tab
      m: workspace:move-to-new-window Move tab to new window
      u: workspace:undo-close-pane Undo close tab
      v: workspace:split-vertical Split right
      '-': workspace:split-horizontal Split down
      g:
        title: Go to tab
        items:
          '1': workspace:goto-tab-1 Tab 1
      e:
        title: Focus pane
        items:
          h: editor:focus-left Focus left
      w: workspace:new-window New window
      W: workspace:close-window Close window
  z: app:zoom Zoom
  b: plugin:bogus Bogus
`;

const KNOWN = new Set([
	"file-explorer:new-file",
	"workspace:new-tab",
	"workspace:close",
	"workspace:next-tab",
	"workspace:previous-tab",
	"workspace:move-to-new-window",
	"workspace:undo-close-pane",
	"workspace:split-vertical",
	"workspace:split-horizontal",
	"workspace:goto-tab-1",
	"editor:focus-left",
	"workspace:new-window",
	"workspace:close-window",
	"app:zoom",
]);

/** A 390x844 phone, anchor bottom-right, nothing under it, the pill taking the top 56px. */
const PHONE: DialGeometry = {
	corner: "bottom-right",
	anchor: { x: 350, y: 804 },
	bounds: { left: 4, top: 60, right: 386, bottom: 832 },
};

/** A box so short that only one ring of three fits, to force paging. */
const TINY: DialGeometry = {
	corner: "bottom-right",
	anchor: { x: 350, y: 180 },
	bounds: { left: 4, top: 60, right: 386, bottom: 208 },
};

function makeHost() {
	const calls = { executed: [] as string[], opened: [] as string[], notices: [] as string[], vibrations: 0 };
	const host: DialHost = {
		isCommandKnown: (id) => KNOWN.has(id),
		resolveCommandName: () => undefined,
		executeCommand: (id) => {
			calls.executed.push(id);
		},
		openFile: (path) => {
			calls.opened.push(path);
		},
		notify: (message) => {
			calls.notices.push(message);
		},
		vibrate: () => {
			calls.vibrations++;
		},
	};
	return { host, calls };
}

function setup(geometry: DialGeometry = PHONE, raisedGeometry: DialGeometry = geometry, overlapGeometry: DialGeometry = raisedGeometry) {
	const root = parseKeymapSource(SOURCE);
	const { host, calls } = makeHost();
	const changes: string[] = [];
	const controller = new DialController(host, (mode) => (mode === "normal" ? geometry : mode === "raised" ? raisedGeometry : overlapGeometry));
	controller.onChange((change) => changes.push(change));
	return { root, host, calls, changes, controller };
}

/** Screen position of the item currently labelled `label`. */
function itemAt(controller: DialController, label: string) {
	const item = controller.view().items.find((i) => i.label === label);
	if (!item) throw new Error(`no item labelled ${label}: ${controller.view().items.map((i) => i.label).join(", ")}`);
	return { x: item.x, y: item.y };
}

describe("DialController opening and closing", () => {
	it("starts closed with an empty view", () => {
		const { controller } = setup();
		expect(controller.isOpen).toBe(false);
		expect(controller.view()).toMatchObject({ open: false, items: [], crumbs: [], armedLabel: null });
	});

	it("opens at the root with the level's items placed on the rings", () => {
		const { controller, root } = setup();
		controller.open(root);
		const view = controller.view();
		expect(view.open).toBe(true);
		expect(view.title).toBe("Neokeys");
		expect(view.crumbs).toEqual([]);
		// Groups first, then commands, in stored order (the which-key popup's sort).
		expect(view.items.map((i) => i.label)).toEqual(["File", "Window", "Zoom", "Bogus"]);
		expect(view.items.map((i) => i.kind)).toEqual(["group", "group", "command", "command"]);
		expect(view.items.map((i) => i.key)).toEqual(["f", "w", "z", "b"]);
		expect(view.items[3].invalid).toBe(true);
		expect(view.items.every((i) => i.size === DEFAULT_RING_PARAMS.itemSize)).toBe(true);
		expect(view.pages).toBe(1);
	});

	it("places items where the layout module says, so hit tests and rendering agree", () => {
		const { controller, root } = setup();
		controller.open(root);
		const rings = computeRings(PHONE, DEFAULT_RING_PARAMS);
		const slots = placeSlots(rings, 4);
		controller.view().items.forEach((item, index) => {
			const expected = slotPosition(slots[index], PHONE, rings);
			expect(item.x).toBeCloseTo(expected.x, 6);
			expect(item.y).toBeCloseTo(expected.y, 6);
		});
	});

	it("pressing the anchor while closed opens it, and releasing without arming leaves it open", () => {
		const { controller, root } = setup();
		controller.pressAnchor(root);
		expect(controller.isOpen).toBe(true);
		expect(controller.isPressing).toBe(true);
		controller.release();
		expect(controller.isOpen).toBe(true);
		expect(controller.isPressing).toBe(false);
	});

	it("a tap on the anchor while open goes back a level, and closes at the root", () => {
		const { controller, root } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().crumbs).toEqual(["Window"]);
		controller.pressAnchor(root);
		controller.release();
		expect(controller.isOpen).toBe(true);
		expect(controller.view().crumbs).toEqual([]);
		controller.pressAnchor(root);
		controller.release();
		expect(controller.isOpen).toBe(false);
	});

	it("a drag from the open anchor that ends on nothing also acts as back", () => {
		const { controller, root } = setup();
		controller.open(root);
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.moveTo({ x: 40, y: 300 });
		controller.release();
		expect(controller.isOpen).toBe(false);
	});

	it("a tap outside every item closes it", () => {
		const { controller, root } = setup();
		controller.open(root);
		controller.pressAt({ x: 40, y: 300 });
		expect(controller.view().armedLabel).toBeNull();
		controller.release();
		expect(controller.isOpen).toBe(false);
	});

	it("close() and back() at the root close it; back() deeper goes up one level", () => {
		const { controller, root } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().crumbs).toEqual(["Window"]);
		controller.back();
		expect(controller.isOpen).toBe(true);
		expect(controller.view().crumbs).toEqual([]);
		controller.back();
		expect(controller.isOpen).toBe(false);
		controller.open(root);
		controller.close();
		expect(controller.isOpen).toBe(false);
	});

	it("re-opening resets to the root and page 0", () => {
		const { controller, root } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.release();
		expect(controller.view().crumbs).toEqual(["File"]);
		controller.open(root);
		expect(controller.view().crumbs).toEqual([]);
		expect(controller.view().page).toBe(0);
	});
});

describe("DialController dragging", () => {
	it("arms the item under the pointer while pressing and shows its label in the breadcrumb", () => {
		const { controller, root, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		const view = controller.view();
		expect(view.armedLabel).toBe("File");
		expect(view.items.find((i) => i.label === "File")?.armed).toBe(true);
		expect(calls.vibrations).toBe(1);
		// Nothing has happened yet: still at the root, nothing executed.
		expect(view.crumbs).toEqual([]);
		expect(calls.executed).toEqual([]);
	});

	it("passing over a group mid-drag never descends; only the release target acts", () => {
		const { controller, root, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		expect(controller.view().crumbs).toEqual([]);
		controller.moveTo(itemAt(controller, "Window"));
		expect(controller.view().armedLabel).toBe("Window");
		expect(controller.view().crumbs).toEqual([]);
		controller.moveTo(itemAt(controller, "Zoom"));
		controller.release();
		expect(calls.executed).toEqual(["app:zoom"]);
		expect(controller.isOpen).toBe(false);
	});

	it("moving away from every item disarms without acting", () => {
		const { controller, root, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Zoom"));
		controller.moveTo({ x: 40, y: 300 });
		expect(controller.view().armedLabel).toBeNull();
		controller.release();
		expect(calls.executed).toEqual([]);
	});

	it("does not react to moves when no pointer is down", () => {
		const { controller, root } = setup();
		controller.open(root);
		controller.moveTo(itemAt(controller, "Zoom"));
		expect(controller.view().armedLabel).toBeNull();
		expect(controller.view().pressing).toBe(false);
	});

	it("ignores a second pointer while one is already down", () => {
		const { controller, root } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.pressAt(itemAt(controller, "Zoom"));
		controller.pressAnchor(root);
		expect(controller.view().armedLabel).toBe("File");
	});

	it("a cancelled press never acts and leaves the dial open", () => {
		const { controller, root, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Zoom"));
		controller.cancelPress();
		expect(controller.view().armedLabel).toBeNull();
		expect(controller.isPressing).toBe(false);
		expect(controller.isOpen).toBe(true);
		controller.release();
		expect(calls.executed).toEqual([]);
	});

	it("only vibrates when the armed item changes", () => {
		const { controller, root, calls } = setup();
		controller.pressAnchor(root);
		const file = itemAt(controller, "File");
		controller.moveTo(file);
		controller.moveTo({ x: file.x + 2, y: file.y + 2 });
		controller.moveTo({ x: file.x - 3, y: file.y });
		expect(calls.vibrations).toBe(1);
		controller.moveTo({ x: 40, y: 300 });
		controller.moveTo(file);
		expect(calls.vibrations).toBe(2);
	});
});

describe("DialController committing", () => {
	it("releasing on a group descends into it without running anything", () => {
		const { controller, root, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.release();
		const view = controller.view();
		expect(view.open).toBe(true);
		expect(view.crumbs).toEqual(["File"]);
		expect(view.items.map((i) => i.label)).toEqual(["Today's inbox", "New file"]);
		expect(view.items.map((i) => i.kind)).toEqual(["file", "command"]);
		expect(calls.executed).toEqual([]);
		expect(calls.opened).toEqual([]);
	});

	it("a direct tap on an item selects it the same way a drag-and-release does", () => {
		const { controller, root, calls } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		expect(controller.view().armedLabel).toBe("File");
		controller.release();
		controller.pressAt(itemAt(controller, "New file"));
		controller.release();
		expect(calls.executed).toEqual(["file-explorer:new-file"]);
		expect(controller.isOpen).toBe(false);
	});

	it("releasing on a file closes the dial and opens the file", () => {
		const { controller, root, calls } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.release();
		controller.pressAt(itemAt(controller, "Today's inbox"));
		controller.release();
		expect(calls.opened).toEqual(["Inbox/Today"]);
		expect(controller.isOpen).toBe(false);
	});

	it("an unknown command shows the same notice as the popup and keeps the dial open", () => {
		const { controller, root, calls } = setup();
		controller.open(root);
		expect(controller.view().items.find((i) => i.label === "Bogus")?.invalid).toBe(true);
		controller.pressAt(itemAt(controller, "Bogus"));
		expect(controller.view().armedInvalid).toBe(true);
		controller.release();
		expect(calls.notices).toEqual(['Neokeys: command "plugin:bogus" is not available']);
		expect(calls.executed).toEqual([]);
		expect(controller.isOpen).toBe(true);
	});

	it("closes before the command runs, so the command sees the dial gone", () => {
		const root = parseKeymapSource(SOURCE);
		const { host, calls } = makeHost();
		const controller = new DialController(host, () => PHONE);
		let openWhenExecuted: boolean | null = null;
		host.executeCommand = (id) => {
			openWhenExecuted = controller.isOpen;
			calls.executed.push(id);
		};
		controller.open(root);
		controller.pressAt(itemAt(controller, "Zoom"));
		controller.release();
		expect(openWhenExecuted).toBe(false);
	});

	it("walks the 12-item Window group on one page on a phone", () => {
		const { controller, root } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		const view = controller.view();
		expect(view.pages).toBe(1);
		expect(view.items).toHaveLength(12);
		expect(view.items.filter((i) => i.kind === "more")).toHaveLength(0);
		expect(view.items.slice(0, 2).map((i) => i.label)).toEqual(["Go to tab", "Focus pane"]);
	});
});

describe("DialController paging", () => {
	it("pages a level the rings cannot hold, with a More item that turns the page and wraps", () => {
		const { controller, root } = setup(TINY);
		controller.open(root);
		// One ring of three: 4 root items -> 2 pages of 2 plus More.
		let view = controller.view();
		expect(view.pages).toBe(2);
		expect(view.items.map((i) => i.label)).toEqual(["File", "Window", "More"]);
		expect(view.items[2]).toMatchObject({ kind: "more", key: "…" });

		controller.pressAt(itemAt(controller, "More"));
		expect(controller.view().armedLabel).toBe("More");
		controller.release();
		view = controller.view();
		expect(view.page).toBe(1);
		expect(view.items.map((i) => i.label)).toEqual(["Zoom", "Bogus", "More"]);
		expect(controller.isOpen).toBe(true);

		controller.pressAt(itemAt(controller, "More"));
		controller.release();
		expect(controller.view().page).toBe(0);
	});

	it("descending into a group starts that group at page 0, and back returns to page 0 of the parent", () => {
		const { controller, root } = setup(TINY);
		controller.open(root);
		controller.pressAt(itemAt(controller, "More"));
		controller.release();
		expect(controller.view().page).toBe(1);
		controller.pressAt(itemAt(controller, "More"));
		controller.release();
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().crumbs).toEqual(["Window"]);
		expect(controller.view().page).toBe(0);
		expect(controller.view().pages).toBe(6); // 12 items, 2 per page
		controller.back();
		expect(controller.view().page).toBe(0);
	});

	it("raises the pill over the header when that lets a level fit without paging", () => {
		// An iPhone SE with its keyboard up: 193px of fan under a pill below the header, 237px with it raised.
		const normal: DialGeometry = { corner: "bottom-right", anchor: { x: 335, y: 315 }, bounds: { left: 4, top: 122, right: 371, bottom: 343 } };
		const raised: DialGeometry = { ...normal, bounds: { ...normal.bounds, top: 78 } };
		const { controller, root } = setup(normal, raised);
		controller.open(root);
		expect(controller.view().mode).toBe("normal");
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		const view = controller.view();
		expect(view.mode).toBe("raised");
		expect(view.pages).toBe(1);
		expect(view.items).toHaveLength(12);
		expect(view.items.every((i) => i.y - i.size / 2 >= 78)).toBe(true);
		controller.back();
		expect(controller.view().mode).toBe("normal");
	});

	it("keeps the pill in place when raising it would not hold more", () => {
		const { controller, root } = setup(TINY, { ...TINY, bounds: { ...TINY.bounds, top: 55 } });
		controller.open(root);
		expect(controller.view().mode).toBe("normal");
		expect(controller.view().pages).toBe(2);
	});

	it("lets the rings reach up behind the pill when nothing fits under it even raised, so a short screen still gets a ring", () => {
		// A 320x568 phone with a tall keyboard up: 91px of fan under the raised pill, not enough for
		// even the compact first ring (74 + 22), but 145px to the pill's top edge.
		const normal: DialGeometry = { corner: "bottom-right", anchor: { x: 280, y: 216 }, bounds: { left: 4, top: 165, right: 316, bottom: 244 } };
		const raised: DialGeometry = { ...normal, bounds: { ...normal.bounds, top: 125 } };
		const overlap: DialGeometry = { ...normal, bounds: { ...normal.bounds, top: 71 } };
		const { controller, root } = setup(normal, raised, overlap);
		controller.open(root);
		const view = controller.view();
		expect(view.mode).toBe("overlap");
		expect(view.items.length).toBeGreaterThan(0);
		expect(view.items.every((i) => i.y - i.size / 2 >= 71)).toBe(true);
	});

	it("shows nothing but stays usable when no ring fits at all", () => {
		const noRoom: DialGeometry = { corner: "bottom-left", anchor: { x: 40, y: 60 }, bounds: { left: 4, top: 50, right: 386, bottom: 88 } };
		const { controller, root } = setup(noRoom);
		controller.open(root);
		expect(controller.view().items).toEqual([]);
		expect(controller.view().pages).toBe(0);
		controller.pressAt({ x: 200, y: 20 });
		controller.release();
		expect(controller.isOpen).toBe(false);
	});
});

describe("DialController relayout", () => {
	it("re-measures and re-places the current level on relayout", () => {
		let geometry = PHONE;
		const root = parseKeymapSource(SOURCE);
		const { host } = makeHost();
		const controller = new DialController(host, () => geometry);
		controller.open(root);
		const before = controller.view().items[0];
		geometry = { ...PHONE, anchor: { x: 350, y: 500 }, bounds: { ...PHONE.bounds, bottom: 528 } };
		controller.relayout();
		const after = controller.view().items[0];
		expect(after.y).toBeCloseTo(before.y - 304, 6);
		expect(after.x).toBeCloseTo(before.x, 6);
	});

	it("notifies listeners of structure changes on open, descend and page turn, and of armed changes on moves", () => {
		const { controller, root, changes } = setup();
		controller.pressAnchor(root);
		expect(changes).toEqual(["structure"]);
		controller.moveTo(itemAt(controller, "File"));
		expect(changes.at(-1)).toBe("armed");
		controller.release();
		expect(changes.at(-1)).toBe("structure");
		controller.close();
		expect(changes.at(-1)).toBe("structure");
	});
});
