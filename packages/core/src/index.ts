import { z } from "zod";

export const evidenceSourceSchema = z.enum(["prd", "code", "inferred"]);
export const requirementStrengthSchema = z.enum([
	"explicit",
	"inferred",
	"assumption",
]);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export const testCaseTypeSchema = z.enum([
	"positive",
	"negative",
	"edge",
	"security",
	"regression",
	"integration",
]);
export const prioritySchema = z.enum(["p0", "p1", "p2", "p3"]);
export const automationReadinessSchema = z.enum([
	"manual",
	"playwright-ready",
	"api-ready",
	"blocked",
]);

export const sourceReferenceSchema = z.object({
	label: z.string().min(1),
	path: z.string().min(1).optional(),
	excerpt: z.string().min(1).optional(),
});

export const normalizedPrdSchema = z.object({
	featureSummary: z.string().min(1),
	userRoles: z.array(z.string().min(1)),
	goals: z.array(z.string().min(1)),
	inScopeBehavior: z.array(z.string().min(1)),
	outOfScopeBehavior: z.array(z.string().min(1)),
	businessRules: z.array(z.string().min(1)),
	uiStates: z.array(z.string().min(1)),
	dataRules: z.array(z.string().min(1)),
	apiContracts: z.array(z.string().min(1)),
	authPermissionRules: z.array(z.string().min(1)),
	edgeCases: z.array(z.string().min(1)),
	openQuestions: z.array(z.string().min(1)),
	sourceReferences: z.array(sourceReferenceSchema),
});

export const featureMapItemSchema = z.object({
	feature: z.string().min(1),
	subFeature: z.string().min(1),
	userFlow: z.string().min(1),
	screensRoutes: z.array(z.string().min(1)),
	componentsFiles: z.array(z.string().min(1)),
	apisDataStores: z.array(z.string().min(1)),
	dependencies: z.array(z.string().min(1)),
	riskLevel: riskLevelSchema,
});

export const acceptanceCriterionSchema = z.object({
	id: z.string().min(1),
	statement: z.string().min(1),
	strength: requirementStrengthSchema,
	evidenceSource: evidenceSourceSchema,
	sourceReferences: z.array(sourceReferenceSchema),
});

export const testCaseSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	type: testCaseTypeSchema,
	priority: prioritySchema,
	objective: z.string().min(1),
	preconditions: z.array(z.string().min(1)),
	testDataAccounts: z.array(z.string().min(1)),
	steps: z.array(z.string().min(1)),
	expectedResults: z.array(z.string().min(1)),
	postconditions: z.array(z.string().min(1)),
	relatedFilesRoutesApis: z.array(z.string().min(1)),
	evidenceSource: evidenceSourceSchema,
	automationReadiness: automationReadinessSchema,
});

export const reviewFindingSchema = z.object({
	id: z.string().min(1),
	severity: z.enum(["low", "medium", "high"]),
	summary: z.string().min(1),
	recommendation: z.string().min(1),
	relatedTestCaseIds: z.array(z.string().min(1)),
});

export type NormalizedPrd = z.infer<typeof normalizedPrdSchema>;
export type FeatureMapItem = z.infer<typeof featureMapItemSchema>;
export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
