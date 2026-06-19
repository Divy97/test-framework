import type { NormalizedUsage } from "../providers/types.js";
import { createStableId, planIdSchema } from "../test-graph/ids.js";
import type { Source, TestGraphV1 } from "../test-graph/schema.js";
import {
	validatePlanRevisionTransition,
	validateTestGraph,
} from "../test-graph/validate.js";
import { type AssembleMeta, assemble } from "./assemble.js";
import { decomposePlan } from "./decompose.js";
import type { PlanDraft } from "./drafts.js";
import { asEngineError, EngineError } from "./errors.js";
import { canonicalKey, type Ingested, ingest } from "./identity.js";
import {
	type GenerationManifest,
	persistPlan,
	persistRevision,
	readPlan,
} from "./persist.js";
import {
	METHODOLOGY_VERSION,
	runCasesStage,
	runDetailsStage,
	runEvidenceStage,
	runFeaturesStage,
	runRefineStage,
	runRepairStage,
	runRequirementsStage,
	runReviewStage,
	WORKFLOW_VERSION,
} from "./stages.js";
import type {
	CreatePlanInput,
	CreatePlanResult,
	CreatePlanSource,
	EngineDeps,
	LoadPlanInput,
	RefinePlanInput,
	RefinePlanResult,
	RepoContext,
} from "./types.js";

const ZERO_USAGE: NormalizedUsage = {
	inputTokens: 0,
	outputTokens: 0,
	totalTokens: 0,
};

function sumOptional(a?: number, b?: number): number | undefined {
	if (a === undefined && b === undefined) return undefined;
	return (a ?? 0) + (b ?? 0);
}

function addUsage(a: NormalizedUsage, b: NormalizedUsage): NormalizedUsage {
	const cached = sumOptional(a.cachedInputTokens, b.cachedInputTokens);
	const reasoning = sumOptional(a.reasoningTokens, b.reasoningTokens);
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		totalTokens: a.totalTokens + b.totalTokens,
		...(cached !== undefined && { cachedInputTokens: cached }),
		...(reasoning !== undefined && { reasoningTokens: reasoning }),
	};
}

function computeStatus(
	reviewBlocking: boolean,
	draft: PlanDraft,
): "complete" | "incomplete" {
	const blocked =
		reviewBlocking ||
		draft.openQuestions.some((question) => question.blocking) ||
		draft.testCases.some(
			(testCase) =>
				testCase.automation.readiness === "blocked" ||
				testCase.automation.blockers.length > 0,
		);
	return blocked ? "incomplete" : "complete";
}

/**
 * Assemble + validate, repairing up to `repairBudget` times by re-calling the
 * model with the failing problems. Status is recomputed each attempt so plan and
 * generation status stay in agreement after a repair. Returns the validated
 * graph, or throws (PLAN_INVARIANT_FAILED / MODEL_OUTPUT_INVALID) once the budget
 * is spent — never a partial plan.
 */
async function buildValidGraph(
	deps: EngineDeps,
	ingested: Ingested,
	baseMeta: Omit<AssembleMeta, "status">,
	reviewBlocking: boolean,
	initialDraft: PlanDraft,
	/**
	 * When set (refine), a candidate must also pass
	 * `validatePlanRevisionTransition(transitionBase, candidate)`; its findings join
	 * the validator findings before the repair/throw decision, so an illegal
	 * revision transition is a hard gate inside the bounded-repair loop.
	 */
	transitionBase?: TestGraphV1,
): Promise<{
	graph: TestGraphV1;
	usage: NormalizedUsage;
	status: "complete" | "incomplete";
}> {
	const budget = deps.repairBudget ?? 2;
	let usage = ZERO_USAGE;
	let draft = initialDraft;

	for (let attempt = 0; ; attempt++) {
		const status = computeStatus(reviewBlocking, draft);
		const meta: AssembleMeta = { ...baseMeta, status };

		let problems: string[];
		try {
			const candidate = assemble(ingested, draft, meta);
			const result = validateTestGraph(candidate);
			const transitionFindings =
				result.valid && transitionBase !== undefined
					? validatePlanRevisionTransition(transitionBase, candidate)
					: [];
			if (result.valid && transitionFindings.length === 0) {
				return { graph: result.graph, usage, status };
			}
			const findings = [...result.findings, ...transitionFindings];
			problems = findings.map(
				(finding) => `${finding.code} at ${finding.path}: ${finding.message}`,
			);
			if (attempt >= budget) {
				throw new EngineError(
					"PLAN_INVARIANT_FAILED",
					`Plan failed validation after ${budget} repair attempt(s).`,
					{ findings },
				);
			}
		} catch (err) {
			const engineError = asEngineError(err, "MODEL_OUTPUT_INVALID");
			// PLAN_INVARIANT_FAILED above is terminal; only assemble-level bad output
			// (dangling/duplicate keys) is repairable here.
			if (engineError.code === "PLAN_INVARIANT_FAILED") throw engineError;
			if (attempt >= budget) throw engineError;
			problems = [engineError.message];
		}

		const repair = await runRepairStage(deps, draft, problems);
		usage = addUsage(usage, repair.usage);
		draft = repair.data;
	}
}

