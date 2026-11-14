import { DialController, type DialHost } from "../src/dial/controller";
import { DEFAULT_RING_PARAMS, MIN_DIAL_ITEM_SIZE, planRings, ringParamsFor, ringSlots, slotPosition, type DialGeometry } from "../src/dial/layout";
import { parseKeymapSource } from "../src/keymap";

const SOURCE = `
title: Neokeys
description: Everything
items:
  f:
    title: File
    description: Create and open files
    items:
      n: file-explorer:new-file New file
      o:
        file: Inbox/Today
        description: Today's inbox
      t:
        title: Templates
        description: Start from a template
        items:
          d:
            file: Templates/Daily
            description: Daily template
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
        description: Jump to a tab
        items:
          '1': workspace:goto-tab-1 Tab 1
      e:
        title: Focus pane
        items:
          h: editor:focus-left Focus left
      w: workspace:new-window New window
      W: workspace:close-window Close window
      o: workspace:open-in-new-window Open in new window
  z: app:zoom Zoom
  b: app:open-help Help
  q: plugin:bogus Bogus
  d:
    title: Desktop only
    items:
      s: workspace:toggle-stacked-tabs Stack tabs
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
	"app:open-help",
]);

/** A 390x844 phone, anchor bottom-right, nothing under it, the pill taking the top 56px. */
const PHONE: DialGeometry = {
	corner: "bottom-right",
	anchor: { x: 350, y: 804 },
	bounds: { left: 4, top: 60, right: 386, bottom: 840 },
};

/** A box so short that only the root ring fits: a group's ring must wait for the release and then take the root's place. */
const TINY: DialGeometry = {
	corner: "bottom-right",
	anchor: { x: 350, y: 180 },
	bounds: { left: 4, top: 60, right: 386, bottom: 216 },
};

/** A key event as the DOM would deliver it, for the hardware-keyboard path. */
function key(k: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) {
	return { key: k, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods };
}

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
	const measured: string[] = [];
	const controller = new DialController(host, (mode) => {
		measured.push(mode);
		return mode === "normal" ? geometry : mode === "raised" ? raisedGeometry : overlapGeometry;
	});
	controller.onChange((change) => changes.push(change));
	return { root, host, calls, changes, measured, controller };
}

/** The items on screen, flat, innermost ring first. */
function items(controller: DialController) {
	return controller.view().rings.flatMap((ring) => ring.items);
}

function labels(controller: DialController): string[] {
	return items(controller).map((item) => item.label);
}

/** Screen position of the item currently labelled `label`. */
function itemAt(controller: DialController, label: string) {
	const item = items(controller).find((i) => i.label === label);
	if (!item) throw new Error(`no item labelled ${label}: ${labels(controller).join(", ")}`);
	return { x: item.x, y: item.y };
}

/** A point just outside the circles of the ring at `radius`, in the gap toward the next ring, at `angleDeg` of the sweep. */
function inGap(geometry: DialGeometry, radius: number, angleDeg: number) {
	const distance = radius + DEFAULT_RING_PARAMS.itemSize / 2 + 8;
	const angle = (angleDeg * Math.PI) / 180;
	return { x: geometry.anchor.x - distance * Math.cos(angle), y: geometry.anchor.y - distance * Math.sin(angle) };
}

describe("DialController opening and closing", () => {
	it("starts closed with an empty view", () => {
		const { controller } = setup();
		const view = controller.view();
		expect(view).toMatchObject({ open: false, pressing: false, rings: [], crumbs: [], armed: null, pages: 0 });
	});

	it("opens at the root with the level's items on one ring, in the popup's order, with the root's description", () => {
		const { root, controller, changes } = setup();
		controller.open(root);
		const view = controller.view();
		expect(view.open).toBe(true);
		expect(view.title).toBe("Neokeys");
		expect(view.crumbs).toEqual([]);
		expect(view.description).toBe("Everything");
		expect(view.rings).toHaveLength(1);
		expect(view.rings[0]).toMatchObject({ level: 1 - 1, group: root, page: 0, pages: 1 });
		expect(labels(controller)).toEqual(["File", "Window", "Zoom", "Help"]);
		expect(items(controller).map((item) => item.key)).toEqual(["f", "w", "z", "b"]);
		expect(items(controller).map((item) => item.kind)).toEqual(["group", "group", "command", "command"]);
		expect(changes).toEqual(["structure"]);
	});

	it("places items where the layout module says, so hit tests and rendering agree", () => {
		const { root, controller } = setup();
		controller.open(root);
		const rings = planRings(PHONE, DEFAULT_RING_PARAMS, [4]);
		const expected = ringSlots(0, rings[0].capacity, 4).map((slot) => slotPosition(slot, PHONE, rings));
		items(controller).forEach((item, i) => {
			expect(item.x).toBeCloseTo(expected[i].x, 6);
			expect(item.y).toBeCloseTo(expected[i].y, 6);
			expect(item.size).toBe(DEFAULT_RING_PARAMS.itemSize);
		});
		expect(controller.view().rings[0].radius).toBe(rings[0].radius);
	});

	it("pressing the anchor while closed opens it, and releasing without arming leaves it open", () => {
		const { root, controller, changes } = setup();
		controller.pressAnchor(root);
		expect(controller.view().open).toBe(true);
		expect(controller.view().pressing).toBe(true);
		controller.release();
		expect(controller.view().open).toBe(true);
		expect(controller.view().pressing).toBe(false);
		expect(changes).toEqual(["structure", "armed"]);
	});

	it("a tap on the anchor while open closes the deepest open group, and closes the dial at the root", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.release();
		expect(controller.view().crumbs).toEqual(["File"]);
		controller.pressAnchor();
		controller.release();
		expect(controller.view().open).toBe(true);
		expect(controller.view().crumbs).toEqual([]);
		controller.pressAnchor();
		controller.release();
		expect(controller.view().open).toBe(false);
	});

	it("a drag from the open anchor that ends on nothing also acts as back", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.release();
		controller.pressAnchor();
		controller.moveTo({ x: 100, y: 100 });
		controller.release();
		expect(controller.view().open).toBe(true);
		expect(controller.view().crumbs).toEqual([]);
	});

	it("a tap outside every item closes it", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.pressAt({ x: 40, y: 300 });
		controller.release();
		expect(controller.view().open).toBe(false);
		expect(calls.executed).toEqual([]);
	});

	it("a tap on blank space inside the fan closes it without running anything", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().rings).toHaveLength(2);
		// The Window ring holds 12 items at the full ring's pitch; a point between the anchor and that ring, off every slot, arms nothing.
		const radius = controller.view().rings[1].radius;
		const ringTop = { x: PHONE.anchor.x, y: PHONE.anchor.y - radius };
		const blank = { x: ringTop.x + 60, y: ringTop.y };
		controller.pressAt(blank);
		expect(controller.view().armed).toBeNull();
		controller.release();
		expect(controller.view().open).toBe(false);
		expect(calls.executed).toEqual([]);
	});

	it("an anchor press needs a root only to open; an open dial takes one without", () => {
		const { root, controller } = setup();
		controller.pressAnchor();
		expect(controller.view().open).toBe(false);
		controller.pressAnchor(root);
		controller.release();
		controller.pressAnchor();
		expect(controller.view().pressing).toBe(true);
		controller.release();
		expect(controller.view().open).toBe(false);
	});

	it("reports pressing from the very first change of the press that opens the dial", () => {
		const { root, controller } = setup();
		let pressingAtFirstChange: boolean | null = null;
		controller.onChange(() => {
			if (pressingAtFirstChange === null) pressingAtFirstChange = controller.view().pressing;
		});
		controller.pressAnchor(root);
		expect(pressingAtFirstChange).toBe(true);
	});

	it("close() and back() at the root close it; back() deeper closes the deepest group", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().crumbs).toEqual(["Window"]);
		controller.back();
		expect(controller.view().crumbs).toEqual([]);
		expect(controller.view().open).toBe(true);
		controller.back();
		expect(controller.view().open).toBe(false);
		controller.open(root);
		controller.close();
		expect(controller.view().open).toBe(false);
	});

	it("re-opening resets to the root", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		controller.open(root);
		expect(controller.view().crumbs).toEqual([]);
		expect(controller.view().rings).toHaveLength(1);
	});
});

describe("DialController dragging", () => {
	it("arms the item under the pointer while pressing and shows it with its description", () => {
		const { root, controller, changes } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Zoom"));
		expect(controller.view().armed).toMatchObject({ label: "Zoom", key: "z", kind: "command", description: "", count: null, open: false, waiting: false });
		expect(items(controller).map((item) => item.armed)).toEqual([false, false, true, false]);
		expect(changes[changes.length - 1]).toBe("armed");
	});

	it("arming a group opens its items as the next ring out, marked open on its own ring, without acting", () => {
		const { root, controller, calls, changes } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		const view = controller.view();
		expect(view.rings).toHaveLength(2);
		expect(view.rings[1]).toMatchObject({ level: 1, page: 0, pages: 1 });
		expect(view.rings[1].items.map((item) => item.label)).toEqual(["Templates", "Today's inbox", "New file"]);
		expect(view.rings[0].items.map((item) => item.open)).toEqual([true, false, false, false]);
		expect(view.crumbs).toEqual(["File"]);
		expect(view.armed).toMatchObject({ label: "File", description: "Create and open files", count: 3, open: true, waiting: false });
		expect(changes[changes.length - 1]).toBe("structure");
		expect(calls.executed).toEqual([]);
	});

	it("describes a group that has no description by its items, so a ring of keys can be read", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Window"));
		expect(controller.view().armed?.description).toBe(
			"g Go to tab · e Focus pane · c New tab · x Close tab · n Next tab · p Previous tab · m Move tab to new window · u Undo close tab · v Split right · - Split down · w New window · W Close window",
		);
	});

	it("walks the keymap in one drag: a child ring's group opens a third ring, and a file on it acts only on the release", () => {
		const { root, controller, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.moveTo(itemAt(controller, "Templates"));
		expect(controller.view().rings).toHaveLength(3);
		expect(controller.view().rings.map((ring) => ring.radius)).toEqual([97, 151, 205]);
		expect(controller.view().rings[2].items.map((item) => item.label)).toEqual(["Daily template"]);
		expect(controller.view().crumbs).toEqual(["File", "Templates"]);
		controller.moveTo(itemAt(controller, "Daily template"));
		expect(controller.view().armed?.label).toBe("Daily template");
		expect(calls.opened).toEqual([]);
		controller.release();
		expect(calls.opened).toEqual(["Templates/Daily"]);
		expect(controller.view().open).toBe(false);
	});

	it("arming a command on an inner ring closes the rings outside it", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.moveTo(itemAt(controller, "Templates"));
		expect(controller.view().rings).toHaveLength(3);
		controller.moveTo(itemAt(controller, "New file"));
		expect(controller.view().rings).toHaveLength(2);
		expect(controller.view().crumbs).toEqual(["File"]);
	});

	it("swaps a child ring at once when the thumb moves over the circles of the inner ring to a sibling group", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		expect(controller.view().rings[1].group.title).toBe("File");
		controller.moveTo(itemAt(controller, "Window"));
		expect(controller.view().rings[1].group.title).toBe("Window");
		expect(controller.view().crumbs).toEqual(["Window"]);
	});

	it("in the band outside an inner ring's circles nothing arms, so a thumb heading out to the next ring swaps nothing", () => {
		const { root, controller, changes } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Window"));
		const radius = controller.view().rings[0].radius;
		expect(controller.view().rings[1].radius).toBeGreaterThan(radius + 100);
		// File sits at 0 degrees on the root ring; just outside its circle, on the way out, nothing is armed and Window's ring stays.
		controller.moveTo(inGap(PHONE, radius, 0));
		expect(controller.view().armed).toBeNull();
		expect(controller.view().rings[1].group.title).toBe("Window");
		expect(changes[changes.length - 1]).toBe("armed");
		controller.moveTo(itemAt(controller, "Go to tab"));
		expect(controller.view().armed?.label).toBe("Go to tab");
		expect(controller.view().rings).toHaveLength(2);
	});

	it("a sibling on an inner ring takes over as soon as the thumb is inside its circle", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Window"));
		controller.moveTo(itemAt(controller, "New tab"));
		const file = itemAt(controller, "File");
		controller.moveTo({ x: file.x + 18, y: file.y });
		expect(controller.view().armed?.label).toBe("File");
		expect(controller.view().rings[1].group.title).toBe("File");
		expect(controller.view().crumbs).toEqual(["File"]);
	});

	it("moving away from every item disarms without acting and keeps the open rings", () => {
		const { root, controller, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.moveTo({ x: 100, y: 100 });
		expect(controller.view().armed).toBeNull();
		expect(controller.view().rings).toHaveLength(2);
		expect(controller.view().description).toBe("Create and open files");
		controller.release();
		expect(controller.view().open).toBe(true);
		expect(controller.view().rings).toHaveLength(2);
		expect(calls.executed).toEqual([]);
	});

	it("does not react to moves when no pointer is down", () => {
		const { root, controller, changes } = setup();
		controller.open(root);
		const before = changes.length;
		controller.moveTo(itemAt(controller, "Zoom"));
		expect(controller.view().armed).toBeNull();
		expect(changes.length).toBe(before);
	});

	it("ignores a second pointer while one is already down", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		controller.pressAt(itemAt(controller, "Zoom"));
		expect(controller.view().armed).toBeNull();
		controller.release();
		expect(controller.view().open).toBe(true);
	});

	it("a cancelled press never acts and leaves the dial open with what was opened", () => {
		const { root, controller, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.moveTo(itemAt(controller, "New file"));
		controller.cancelPress();
		expect(calls.executed).toEqual([]);
		expect(controller.view().open).toBe(true);
		expect(controller.view().pressing).toBe(false);
		expect(controller.view().armed).toBeNull();
		expect(controller.view().rings).toHaveLength(2);
	});

	it("only vibrates when the armed item changes", () => {
		const { root, controller, calls } = setup();
		controller.pressAnchor(root);
		const zoom = itemAt(controller, "Zoom");
		controller.moveTo(zoom);
		controller.moveTo({ x: zoom.x + 2, y: zoom.y + 2 });
		controller.moveTo(itemAt(controller, "Help"));
		controller.moveTo({ x: 100, y: 100 });
		expect(calls.vibrations).toBe(2);
	});
});

describe("DialController committing", () => {
	it("releasing on a group leaves its ring open with nothing armed, and runs nothing", () => {
		const { root, controller, calls, changes } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "File"));
		controller.release();
		const view = controller.view();
		expect(view.open).toBe(true);
		expect(view.pressing).toBe(false);
		expect(view.armed).toBeNull();
		expect(view.crumbs).toEqual(["File"]);
		expect(view.rings).toHaveLength(2);
		expect(view.rings[0].items[0].open).toBe(true);
		expect(changes[changes.length - 1]).toBe("armed");
		expect(calls.executed).toEqual([]);
	});

	it("a direct tap on an item selects it the same way a drag-and-release does", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Zoom"));
		expect(controller.view().armed?.label).toBe("Zoom");
		controller.release();
		expect(calls.executed).toEqual(["app:zoom"]);
		expect(controller.view().open).toBe(false);
	});

	it("releasing on a file closes the dial and opens the file; the pill described it by its path", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.release();
		controller.pressAt(itemAt(controller, "Today's inbox"));
		expect(controller.view().armed).toMatchObject({ kind: "file", description: "Inbox/Today" });
		controller.release();
		expect(calls.opened).toEqual(["Inbox/Today"]);
		expect(controller.view().open).toBe(false);
	});

	it("hides commands this device does not know, and a group left with nothing, without taking a slot", () => {
		const { root, controller } = setup();
		controller.open(root);
		expect(labels(controller)).toEqual(["File", "Window", "Zoom", "Help"]);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		const shown: string[] = [];
		for (let page = 0; page < controller.view().pages; page++) {
			shown.push(...controller.view().rings[1].items.filter((item) => item.kind !== "more").map((item) => item.label));
			controller.pressAt(itemAt(controller, "More"));
			controller.release();
		}
		expect(shown).toHaveLength(12);
		expect(shown).not.toContain("Open in new window");
	});

	it("refuses to open a keymap with nothing available on this device, with a notice", () => {
		const { calls, host } = makeHost();
		const unknownOnly = parseKeymapSource("title: Nothing\nitems:\n  a: plugin:bogus Bogus\n");
		const controller = new DialController(host, () => PHONE);
		controller.open(unknownOnly);
		expect(controller.view().open).toBe(false);
		expect(calls.notices).toEqual(["Neokeys: nothing in the keymap is available on this device"]);
	});

	it("exposes one guide arc per ring with two or more items, from the first item to the last", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.moveTo(itemAt(controller, "Templates"));
		const view = controller.view();
		expect(view.rings).toHaveLength(3);
		expect(view.rings[2].items).toHaveLength(1);
		expect(view.arcs).toHaveLength(2);
		expect(view.arcs[0].from).toEqual({ x: view.rings[0].items[0].x, y: view.rings[0].items[0].y });
		expect(view.arcs[1].to).toEqual({ x: view.rings[1].items[2].x, y: view.rings[1].items[2].y });
	});

	it("closes before the command runs, so the command sees the dial gone", () => {
		const { root, controller, host } = setup();
		let openWhenRun: boolean | null = null;
		host.executeCommand = () => {
			openWhenRun = controller.view().open;
		};
		controller.open(root);
		controller.pressAt(itemAt(controller, "Zoom"));
		controller.release();
		expect(openWhenRun).toBe(false);
	});

	it("tells the user about a command that went missing between opening and releasing, and stays open", () => {
		const { root, controller, host, calls } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Zoom"));
		host.isCommandKnown = () => false;
		controller.release();
		expect(calls.executed).toEqual([]);
		expect(calls.notices).toEqual(['Neokeys: command "app:zoom" is not available']);
		expect(controller.view().open).toBe(true);
	});

	it("pages the 12-item Window group in two on a phone at the default size, and holds it whole at the smallest", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		const view = controller.view();
		expect(view.rings[1].items).toHaveLength(11);
		expect(view.rings[1].items[10].kind).toBe("more");
		expect(view.pages).toBe(2);

		const small = new DialController(makeHost().host, () => PHONE, ringParamsFor(MIN_DIAL_ITEM_SIZE));
		small.open(root);
		small.pressAt(itemAt(small, "Window"));
		small.release();
		expect(small.view().rings[1].items).toHaveLength(12);
		expect(small.view().pages).toBe(1);
	});
});

describe("DialController when a ring has no room", () => {
	it("keeps the group armed and in the path but opens no ring, then on release redraws from the levels that fit", () => {
		const { root, controller, changes } = setup(TINY);
		controller.pressAnchor(root);
		expect(controller.view().rings).toHaveLength(1);
		controller.moveTo(itemAt(controller, "Window"));
		let view = controller.view();
		expect(view.armed?.label).toBe("Window");
		expect(view.crumbs).toEqual(["Window"]);
		expect(view.rings).toHaveLength(1);
		expect(view.rings[0].level).toBe(0);
		expect(view.rings[0].items[1].open).toBe(true);
		controller.release();
		view = controller.view();
		expect(changes[changes.length - 1]).toBe("structure");
		expect(view.rings).toHaveLength(1);
		expect(view.rings[0].level).toBe(1);
		expect(view.rings[0].group.title).toBe("Window");
		expect(view.crumbs).toEqual(["Window"]);
		expect(view.pages).toBeGreaterThan(1);
	});

	it("lets a group with no room go when the thumb moves off it", () => {
		const { root, controller } = setup(TINY);
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Window"));
		controller.moveTo({ x: 100, y: 10 });
		expect(controller.view().crumbs).toEqual([]);
		controller.release();
		expect(controller.view().rings[0].level).toBe(0);
	});

	it("shows the root ring at once on a press that opens the dial after a deep session", () => {
		const { root, controller } = setup(TINY);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().rings[0].level).toBe(1);
		controller.close();
		controller.pressAnchor(root);
		expect(controller.view().rings).toHaveLength(1);
		expect(controller.view().rings[0].level).toBe(0);
		expect(labels(controller)).toEqual(["File", "Window", "Zoom", "Help"]);
	});

	it("tells the user to let go when the armed group's ring has no room, and marks it as the path's last crumb", () => {
		const { root, controller } = setup(TINY);
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Window"));
		expect(controller.view().armed).toMatchObject({ label: "Window", open: true, waiting: true });
		expect(controller.view().armed?.description).toMatch(/^Let go to open · g Go to tab/);
		controller.moveTo(itemAt(controller, "File"));
		expect(controller.view().armed).toMatchObject({ label: "File", open: true, waiting: true, description: "Let go to open · Create and open files" });
	});

	it("brings the outer levels back on back()", () => {
		const { root, controller } = setup(TINY);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().rings[0].level).toBe(1);
		controller.back();
		expect(controller.view().rings[0].level).toBe(0);
		expect(controller.view().crumbs).toEqual([]);
		expect(labels(controller)).toEqual(["File", "Window", "Zoom", "Help"]);
	});
});

describe("DialController paging", () => {
	it("pages a level the ring cannot hold, with a More item that turns the page and wraps", () => {
		const { root, controller, changes } = setup(TINY);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		const first = controller.view();
		expect(first.page).toBe(0);
		expect(first.pages).toBe(4);
		expect(first.rings[0].items.map((item) => item.kind)).toEqual(["group", "group", "command", "more"]);
		expect(first.rings[0].items[3]).toMatchObject({ key: "…", label: "More" });
		controller.pressAt(itemAt(controller, "More"));
		expect(controller.view().armed?.description).toBe("Next page");
		controller.release();
		expect(controller.view().page).toBe(1);
		expect(labels(controller)).toEqual(["Close tab", "Next tab", "Previous tab", "More"]);
		expect(changes[changes.length - 1]).toBe("structure");
		for (let i = 0; i < 3; i++) {
			controller.pressAt(itemAt(controller, "More"));
			controller.release();
		}
		expect(controller.view().page).toBe(0);
	});

	it("a group opened later starts at page 0, and back returns to page 0 of the parent", () => {
		const { root, controller } = setup(TINY);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		controller.pressAt(itemAt(controller, "More"));
		controller.release();
		expect(controller.view().page).toBe(1);
		controller.back();
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().page).toBe(0);
	});

	it("shows nothing but stays usable when no ring fits at all", () => {
		const nothing: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 100 }, bounds: { left: 4, top: 60, right: 386, bottom: 136 } };
		const { root, controller } = setup(nothing);
		controller.open(root);
		expect(controller.view().open).toBe(true);
		expect(controller.view().rings).toEqual([]);
		expect(controller.view().pages).toBe(0);
		controller.pressAt({ x: 200, y: 80 });
		controller.release();
		expect(controller.view().open).toBe(false);
	});
});

describe("DialController pill mode", () => {
	const normal: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 300 }, bounds: { left: 4, top: 100, right: 386, bottom: 336 } };
	const raised: DialGeometry = { ...normal, bounds: { ...normal.bounds, top: 56 } };
	const overlap: DialGeometry = { ...normal, bounds: { ...normal.bounds, top: 12 } };

	it("raises the pill when the keymap's deepest path would not fit under it, and keeps it there while rings open", () => {
		const { root, controller, measured } = setup(normal, raised, overlap);
		controller.pressAnchor(root);
		expect(controller.view().mode).toBe("raised");
		expect(measured).toEqual(["normal", "raised"]);
		controller.moveTo(itemAt(controller, "Window"));
		controller.moveTo(itemAt(controller, "Go to tab"));
		expect(measured).toEqual(["normal", "raised"]);
		expect(controller.view().mode).toBe("raised");
	});

	it("keeps the pill in place when raising it would not reach farther (the fixture's 12-item Window is wider than the phone either way)", () => {
		const { root, controller, measured } = setup();
		controller.open(root);
		expect(controller.view().mode).toBe("normal");
		expect(measured).toEqual(["normal", "raised", "normal"]);
	});

	it("lets the rings reach up behind the pill when not even the root ring fits under it raised", () => {
		const short: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 160 }, bounds: { left: 4, top: 130, right: 386, bottom: 196 } };
		const shortRaised: DialGeometry = { ...short, bounds: { ...short.bounds, top: 100 } };
		const shortOverlap: DialGeometry = { ...short, bounds: { ...short.bounds, top: 40 } };
		const { root, controller, measured } = setup(short, shortRaised, shortOverlap);
		controller.open(root);
		expect(controller.view().mode).toBe("overlap");
		expect(measured[measured.length - 1]).toBe("overlap");
		expect(controller.view().rings).toHaveLength(1);
	});
});

describe("DialController keyboard", () => {
	it("a bound key picks its entry in the deepest open group exactly as a release on it would", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.typeKey(key("w"));
		expect(controller.view().crumbs).toEqual(["Window"]);
		expect(controller.view().rings).toHaveLength(2);
		controller.typeKey(key("c"));
		expect(calls.executed).toEqual(["workspace:new-tab"]);
		expect(controller.view().open).toBe(false);
	});

	it("shift on a letter selects the uppercase binding", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.typeKey(key("w"));
		controller.typeKey(key("W", { shiftKey: true }));
		expect(calls.executed).toEqual(["workspace:close-window"]);
	});

	it("Backspace closes the deepest group and closes the dial at the root; Escape closes from anywhere", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.typeKey(key("w"));
		controller.typeKey(key("Backspace"));
		expect(controller.view().open).toBe(true);
		expect(controller.view().crumbs).toEqual([]);
		controller.typeKey(key("Backspace"));
		expect(controller.view().open).toBe(false);
		controller.open(root);
		controller.typeKey(key("w"));
		controller.typeKey(key("Escape"));
		expect(controller.view().open).toBe(false);
	});

	it("an unbound key does nothing and leaves the dial where it was", () => {
		const { root, controller, calls, changes } = setup();
		controller.open(root);
		const before = changes.length;
		controller.typeKey(key("y"));
		expect(controller.view().open).toBe(true);
		expect(calls.executed).toEqual([]);
		expect(changes.length).toBe(before);
	});

	it("a key bound to a hidden command or group does nothing and keeps the dial open", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.typeKey(key("q"));
		controller.typeKey(key("d"));
		expect(controller.view().open).toBe(true);
		expect(controller.view().crumbs).toEqual([]);
		expect(calls.executed).toEqual([]);
		expect(calls.notices).toEqual([]);
	});

	it("keys do nothing while the dial is closed", () => {
		const { controller, calls } = setup();
		controller.typeKey(key("z"));
		expect(calls.executed).toEqual([]);
	});

	it("a key during a held press drops the press, so the finger cannot act as well", () => {
		const { root, controller, calls } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Zoom"));
		controller.typeKey(key("b"));
		expect(calls.executed).toEqual(["app:open-help"]);
		controller.release();
		expect(calls.executed).toEqual(["app:open-help"]);
	});
});

describe("DialController relayout during a press", () => {
	const KEYBOARD_UP: DialGeometry = {
		corner: "bottom-right",
		anchor: { x: 350, y: 504 },
		bounds: { left: 4, top: 60, right: 386, bottom: 540 },
	};

	it("re-arms what is under the finger; a release on nothing then leaves the dial open", () => {
		const root = parseKeymapSource(SOURCE);
		const { host } = makeHost();
		let geometry = PHONE;
		const controller = new DialController(host, () => geometry);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Zoom"));
		expect(controller.view().armed?.label).toBe("Zoom");
		geometry = KEYBOARD_UP;
		controller.relayout();
		expect(controller.view().rings[0].items[0].y).toBeLessThan(PHONE.anchor.y - 200);
		expect(controller.view().armed).toBeNull();
		controller.release();
		expect(controller.view().open).toBe(true);
	});

	it("arms the item that moved under the finger, never the stale index", () => {
		const root = parseKeymapSource(SOURCE);
		const { host, calls } = makeHost();
		let geometry = PHONE;
		const controller = new DialController(host, () => geometry);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Zoom"));
		geometry = KEYBOARD_UP;
		controller.relayout();
		controller.moveTo(itemAt(controller, "Help"));
		expect(controller.view().armed?.label).toBe("Help");
		controller.release();
		expect(calls.executed).toEqual(["app:open-help"]);
	});

	it("redraws from the levels that fit the new screen, even mid-press, since the screen itself moved", () => {
		const root = parseKeymapSource(SOURCE);
		const { host } = makeHost();
		let geometry = PHONE;
		const controller = new DialController(host, () => geometry);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		expect(controller.view().rings).toHaveLength(2);
		geometry = TINY;
		controller.relayout();
		expect(controller.view().rings).toHaveLength(1);
		expect(controller.view().rings[0].level).toBe(1);
		expect(controller.view().crumbs).toEqual(["Window"]);
	});

	it("keeps the open rings and re-chooses the pill mode for the new screen", () => {
		const root = parseKeymapSource(SOURCE);
		const { host } = makeHost();
		let geometry = PHONE;
		const measured: string[] = [];
		const controller = new DialController(host, (mode) => {
			measured.push(mode);
			return geometry;
		});
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		expect(controller.view().rings).toHaveLength(2);
		geometry = KEYBOARD_UP;
		measured.length = 0;
		controller.relayout();
		expect(measured[0]).toBe("normal");
		expect(controller.view().rings).toHaveLength(2);
		expect(controller.view().crumbs).toEqual(["Window"]);
	});
});

describe("DialController relayout", () => {
	it("re-measures and re-places the open rings on relayout", () => {
		const root = parseKeymapSource(SOURCE);
		const { host } = makeHost();
		let geometry = PHONE;
		const controller = new DialController(host, () => geometry);
		controller.open(root);
		const before = itemAt(controller, "Zoom");
		geometry = { ...PHONE, anchor: { x: 350, y: 704 } };
		controller.relayout();
		const after = itemAt(controller, "Zoom");
		expect(after.y).toBeCloseTo(before.y - 100, 6);
		expect(after.x).toBeCloseTo(before.x, 6);
	});

	it("reports a relayout of the same items as 'layout' and a different set of items as 'structure'", () => {
		const root = parseKeymapSource(SOURCE);
		const { host } = makeHost();
		let geometry = PHONE;
		const changes: string[] = [];
		const controller = new DialController(host, () => geometry);
		controller.onChange((change) => changes.push(change));
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		changes.length = 0;
		geometry = { ...PHONE, anchor: { x: 350, y: 704 } };
		controller.relayout();
		expect(changes).toEqual(["layout"]);
		geometry = TINY;
		controller.relayout();
		expect(changes).toEqual(["layout", "structure"]);
		expect(controller.view().rings).toHaveLength(1);
		expect(controller.view().rings[0].level).toBe(1);
	});

	it("notifies listeners of structure changes on open, ring opening and page turn, and of armed changes on moves", () => {
		const { root, controller, changes } = setup(TINY);
		controller.open(root);
		expect(changes).toEqual(["structure"]);
		controller.pressAt(itemAt(controller, "Zoom"));
		expect(changes).toEqual(["structure", "armed"]);
		controller.moveTo(itemAt(controller, "Window"));
		expect(changes).toEqual(["structure", "armed", "armed"]);
		controller.release();
		expect(changes).toEqual(["structure", "armed", "armed", "structure"]);
		controller.pressAt(itemAt(controller, "More"));
		controller.release();
		expect(changes[changes.length - 1]).toBe("structure");
	});
});
