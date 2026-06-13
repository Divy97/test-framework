import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ScanFileSystem } from "./filesystem.js";
import { nodeFileSystem } from "./filesystem.js";
import type { TraverseOptions } from "./traverse.js";
import { traverseRepository } from "./traverse.js";

async function tempRoot(): Promise<string> {
	return realpath(await mkdtemp(join(tmpdir(), "repo-scan-walk-")));
}

function defaults(canonicalRoot: string): TraverseOptions {
	return {
		canonicalRoot,
		maxDepth: 20,
		maxEntries: 50_000,
		maxFiles: 10_000,
		maxFileBytes: 262_144,
		maxTotalReadBytes: 8_388_608,
		honorGitignore: true,
		additionalIgnorePatterns: [],
	};
}

function spyOpen(): { fs: ScanFileSystem; opened: string[] } {
	const opened: string[] = [];
	return {
		opened,
		fs: {
			realpath: (p) => nodeFileSystem.realpath(p),
			lstat: (p) => nodeFileSystem.lstat(p),
			readdir: (p) => nodeFileSystem.readdir(p),
			open: (p, flags) => {
				opened.push(p);
				return nodeFileSystem.open(p, flags);
			},
		},
	};
}

test("returns considered files in stable lexicographic order", async () => {
	const root = await tempRoot();
	await mkdir(join(root, "src"));
	await writeFile(join(root, "src", "b.ts"), "b");
	await writeFile(join(root, "src", "a.ts"), "a");
	await writeFile(join(root, "z.ts"), "z");
	const result = await traverseRepository(defaults(root));
	assert.deepEqual(
		result.files.map((file) => file.path),
		["src/a.ts", "src/b.ts", "z.ts"],
	);
	assert.equal(result.truncated, false);
	assert.equal(result.stopReason, null);
});

test("skips symlinked files and directories without following them", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "real.ts"), "x");
	await symlink(join(root, "real.ts"), join(root, "link.ts"));
	await mkdir(join(root, "dir"));
	await writeFile(join(root, "dir", "inside.ts"), "y");
	await symlink(join(root, "dir"), join(root, "dirlink"), "dir");
	const result = await traverseRepository(defaults(root));
	const paths = result.files.map((file) => file.path).sort();
	assert.deepEqual(paths, ["dir/inside.ts", "real.ts"]);
	assert.ok(result.stats.skippedSymlinks >= 2);
});

test("excludes hard-policy directories and never opens their files", async () => {
	const root = await tempRoot();
	await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
	await writeFile(join(root, "node_modules", "pkg", "index.js"), "secret");
	await writeFile(join(root, "keep.ts"), "ok");
	const spy = spyOpen();
	const result = await traverseRepository({ ...defaults(root), fs: spy.fs });
	assert.deepEqual(
		result.files.map((file) => file.path),
		["keep.ts"],
	);
	for (const opened of spy.opened) {
		assert.equal(opened.includes("node_modules"), false);
	}
});

test("records lockfiles by path while excluding their contents", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "pnpm-lock.yaml"), "lockfile contents");
	await writeFile(join(root, "package.json"), "{}");
	const spy = spyOpen();
	const result = await traverseRepository({ ...defaults(root), fs: spy.fs });
	assert.deepEqual(result.lockfiles, ["pnpm-lock.yaml"]);
	assert.equal(
		result.files.some((file) => file.path === "pnpm-lock.yaml"),
		false,
	);
	for (const opened of spy.opened) {
		assert.equal(opened.endsWith("pnpm-lock.yaml"), false);
	}
});

test("honors nested gitignore but a hard exclusion still wins after negation", async () => {
	const root = await tempRoot();
	await writeFile(join(root, ".gitignore"), "*.log\n!node_modules\n");
	await writeFile(join(root, "app.log"), "log");
	await writeFile(join(root, "keep.ts"), "x");
	await mkdir(join(root, "node_modules"));
	await writeFile(join(root, "node_modules", "dep.js"), "dep");
	const result = await traverseRepository(defaults(root));
	const paths = result.files.map((file) => file.path).sort();
	assert.deepEqual(paths, ["keep.ts"]);
	assert.ok(result.stats.skippedByGitignore >= 1);
});

test("does not read .env or other secret files", async () => {
	const root = await tempRoot();
	await writeFile(join(root, ".env"), "SECRET=value");
	await writeFile(join(root, ".env.example"), "SECRET=example");
	await writeFile(join(root, "id_rsa"), "PRIVATE KEY");
	await writeFile(join(root, "app.ts"), "x");
	const spy = spyOpen();
	const result = await traverseRepository({ ...defaults(root), fs: spy.fs });
	assert.deepEqual(
		result.files.map((file) => file.path),
		["app.ts"],
	);
	for (const opened of spy.opened) {
		assert.equal(opened.endsWith(".env"), false);
		assert.equal(opened.endsWith(".env.example"), false);
		assert.equal(opened.endsWith("id_rsa"), false);
	}
});

