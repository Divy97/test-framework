const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

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
	...readDirNames(join(__dirname, "apps")),
	...readDirNames(join(__dirname, "packages")),
];

module.exports = { scopes };
