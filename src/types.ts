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

export interface NeokeysSettings {
	keymapSource: string;
	showDelayMs: number;
	/** Key-string form (see keys.ts), e.g. "c-b"; empty means no combo leader is set. */
	comboLeader: string;
}
