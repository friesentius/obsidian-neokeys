import { stringify } from "yaml";
import type { GroupNode, KeymapNode } from "./types";

function nodeToYamlValue(node: KeymapNode): unknown {
	if (node.kind === "group") {
		return groupToYamlValue(node);
	}
	const map = new Map<string, unknown>();
	if (node.kind === "command") {
		map.set("command", node.command);
	} else {
		map.set("file", node.file);
	}
	if (node.description !== undefined) map.set("description", node.description);
	return map;
}

function groupToYamlValue(group: GroupNode): Map<string, unknown> {
	const map = new Map<string, unknown>();
	if (group.title !== undefined) map.set("title", group.title);
	if (group.description !== undefined) map.set("description", group.description);

	const items = new Map<string, unknown>();
	for (const entry of group.entries) {
		items.set(entry.rawKey, nodeToYamlValue(entry.node));
	}
	map.set("items", items);
	return map;
}

/**
 * Serialize a GroupNode tree back to YAML source, the inverse of parseKeymapSource. Always
 * writes the explicit mapping form (never the "<id> <description>" command shorthand) and always
 * writes "items" even when empty, so output is uniform regardless of how the source was written.
 * Item keys use a Map (not a plain object) to preserve insertion order for every key, including
 * ones that look like numbers, which a plain JS object would otherwise reorder.
 */
export function serializeKeymap(root: GroupNode): string {
	return stringify(groupToYamlValue(root));
}
