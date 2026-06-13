import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { RepoScanSummary } from "./contracts.js";
import { RepoScanError } from "./errors.js";
import { scanRepository } from "./scanner.js";

const fixturesRoot = fileURLToPath(
	new URL("../test/fixtures", import.meta.url),
);

async function tempRoot(): Promise<string> {
	return realpath(await mkdtemp(join(tmpdir(), "repo-scan-scanner-")));
}

const NEXT_HONO_EXPECTED: RepoScanSummary = {
	framework: "next",
	packageManager: "pnpm",
	frameworks: [
		{
			path: "apps/web/package.json",
			reason: "next dependency (next)",
			name: "next",
		},
		{
			path: "apps/api/package.json",
			reason: "hono dependency (hono)",
			name: "hono",
		},
		{
			path: "apps/web/package.json",
			reason: "react dependency (react)",
			name: "react",
		},
	],
	packageManagers: [
		{
			path: "package.json",
			reason: "Explicit packageManager field",
			name: "pnpm",
		},
	],
	routesPages: [
		{
			path: "apps/web/src/app/dashboard/page.tsx",
			reason: "Next.js App Router page convention",
		},
	],
	components: [
		{
			path: "apps/web/src/app/dashboard/page.tsx",
			reason: "JSX component module",
		},
		{
			path: "apps/web/src/components/UserCard.test.tsx",
			reason: "Component directory and module",
		},
		{
			path: "apps/web/src/components/UserCard.tsx",
			reason: "Component directory and module",
		},
	],
	apiHandlers: [
		{ path: "apps/api/src/index.ts", reason: "API directory convention" },
		{
			path: "apps/web/src/app/api/users/route.ts",
			reason: "Next.js route handler convention",
		},
	],
	dbSchemasModels: [
		{ path: "apps/web/src/db/schema.ts", reason: "Drizzle table declaration" },
	],
	existingTests: [
		{
			path: "apps/web/src/components/UserCard.test.tsx",
			reason: "Test filename or directory convention",
		},
	],
	authMiddleware: [
		{
			path: "apps/web/src/middleware.ts",
			reason: "Middleware filename convention",
		},
	],
	validationSchemas: [
		{
			path: "apps/web/src/validation/user.ts",
			reason: "Zod validation schema",
		},
	],
	featureFlags: [
		{
			path: "apps/web/src/flags.ts",
			reason: "Feature flag SDK usage (posthog-node)",
		},
	],
	externalIntegrations: [
		{ path: "apps/web/package.json", reason: "Stripe SDK dependency (stripe)" },
		{
			path: "apps/web/src/flags.ts",
			reason: "PostHog SDK import (posthog-node)",
		},
		{
			path: "apps/web/src/integrations/stripe.ts",
			reason: "Stripe SDK import (stripe)",
		},
	],
	truncated: false,
	stopReason: null,
	warnings: [],
	stats: {
		entriesVisited: 27,
		filesConsidered: 13,
		filesRead: 13,
		bytesRead: 1593,
		skippedByPolicy: 1,
		skippedByGitignore: 0,
		skippedSymlinks: 0,
		skippedLargeFiles: 0,
		skippedBinaryFiles: 0,
		unreadablePaths: 0,
	},
};

const EXPRESS_EXPECTED: RepoScanSummary = {
	framework: "express",
	packageManager: "npm",
	frameworks: [
		{
			path: "package.json",
			reason: "express dependency (express)",
			name: "express",
		},
	],
	packageManagers: [
		{ path: "package-lock.json", reason: "Lockfile present", name: "npm" },
	],
	routesPages: [
		{ path: "src/routes/users.ts", reason: "Routes directory convention" },
	],
	components: [],
	apiHandlers: [
		{
			path: "src/routes/users.ts",
			reason: "Route module with HTTP handler signals",
		},
	],
	dbSchemasModels: [
		{
			path: "src/models/user.model.ts",
			reason: "Model file or directory convention",
		},
	],
	existingTests: [
		{
			path: "test/users.spec.ts",
			reason: "Test filename or directory convention",
		},
	],
	authMiddleware: [
		{
			path: "src/auth/middleware.ts",
			reason: "Middleware filename convention",
		},
	],
	validationSchemas: [],
	featureFlags: [],
	externalIntegrations: [],
	truncated: false,
	stopReason: null,
	warnings: [],
	stats: {
		entriesVisited: 11,
		filesConsidered: 5,
		filesRead: 5,
		bytesRead: 618,
		skippedByPolicy: 1,
		skippedByGitignore: 0,
		skippedSymlinks: 0,
		skippedLargeFiles: 0,
		skippedBinaryFiles: 0,
		unreadablePaths: 0,
	},
};

