import {
	acceptanceCriterionSchema,
	featureMapItemSchema,
	normalizedPrdSchema,
	reviewFindingSchema,
	testCaseSchema,
} from "@test-framework/core";
import { repoScanSummarySchema } from "@test-framework/repo-scan";
import { z } from "zod";

export const analyzeFeatureInputSchema = z.object({
	featureRequest: z.string().min(1),
	repoPath: z.string().min(1),
	relevantFiles: z.array(z.string().min(1)).default([]),
});

export const analyzeFeatureOutputSchema = z.object({
	normalizedPrd: normalizedPrdSchema,
});

export const mapFeatureOutputSchema = z.object({
	featureMap: z.array(featureMapItemSchema),
	acceptanceCriteria: z.array(acceptanceCriterionSchema),
	repoScan: repoScanSummarySchema,
});

export const generateTestCasesOutputSchema = z.object({
	testCases: z.array(testCaseSchema),
});

export const reviewTestCasesOutputSchema = z.object({
	findings: z.array(reviewFindingSchema),
});

export const plannerManifest = {
	name: "planner",
	version: "0.1.0",
} as const;
