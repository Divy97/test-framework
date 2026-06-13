import { z } from "zod";

export const repoScanOptionsSchema = z.object({
	maxDepth: z.number().int().min(1).max(50).default(20),
	maxEntries: z.number().int().min(1).max(200_000).default(50_000),
	maxFiles: z.number().int().min(1).max(50_000).default(10_000),
	maxFileBytes: z.number().int().min(1).max(1_048_576).default(262_144),
	maxTotalReadBytes: z
		.number()
		.int()
		.min(1)
		.max(33_554_432)
		.default(8_388_608),
	maxEvidencePerCategory: z.number().int().min(1).max(500).default(100),
	honorGitignore: z.boolean().default(true),
	additionalIgnorePatterns: z
		.array(z.string().min(1).max(256))
		.max(100)
		.default([]),
});

export const repoScanRequestSchema = z.object({
	rootPath: z.string().min(1),
	relevantFiles: z.array(z.string().min(1)).default([]),
	options: repoScanOptionsSchema.partial().default({}),
});

export const repoFileReferenceSchema = z.object({
	path: z.string().min(1),
	reason: z.string().min(1),
});

export const repoTechnologyDetectionSchema = repoFileReferenceSchema.extend({
	name: z.string().min(1),
});

export const repoScanStatsSchema = z.object({
	entriesVisited: z.number().int().nonnegative(),
	filesConsidered: z.number().int().nonnegative(),
	filesRead: z.number().int().nonnegative(),
	bytesRead: z.number().int().nonnegative(),
	skippedByPolicy: z.number().int().nonnegative(),
	skippedByGitignore: z.number().int().nonnegative(),
	skippedSymlinks: z.number().int().nonnegative(),
	skippedLargeFiles: z.number().int().nonnegative(),
	skippedBinaryFiles: z.number().int().nonnegative(),
	unreadablePaths: z.number().int().nonnegative(),
});

export const repoScanSummarySchema = z.object({
	framework: z.string().min(1).nullable(),
	packageManager: z.string().min(1).nullable(),
	frameworks: z.array(repoTechnologyDetectionSchema),
	packageManagers: z.array(repoTechnologyDetectionSchema),
	routesPages: z.array(repoFileReferenceSchema),
	components: z.array(repoFileReferenceSchema),
	apiHandlers: z.array(repoFileReferenceSchema),
	dbSchemasModels: z.array(repoFileReferenceSchema),
	existingTests: z.array(repoFileReferenceSchema),
	authMiddleware: z.array(repoFileReferenceSchema),
	validationSchemas: z.array(repoFileReferenceSchema),
	featureFlags: z.array(repoFileReferenceSchema),
	externalIntegrations: z.array(repoFileReferenceSchema),
	truncated: z.boolean(),
	stopReason: z
		.enum(["max-depth", "max-entries", "max-files", "max-total-read-bytes"])
		.nullable(),
	warnings: z.array(z.string().min(1)),
	stats: repoScanStatsSchema,
});

export type RepoScanOptions = z.infer<typeof repoScanOptionsSchema>;
export type RepoScanRequest = z.infer<typeof repoScanRequestSchema>;
export type RepoFileReference = z.infer<typeof repoFileReferenceSchema>;
export type RepoTechnologyDetection = z.infer<
	typeof repoTechnologyDetectionSchema
>;
export type RepoScanStats = z.infer<typeof repoScanStatsSchema>;
export type RepoScanSummary = z.infer<typeof repoScanSummarySchema>;
export type RepoScanStopReason = NonNullable<RepoScanSummary["stopReason"]>;
