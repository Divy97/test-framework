import type { ZodType } from "zod";
import type { NormalizedUsage } from "../providers/types.js";
import {
	type CasesStage,
	casesStageSchema,
	type DetailsStage,
	detailsStageSchema,
	type EvidenceStage,
	evidenceStageSchema,
	type FeaturesStage,
	featuresStageSchema,
	type PlanDraft,
	planDraftSchema,
	type RequirementsStage,
	type ReviewStage,
	requirementsStageSchema,
	reviewStageSchema,
} from "./drafts.js";
import { asEngineError } from "./errors.js";
import type { Ingested } from "./identity.js";
import type { EngineDeps, RepoContext } from "./types.js";

/** Versioned methodology + workflow assets stamped into generation metadata. */
export const METHODOLOGY_VERSION = "1.0.0";
export const WORKFLOW_VERSION = "1.0.0";

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 60_000;

const SYSTEM = [
	"You are a QA planning engine. You read supplied product context and emit a",
	"structured plan as JSON matching the provided schema. Rules:",
	"- Reference other entities ONLY by the stable string keys you assign; never emit IDs.",
	"- Provenance kind 'explicit' must cite evidence keys from supplied sources;",
	"  'inferred' needs evidence or a rationale; 'assumption' needs a rationale.",
	"- Every test case must cover at least one requirement.",
	"- Step orders within a case run 1..N with no gaps.",
	"- Reuse the exact keys you defined in earlier stages.",
].join("\n");

/** One structured model call, mapping any seam error onto the engine taxonomy. */
async function runStage<T>(
	deps: EngineDeps,
	prompt: string,
	schema: ZodType<T>,
): Promise<{ data: T; usage: NormalizedUsage }> {
	try {
		const result = await deps.provider.generate(
			{
				system: SYSTEM,
				messages: [{ role: "user", content: prompt }],
				schema,
				maxOutputTokens: deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
				temperature: 0,
			},
			{
				timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				...(deps.signal !== undefined && { signal: deps.signal }),
			},
		);
		// The seam guarantees `data` is present and schema-valid for structured calls.
		return { data: result.data as T, usage: result.usage };
	} catch (err) {
		throw asEngineError(err, "MODEL_OUTPUT_INVALID");
	}
}

function contextBlock(label: string, value: unknown): string {
	return `## ${label}\n${JSON.stringify(value, null, 2)}`;
}

export interface StageContext {
	ingested: Ingested;
	repo?: RepoContext;
}

export function runEvidenceStage(
	deps: EngineDeps,
	ctx: StageContext,
): Promise<{ data: EvidenceStage; usage: NormalizedUsage }> {
	const sources = ctx.ingested.sources.map((source) => ({
		key: source.key,
		kind: source.node.kind,
		title: source.node.title,
		content: source.content,
	}));
	const prompt = [
		"Extract evidence from these supplied sources. Each evidence item gets a",
		"unique key and references its source by `sourceKey`.",
		contextBlock("Sources", sources),
		...(ctx.repo ? [contextBlock("Repository signals", ctx.repo.signals)] : []),
	].join("\n\n");
	return runStage(deps, prompt, evidenceStageSchema);
}

export function runRequirementsStage(
	deps: EngineDeps,
	evidence: EvidenceStage,
): Promise<{ data: RequirementsStage; usage: NormalizedUsage }> {
	const prompt = [
		"Derive requirements and open questions from the evidence. Cite evidence keys",
		"in each requirement's provenance.",
		contextBlock("Evidence", evidence.evidence),
	].join("\n\n");
	return runStage(deps, prompt, requirementsStageSchema);
}

export function runFeaturesStage(
	deps: EngineDeps,
	requirements: RequirementsStage,
): Promise<{ data: FeaturesStage; usage: NormalizedUsage }> {
	const prompt = [
		"Group the requirements into features. Reference requirement keys.",
		contextBlock("Requirements", requirements.requirements),
	].join("\n\n");
	return runStage(deps, prompt, featuresStageSchema);
}

export function runCasesStage(
	deps: EngineDeps,
	requirements: RequirementsStage,
	features: FeaturesStage,
): Promise<{ data: CasesStage; usage: NormalizedUsage }> {
	const prompt = [
		"Write test cases covering the requirements and features. Each case must",
		"reference at least one requirement key.",
		contextBlock("Requirements", requirements.requirements),
		contextBlock("Features", features.features),
	].join("\n\n");
	return runStage(deps, prompt, casesStageSchema);
}

export function runDetailsStage(
	deps: EngineDeps,
	cases: CasesStage,
): Promise<{ data: DetailsStage; usage: NormalizedUsage }> {
	const prompt = [
		"For each test case, emit data requirements, ordered steps (orders 1..N), and",
		"assertions. Reference cases/steps by key.",
		contextBlock("Test cases", cases.testCases),
	].join("\n\n");
	return runStage(deps, prompt, detailsStageSchema);
}

/** Independent semantic-review pass (ADR-0006: judgment is the model's, not code's). */
export function runReviewStage(
	deps: EngineDeps,
	draft: PlanDraft,
): Promise<{ data: ReviewStage; usage: NormalizedUsage }> {
	const prompt = [
		"Independently review this plan for missing, duplicated, unsupported, or weak",
		"scenarios. Report findings. Set `blocking` true only if a gap is material",
		"enough that the plan should be marked incomplete.",
		contextBlock("Plan draft", draft),
	].join("\n\n");
	return runStage(deps, prompt, reviewStageSchema);
}

/**
 * Refine an existing plan draft against scoped feedback. Re-emits the whole draft
 * (same contract as repair) so the existing review/validate/repair loop runs
 * unchanged on the revision. Entities the feedback does not touch keep their keys
 * and content, so their stable ids survive the revision.
 */
export function runRefineStage(
	deps: EngineDeps,
	priorDraft: PlanDraft,
	feedback: string,
): Promise<{ data: PlanDraft; usage: NormalizedUsage }> {
	const prompt = [
		"Revise this existing plan draft to address the scoped feedback. Preserve the",
		"keys and content of entities the feedback does not touch; add/modify/remove",
		"only what the feedback requires. Keep provenance rules.",
		contextBlock("Current draft", priorDraft),
		contextBlock("Feedback", feedback),
	].join("\n\n");
	return runStage(deps, prompt, planDraftSchema);
}

/** Bounded repair: re-emit the whole draft, correcting the reported problems. */
export function runRepairStage(
	deps: EngineDeps,
	draft: PlanDraft,
	problems: readonly string[],
): Promise<{ data: PlanDraft; usage: NormalizedUsage }> {
	const prompt = [
		"This plan draft failed deterministic validation. Return a corrected full",
		"draft that fixes every problem below while preserving valid content and keys.",
		contextBlock("Problems", problems),
		contextBlock("Current draft", draft),
	].join("\n\n");
	return runStage(deps, prompt, planDraftSchema);
}
