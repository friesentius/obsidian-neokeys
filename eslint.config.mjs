import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

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
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
				},
			},
		},
		rules: {},
	},
]);
