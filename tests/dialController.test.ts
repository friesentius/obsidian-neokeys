import { DialController, type DialHost } from "../src/dial/controller";
import { BEAD_FLOOR, DEFAULT_RING_PARAMS, edgeRoom, peakSize, planRings, ringParamsFor, ringSlots, slotPosition, TAP_FOCUS_BELOW, type DialGeometry } from "../src/dial/layout";
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
	bounds: { left: 4, top: 40, right: 386, bottom: 216 },
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

/** The item currently labelled `label`. */
function item(controller: DialController, label: string) {
	const found = items(controller).find((i) => i.label === label);
	if (!found) throw new Error(`no item labelled ${label}: ${labels(controller).join(", ")}`);
	return found;
}

/** Screen position of the item currently labelled `label`. */
function itemAt(controller: DialController, label: string) {
	const { x, y } = item(controller, label);
	return { x, y };
}

/** The point at `distance` from the anchor, `angleDeg` into the sweep. */
function polar(geometry: DialGeometry, distance: number, angleDeg: number) {
	const angle = (angleDeg * Math.PI) / 180;
	return { x: geometry.anchor.x - distance * Math.cos(angle), y: geometry.anchor.y - distance * Math.sin(angle) };
}

/**
 * Drags `finger` (moved in place) toward the circle labelled `label` the way a thumb does: a
 * little at a time along the ring and across it, toward wherever the circle is drawn now, since
 * the lens moves the circles as the finger comes, until the circle is armed. Returns how many
 * moves it took.
 */
function dragTo(controller: DialController, finger: { x: number; y: number }, label: string): number {
	const toPolar = (point: { x: number; y: number }) => ({
		distance: Math.hypot(point.x - PHONE.anchor.x, point.y - PHONE.anchor.y),
		angle: Math.atan2(PHONE.anchor.y - point.y, PHONE.anchor.x - point.x),
	});
	for (let move = 1; move <= 80; move++) {
		const target = toPolar(itemAt(controller, label));
		const here = toPolar(finger);
		const distance = here.distance + Math.max(-6, Math.min(6, target.distance - here.distance));
		const angle = here.angle + Math.max(-0.05, Math.min(0.05, target.angle - here.angle));
		finger.x = PHONE.anchor.x - distance * Math.cos(angle);
		finger.y = PHONE.anchor.y - distance * Math.sin(angle);
		controller.moveTo({ x: finger.x, y: finger.y });
		if (controller.view().armed?.label === label) return move;
	}
	throw new Error(`never reached ${label}; armed ${controller.view().armed?.label ?? "nothing"}`);
}

/** A point just outside the circles of the ring at `radius`, in its own band before the next ring's begins, at `angleDeg` of the sweep. */
function inGap(geometry: DialGeometry, radius: number, angleDeg: number) {
	return polar(geometry, radius + DEFAULT_RING_PARAMS.itemSize / 2 + 3, angleDeg);
}