/**
 * The coarse create operation. Runs the full internal pipeline (ingest ->
 * optional repo context -> evidence -> requirements -> features -> cases ->
 * details -> independent review -> validate/repair -> persist) and returns the
 * validated, persisted graph. Callers never touch a stage.
 */
export async function createPlan(
	input: CreatePlanInput,
	deps: EngineDeps,
): Promise<CreatePlanResult> {
	const ingested = ingest(input);

	let repo: RepoContext | undefined;
	if (input.repo !== undefined && deps.scan !== undefined) {
		try {
			repo = await deps.scan({ path: input.repo.path });
		} catch (err) {
			throw asEngineError(err, "REPO_ACCESS_DENIED");
		}
	}

	let usage = ZERO_USAGE;
	const track = <T>(stage: { data: T; usage: NormalizedUsage }): T => {
		usage = addUsage(usage, stage.usage);
		return stage.data;
	};

	const evidence = track(await runEvidenceStage(deps, { ingested, repo }));
	const requirements = track(await runRequirementsStage(deps, evidence));
	const features = track(await runFeaturesStage(deps, requirements));
	const cases = track(await runCasesStage(deps, requirements, features));
	const details = track(await runDetailsStage(deps, cases));

	const draft: PlanDraft = {
		evidence: evidence.evidence,
		requirements: requirements.requirements,
		openQuestions: requirements.openQuestions,
		features: features.features,
		testCases: cases.testCases,
		dataRequirements: details.dataRequirements,
		steps: details.steps,
		assertions: details.assertions,
	};

	const review = track(await runReviewStage(deps, draft));
	const warnings = [
		...(repo?.truncated === true
			? [
					"Repository context was truncated; plan may miss repo-derived evidence.",
				]
			: []),
		...review.findings.map(
			(finding) => `[${finding.severity}] ${finding.message}`,
		),
	];

	const timestamp = new Date(deps.now()).toISOString();
	const baseMeta: Omit<AssembleMeta, "status"> = {
		generatedAt: timestamp,
		createdAt: timestamp,
		updatedAt: timestamp,
		methodologyVersion: deps.methodologyVersion ?? METHODOLOGY_VERSION,
		workflowVersion: deps.workflowVersion ?? WORKFLOW_VERSION,
		generator: {
			kind: "model",
			provider: deps.provider.id,
			model: deps.provider.model,
		},
		warnings,
		...(repo?.revision !== undefined && { repositoryRevision: repo.revision }),
	};

	const built = await buildValidGraph(
		deps,
		ingested,
		baseMeta,
		review.blocking,
		draft,
	);
	usage = addUsage(usage, built.usage);
	const graph = built.graph;

	const manifest: GenerationManifest = {
		generatedAt: graph.generation.generatedAt,
		methodologyVersion: graph.generation.methodologyVersion,
		workflowVersion: graph.generation.workflowVersion,
		inputFingerprint: graph.generation.inputFingerprint,
		generator: graph.generation.generator,
		status: built.status,
		warnings,
		usage,
	};
	const planDir = await persistPlan(graph, manifest, deps.workspaceRoot);

	return { graph, planDir, usage, warnings, status: built.status };
}

/** The coarse load operation: read + re-validate a persisted plan by ID. */
export async function loadPlan(
	input: LoadPlanInput,
	deps: { workspaceRoot: string },
): Promise<TestGraphV1> {
	const parsed = planIdSchema.safeParse(input.planId);
	if (!parsed.success) {
		throw new EngineError(
			"INVALID_INPUT",
			`Malformed planId: ${JSON.stringify(input.planId)}.`,
		);
	}
	return readPlan(deps.workspaceRoot, parsed.data);
}

/**
 * Append caller-supplied new sources to a decomposed plan's ingested set, reusing
 * the same canonicalization + plan-scoped stable-id derivation as create. New
 * source identity must not collide with an existing source's key.
 */
