#!/usr/bin/env node
// Decides whether a push to main should cut a release: it should exactly
// when manifest.json's version has no GitHub release yet. This never
// re-tags or re-publishes a version that was already released, which is
// what makes merging a release PR for an already-released version (the
// state right after this workflow lands, since 0.1.1 is already out) a
// clean no-op.
import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function decideRelease(version, existingReleaseTags) {
	if (typeof version !== "string" || version.length === 0) {
		throw new Error("version is required");
	}
	return { version, shouldRelease: !existingReleaseTags.includes(version) };
}

function readManifestVersion(path = "manifest.json") {
	const manifest = JSON.parse(readFileSync(path, "utf8"));
	return manifest.version;
}

function existingReleaseTags() {
	const output = execFileSync("gh", ["release", "list", "--limit", "1000", "--json", "tagName"], {
		encoding: "utf8",
	});
	return JSON.parse(output).map((release) => release.tagName);
}

function main() {
	const version = readManifestVersion();
	const { shouldRelease } = decideRelease(version, existingReleaseTags());

	const lines = [`version=${version}`, `should_release=${shouldRelease}`];
	const outputPath = process.env.GITHUB_OUTPUT;
	if (outputPath) {
		appendFileSync(outputPath, lines.join("\n") + "\n");
	}
	console.log(lines.join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
