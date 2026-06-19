import assert from "node:assert/strict";
import test from "node:test";
import type { RepoScanSummary } from "@test-framework/repo-scan";
import { repoContextFromSummary } from "./scan-adapter.js";

function emptySummary(overrides: Partial<RepoScanSummary>): RepoScanSummary {
	return {
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
		...overrides,
	};
}

test("repoContextFromSummary synthesizes one signal per surfaced reference", () => {
	const context = repoContextFromSummary(
		emptySummary({
			framework: "Next.js",
			packageManager: "pnpm",
			components: [{ path: "src/Button.tsx", reason: "react component" }],
			apiHandlers: [{ path: "src/api/login.ts", reason: "route handler" }],
			truncated: true,
		}),
	);
	assert.equal(context.truncated, true);
	assert.equal(context.revision, undefined);
	assert.ok(context.signals.some((s) => s.includes("Next.js")));
	assert.ok(context.signals.some((s) => s.includes("src/Button.tsx")));
	assert.ok(context.signals.some((s) => s.includes("src/api/login.ts")));
});

test("repoContextFromSummary returns no signals for an empty scan", () => {
	const context = repoContextFromSummary(emptySummary({}));
	assert.deepEqual(context, { signals: [], truncated: false });
});
