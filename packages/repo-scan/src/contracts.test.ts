import assert from "node:assert/strict";
import test from "node:test";
import {
	repoFileReferenceSchema,
	repoScanOptionsSchema,
	repoScanRequestSchema,
	repoScanSummarySchema,
	repoTechnologyDetectionSchema,
} from "./contracts.js";

test("options schema expands all defaults from an empty object", () => {
	const options = repoScanOptionsSchema.parse({});
	assert.deepEqual(options, {
		maxDepth: 20,
		maxEntries: 50_000,
		maxFiles: 10_000,
		maxFileBytes: 262_144,
		maxTotalReadBytes: 8_388_608,
		maxEvidencePerCategory: 100,
		honorGitignore: true,
		additionalIgnorePatterns: [],
	});
});

test("options schema rejects values above hard caps", () => {
	assert.equal(
		repoScanOptionsSchema.safeParse({ maxDepth: 51 }).success,
		false,
	);
	assert.equal(
		repoScanOptionsSchema.safeParse({ maxEntries: 200_001 }).success,
		false,
	);
	assert.equal(
		repoScanOptionsSchema.safeParse({ maxFiles: 50_001 }).success,
		false,
	);
	assert.equal(
		repoScanOptionsSchema.safeParse({ maxFileBytes: 1_048_577 }).success,
		false,
	);
	assert.equal(
		repoScanOptionsSchema.safeParse({ maxTotalReadBytes: 33_554_433 }).success,
		false,
	);
	assert.equal(
		repoScanOptionsSchema.safeParse({ maxEvidencePerCategory: 501 }).success,
		false,
	);
});

test("options schema rejects values below hard minimums", () => {
	assert.equal(repoScanOptionsSchema.safeParse({ maxDepth: 0 }).success, false);
	assert.equal(repoScanOptionsSchema.safeParse({ maxFiles: 0 }).success, false);
});

test("options schema caps additionalIgnorePatterns count and length", () => {
	assert.equal(
		repoScanOptionsSchema.safeParse({
			additionalIgnorePatterns: Array.from({ length: 101 }, () => "x"),
		}).success,
		false,
	);
	assert.equal(
		repoScanOptionsSchema.safeParse({
			additionalIgnorePatterns: ["a".repeat(257)],
		}).success,
		false,
	);
	assert.equal(
		repoScanOptionsSchema.safeParse({ additionalIgnorePatterns: [""] }).success,
		false,
	);
});

test("request schema applies relevantFiles and options defaults", () => {
	const request = repoScanRequestSchema.parse({ rootPath: "/repo" });
	assert.equal(request.rootPath, "/repo");
	assert.deepEqual(request.relevantFiles, []);
	assert.deepEqual(request.options, {});
});

test("request schema rejects an empty root path", () => {
	assert.equal(
		repoScanRequestSchema.safeParse({ rootPath: "" }).success,
		false,
	);
});

test("file reference requires non-empty path and reason", () => {
	assert.equal(
		repoFileReferenceSchema.safeParse({ path: "src/a.ts", reason: "x" })
			.success,
		true,
	);
	assert.equal(
		repoFileReferenceSchema.safeParse({ path: "", reason: "x" }).success,
		false,
	);
	assert.equal(
		repoFileReferenceSchema.safeParse({ path: "src/a.ts", reason: "" }).success,
		false,
	);
});

test("technology detection extends file reference with a name", () => {
	assert.equal(
		repoTechnologyDetectionSchema.safeParse({
			path: "package.json",
			reason: "dependency",
			name: "next",
		}).success,
		true,
	);
	assert.equal(
		repoTechnologyDetectionSchema.safeParse({
			path: "package.json",
			reason: "dependency",
		}).success,
		false,
	);
});

