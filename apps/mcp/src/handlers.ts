import { join } from "node:path";
import {
	type CreatePlanInput,
	createPlan,
	loadPlan,
	type RefinePlanInput,
	refinePlan,
	type TestGraphV1,
} from "@test-framework/qa-engine";
import { type EngineRuntime, engineDepsFor } from "./engine-runtime.js";
import { confineRepoPath } from "./roots.js";
import type {
	CreateTestPlanInput,
	GetTestPlanInput,
	GetTestPlanOutput,
	PlanResultOutput,
	RefineTestPlanInput,
	UsageOutput,
} from "./tool-schemas.js";

/** Per-call context handed to a handler: the runtime plus the resolved root and signal. */
export interface ToolContext {
	runtime: EngineRuntime;
	/** Workspace root resolved for this call by the roots policy. */
	root: string;
	signal?: AbortSignal;
}

/**
 * Engine-backed tool operations. Each maps a transport input to the engine call
 * and projects the engine result back to the transport output shape. The eight
 * internal stages stay private (ADR-0003); these are the only public operations.
 */
export interface EngineHandlers {
	createTestPlan(
		input: CreateTestPlanInput,
		ctx: ToolContext,
	): Promise<PlanResultOutput>;
	refineTestPlan(
		input: RefineTestPlanInput,
		ctx: ToolContext,
	): Promise<PlanResultOutput>;
	getTestPlan(
		input: GetTestPlanInput,
		ctx: ToolContext,
	): Promise<GetTestPlanOutput>;
}

function artifactsFor(planDir: string) {
	return {
		planJson: join(planDir, "plan.json"),
		planMd: join(planDir, "plan.md"),
		generationJson: join(planDir, "generation.json"),
	};
}

/** Project the engine's `NormalizedUsage` to a plain, index-signature-free shape. */
function usageOutput(usage: {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	cachedInputTokens?: number;
	reasoningTokens?: number;
}): UsageOutput {
	return {
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		totalTokens: usage.totalTokens,
		...(usage.cachedInputTokens !== undefined && {
			cachedInputTokens: usage.cachedInputTokens,
		}),
		...(usage.reasoningTokens !== undefined && {
			reasoningTokens: usage.reasoningTokens,
		}),
	};
}

export function createEngineHandlers(): EngineHandlers {
	return {
		async createTestPlan(input, ctx) {
			const engineInput: CreatePlanInput = {
				project: { name: input.project.name },
				title: input.title,
				sources: input.sources.map((source) => ({
					kind: source.kind,
					title: source.title,
					content: source.content,
					...(source.locator !== undefined && { locator: source.locator }),
				})),
				...(input.repo?.path !== undefined && {
					// Confine the repo path inside the resolved root before any engine
					// call; an escaping path is rejected as REPO_ACCESS_DENIED.
					repo: { path: confineRepoPath(ctx.root, input.repo.path) },
				}),
			};
			const result = await createPlan(
				engineInput,
				engineDepsFor(ctx.runtime, ctx.root, ctx.signal),
			);
			return {
				planId: result.graph.planId,
				projectId: result.graph.projectId,
				planVersion: result.graph.planVersion,
				status: result.status,
				title: result.graph.title,
				planDir: result.planDir,
				artifacts: artifactsFor(result.planDir),
				usage: usageOutput(result.usage),
				warnings: result.warnings,
			};
		},

		async refineTestPlan(input, ctx) {
			const engineInput: RefinePlanInput = {
				planId: input.planId,
				feedback: input.feedback,
				...(input.expectedVersion !== undefined && {
					expectedVersion: input.expectedVersion,
				}),
				...(input.sources !== undefined && {
					sources: input.sources.map((source) => ({
						kind: source.kind,
						title: source.title,
						content: source.content,
						...(source.locator !== undefined && { locator: source.locator }),
					})),
				}),
			};
			const result = await refinePlan(
				engineInput,
				engineDepsFor(ctx.runtime, ctx.root, ctx.signal),
			);
			return {
				planId: result.graph.planId,
				projectId: result.graph.projectId,
				planVersion: result.graph.planVersion,
				status: result.status,
				title: result.graph.title,
				planDir: result.planDir,
				artifacts: artifactsFor(result.planDir),
				usage: usageOutput(result.usage),
				warnings: result.warnings,
				previousVersion: result.previousVersion,
			};
		},

		async getTestPlan(input, ctx) {
			const graph: TestGraphV1 = await loadPlan(
				{ planId: input.planId },
				{ workspaceRoot: ctx.root },
			);
			const planDir = join(ctx.root, ".test-framework", "plans", graph.planId);
			return {
				planId: graph.planId,
				projectId: graph.projectId,
				planVersion: graph.planVersion,
				title: graph.title,
				status: graph.status,
				createdAt: graph.createdAt,
				updatedAt: graph.updatedAt,
				generation: {
					generatedAt: graph.generation.generatedAt,
					methodologyVersion: graph.generation.methodologyVersion,
					workflowVersion: graph.generation.workflowVersion,
					inputFingerprint: graph.generation.inputFingerprint,
					generator: graph.generation.generator,
					status: graph.generation.status,
					warnings: graph.generation.warnings,
				},
				summary: {
					requirements: graph.requirements.length,
					features: graph.features.length,
					testCases: graph.testCases.length,
					openQuestions: graph.openQuestions.length,
					assertions: graph.assertions.length,
				},
				artifacts: artifactsFor(planDir),
			};
		},
	};
}