test("scans the Next.js + Hono monorepo fixture into exact evidence", async () => {
	const summary = await scanRepository({
		rootPath: join(fixturesRoot, "next-hono-monorepo"),
		relevantFiles: [],
		options: {},
	});
	assert.deepEqual(summary, NEXT_HONO_EXPECTED);
});

test("scans the Express single-app fixture into exact evidence", async () => {
	const summary = await scanRepository({
		rootPath: join(fixturesRoot, "express-app"),
		relevantFiles: [],
		options: {},
	});
	assert.deepEqual(summary, EXPRESS_EXPECTED);
});

test("repeated scans of an unchanged fixture are deep-equal", async () => {
	const request = {
		rootPath: join(fixturesRoot, "next-hono-monorepo"),
		relevantFiles: [],
		options: {},
	};
	const first = await scanRepository(request);
	const second = await scanRepository(request);
	assert.deepEqual(first, second);
});

test("all evidence paths are repo-relative and posix-separated", async () => {
	const summary = await scanRepository({
		rootPath: join(fixturesRoot, "next-hono-monorepo"),
		relevantFiles: [],
		options: {},
	});
	const allPaths = [
		...summary.frameworks,
		...summary.packageManagers,
		...summary.routesPages,
		...summary.components,
		...summary.apiHandlers,
		...summary.dbSchemasModels,
		...summary.existingTests,
		...summary.authMiddleware,
		...summary.validationSchemas,
		...summary.featureFlags,
		...summary.externalIntegrations,
	].map((ref) => ref.path);
	for (const path of allPaths) {
		assert.equal(path.startsWith("/"), false, path);
		assert.equal(path.includes("\\"), false, path);
		assert.equal(path.includes(".."), false, path);
	}
});

test("relevant-file hints are ordered before lexicographic evidence", async () => {
	const summary = await scanRepository({
		rootPath: join(fixturesRoot, "next-hono-monorepo"),
		relevantFiles: ["apps/web/src/components/UserCard.tsx"],
		options: {},
	});
	assert.equal(
		summary.components[0]?.path,
		"apps/web/src/components/UserCard.tsx",
	);
});

test("an empty repository yields null technologies and empty evidence", async () => {
	const root = await tempRoot();
	const summary = await scanRepository({
		rootPath: root,
		relevantFiles: [],
		options: {},
	});
	assert.equal(summary.framework, null);
	assert.equal(summary.packageManager, null);
	assert.deepEqual(summary.frameworks, []);
	assert.deepEqual(summary.routesPages, []);
	assert.equal(summary.truncated, false);
	assert.equal(summary.stopReason, null);
	assert.equal(summary.stats.filesRead, 0);
	assert.equal(summary.stats.bytesRead, 0);
});

test("package signals do not leak across monorepo packages", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "package.json"), "{}");
	await mkdir(join(root, "pkg-a"), { recursive: true });
	await writeFile(
		join(root, "pkg-a", "package.json"),
		'{"dependencies":{"react":"19.0.0"}}',
	);
	await writeFile(
		join(root, "pkg-a", "RealCard.tsx"),
		"export const RealCard = () => null;",
	);
	await mkdir(join(root, "pkg-b"), { recursive: true });
	await writeFile(join(root, "pkg-b", "package.json"), "{}");
	await writeFile(
		join(root, "pkg-b", "NotAComponent.tsx"),
		"export const NotAComponent = () => null;",
	);

	const summary = await scanRepository({
		rootPath: root,
		relevantFiles: [],
		options: {},
	});
	const components = summary.components.map((ref) => ref.path);
	assert.equal(components.includes("pkg-a/RealCard.tsx"), true);
	assert.equal(components.includes("pkg-b/NotAComponent.tsx"), false);
});

