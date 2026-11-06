#!/usr/bin/env node
// Mirrors the parts of Obsidian's obsidian-releases submission checks that
// don't require a live GitHub release: manifest/versions shape, id and
// version format. With --check-release-assets <tag> it also verifies a
// tagged GitHub release has main.js and manifest.json attached.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const errors = [];
const warnings = [];

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		errors.push(`Could not read/parse ${path}: ${err.message}`);
		return null;
	}
}

const manifest = readJson("manifest.json");
const versions = readJson("versions.json");

if (manifest) {
	for (const field of ["id", "name", "description", "author", "version", "minAppVersion", "isDesktopOnly"]) {
		if (manifest[field] === undefined) {
			errors.push(`manifest.json is missing required field "${field}"`);
		}
	}

	if (typeof manifest.id === "string") {
		if (manifest.id.includes("obsidian")) {
			errors.push(`manifest.json "id" must not contain "obsidian" (got "${manifest.id}")`);
		}
		if (manifest.id.endsWith("plugin")) {
			errors.push(`manifest.json "id" must not end in "plugin" (got "${manifest.id}")`);
		}
		if (!/^[a-z0-9-_]+$/.test(manifest.id)) {
			errors.push(`manifest.json "id" must match ^[a-z0-9-_]+$ (got "${manifest.id}")`);
		}
	}

	if (typeof manifest.name === "string") {
		if (manifest.name.includes("Obsidian")) {
			errors.push(`manifest.json "name" must not contain "Obsidian" (got "${manifest.name}")`);
		}
		if (manifest.name.endsWith("Plugin")) {
			errors.push(`manifest.json "name" must not end in "Plugin" (got "${manifest.name}")`);
		}
	}

	if (typeof manifest.description === "string") {
		if (manifest.description.includes("Obsidian")) {
			errors.push(`manifest.json "description" must not include the word "Obsidian"`);
		}
		if (manifest.description.length > 300) {
			warnings.push(`manifest.json "description" is longer than 300 characters`);
		}
	}

	if (typeof manifest.author === "string" && /\S+@\S+\.\S+/.test(manifest.author)) {
		warnings.push(`manifest.json "author" looks like an email address`);
	}

	if (typeof manifest.version === "string" && !/^[0-9.]+$/.test(manifest.version)) {
		errors.push(`manifest.json "version" must match ^[0-9.]+$ (got "${manifest.version}")`);
	}

	if (manifest.fundingUrl === "https://obsidian.md/pricing") {
		errors.push(`manifest.json "fundingUrl" must not point at https://obsidian.md/pricing`);
	}

	if (typeof manifest.authorUrl === "string") {
		if (/obsidian\.md/.test(manifest.authorUrl)) {
			errors.push(`manifest.json "authorUrl" must not point at obsidian.md`);
		}
	}

	if (versions && typeof manifest.version === "string") {
		if (!Object.prototype.hasOwnProperty.call(versions, manifest.version)) {
			errors.push(`versions.json has no entry for manifest.json's version "${manifest.version}"`);
		} else if (versions[manifest.version] !== manifest.minAppVersion) {
			errors.push(
				`versions.json["${manifest.version}"] (${versions[manifest.version]}) does not match manifest.json's minAppVersion (${manifest.minAppVersion})`,
			);
		}
	}
}

const checkReleaseAssetsIndex = process.argv.indexOf("--check-release-assets");
if (checkReleaseAssetsIndex !== -1) {
	const tag = process.argv[checkReleaseAssetsIndex + 1];
	if (!tag) {
		errors.push("--check-release-assets requires a tag argument");
	} else if (manifest) {
		if (tag.replace(/^v/, "") !== manifest.version) {
			errors.push(`Release tag "${tag}" does not match manifest.json's version "${manifest.version}"`);
		}

		let assetNames = [];
		try {
			const output = execFileSync("gh", ["release", "view", tag, "--json", "assets"], {
				encoding: "utf8",
			});
			const parsed = JSON.parse(output);
			assetNames = (parsed.assets ?? []).map((a) => a.name);
		} catch (err) {
			errors.push(`Could not fetch release "${tag}" via gh: ${err.message}`);
		}

		for (const required of ["main.js", "manifest.json"]) {
			if (!assetNames.includes(required)) {
				errors.push(`Release "${tag}" is missing required asset "${required}"`);
			}
		}
	}
}

for (const warning of warnings) {
	console.warn(`warning: ${warning}`);
}

if (errors.length > 0) {
	for (const error of errors) {
		console.error(`error: ${error}`);
	}
	process.exit(1);
}

console.log("validate-release: ok");
