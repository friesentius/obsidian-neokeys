import { execFileSync } from "node:child_process";
import * as path from "node:path";

// release-decision.mjs is ESM; ts-jest's CommonJS transform can't `import`
// it directly (Jest would need Node 24.9+ for require(esm)), so each case
// spawns node to import decideRelease and report its result as JSON.
const scriptPath = path.join(__dirname, "..", "scripts", "release-decision.mjs");

type DecisionResult = { version: string; shouldRelease: boolean } | { error: string };

function callDecideRelease(version: string, existingReleaseTags: string[]): DecisionResult {
	const code = `
		import { decideRelease } from ${JSON.stringify(scriptPath)};
		try {
			console.log(JSON.stringify(decideRelease(${JSON.stringify(version)}, ${JSON.stringify(existingReleaseTags)})));
		} catch (err) {
			console.log(JSON.stringify({ error: err.message }));
		}
	`;
	const output = execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
	return JSON.parse(output) as DecisionResult;
}

describe("decideRelease", () => {
	it("skips a version that already has a release", () => {
		expect(callDecideRelease("0.1.1", ["0.1.0", "0.1.1"])).toEqual({
			version: "0.1.1",
			shouldRelease: false,
		});
	});

	it("releases a version with no existing release", () => {
		expect(callDecideRelease("0.2.0", ["0.1.0", "0.1.1"])).toEqual({
			version: "0.2.0",
			shouldRelease: true,
		});
	});

	it("releases when nothing has ever been released", () => {
		expect(callDecideRelease("0.1.0", [])).toEqual({
			version: "0.1.0",
			shouldRelease: true,
		});
	});

	it("rejects a missing version", () => {
		expect(callDecideRelease("", ["0.1.0"])).toEqual({
			error: "version is required",
		});
	});
});
