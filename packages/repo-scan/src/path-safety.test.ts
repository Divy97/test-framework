import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RepoScanError } from "./errors.js";
import {
	isPathInsideRoot,
	resolveRelevantFileHints,
	resolveScanRoot,
	toRepoRelativePath,
} from "./path-safety.js";

async function tempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), "repo-scan-path-"));
}

test("resolveScanRoot accepts a directory and returns its canonical root", async () => {
	const dir = await tempDir();
	const { requestedRoot, canonicalRoot } = await resolveScanRoot(dir);
	assert.equal(canonicalRoot, await realpath(dir));
	assert.ok(requestedRoot.length > 0);
});

test("resolveScanRoot resolves a symlinked root to its canonical target", async () => {
	const base = await tempDir();
	const target = join(base, "target");
	const link = join(base, "link");
	await mkdir(target);
	await symlink(target, link, "dir");
	const { canonicalRoot } = await resolveScanRoot(link);
	assert.equal(canonicalRoot, await realpath(target));
});

test("resolveScanRoot throws ROOT_NOT_FOUND for a missing path", async () => {
	const base = await tempDir();
	await assert.rejects(resolveScanRoot(join(base, "missing")), (error) => {
		assert.ok(error instanceof RepoScanError);
		assert.equal(error.code, "ROOT_NOT_FOUND");
		return true;
	});
});

test("resolveScanRoot throws ROOT_NOT_DIRECTORY for a file root", async () => {
	const base = await tempDir();
	const file = join(base, "file.txt");
	await writeFile(file, "x");
	await assert.rejects(resolveScanRoot(file), (error) => {
		assert.ok(error instanceof RepoScanError);
		assert.equal(error.code, "ROOT_NOT_DIRECTORY");
		return true;
	});
});

test("isPathInsideRoot accepts the root itself and descendants", () => {
	assert.equal(isPathInsideRoot("/repo", "/repo"), true);
	assert.equal(isPathInsideRoot("/repo", "/repo/src/a.ts"), true);
});

test("isPathInsideRoot rejects sibling-prefix escapes", () => {
	assert.equal(isPathInsideRoot("/repo", "/repo-other/a.ts"), false);
});

test("isPathInsideRoot rejects unrelated and parent paths", () => {
	assert.equal(isPathInsideRoot("/repo", "/etc/passwd"), false);
	assert.equal(isPathInsideRoot("/repo", "/repo/../etc"), false);
});

test("toRepoRelativePath returns a posix repo-relative path", () => {
	assert.equal(toRepoRelativePath("/repo", "/repo/src/app/page.tsx"), "src/app/page.tsx");
});

test("resolveRelevantFileHints normalizes relative and inside-absolute hints", () => {
	const root = "/repo";
	const result = resolveRelevantFileHints(root, [
		"src/a.ts",
		join(root, "src/b.ts"),
	]);
	assert.deepEqual(result.hints, ["src/a.ts", "src/b.ts"]);
	assert.deepEqual(result.warnings, []);
});

test("resolveRelevantFileHints dedupes while preserving first-seen order", () => {
	const result = resolveRelevantFileHints("/repo", [
		"src/a.ts",
		"./src/a.ts",
		"src/b.ts",
	]);
	assert.deepEqual(result.hints, ["src/a.ts", "src/b.ts"]);
});

test("resolveRelevantFileHints drops outside-root hints as warnings, never fatal", () => {
	const result = resolveRelevantFileHints("/repo", [
		"../escape.ts",
		"/etc/passwd",
		"src/keep.ts",
	]);
	assert.deepEqual(result.hints, ["src/keep.ts"]);
	assert.ok(result.warnings.length >= 1);
});

test("resolveRelevantFileHints drops Windows-shaped absolute hints", () => {
	const result = resolveRelevantFileHints("/repo", [
		"C:\\Windows\\System32\\x.ts",
		"\\\\server\\share\\y.ts",
		"src/keep.ts",
	]);
	assert.deepEqual(result.hints, ["src/keep.ts"]);
	assert.ok(result.warnings.length >= 1);
});

test("resolveRelevantFileHints warnings never leak an absolute path", () => {
	const result = resolveRelevantFileHints("/repo", ["/etc/secret-thing"]);
	assert.equal(result.hints.length, 0);
	for (const warning of result.warnings) {
		assert.equal(warning.includes("/etc/secret-thing"), false);
	}
});
