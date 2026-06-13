import assert from "node:assert/strict";
import test from "node:test";
import {
	detectFrameworks,
	detectPackageManagers,
	parseManifest,
	primaryFramework,
} from "./technology.js";

test("parseManifest merges all dependency groups and ignores non-string values", () => {
	const parsed = parseManifest(
		JSON.stringify({
			packageManager: "pnpm@10.24.0",
			dependencies: { next: "15.0.0", react: "19.0.0" },
			devDependencies: { vite: "^5" },
			peerDependencies: { react: "*" },
			optionalDependencies: { fsevents: "*" },
			scripts: { build: "next build" },
		}),
	);
	assert.ok(parsed);
	assert.equal(parsed.packageManager, "pnpm");
	assert.deepEqual([...parsed.dependencyNames].sort(), [
		"fsevents",
		"next",
		"react",
		"vite",
	]);
});

test("parseManifest returns null for malformed or non-object JSON", () => {
	assert.equal(parseManifest("not json"), null);
	assert.equal(parseManifest("[1,2,3]"), null);
	assert.equal(parseManifest("42"), null);
});

test("parseManifest tolerates a non-object dependencies field", () => {
	const parsed = parseManifest(
		JSON.stringify({ dependencies: "oops", name: "x" }),
	);
	assert.ok(parsed);
	assert.deepEqual([...parsed.dependencyNames], []);
});

test("detectFrameworks finds frameworks from dependencies of each manifest", () => {
	const detections = detectFrameworks(
		[
			{
				path: "apps/web/package.json",
				dependencyNames: new Set(["next", "react"]),
			},
			{ path: "apps/api/package.json", dependencyNames: new Set(["hono"]) },
		],
		[],
	);
	const names = detections.map((d) => d.name).sort();
	assert.deepEqual(names, ["hono", "next", "react"]);
	const next = detections.find((d) => d.name === "next");
	assert.equal(next?.path, "apps/web/package.json");
	assert.match(next?.reason ?? "", /dependency/i);
});

test("detectFrameworks finds frameworks from distinctive config files", () => {
	const detections = detectFrameworks(
		[],
		["next.config.mjs", "vite.config.ts"],
	);
	assert.deepEqual(detections.map((d) => d.name).sort(), ["next", "vite"]);
});

test("detectFrameworks dedupes a framework detected by both dep and config", () => {
	const detections = detectFrameworks(
		[{ path: "package.json", dependencyNames: new Set(["next"]) }],
		["next.config.js"],
	);
	assert.equal(detections.filter((d) => d.name === "next").length, 1);
});

test("primaryFramework prefers full-stack over backend over UI over build tool", () => {
	assert.equal(
		primaryFramework([
			{ path: "p", reason: "r", name: "react" },
			{ path: "p", reason: "r", name: "hono" },
			{ path: "p", reason: "r", name: "next" },
			{ path: "p", reason: "r", name: "vite" },
		]),
		"next",
	);
	assert.equal(
		primaryFramework([
			{ path: "p", reason: "r", name: "react" },
			{ path: "p", reason: "r", name: "vite" },
		]),
		"react",
	);
	assert.equal(primaryFramework([]), null);
});

test("detectPackageManagers lets an explicit packageManager field win", () => {
	const result = detectPackageManagers("pnpm", ["yarn.lock"]);
	assert.equal(result.primary, "pnpm");
	assert.equal(result.warning, undefined);
	assert.ok(result.detections.some((d) => d.name === "pnpm"));
});

test("detectPackageManagers detects a single lockfile", () => {
	const result = detectPackageManagers(null, ["pnpm-lock.yaml"]);
	assert.equal(result.primary, "pnpm");
	assert.equal(result.warning, undefined);
});

test("detectPackageManagers reports a conflict for multiple lockfiles", () => {
	const result = detectPackageManagers(null, ["pnpm-lock.yaml", "yarn.lock"]);
	assert.equal(result.primary, null);
	assert.ok(result.warning);
	assert.deepEqual(result.detections.map((d) => d.name).sort(), [
		"pnpm",
		"yarn",
	]);
});