test("stops at exactly maxFiles and reports max-files truncation when over", async () => {
	const root = await tempRoot();
	for (const name of ["a.ts", "b.ts", "c.ts"]) {
		await writeFile(join(root, name), "x");
	}
	const exact = await traverseRepository({ ...defaults(root), maxFiles: 3 });
	assert.equal(exact.stats.filesConsidered, 3);
	assert.equal(exact.truncated, false);
	assert.equal(exact.stopReason, null);

	const over = await traverseRepository({ ...defaults(root), maxFiles: 2 });
	assert.equal(over.stats.filesConsidered, 2);
	assert.equal(over.truncated, true);
	assert.equal(over.stopReason, "max-files");
});

test("prunes directories beyond maxDepth and reports max-depth", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "f0.ts"), "0");
	await mkdir(join(root, "a"));
	await writeFile(join(root, "a", "f1.ts"), "1");
	await mkdir(join(root, "a", "b"));
	await writeFile(join(root, "a", "b", "f2.ts"), "2");

	const shallow = await traverseRepository({ ...defaults(root), maxDepth: 1 });
	assert.deepEqual(shallow.files.map((file) => file.path).sort(), [
		"a/f1.ts",
		"f0.ts",
	]);
	assert.equal(shallow.truncated, true);
	assert.equal(shallow.stopReason, "max-depth");

	const deep = await traverseRepository({ ...defaults(root), maxDepth: 2 });
	assert.equal(deep.files.length, 3);
	assert.equal(deep.stopReason, null);
});

test("does not read files larger than maxFileBytes but still considers them", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "big.ts"), "x".repeat(100));
	const result = await traverseRepository({
		...defaults(root),
		maxFileBytes: 10,
	});
	assert.equal(result.stats.filesConsidered, 1);
	assert.equal(result.stats.skippedLargeFiles, 1);
	assert.equal(result.stats.bytesRead, 0);
	assert.equal(result.files[0]?.text, null);
});

test("stops reading at the total byte budget and reports truncation", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "a.ts"), "0123456789");
	await writeFile(join(root, "b.ts"), "0123456789");
	const result = await traverseRepository({
		...defaults(root),
		maxTotalReadBytes: 10,
	});
	assert.equal(result.stats.bytesRead, 10);
	assert.equal(result.stats.filesRead, 1);
	assert.equal(result.truncated, true);
	assert.equal(result.stopReason, "max-total-read-bytes");
	// both files are still listed for path-only classification
	assert.equal(result.files.length, 2);
});

test("stops early on a large tree and never opens files past the limit", async () => {
	const root = await tempRoot();
	const fileCount = 5_000;
	await Promise.all(
		Array.from({ length: fileCount }, (_unused, index) =>
			writeFile(join(root, `f${String(index).padStart(5, "0")}.ts`), "x"),
		),
	);
	const spy = spyOpen();
	const result = await traverseRepository({
		...defaults(root),
		maxEntries: 100,
		maxFiles: 50,
		fs: spy.fs,
	});
	assert.ok(result.stats.entriesVisited <= 100);
	assert.ok(result.stats.filesConsidered <= 50);
	assert.equal(result.truncated, true);
	assert.ok(
		result.stopReason === "max-files" || result.stopReason === "max-entries",
	);
	// reads are bounded by the file cap, far below the 5,000 files on disk
	assert.ok(spy.opened.length <= 50);
});

test("continues past an unreadable directory and records a warning", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "keep.ts"), "x");
	await mkdir(join(root, "locked"));
	const failingReaddir: ScanFileSystem = {
		realpath: (p) => nodeFileSystem.realpath(p),
		lstat: (p) => nodeFileSystem.lstat(p),
		readdir: (p) => {
			if (p.endsWith("locked")) {
				return Promise.reject(
					Object.assign(new Error("denied"), { code: "EACCES" }),
				);
			}
			return nodeFileSystem.readdir(p);
		},
		open: (p, flags) => nodeFileSystem.open(p, flags),
	};
	const result = await traverseRepository({
		...defaults(root),
		fs: failingReaddir,
	});
	assert.deepEqual(
		result.files.map((file) => file.path),
		["keep.ts"],
	);
	assert.equal(result.stats.unreadablePaths >= 1, true);
	assert.equal(result.warnings.length >= 1, true);
});
