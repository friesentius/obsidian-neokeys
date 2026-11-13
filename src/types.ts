export interface ParsedKey {
	key: string;
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	meta: boolean;
}

export interface CommandNode {
	kind: "command";
	command: string;
	description?: string;
}

export interface FileNode {
	kind: "file";
	file: string;
	description?: string;
}

export interface GroupEntry {
	rawKey: string;
	key: ParsedKey;
	node: KeymapNode;
}

export interface GroupNode {
	kind: "group";
	title?: string;
	description?: string;
	entries: GroupEntry[];
}

export type KeymapNode = GroupNode | CommandNode | FileNode;

/** Which bottom corner of the screen the mobile dial's anchor button is pinned to. */
export type DialCorner = "bottom-right" | "bottom-left";

export const DIAL_CORNERS: readonly DialCorner[] = ["bottom-right", "bottom-left"];

export interface NeokeysSettings {
	keymapSource: string;
	showDelayMs: number;
	/** Key-string form (see keys.ts), e.g. "c-b"; empty means no combo leader is set. */
	comboLeader: string;
	animationsEnabled: boolean;
	/** Milliseconds for the slide-in and crossfade animations; see parseAnimationDurationInput. */
	animationDurationMs: number;
	/** Mobile only: show the pinned dial (anchor button plus fan of items) instead of relying on a keyboard. */
	mobileDialEnabled: boolean;
	mobileDialCorner: DialCorner;
	/** Diameter of the dial's items in px, MIN_DIAL_ITEM_SIZE to MAX_DIAL_ITEM_SIZE (see dial/layout.ts). */
	mobileDialItemSize: number;
}
