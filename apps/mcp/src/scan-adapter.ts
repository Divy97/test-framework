import type { RepoContext } from "@test-framework/qa-engine";
import {
	type RepoFileReference,
	type RepoScanSummary,
	type RepoTechnologyDetection,
	scanRepository,
} from "@test-framework/repo-scan";

/**
 * Project a `repo-scan` `RepoScanSummary` onto the engine's `RepoContext`. The
 * engine stays scanner-agnostic (its `scan` dep returns `RepoContext`); this
 * projection lives in the adapter (decision: RepoScanSummary -> RepoContext maps
 * in the MCP app, not the engine). One synthesized claim per surfaced signal;
 * `revision` is omitted (no VCS read in V1).
 */
export function repoContextFromSummary(summary: RepoScanSummary): RepoContext {
	const signals: string[] = [];

	if (summary.framework)
		signals.push(`Primary framework: ${summary.framework}.`);
	if (summary.packageManager) {
		signals.push(`Package manager: ${summary.packageManager}.`);
	}
	for (const tech of summary.frameworks) signals.push(technologyClaim(tech));
	for (const tech of summary.packageManagers)
		signals.push(technologyClaim(tech));

	pushFiles(signals, "Route/page", summary.routesPages);
	pushFiles(signals, "Component", summary.components);
	pushFiles(signals, "API handler", summary.apiHandlers);
	pushFiles(signals, "DB schema/model", summary.dbSchemasModels);
	pushFiles(signals, "Existing test", summary.existingTests);
	pushFiles(signals, "Auth/middleware", summary.authMiddleware);
	pushFiles(signals, "Validation schema", summary.validationSchemas);
	pushFiles(signals, "Feature flag", summary.featureFlags);
	pushFiles(signals, "External integration", summary.externalIntegrations);

	return { signals, truncated: summary.truncated };
}

function technologyClaim(tech: RepoTechnologyDetection): string {
	return `Detected ${tech.name} (${tech.path}): ${tech.reason}.`;
}

function pushFiles(
	signals: string[],
	label: string,
	refs: RepoFileReference[],
): void {
	for (const ref of refs) {
		signals.push(`${label} at ${ref.path}: ${ref.reason}.`);
	}
}

/**
 * An engine `scan` dep backed by `repo-scan`. Scanner errors (`RepoScanError`)
 * propagate; the engine's `createPlan` wraps a thrown `scan` as
 * `REPO_ACCESS_DENIED`.
 */
export async function scanRepoForEngine(req: {
	path: string;
}): Promise<RepoContext> {
	const summary = await scanRepository({
		rootPath: req.path,
		relevantFiles: [],
		options: {},
	});
	return repoContextFromSummary(summary);
}
