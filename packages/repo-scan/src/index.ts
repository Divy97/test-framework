import type { RepoScanRequest, RepoScanSummary } from "./contracts.js";

export {
	repoFileReferenceSchema,
	repoScanOptionsSchema,
	repoScanRequestSchema,
	repoScanStatsSchema,
	repoScanSummarySchema,
	repoTechnologyDetectionSchema,
} from "./contracts.js";
export type {
	RepoFileReference,
	RepoScanOptions,
	RepoScanRequest,
	RepoScanStats,
	RepoScanStopReason,
	RepoScanSummary,
	RepoTechnologyDetection,
} from "./contracts.js";
export { RepoScanError } from "./errors.js";
export type { RepoScanErrorCode } from "./errors.js";

export const repoScanManifest = {
	name: "repo-scan",
	version: "0.1.0",
} as const;

/**
 * Scan a local repository and return deterministic, bounded, secret-safe
 * evidence. Implemented incrementally; this typed shell is replaced with the
 * real orchestration in a later task.
 */
export function scanRepository(
	_request: RepoScanRequest,
): Promise<RepoScanSummary> {
	throw new Error("scanRepository is not implemented yet.");
}
