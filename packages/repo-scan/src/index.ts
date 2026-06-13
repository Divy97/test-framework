import { z } from "zod";

export const repoFileReferenceSchema = z.object({
	path: z.string().min(1),
	reason: z.string().min(1),
});

export const repoScanSummarySchema = z.object({
	framework: z.string().min(1).nullable(),
	packageManager: z.string().min(1).nullable(),
	routesPages: z.array(repoFileReferenceSchema),
	components: z.array(repoFileReferenceSchema),
	apiHandlers: z.array(repoFileReferenceSchema),
	dbSchemasModels: z.array(repoFileReferenceSchema),
	existingTests: z.array(repoFileReferenceSchema),
	authMiddleware: z.array(repoFileReferenceSchema),
	validationSchemas: z.array(repoFileReferenceSchema),
	featureFlags: z.array(repoFileReferenceSchema),
	externalIntegrations: z.array(repoFileReferenceSchema),
});

export const repoScanManifest = {
	name: "repo-scan",
	version: "0.1.0",
} as const;

export type RepoScanSummary = z.infer<typeof repoScanSummarySchema>;
