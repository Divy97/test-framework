import {
	acceptanceCriterionSchema,
	featureMapItemSchema,
	normalizedPrdSchema,
	reviewFindingSchema,
	testCaseSchema,
} from "@test-framework/core";
import {
	repoScanOptionsSchema,
	repoScanSummarySchema,
} from "@test-framework/repo-scan";
import { z } from "zod";

export const analyzeFeatureInputSchema = z.object({
	featureRequest: z.string().min(1),
	repoPath: z.string().min(1),
	relevantFiles: z.array(z.string().min(1)).default([]),
});

export const analyzeFeatureOutputSchema = z.object({
	normalizedPrd: normalizedPrdSchema,
});

export const mapFeatureInputSchema = z.object({
	normalizedPrd: normalizedPrdSchema,
	repoPath: z.string().min(1),
	relevantFiles: z.array(z.string().min(1)).default([]),
	scanOptions: repoScanOptionsSchema.partial().default({}),
});

export const mapFeatureOutputSchema = z.object({
	featureMap: z.array(featureMapItemSchema),
	acceptanceCriteria: z.array(acceptanceCriterionSchema),
	repoScan: repoScanSummarySchema,
});

export const generateTestCasesInputSchema = z.object({
	normalizedPrd: normalizedPrdSchema,
	featureMap: z.array(featureMapItemSchema),
	acceptanceCriteria: z.array(acceptanceCriterionSchema),
	userHints: z.array(z.string().min(1)).default([]),
});

export const generateTestCasesOutputSchema = z.object({
	testCases: z.array(testCaseSchema),
});

export const reviewTestCasesInputSchema = z.object({
	testCases: z.array(testCaseSchema),
	acceptanceCriteria: z.array(acceptanceCriterionSchema).default([]),
});

export const reviewTestCasesOutputSchema = z.object({
	findings: z.array(reviewFindingSchema),
});

export const exportFormatSchema = z.enum(["json", "markdown"]);

export const exportTestCasesInputSchema = z.object({
	repoPath: z.string().min(1),
	testCases: z.array(testCaseSchema),
	formats: z.array(exportFormatSchema).min(1).default(["json", "markdown"]),
});

export const exportedArtifactSchema = z.object({
	format: exportFormatSchema,
	path: z.string().min(1),
	written: z.boolean(),
});

export const exportTestCasesOutputSchema = z.object({
	status: z.enum(["preview", "written"]),
	testCases: z.array(testCaseSchema),
	artifacts: z.array(exportedArtifactSchema),
});

export type AnalyzeFeatureInput = z.infer<typeof analyzeFeatureInputSchema>;
export type AnalyzeFeatureOutput = z.infer<typeof analyzeFeatureOutputSchema>;
export type MapFeatureInput = z.infer<typeof mapFeatureInputSchema>;
export type MapFeatureOutput = z.infer<typeof mapFeatureOutputSchema>;
export type GenerateTestCasesInput = z.infer<
	typeof generateTestCasesInputSchema
>;
export type GenerateTestCasesOutput = z.infer<
	typeof generateTestCasesOutputSchema
>;
export type ReviewTestCasesInput = z.infer<typeof reviewTestCasesInputSchema>;
export type ReviewTestCasesOutput = z.infer<typeof reviewTestCasesOutputSchema>;
export type ExportTestCasesInput = z.infer<typeof exportTestCasesInputSchema>;
export type ExportTestCasesOutput = z.infer<typeof exportTestCasesOutputSchema>;

export const plannerManifest = {
	name: "planner",
	version: "0.1.0",
} as const;