describe("DialController opening and closing", () => {
	it("starts closed with an empty view", () => {
		const { controller } = setup();
		const view = controller.view();
		expect(view).toMatchObject({ open: false, pressing: false, rings: [], crumbs: [], armed: null, arcs: [] });
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
		expect(view.rings[0]).toMatchObject({ level: 0, group: root, radius: 97, parent: null });
		expect(labels(controller)).toEqual(["File", "Window", "Zoom", "Help"]);
		expect(items(controller).map((item) => item.key)).toEqual(["f", "w", "z", "b"]);
		expect(items(controller).map((item) => item.kind)).toEqual(["group", "group", "command", "command"]);
		expect(changes).toEqual(["structure"]);
	});

	it("places items where the layout module says, so hit tests and rendering agree", () => {
		const { root, controller } = setup();
		controller.open(root);
		const rings = planRings(PHONE, DEFAULT_RING_PARAMS, [4]);
		const expected = ringSlots(0, rings[0], 4, DEFAULT_RING_PARAMS, peakSize(PHONE, DEFAULT_RING_PARAMS), null, edgeRoom(PHONE)).map((slot) => slotPosition(slot, PHONE, rings));
		items(controller).forEach((shown, i) => {
			expect(shown.x).toBeCloseTo(expected[i].x, 6);
			expect(shown.y).toBeCloseTo(expected[i].y, 6);
			expect(shown.size).toBe(DEFAULT_RING_PARAMS.itemSize);
			expect(shown.weight).toBe(0);
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
		expect(view.rings[1]).toMatchObject({ level: 1, radius: 151, parent: itemAt(controller, "File") });
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
		expect(controller.view().rings[1].radius).toBe(radius + 54);
		// Between File (at 0 degrees) and Window on the root ring, outside both circles even grown by the lens, nothing is armed and Window's ring stays.
		controller.moveTo(inGap(PHONE, radius, 12));
		expect(controller.view().armed).toBeNull();
		expect(controller.view().rings[1].group.title).toBe("Window");
		expect(changes[changes.length - 1]).toBe("armed");
		dragTo(controller, inGap(PHONE, radius, 12), "New tab");
		expect(controller.view().armed?.label).toBe("New tab");
		expect(controller.view().rings).toHaveLength(2);
	});

	it("a tap a little past a group's circle keeps the group armed through the jitter and the ring it opens", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		const file = itemAt(controller, "File");
		// 30px beyond File's centre along its ray: in the root ring's outer band while the root ring is the outermost one.
		const point = { x: file.x - 30, y: file.y };
		controller.pressAt(point);
		expect(controller.view().armed?.label).toBe("File");
		expect(controller.view().rings).toHaveLength(2);
		controller.moveTo({ x: point.x + 3, y: point.y - 4 });
		controller.moveTo(point);
		expect(controller.view().armed?.label).toBe("File");
		controller.release();
		expect(calls.executed).toEqual([]);
		expect(calls.opened).toEqual([]);
		expect(controller.view().open).toBe(true);
		expect(controller.view().crumbs).toEqual(["File"]);
	});

	it("a group armed through its band keeps its arm while the thumb stays in that share, even after its ring opened outside", () => {
		const { root, controller } = setup();
		controller.open(root);
		const window_ = itemAt(controller, "Window");
		// Press on Window's circle, then drift 24px outward from its centre: well past the jitter and the circle's edge, still Window's share of the root band.
		controller.pressAt(window_);
		controller.moveTo({ x: window_.x + (window_.x - PHONE.anchor.x) * 0.25, y: window_.y + (window_.y - PHONE.anchor.y) * 0.25 });
		expect(controller.view().armed?.label).toBe("Window");
		// Past the midpoint to the Window ring it is that ring's band, and its items arm by angle as ever.
		controller.moveTo(polar(PHONE, 140, 40));
		expect(controller.view().armed?.kind).toBe("command");
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
		const shown = controller.view().rings[1].items.map((shownItem) => shownItem.label);
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

	it("holds the 12-item Window group whole on its fixed ring, shrunk to beads spread evenly over the sweep", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		const ring = controller.view().rings[1];
		expect(ring.radius).toBe(151);
		expect(ring.items).toHaveLength(12);
		const sizes = ring.items.map((bead) => bead.size);
		expect(Math.max(...sizes)).toBeLessThan(TAP_FOCUS_BELOW);
		expect(Math.min(...sizes)).toBeGreaterThanOrEqual(BEAD_FLOOR);
		expect(new Set(sizes).size).toBe(1);
		const angles = ring.items.map((bead) => Math.atan2(PHONE.anchor.y - bead.y, PHONE.anchor.x - bead.x));
		expect(angles[0]).toBeCloseTo(0, 6);
		expect(angles[11]).toBeCloseTo(Math.PI / 2, 6);
		for (let i = 1; i < 12; i++) expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 2 / 11, 6);
	});

	it("under the fit rule each level gets the ring that holds it, as far as the screen reaches: a small root sits closer in, the Window group's ring is wider", () => {
		const params = ringParamsFor(DEFAULT_RING_PARAMS.itemSize, { rule: "fit" });
		const two = parseKeymapSource("title: Two\nitems:\n  z: app:zoom Zoom\n  b: app:open-help Help\n");
		const small = new DialController(makeHost().host, () => PHONE, params);
		small.open(two);
		expect(small.view().rings[0].radius).toBe(60);
		expect(small.view().rings[0].items.map((shown) => shown.size)).toEqual([44, 44]);
		const fit = new DialController(makeHost().host, () => PHONE, params);
		fit.open(parseKeymapSource(SOURCE));
		expect(fit.view().rings[0].radius).toBe(97);
		fit.pressAt(itemAt(fit, "Window"));
		fit.release();
		expect(fit.view().rings[1].radius).toBeGreaterThan(300);
		expect(fit.view().rings[1].items).toHaveLength(12);
		expect(fit.view().rings[1].items[0].size).toBeGreaterThan(40);
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
		expect(view.rings[0].items).toHaveLength(12);
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

describe("DialController on a screen with no room", () => {
	it("shows nothing but stays usable when no ring fits at all", () => {
		const nothing: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 100 }, bounds: { left: 4, top: 60, right: 386, bottom: 136 } };
		const { root, controller } = setup(nothing);
		controller.open(root);
		expect(controller.view().open).toBe(true);
		expect(controller.view().rings).toEqual([]);
		expect(controller.view().arcs).toEqual([]);
		controller.pressAt({ x: 200, y: 80 });
		controller.release();
		expect(controller.view().open).toBe(false);
	});

	it("keeps the root when a press opens it on such a screen, so a relayout and a key afterwards still work", () => {
		const nothing: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 100 }, bounds: { left: 4, top: 60, right: 386, bottom: 136 } };
		const { root, controller, calls } = setup(nothing);
		controller.pressAnchor(root);
		controller.release();
		expect(controller.view().open).toBe(true);
		expect(controller.view().title).toBe("Neokeys");
		controller.relayout();
		expect(controller.view().rings).toEqual([]);
		controller.typeKey(key("z"));
		expect(calls.executed).toEqual(["app:zoom"]);
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

	it("keeps the pill in place, measuring nothing else, when the keymap's deepest path fits under it", () => {
		const { root, controller, measured } = setup();
		controller.open(root);
		expect(controller.view().mode).toBe("normal");
		expect(measured).toEqual(["normal"]);
	});

	it("keeps the pill in place when raising it would not reach farther (under the fit rule the 12-item Window is wider than the phone either way)", () => {
		const measured: string[] = [];
		const controller = new DialController(
			makeHost().host,
			(mode) => {
				measured.push(mode);
				return PHONE;
			},
			ringParamsFor(DEFAULT_RING_PARAMS.itemSize, { rule: "fit" }),
		);
		controller.open(parseKeymapSource(SOURCE));
		expect(controller.view().mode).toBe("normal");
		expect(measured).toEqual(["normal", "raised", "normal"]);
	});

	it("lets the rings reach up behind the pill when not even the root ring fits under it raised", () => {
		const short: DialGeometry = { corner: "bottom-right", anchor: { x: 350, y: 160 }, bounds: { left: 4, top: 130, right: 386, bottom: 196 } };
		const shortRaised: DialGeometry = { ...short, bounds: { ...short.bounds, top: 100 } };
		const shortOverlap: DialGeometry = { ...short, bounds: { ...short.bounds, top: 20 } };
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

	it("notifies listeners of structure changes on open and on a ring taking the screen, and of armed changes on moves", () => {
		const { root, controller, changes } = setup(TINY);
		controller.open(root);
		expect(changes).toEqual(["structure"]);
		controller.pressAt(itemAt(controller, "Zoom"));
		expect(changes).toEqual(["structure", "armed"]);
		controller.moveTo(itemAt(controller, "Window"));
		expect(changes).toEqual(["structure", "armed", "armed"]);
		controller.release();
		expect(changes).toEqual(["structure", "armed", "armed", "structure"]);
	});
});

describe("DialController lens", () => {
	/** The angle of `point` into the sweep, in degrees. */
	const angleOf = (point: { x: number; y: number }) => (Math.atan2(PHONE.anchor.y - point.y, PHONE.anchor.x - point.x) * 180) / Math.PI;

	it("the lens on the ring in play follows the finger: the circle under it grows to the peak, its neighbours by less, and a move that arms nothing new reports only the lens", () => {
		const { root, controller, changes } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Zoom"));
		expect(item(controller, "Zoom").size).toBe(66);
		expect(item(controller, "Zoom").weight).toBeCloseTo(1);
		expect(item(controller, "Window").size).toBeCloseTo(44 + 22 / 3);
		expect(item(controller, "Help").size).toBeCloseTo(44 + 22 / 3);
		expect(item(controller, "File").size).toBe(44);
		expect(changes[changes.length - 1]).toBe("armed");
		changes.length = 0;
		const zoom = itemAt(controller, "Zoom");
		controller.moveTo(polar(PHONE, 97, angleOf(zoom) + 4));
		expect(changes).toEqual(["lens"]);
		expect(controller.view().armed?.label).toBe("Zoom");
		expect(item(controller, "Help").size).toBeGreaterThan(44 + 22 / 3);
		expect(item(controller, "Window").size).toBeLessThan(44 + 22 / 3);
	});

	it("a ring a drag opens starts with its lens where the finger is, and a ring the finger has left keeps its lens", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		controller.moveTo(itemAt(controller, "Window"));
		const ring = controller.view().rings[1];
		const sizes = ring.items.map((bead) => bead.size);
		const grown = sizes.indexOf(Math.max(...sizes));
		expect(Math.max(...sizes)).toBeGreaterThan(44);
		expect(Math.abs(angleOf(ring.items[grown]) - angleOf(itemAt(controller, "Window")))).toBeLessThan(90 / 11);
		expect(sizes[11]).toBeLessThan(TAP_FOCUS_BELOW);
		expect(sizes[11]).toBe(sizes[10]);
		// Straight out from the finger, at its angle, is the grown bead.
		controller.moveTo(polar(PHONE, 151, 30));
		expect(controller.view().armed?.label).toBe(ring.items[grown].label);
		expect(item(controller, "Window").size).toBe(66);
		expect(item(controller, "Window").armed).toBe(false);
	});

	it("a thumb that heads for a bead reaches it in a few moves, though the lens moves the beads as it comes", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		const finger = itemAt(controller, "Window");
		controller.moveTo(finger);
		for (const label of ["Close tab", "Split down", "Go to tab", "Close window", "Next tab"]) {
			expect(dragTo(controller, finger, label)).toBeLessThan(40);
			expect(item(controller, label).size).toBeGreaterThanOrEqual(TAP_FOCUS_BELOW);
		}
	});

	it("an inner ring's lens follows the finger only while it is on one of that ring's circles", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		const finger = itemAt(controller, "Window");
		controller.moveTo(finger);
		dragTo(controller, finger, "New tab");
		const left = item(controller, "Window").size;
		expect(left).toBeGreaterThan(44 + 22 / 3);
		controller.moveTo(inGap(PHONE, 97, 12));
		expect(controller.view().armed).toBeNull();
		expect(item(controller, "Window").size).toBe(left);
		expect(controller.view().rings[1].group.title).toBe("Window");
		controller.moveTo(itemAt(controller, "File"));
		expect(item(controller, "File").size).toBe(66);
		expect(item(controller, "Window").size).toBeLessThan(66);
		expect(controller.view().rings[1].group.title).toBe("File");
	});

	it("a level whose group changes forgets its lens: the ring opens again with the lens under the finger", () => {
		const { root, controller } = setup();
		controller.pressAnchor(root);
		const finger = itemAt(controller, "Window");
		controller.moveTo(finger);
		dragTo(controller, finger, "Split down");
		expect(item(controller, "Split down").size).toBeGreaterThan(44);
		controller.moveTo(itemAt(controller, "File"));
		expect(controller.view().rings[1].group.title).toBe("File");
		controller.moveTo(itemAt(controller, "Window"));
		expect(controller.view().rings[1].group.title).toBe("Window");
		expect(item(controller, "Split down").size).toBeLessThan(TAP_FOCUS_BELOW);
		const ring = controller.view().rings[1];
		const sizes = ring.items.map((bead) => bead.size);
		const grown = sizes.indexOf(Math.max(...sizes));
		expect(Math.abs(angleOf(ring.items[grown]) - angleOf(itemAt(controller, "Window")))).toBeLessThan(90 / 11);
	});

	it("a relayout keeps each ring's lens where it was", () => {
		const root = parseKeymapSource(SOURCE);
		const { host } = makeHost();
		let geometry = PHONE;
		const controller = new DialController(host, () => geometry);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		controller.pressAt(itemAt(controller, "Close tab"));
		controller.release();
		expect(item(controller, "Close tab").size).toBe(66);
		const before = itemAt(controller, "Close tab");
		geometry = { ...PHONE, anchor: { x: 350, y: 704 } };
		controller.relayout();
		expect(item(controller, "Close tab").size).toBe(66);
		expect(itemAt(controller, "Close tab").y).toBeCloseTo(before.y - 100, 6);
	});
});

describe("DialController tap rule", () => {
	it("a tap on a bead brings it into the lens instead of running it, and a second tap runs it", () => {
		const { root, controller, calls, changes } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(item(controller, "Close tab").size).toBeLessThan(TAP_FOCUS_BELOW);
		controller.pressAt(itemAt(controller, "Close tab"));
		expect(controller.view().armed?.label).toBe("Close tab");
		changes.length = 0;
		controller.release();
		expect(calls.executed).toEqual([]);
		expect(controller.view().open).toBe(true);
		expect(controller.view().armed).toBeNull();
		expect(changes).toEqual(["armed"]);
		expect(item(controller, "Close tab").size).toBe(66);
		controller.pressAt(itemAt(controller, "Close tab"));
		controller.release();
		expect(calls.executed).toEqual(["workspace:close"]);
		expect(controller.view().open).toBe(false);
	});

	it("a tap on a bead that is a group opens its ring, as arming it does, and brings the bead into the lens", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		controller.pressAt(itemAt(controller, "Go to tab"));
		expect(controller.view().crumbs).toEqual(["Window", "Go to tab"]);
		controller.release();
		expect(controller.view().crumbs).toEqual(["Window", "Go to tab"]);
		expect(controller.view().rings).toHaveLength(3);
		expect(controller.view().armed).toBeNull();
		expect(item(controller, "Go to tab").size).toBe(66);
		expect(item(controller, "Go to tab").open).toBe(true);
		controller.pressAt(itemAt(controller, "Go to tab"));
		controller.release();
		expect(controller.view().crumbs).toEqual(["Window", "Go to tab"]);
		expect(controller.view().open).toBe(true);
	});

	it("a tap on a group bead whose ring has no room redraws from the levels that fit, as a release on the group would", () => {
		const { root, controller, changes } = setup(TINY);
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		expect(controller.view().rings[0].level).toBe(1);
		expect(item(controller, "Go to tab").size).toBeLessThan(TAP_FOCUS_BELOW);
		controller.pressAt(itemAt(controller, "Go to tab"));
		expect(controller.view().armed).toMatchObject({ label: "Go to tab", waiting: true });
		changes.length = 0;
		controller.release();
		expect(changes).toEqual(["structure"]);
		expect(controller.view().armed).toBeNull();
		expect(controller.view().crumbs).toEqual(["Window", "Go to tab"]);
		expect(controller.view().rings).toHaveLength(1);
		expect(controller.view().rings[0].level).toBe(2);
		expect(labels(controller)).toEqual(["Tab 1"]);
	});

	it("a drag that ends on a bead runs it: the lens has grown it under the finger", () => {
		const { root, controller, calls } = setup();
		controller.pressAnchor(root);
		const finger = itemAt(controller, "Window");
		controller.moveTo(finger);
		dragTo(controller, finger, "Close tab");
		expect(controller.view().armed?.label).toBe("Close tab");
		expect(item(controller, "Close tab").size).toBeGreaterThanOrEqual(TAP_FOCUS_BELOW);
		controller.release();
		expect(calls.executed).toEqual(["workspace:close"]);
	});

	it("an activation that is not a touch runs a bead at once", () => {
		const { root, controller, calls } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "Window"));
		controller.release();
		controller.pressAt(itemAt(controller, "Close tab"));
		controller.release(true);
		expect(calls.executed).toEqual(["workspace:close"]);
	});

	it("a circle at the tap size or more runs on one tap even on a crowded ring", () => {
		const six = parseKeymapSource("title: Six\nitems:\n  s:\n    title: Six\n    items:\n" + [..."abcdef"].map((k) => `      ${k}: app:${k} ${k.toUpperCase()}\n`).join(""));
		const { host, calls } = makeHost();
		host.isCommandKnown = () => true;
		const controller = new DialController(host, () => PHONE);
		controller.open(six);
		controller.pressAt(itemAt(controller, "Six"));
		controller.release();
		const ring = controller.view().rings[1];
		expect(ring.items).toHaveLength(6);
		expect(ring.items.map((shown) => shown.size)).toEqual([44, 44, 44, 44, 44, 44]);
		expect(ring.items[0].y).toBeCloseTo(PHONE.anchor.y, 6);
		expect(ring.items[5].x).toBeCloseTo(PHONE.anchor.x, 6);
		controller.pressAt(itemAt(controller, "C"));
		controller.release();
		expect(calls.executed).toEqual(["app:c"]);
	});
});

