import { parse as parseYamlOrJson, YAMLParseError } from "yaml";
import { KeyParseError, parseKeyString } from "./keys";
import type { CommandNode, FileNode, GroupNode, KeymapNode } from "./types";

export class KeymapParseError extends Error {
	constructor(
		public readonly path: string[],
		message: string,
	) {
		super(KeymapParseError.formatMessage(path, message));
		this.name = "KeymapParseError";
	}

	private static formatMessage(path: string[], message: string): string {
		const where = path.length > 0 ? path.join(".") : "root";
		return `${message} (at ${where})`;
	}
}

/**
 * Documents are parsed with `mapAsMap: true` so mapping key order (including keys that look like
 * numbers, which a plain JS object would otherwise reorder ahead of letter keys) round-trips
 * exactly through the tree editor's add/reorder/serialize cycle.
 */
function isYamlMap(value: unknown): value is Map<unknown, unknown> {
	return value instanceof Map;
}

function requireString(value: unknown, path: string[], field: string): string {
	if (typeof value !== "string") {
		throw new KeymapParseError(path, `"${field}" must be a string`);
	}
	return value;
}

function optionalString(value: unknown, path: string[], field: string): string | undefined {
	if (value === undefined) return undefined;
	return requireString(value, path, field);
}

const GROUP_KEYS = new Set(["title", "description", "items"]);
const COMMAND_KEYS = new Set(["command", "description"]);
const FILE_KEYS = new Set(["file", "description"]);

function checkUnknownKeys(obj: Map<unknown, unknown>, allowed: Set<string>, path: string[]): void {
	for (const key of obj.keys()) {
		if (typeof key !== "string" || !allowed.has(key)) {
			throw new KeymapParseError(path, `Unknown field "${String(key)}"`);
		}
	}
}

function parseCommandShorthand(value: string, path: string[]): CommandNode {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		throw new KeymapParseError(path, "Command shorthand must not be empty");
	}
	const spaceIndex = trimmed.indexOf(" ");
	if (spaceIndex === -1) {
		return { kind: "command", command: trimmed };
	}
	const command = trimmed.slice(0, spaceIndex);
	const description = trimmed.slice(spaceIndex + 1).trim();
	return { kind: "command", command, description: description.length > 0 ? description : undefined };
}

function parseNode(value: unknown, path: string[]): KeymapNode {
	if (typeof value === "string") {
		return parseCommandShorthand(value, path);
	}

	if (!isYamlMap(value)) {
		throw new KeymapParseError(
			path,
			"Entry must be a string (command shorthand) or a mapping with items/command/file",
		);
	}

	const presentKinds = ["items", "command", "file"].filter((k) => value.get(k) !== undefined);
	if (presentKinds.length === 0) {
		throw new KeymapParseError(path, "Entry must have one of: items, command, file");
	}
	if (presentKinds.length > 1) {
		throw new KeymapParseError(
			path,
			`Entry cannot combine ${presentKinds.map((k) => `"${k}"`).join(" and ")}; choose exactly one`,
		);
	}

	if (presentKinds[0] === "items") {
		return parseGroup(value, path);
	}

	if (presentKinds[0] === "command") {
		checkUnknownKeys(value, COMMAND_KEYS, path);
		const command = requireString(value.get("command"), path, "command");
		const description = optionalString(value.get("description"), path, "description");
		const node: CommandNode = { kind: "command", command };
		if (description !== undefined) node.description = description;
		return node;
	}

	checkUnknownKeys(value, FILE_KEYS, path);
	const file = requireString(value.get("file"), path, "file");
	const description = optionalString(value.get("description"), path, "description");
	const node: FileNode = { kind: "file", file };
	if (description !== undefined) node.description = description;
	return node;
}

export function parseGroup(value: unknown, path: string[] = []): GroupNode {
	if (!isYamlMap(value)) {
		throw new KeymapParseError(path, "A group must be a mapping");
	}

	checkUnknownKeys(value, GROUP_KEYS, path);

	const title = optionalString(value.get("title"), path, "title");
	const description = optionalString(value.get("description"), path, "description");
	const items = value.get("items");

	if (!isYamlMap(items)) {
		throw new KeymapParseError([...path, "items"], '"items" must be a mapping of key strings to entries');
	}

	const seen = new Map<string, string>();
	const entries: GroupNode["entries"] = [];

	for (const [rawKeyUnknown, childValue] of items.entries()) {
		if (typeof rawKeyUnknown !== "string") {
			throw new KeymapParseError(
				[...path, "items"],
				`Key "${String(rawKeyUnknown)}" must be written as a quoted string (e.g. "1")`,
			);
		}
		const rawKey = rawKeyUnknown;
		const childPath = [...path, "items", rawKey];
		let key;
		try {
			key = parseKeyString(rawKey);
		} catch (err) {
			if (err instanceof KeyParseError) {
				throw new KeymapParseError(childPath, err.message);
			}
			throw err;
		}

		const dedupeKey = JSON.stringify(key);
		const existing = seen.get(dedupeKey);
		if (existing !== undefined) {
			throw new KeymapParseError(
				childPath,
				`Key "${rawKey}" collides with sibling key "${existing}" (same key combination)`,
			);
		}
		seen.set(dedupeKey, rawKey);

		const node = parseNode(childValue, childPath);
		entries.push({ rawKey, key, node });
	}

	const group: GroupNode = { kind: "group", entries };
	if (title !== undefined) group.title = title;
	if (description !== undefined) group.description = description;
	return group;
}

/** Parse a Neokeys keymap from YAML (or JSON, a YAML subset) source text. */
export function parseKeymapSource(source: string): GroupNode {
	let doc: unknown;
	try {
		doc = parseYamlOrJson(source, { mapAsMap: true });
	} catch (err) {
		if (err instanceof YAMLParseError) {
			throw new KeymapParseError([], `Could not parse keymap: ${err.message}`);
		}
		throw err;
	}

	if (doc === null || doc === undefined) {
		throw new KeymapParseError([], "Keymap is empty");
	}

	return parseGroup(doc, []);
}
