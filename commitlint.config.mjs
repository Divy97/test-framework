import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readDirNames(dir) {
	if (!existsSync(dir)) return [];

	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

const scopes = [
	"repo",
	"docs",
	"infra",
	"mcp",
	"stack",
	...readDirNames(join(process.cwd(), "apps")),
	...readDirNames(join(process.cwd(), "packages")),
];

export default {
	parserPreset: {
		parserOpts: {
			headerPattern: /^(:(?:[\w+-]+):) (\w+)\(([\w.-]+)\): (.+)$/,
			headerCorrespondence: ["emoji", "type", "scope", "subject"],
		},
	},
	rules: {
		"header-max-length": [2, "always", 100],
		"scope-empty": [2, "never"],
		"scope-enum": [2, "always", scopes],
		"subject-case": [2, "always", ["lower-case"]],
		"subject-empty": [2, "never"],
		"subject-full-stop": [2, "never", "."],
		"type-empty": [2, "never"],
		"type-enum": [
			2,
			"always",
			[
				"feat",
				"fix",
				"docs",
				"style",
				"refactor",
				"perf",
				"test",
				"build",
				"ci",
				"chore",
				"revert",
				"wip",
			],
		],
	},
};
