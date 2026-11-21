import { defineConfig, globalIgnores } from "eslint/config";
import css from "@eslint/css";
import obsidianmd from "eslint-plugin-obsidianmd";

// eslint-plugin-obsidianmd is pinned to exactly 0.5.0 (not ^0.5.1) in
// package.json: Obsidian's community-directory scanner's no-unsupported-api
// findings match 0.5.0, but 0.5.1's PR obsidianmd/eslint-plugin#243 made the
// rule trust old, pre-1.0 typings' matching call shapes over the current
// @since tag, which hides every finding the scanner reports for this repo.
// Revisit this pin once the scanner (or its documented plugin version) moves
// past that behavior.
//
// typescript is held to ~6.0.3 (typescript-eslint supports <6.1.0): the
// scanner type-checks with TypeScript 6, whose lib.dom types an `input` event
// as InputEvent (5.9 types it as Event). On 5.9, local lint missed the
// scanner's @typescript-eslint/no-unnecessary-type-assertion findings on
// `evt as InputEvent` in entryEditorModal.ts. tsconfig.json therefore also
// names its `types` (TS 6 no longer loads every @types package implicitly) and
// drops the deprecated `baseUrl`.

export default defineConfig([
	// Build output and Node build/tooling scripts are not plugin source.
	globalIgnores(["node_modules", "dist", "coverage", "main.js", "esbuild.config.mjs", "version-bump.mjs"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.*",
						"jest.config.*",
						"version-bump.mjs",
						"tests/*.ts",
						"scripts/*.mjs",
					],
					// Default is 8; the tests/*.ts glob alone now exceeds that as the suite grows.
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 64,
				},
			},
		},
		rules: {},
	},
	{
		// 0.5.0 (see the pin note above) predates the recommended config's
		// scripts/** exemption from the Obsidian-runtime rules, so it still
		// reports a plain console.log() here, and (now that the manifest is no
		// longer desktop-only) Node built-in imports and the `process` global,
		// even though scripts/ only ever runs under Node in CI. Restoring just
		// that exemption locally.
		files: ["scripts/**/*.{js,mjs,cjs,ts}"],
		languageOptions: {
			globals: { process: "readonly" },
		},
		rules: {
			"obsidianmd/rule-custom-message": "off",
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
	{
		// The community directory's CSS LINT check ("Avoid !important") isn't
		// part of eslint-plugin-obsidianmd (it lints JS/TS only); @eslint/css's
		// no-important is the equivalent, actively-maintained rule for it.
		files: ["**/*.css"],
		language: "css/css",
		plugins: { css },
		rules: {
			"css/no-important": "error",
		},
	},
]);
