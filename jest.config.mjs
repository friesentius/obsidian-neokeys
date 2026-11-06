export default {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/tests"],
	testMatch: ["**/*.test.ts"],
	transform: {
		"^.+\\.ts$": [
			"ts-jest",
			{
				tsconfig: "tsconfig.jest.json",
			},
		],
	},
};
