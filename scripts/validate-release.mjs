#!/usr/bin/env node
// Mirrors the parts of Obsidian's obsidian-releases submission checks that
// don't require a live GitHub release: manifest/versions shape, id and
// version format. With --tag <tag> it also verifies the release tag equals
// manifest.json's version exactly, and with --check-release-assets <tag> it
// verifies a tagged GitHub release has main.js and manifest.json attached.
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

/** Compares dotted version strings numerically ("1.10.0" is newer than "1.9.3"). */
function compareVersions(a, b) {
	const pa = String(a).split(".").map(Number);
	const pb = String(b).split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

// Cutting a release passes --tag; CI on a branch between releases does not.
const releasing = process.argv.includes("--tag");

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
		const recorded = versions[manifest.version];
		if (!Object.prototype.hasOwnProperty.call(versions, manifest.version)) {
			errors.push(`versions.json has no entry for manifest.json's version "${manifest.version}"`);
		} else if (recorded !== manifest.minAppVersion) {
			// Between releases manifest.json still names the last release while minAppVersion may
			// already be raised for the next one: versions.json keeps what each released version
			// truly needs, and `npm version` records the new minimum when the next release is cut.
			// A release itself (--tag) must match exactly.
			const raisedAhead = !releasing && compareVersions(manifest.minAppVersion, recorded) > 0;
			if (!raisedAhead) {
				errors.push(
					`versions.json["${manifest.version}"] (${recorded}) does not match manifest.json's minAppVersion (${manifest.minAppVersion})`,
				);
			}
		}
	}
}

function optionValue(flag) {
	const index = process.argv.indexOf(flag);
	if (index === -1) return undefined;
	const value = process.argv[index + 1];
	if (!value) {
		errors.push(`${flag} requires a tag argument`);
		return undefined;
	}
	return value;
}

const tag = optionValue("--tag");
if (tag !== undefined && manifest && tag !== manifest.version) {
	errors.push(`Release tag "${tag}" does not match manifest.json's version "${manifest.version}"`);
}

const assetsTag = optionValue("--check-release-assets");
if (assetsTag !== undefined) {
	let assetNames = [];
	try {
		const output = execFileSync("gh", ["release", "view", assetsTag, "--json", "assets"], {
			encoding: "utf8",
		});
		const parsed = JSON.parse(output);
		assetNames = (parsed.assets ?? []).map((a) => a.name);
	} catch (err) {
		errors.push(`Could not fetch release "${assetsTag}" via gh: ${err.message}`);
	}

	for (const required of ["main.js", "manifest.json"]) {
		if (!assetNames.includes(required)) {
			errors.push(`Release "${assetsTag}" is missing required asset "${required}"`);
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
