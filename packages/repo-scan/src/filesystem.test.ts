import assert from "node:assert/strict";
import type { Dirent, Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ScanFileSystem } from "./filesystem.js";
import { nodeFileSystem, readBoundedTextFile } from "./filesystem.js";

async function tempRoot(): Promise<string> {
	return realpath(await mkdtemp(join(tmpdir(), "repo-scan-fs-")));
}

/** Wraps a real filesystem, recording every path passed to open(). */
function spyOpenFileSystem(): { fs: ScanFileSystem; opened: string[] } {
	const opened: string[] = [];
	const fs: ScanFileSystem = {
		realpath: (path) => nodeFileSystem.realpath(path),
		lstat: (path) => nodeFileSystem.lstat(path),
		readdir: (path) => nodeFileSystem.readdir(path),
		open: (path, flags) => {
			opened.push(path);
			return nodeFileSystem.open(path, flags);
		},
	};
	return { fs, opened };
}

test("reads a small UTF-8 text file within budget", async () => {
	const root = await tempRoot();
	const file = join(root, "a.ts");
	await writeFile(file, "export const x = 1;\n");
	const result = await readBoundedTextFile({
		canonicalRoot: root,
		absolutePath: file,
		maxFileBytes: 1024,
		remainingTotalBytes: 1024,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.match(result.text, /export const x/);
		assert.equal(result.bytesRead, 20);
		assert.equal(result.truncatedRead, false);
	}
});

test("refuses to read a path outside the canonical root and never opens it", async () => {
	const root = await tempRoot();
	const outside = await tempRoot();
	const file = join(outside, "secret.ts");
	await writeFile(file, "nope");
	const spy = spyOpenFileSystem();
	const result = await readBoundedTextFile({
		canonicalRoot: root,
		absolutePath: file,
		maxFileBytes: 1024,
		remainingTotalBytes: 1024,
		fs: spy.fs,
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.reason, "confinement");
	}
	assert.deepEqual(spy.opened, []);
});

test("refuses to read a symlink and never opens it", async () => {
	const root = await tempRoot();
	const target = join(root, "target.ts");
	const link = join(root, "link.ts");
	await writeFile(target, "export const y = 2;\n");
	await symlink(target, link);
	const spy = spyOpenFileSystem();
	const result = await readBoundedTextFile({
		canonicalRoot: root,
		absolutePath: link,
		maxFileBytes: 1024,
		remainingTotalBytes: 1024,
		fs: spy.fs,
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.reason, "not-regular");
	}
	assert.deepEqual(spy.opened, []);
});

test("refuses to read a file larger than maxFileBytes without opening it", async () => {
	const root = await tempRoot();
	const file = join(root, "big.ts");
	await writeFile(file, "x".repeat(2048));
	const spy = spyOpenFileSystem();
	const result = await readBoundedTextFile({
		canonicalRoot: root,
		absolutePath: file,
		maxFileBytes: 1024,
		remainingTotalBytes: 8192,
		fs: spy.fs,
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.reason, "too-large");
	}
	assert.deepEqual(spy.opened, []);
});

test("refuses to read when the remaining total budget is exhausted", async () => {
	const root = await tempRoot();
	const file = join(root, "a.ts");
	await writeFile(file, "export const x = 1;\n");
	const spy = spyOpenFileSystem();
	const result = await readBoundedTextFile({
		canonicalRoot: root,
		absolutePath: file,
		maxFileBytes: 1024,
		remainingTotalBytes: 0,
		fs: spy.fs,
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.reason, "budget");
	}
	assert.deepEqual(spy.opened, []);
});

test("rejects NUL-containing content as binary", async () => {
	const root = await tempRoot();
	const file = join(root, "data.txt");
	await writeFile(file, Buffer.from([0x68, 0x69, 0x00, 0x21]));
	const result = await readBoundedTextFile({
		canonicalRoot: root,
		absolutePath: file,
		maxFileBytes: 1024,
		remainingTotalBytes: 1024,
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.equal(result.reason, "binary");
	}
});

test("reads at most the remaining total budget for a permitted file", async () => {
	const root = await tempRoot();
	const file = join(root, "a.ts");
	await writeFile(file, "abcdefghij");
	const result = await readBoundedTextFile({
		canonicalRoot: root,
		absolutePath: file,
		maxFileBytes: 1024,
		remainingTotalBytes: 4,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.bytesRead, 4);
		assert.equal(result.text, "abcd");
		assert.equal(result.truncatedRead, true);
	}
});

test("the node filesystem adapter exposes Dirent-based readdir", async () => {
	const root = await tempRoot();
	await mkdir(join(root, "sub"));
	await writeFile(join(root, "a.ts"), "x");
	const entries = await nodeFileSystem.readdir(root);
	const names = entries.map((entry: Dirent) => entry.name).sort();
	assert.deepEqual(names, ["a.ts", "sub"]);
});

test("readdir, lstat, and open type-check against the ScanFileSystem contract", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "a.ts"), "x");
	const fs: ScanFileSystem = nodeFileSystem;
	const stats: Stats = await fs.lstat(join(root, "a.ts"));
	assert.equal(stats.isFile(), true);
	const handle: FileHandle = await fs.open(join(root, "a.ts"), 0);
	await handle.close();
});