describe("DialController descriptions", () => {
	it("describes an armed command by its name in Obsidian only when the keymap labels it something else, never by its group's description", () => {
		const { root, host, controller } = setup();
		host.resolveCommandName = (id) => (id === "file-explorer:new-file" ? "Create new note" : id === "app:zoom" ? "Zoom" : undefined);
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.release();
		expect(controller.view().description).toBe("Create and open files");
		controller.pressAt(itemAt(controller, "New file"));
		expect(controller.view().armed).toMatchObject({ label: "New file", description: "Create new note" });
		controller.cancelPress();
		controller.pressAt(itemAt(controller, "Zoom"));
		expect(controller.view().armed).toMatchObject({ label: "Zoom", description: "" });
		controller.cancelPress();
		controller.pressAt(itemAt(controller, "Help"));
		expect(controller.view().armed).toMatchObject({ label: "Help", description: "" });
	});

	it("describes a file without a description of its own by nothing, and one with by its path", () => {
		const { root, controller } = setup();
		controller.open(root);
		controller.pressAt(itemAt(controller, "File"));
		controller.release();
		controller.pressAt(itemAt(controller, "Templates"));
		controller.release();
		controller.pressAt(itemAt(controller, "Daily template"));
		expect(controller.view().armed).toMatchObject({ kind: "file", label: "Daily template", description: "Templates/Daily" });
	});
});