test("summary schema parses a complete deterministic summary", () => {
	const summary = repoScanSummarySchema.parse({
		framework: "next",
		packageManager: "pnpm",
		frameworks: [{ path: "package.json", reason: "dependency", name: "next" }],
		packageManagers: [
			{ path: "package.json", reason: "packageManager field", name: "pnpm" },
		],
		routesPages: [
			{ path: "src/app/page.tsx", reason: "Next.js App Router page" },
		],
		components: [],
		apiHandlers: [],
		dbSchemasModels: [],
		existingTests: [],
		authMiddleware: [],
		validationSchemas: [],
		featureFlags: [],
		externalIntegrations: [],
		truncated: false,
		stopReason: null,
		warnings: [],
		stats: {
			entriesVisited: 1,
			filesConsidered: 1,
			filesRead: 1,
			bytesRead: 10,
			skippedByPolicy: 0,
			skippedByGitignore: 0,
			skippedSymlinks: 0,
			skippedLargeFiles: 0,
			skippedBinaryFiles: 0,
			unreadablePaths: 0,
		},
	});
	assert.equal(summary.framework, "next");
	assert.equal(summary.stopReason, null);
});

test("summary schema accepts each valid stopReason", () => {
	for (const stopReason of [
		"max-depth",
		"max-entries",
		"max-files",
		"max-total-read-bytes",
	] as const) {
		const result = repoScanSummarySchema.safeParse({
			framework: null,
			packageManager: null,
			frameworks: [],
			packageManagers: [],
			routesPages: [],
			components: [],
			apiHandlers: [],
			dbSchemasModels: [],
			existingTests: [],
			authMiddleware: [],
			validationSchemas: [],
			featureFlags: [],
			externalIntegrations: [],
			truncated: true,
			stopReason,
			warnings: ["soft limit reached"],
			stats: {
				entriesVisited: 0,
				filesConsidered: 0,
				filesRead: 0,
				bytesRead: 0,
				skippedByPolicy: 0,
				skippedByGitignore: 0,
				skippedSymlinks: 0,
				skippedLargeFiles: 0,
				skippedBinaryFiles: 0,
				unreadablePaths: 0,
			},
		});
		assert.equal(result.success, true);
	}
});

test("summary schema rejects an unknown stopReason value", () => {
	const result = repoScanSummarySchema.safeParse({
		framework: null,
		packageManager: null,
		frameworks: [],
		packageManagers: [],
		routesPages: [],
		components: [],
		apiHandlers: [],
		dbSchemasModels: [],
		existingTests: [],
		authMiddleware: [],
		validationSchemas: [],
		featureFlags: [],
		externalIntegrations: [],
		truncated: true,
		stopReason: "max-bytes",
		warnings: [],
		stats: {
			entriesVisited: 0,
			filesConsidered: 0,
			filesRead: 0,
			bytesRead: 0,
			skippedByPolicy: 0,
			skippedByGitignore: 0,
			skippedSymlinks: 0,
			skippedLargeFiles: 0,
			skippedBinaryFiles: 0,
			unreadablePaths: 0,
		},
	});
	assert.equal(result.success, false);
});

test("summary schema stays forward-compatible (non-strict)", () => {
	const result = repoScanSummarySchema.safeParse({
		framework: null,
		packageManager: null,
		frameworks: [],
		packageManagers: [],
		routesPages: [],
		components: [],
		apiHandlers: [],
		dbSchemasModels: [],
		existingTests: [],
		authMiddleware: [],
		validationSchemas: [],
		featureFlags: [],
		externalIntegrations: [],
		truncated: false,
		stopReason: null,
		warnings: [],
		stats: {
			entriesVisited: 0,
			filesConsidered: 0,
			filesRead: 0,
			bytesRead: 0,
			skippedByPolicy: 0,
			skippedByGitignore: 0,
			skippedSymlinks: 0,
			skippedLargeFiles: 0,
			skippedBinaryFiles: 0,
			unreadablePaths: 0,
		},
		futureField: "ok",
	});
	assert.equal(result.success, true);
});
