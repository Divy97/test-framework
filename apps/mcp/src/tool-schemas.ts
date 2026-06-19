import { repoScanOptionsSchema } from "@test-framework/repo-scan";
import { z } from "zod";

/**
 * Transport schemas for the three coarse tools. The adapter owns the *transport*
 * shape (stable JSON the host sees); the engine owns the *domain* shape. These
 * are thin projections of the engine types — input mirrors `CreatePlanInput` /
 * `RefinePlanInput`; output projects `CreatePlanResult` / `loadPlan` to identity,
 * status, version, and artifact paths (never the whole graph).
 *
 * Output schemas stay non-strict (forward-compatible fields allowed).
 */

/** Mirrors `CreatePlanSource["kind"]` (the test-graph `Source` kind enum). */
export const sourceKindSchema = z.enum([
	"feature-request",
	"document",
	"repository",
	"diff",
	"user-hint",
	"api-spec",
	"other",
]);

const sourceSchema = z.object({
	kind: sourceKindSchema,
	title: z.string().min(1),
	content: z.string().min(1),
	locator: z.string().min(1).optional(),
});

export const createTestPlanInputSchema = z.object({
	project: z.object({ name: z.string().min(1) }),
	title: z.string().min(1),
	sources: z.array(sourceSchema).min(1),
	repo: z
		.object({
			path: z.string().min(1).optional(),
			scanOptions: repoScanOptionsSchema.partial().optional(),
		})
		.optional(),
});
export type CreateTestPlanInput = z.infer<typeof createTestPlanInputSchema>;

export const refineTestPlanInputSchema = z.object({
	planId: z.string().min(1),
	feedback: z.string().min(1),
	expectedVersion: z.number().int().optional(),
	sources: z.array(sourceSchema).optional(),
});
export type RefineTestPlanInput = z.infer<typeof refineTestPlanInputSchema>;

export const getTestPlanInputSchema = z.object({
	planId: z.string().min(1),
});
export type GetTestPlanInput = z.infer<typeof getTestPlanInputSchema>;

const usageSchema = z
	.object({
		inputTokens: z.number(),
		outputTokens: z.number(),
		totalTokens: z.number(),
		cachedInputTokens: z.number().optional(),
		reasoningTokens: z.number().optional(),
	})
	.loose();

const artifactsSchema = z.object({
	planJson: z.string(),
	planMd: z.string(),
	generationJson: z.string(),
});

/** Shared create/refine output. Non-strict: forward-compatible fields allowed. */
export const planResultOutputSchema = z
	.object({
		planId: z.string(),
		projectId: z.string(),
		planVersion: z.number().int(),
		status: z.enum(["complete", "incomplete"]),
		title: z.string(),
		planDir: z.string(),
		artifacts: artifactsSchema,
		usage: usageSchema,
		warnings: z.array(z.string()),
		previousVersion: z.number().int().optional(),
	})
	.loose();

export const getTestPlanOutputSchema = z
	.object({
		planId: z.string(),
		projectId: z.string(),
		planVersion: z.number().int(),
		title: z.string(),
		// Projects the graph status verbatim (graphs may be "draft").
		status: z.enum(["draft", "complete", "incomplete"]),
		createdAt: z.string(),
		updatedAt: z.string(),
		generation: z.object({
			generatedAt: z.string(),
			methodologyVersion: z.string(),
			workflowVersion: z.string(),
			inputFingerprint: z.string(),
			generator: z.union([
				z.object({ kind: z.literal("manual") }),
				z.object({
					kind: z.literal("model"),
					provider: z.string(),
					model: z.string(),
				}),
			]),
			status: z.enum(["complete", "incomplete"]),
			warnings: z.array(z.string()),
		}),
		summary: z.object({
			requirements: z.number().int(),
			features: z.number().int(),
			testCases: z.number().int(),
			openQuestions: z.number().int(),
			assertions: z.number().int(),
		}),
		artifacts: artifactsSchema,
	})
	.loose();

/**
 * Explicit, concrete handler output types. These are intentionally NOT
 * `z.infer<>` of the loose output schemas above: the loose schemas carry an
 * `[x: string]: unknown` index signature (for forward-compatible fields) that
 * conflicts with the engine's concrete types (branded `PlanId`/`ProjectId`,
 * `NormalizedUsage`). Handlers map engine results into these plain shapes; the
 * Zod schemas stay ONLY for the SDK's runtime `structuredContent` validation.
 */

export interface ArtifactPaths {
	planJson: string;
	planMd: string;
	generationJson: string;
}

export interface UsageOutput {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	cachedInputTokens?: number;
	reasoningTokens?: number;
}

/** Shared create/refine handler output (`previousVersion` set only on refine). */
export interface PlanResultOutput {
	planId: string;
	projectId: string;
	planVersion: number;
	status: "complete" | "incomplete";
	title: string;
	planDir: string;
	artifacts: ArtifactPaths;
	usage: UsageOutput;
	warnings: string[];
	previousVersion?: number;
}

export interface GenerationOutput {
	generatedAt: string;
	methodologyVersion: string;
	workflowVersion: string;
	inputFingerprint: string;
	generator:
		| { kind: "manual" }
		| { kind: "model"; provider: string; model: string };
	status: "complete" | "incomplete";
	warnings: string[];
}

export interface PlanSummaryOutput {
	requirements: number;
	features: number;
	testCases: number;
	openQuestions: number;
	assertions: number;
}

export interface GetTestPlanOutput {
	planId: string;
	projectId: string;
	planVersion: number;
	title: string;
	status: "draft" | "complete" | "incomplete";
	createdAt: string;
	updatedAt: string;
	generation: GenerationOutput;
	summary: PlanSummaryOutput;
	artifacts: ArtifactPaths;
}
