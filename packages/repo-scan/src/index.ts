export type {
	RepoFileReference,
	RepoScanOptions,
	RepoScanRequest,
	RepoScanStats,
	RepoScanStopReason,
	RepoScanSummary,
	RepoTechnologyDetection,
} from "./contracts.js";
export {
	repoFileReferenceSchema,
	repoScanOptionsSchema,
	repoScanRequestSchema,
	repoScanStatsSchema,
	repoScanSummarySchema,
	repoTechnologyDetectionSchema,
} from "./contracts.js";
export type { RepoScanErrorCode } from "./errors.js";
export { RepoScanError } from "./errors.js";
export { scanRepository } from "./scanner.js";

export const repoScanManifest = {
	name: "repo-scan",
	version: "0.1.0",
} as const;