function mergeSources(
	ingested: Ingested,
	sources: CreatePlanSource[] | undefined,
): Ingested {
	if (sources === undefined || sources.length === 0) return ingested;

	const merged = [...ingested.sources];
	const seenKeys = new Set(merged.map((source) => source.key));
	for (const source of sources) {
		const content = source.content.trim();
		if (content.length === 0) {
			throw new EngineError(
				"INVALID_INPUT",
				`Source "${source.title}" has empty content.`,
			);
		}
		const key = canonicalKey(source.locator ?? source.title, "source identity");
		if (seenKeys.has(key)) {
			throw new EngineError(
				"INVALID_INPUT",
				`Duplicate source identity "${key}"; give each new source a distinct locator or title.`,
			);
		}
		seenKeys.add(key);
		const node: Source = {
			id: createStableId("source", ingested.planId, key),
			kind: source.kind,
			title: canonicalKey(source.title, "source.title"),
			supplied: true,
			...(source.locator !== undefined && {
				locator: canonicalKey(source.locator, "source.locator"),
			}),
		};
		merged.push({ key, id: node.id, node, content });
	}
	return { ...ingested, sources: merged };
}

/**
 * The coarse refine operation. Loads an existing plan, re-plans it from scoped
 * feedback, and atomically replaces the on-disk plan with a `planVersion + 1`
 * revision that passes both `validateTestGraph` and
 * `validatePlanRevisionTransition`. Refuses with `ARTIFACT_CONFLICT` when the plan
 * changed under the caller, and never corrupts or partially overwrites the
 * previous revision. Callers never touch a stage.
 */
export async function refinePlan(
	input: RefinePlanInput,
	deps: EngineDeps,
): Promise<RefinePlanResult> {
	const parsedId = planIdSchema.safeParse(input.planId);
	if (!parsedId.success) {
		throw new EngineError(
			"INVALID_INPUT",
			`Malformed planId: ${JSON.stringify(input.planId)}.`,
		);
	}
	const feedback = input.feedback.trim();
	if (feedback.length === 0) {
		throw new EngineError("INVALID_INPUT", "feedback must not be empty.");
	}

	const previous = await readPlan(deps.workspaceRoot, parsedId.data);

	// Fail fast on a stale version before any model spend.
	if (
		input.expectedVersion !== undefined &&
		input.expectedVersion !== previous.planVersion
	) {
		throw new EngineError(
			"ARTIFACT_CONFLICT",
			`Plan ${previous.planId} changed since it was loaded: expected v${input.expectedVersion}, found v${previous.planVersion}.`,
		);
	}

	const decomposed = decomposePlan(previous);
	const ingested = mergeSources(decomposed.ingested, input.sources);

	let usage = ZERO_USAGE;
	const track = <T>(stage: { data: T; usage: NormalizedUsage }): T => {
		usage = addUsage(usage, stage.usage);
		return stage.data;
	};

	const draft = track(await runRefineStage(deps, decomposed.draft, feedback));
	const review = track(await runReviewStage(deps, draft));
	const warnings = review.findings.map(
		(finding) => `[${finding.severity}] ${finding.message}`,
	);

	const nextVersion = previous.planVersion + 1;
	const timestamp = new Date(deps.now()).toISOString();
	const baseMeta: Omit<AssembleMeta, "status"> = {
		generatedAt: timestamp,
		createdAt: previous.createdAt,
		updatedAt: timestamp,
		methodologyVersion: deps.methodologyVersion ?? METHODOLOGY_VERSION,
		workflowVersion: deps.workflowVersion ?? WORKFLOW_VERSION,
		generator: {
			kind: "model",
			provider: deps.provider.id,
			model: deps.provider.model,
		},
		warnings,
		planVersion: nextVersion,
		generationKey: `revision-${nextVersion}`,
		...(previous.generation.repositoryRevision !== undefined && {
			repositoryRevision: previous.generation.repositoryRevision,
		}),
	};

	const built = await buildValidGraph(
		deps,
		ingested,
		baseMeta,
		review.blocking,
		draft,
		previous,
	);
	usage = addUsage(usage, built.usage);
	const graph = built.graph;

	const manifest: GenerationManifest = {
		generatedAt: graph.generation.generatedAt,
		methodologyVersion: graph.generation.methodologyVersion,
		workflowVersion: graph.generation.workflowVersion,
		inputFingerprint: graph.generation.inputFingerprint,
		generator: graph.generation.generator,
		status: built.status,
		warnings,
		usage,
	};
	const planDir = await persistRevision(graph, manifest, deps.workspaceRoot, {
		expectedVersion: input.expectedVersion ?? previous.planVersion,
	});

	return {
		graph,
		planDir,
		usage,
		warnings,
		status: built.status,
		previousVersion: previous.planVersion,
	};
}