test("evidence-cap truncation sets truncated and warns", async () => {
	const root = await tempRoot();
	await writeFile(join(root, "a.test.ts"), "test('a', () => {});");
	await writeFile(join(root, "b.test.ts"), "test('b', () => {});");
	const summary = await scanRepository({
		rootPath: root,
		relevantFiles: [],
		options: { maxEvidencePerCategory: 1 },
	});
	assert.equal(summary.existingTests.length, 1);
	assert.equal(summary.truncated, true);
	assert.ok(summary.warnings.some((w) => /truncated/i.test(w)));
});

test("a missing root is a fatal typed error", async () => {
	const root = await tempRoot();
	await assert.rejects(
		scanRepository({
			rootPath: join(root, "does-not-exist"),
			relevantFiles: [],
			options: {},
		}),
		(error) => {
			assert.ok(error instanceof RepoScanError);
			assert.equal(error.code, "ROOT_NOT_FOUND");
			return true;
		},
	);
});

test("never exposes secrets, excluded dirs, or generated/binary/large files", async () => {
	const root = await tempRoot();
	await writeFile(
		join(root, "package.json"),
		'{"dependencies":{"express":"4.0.0"}}',
	);
	await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: 9");
	await writeFile(join(root, "yarn.lock"), "# yarn lock");
	await writeFile(join(root, ".env"), "SECRET=topsecretvalue");
	await writeFile(join(root, ".env.example"), "SECRET=example");
	await writeFile(join(root, "id_rsa"), "PRIVATE KEY MATERIAL");
	await writeFile(join(root, "app.generated.ts"), "export const gen = 1;");
	await writeFile(join(root, "big.ts"), "x".repeat(2048));
	await writeFile(
		join(root, "blob.bin"),
		Buffer.from([0x00, 0x01, 0x02, 0x00]),
	);
	await writeFile(join(root, "keep.ts"), "export const ok = 1;");
	await mkdir(join(root, "node_modules", "dep"), { recursive: true });
	await writeFile(
		join(root, "node_modules", "dep", "index.js"),
		"module.exports={}",
	);
	await mkdir(join(root, "dist"));
	await writeFile(join(root, "dist", "bundle.js"), "console.log(1)");
	await mkdir(join(root, "src", "api"), { recursive: true });
	await writeFile(
		join(root, "src", "api", "handler.ts"),
		"export const GET=()=>1;",
	);
	await mkdir(join(root, "pkg"), { recursive: true });
	await writeFile(join(root, "pkg", "package.json"), "{ not valid json");
	await writeFile(join(root, ".gitignore"), "ignored-dir/\n");
	await mkdir(join(root, "ignored-dir"));
	await writeFile(
		join(root, "ignored-dir", "secret-notes.ts"),
		"export const n=1;",
	);
	// External symlink, internal symlink, and a directory loop.
	const outside = await tempRoot();
	await writeFile(join(outside, "outside.ts"), "export const out = 1;");
	await symlink(join(outside, "outside.ts"), join(root, "external-link.ts"));
	await symlink(join(root, "keep.ts"), join(root, "internal-link.ts"));
	await symlink(join(root, "src"), join(root, "src", "loop"), "dir");

	const summary = await scanRepository({
		rootPath: root,
		relevantFiles: [],
		options: { maxFileBytes: 256 },
	});

	const everything = JSON.stringify(summary);
	for (const forbidden of [
		"topsecretvalue",
		"PRIVATE KEY MATERIAL",
		".env",
		"id_rsa",
		"node_modules",
		"dist/bundle",
		"app.generated",
		"ignored-dir",
		"outside.ts",
		"external-link",
		"internal-link",
		root,
	]) {
		assert.equal(everything.includes(forbidden), false, forbidden);
	}

	// Detection still works on the safe files.
	assert.equal(summary.framework, "express");
	// Conflicting lockfiles with no explicit field: null primary plus a warning.
	assert.equal(summary.packageManager, null);
	assert.ok(summary.warnings.some((w) => /conflicting lockfiles/i.test(w)));
	assert.ok(
		summary.apiHandlers.some((ref) => ref.path === "src/api/handler.ts"),
	);
	// big.ts exceeds maxFileBytes and is never read.
	assert.ok(summary.stats.skippedLargeFiles >= 1);
});
