import type { Assertion } from "../test-graph/assertions.js";
import type { Provenance } from "../test-graph/common.js";
import {
	createStableId,
	type DataRequirementId,
	type EvidenceId,
	type FeatureId,
	type GraphIdByKind,
	type IdKind,
	idPrefixes,
	type OpenQuestionId,
	type RequirementId,
	type SourceId,
	type StepId,
	type TestCaseId,
} from "../test-graph/ids.js";
import type {
	DataRequirement,
	Evidence,
	Feature,
	GenerationMetadata,
	OpenQuestion,
	Requirement,
	Step,
	TestCase,
	TestGraphV1,
} from "../test-graph/schema.js";
import { TEST_GRAPH_SCHEMA_VERSION } from "../test-graph/version.js";
import type { PlanDraft, ProvenanceDraft } from "./drafts.js";
import { EngineError } from "./errors.js";
import type { Ingested } from "./identity.js";

export interface AssembleMeta {
	generatedAt: string;
	createdAt: string;
	updatedAt: string;
	methodologyVersion: string;
	workflowVersion: string;
	generator:
		| { kind: "manual" }
		| { kind: "model"; provider: string; model: string };
	status: "complete" | "incomplete";
	warnings: string[];
	repositoryRevision?: string;
	/** Plan revision number. Defaults to 1 so the v1 create path is unchanged. */
	planVersion?: number;
	/**
	 * Per-revision key for the generation node's stable id. Defaults to "initial"
	 * so the v1 create path keeps byte-identical output; refine passes
	 * "revision-2", "revision-3", … so each generation event gets a distinct id.
	 */
	generationKey?: string;
}

const ID_HEX_LENGTH = 20;

/**
 * Assign a stable id, treating a key that is already a well-formed id of `kind`
 * as a final id passed through verbatim. `createStableId` is not idempotent over
 * its own output, so refinement (which re-keys loaded entities by their existing
 * id — see decompose.ts) relies on this passthrough to keep entity ids constant
 * across a revision (the ADR-0007 identity invariant). Create-path keys are
 * slugs (never id-shaped), so they always hash and the v1 path is unchanged.
 */
function stableId<TKind extends IdKind>(
	kind: TKind,
	scopeId: string,
	key: string,
): GraphIdByKind[TKind] {
	const idPattern = new RegExp(
		`^${idPrefixes[kind]}_[0-9a-f]{${ID_HEX_LENGTH}}$`,
	);
	if (idPattern.test(key)) return key as GraphIdByKind[TKind];
	return createStableId(kind, scopeId, key);
}

/** Canonicalize a model-emitted key; an empty/whitespace key is bad model output. */
function normKey(value: string): string {
	const canonical = value.trim().normalize("NFC");
	if (canonical.length === 0) {
		throw new EngineError(
			"MODEL_OUTPUT_INVALID",
			"Model emitted an empty key.",
		);
	}
	return canonical;
}

function resolve<TId>(map: Map<string, TId>, key: string, kind: string): TId {
	const id = map.get(normKey(key));
	if (id === undefined) {
		throw new EngineError(
			"MODEL_OUTPUT_INVALID",
			`Reference to unknown ${kind} "${key}".`,
		);
	}
	return id;
}

/** Build a key→ID map, rejecting duplicate keys within a stage as bad output. */
function buildMap<TId>(
	items: ReadonlyArray<{ key: string }>,
	kind: string,
	make: (key: string) => TId,
): Map<string, TId> {
	const map = new Map<string, TId>();
	for (const item of items) {
		const key = normKey(item.key);
		if (map.has(key)) {
			throw new EngineError(
				"MODEL_OUTPUT_INVALID",
				`Duplicate ${kind} key "${key}".`,
			);
		}
		map.set(key, make(key));
	}
	return map;
}

/**
 * Deterministically turn a slug-keyed draft into a Test Graph: assign every ID
 * via createStableId, resolve cross-stage references by key, and attach
 * generation metadata. Pure and order-independent — the same draft + meta always
 * produces the same graph. The graph is NOT validated here; callers run
 * validateTestGraph and route findings to bounded repair.
 */
export function assemble(
	ingested: Ingested,
	draft: PlanDraft,
	meta: AssembleMeta,
): TestGraphV1 {
	const { planId, projectId } = ingested;

	const sourceMap = new Map<string, SourceId>(
		ingested.sources.map((source) => [source.key, source.id]),
	);
	const evidenceMap = buildMap<EvidenceId>(draft.evidence, "evidence", (key) =>
		stableId("evidence", planId, key),
	);
	const openQuestionMap = buildMap<OpenQuestionId>(
		draft.openQuestions,
		"open question",
		(key) => stableId("openQuestion", planId, key),
	);
	const requirementMap = buildMap<RequirementId>(
		draft.requirements,
		"requirement",
		(key) => stableId("requirement", planId, key),
	);
	const featureMap = buildMap<FeatureId>(draft.features, "feature", (key) =>
		stableId("feature", planId, key),
	);
	const caseMap = buildMap<TestCaseId>(draft.testCases, "test case", (key) =>
		stableId("testCase", planId, key),
	);
	const dataMap = buildMap<DataRequirementId>(
		draft.dataRequirements,
		"data requirement",
		(key) => stableId("dataRequirement", planId, key),
	);
	// Steps and assertions are scoped by their case ID, so resolve the case first.
	const stepMap = new Map<string, StepId>();
	for (const step of draft.steps) {
		const key = normKey(step.key);
		if (stepMap.has(key)) {
			throw new EngineError(
				"MODEL_OUTPUT_INVALID",
				`Duplicate step key "${key}".`,
			);
		}
		const caseId = resolve(caseMap, step.caseKey, "testCase");
		stepMap.set(key, stableId("step", caseId, key));
	}

	const resolveProvenance = (provenance: ProvenanceDraft): Provenance => {
		const evidenceIds = provenance.evidenceKeys.map((key) =>
			resolve(evidenceMap, key, "evidence"),
		);
		if (provenance.kind === "assumption") {
			return {
				kind: "assumption",
				evidenceIds,
				rationale: provenance.rationale,
			};
		}
		return {
			kind: provenance.kind,
			evidenceIds,
			...(provenance.rationale !== undefined && {
				rationale: provenance.rationale,
			}),
		};
	};

	const evidence: Evidence[] = draft.evidence.map((item) => ({
		id: resolve(evidenceMap, item.key, "evidence"),
		sourceId: resolve(sourceMap, item.sourceKey, "source"),
		kind: item.kind,
		claim: item.claim,
		...(item.excerpt !== undefined && { excerpt: item.excerpt }),
	}));

	const openQuestions: OpenQuestion[] = draft.openQuestions.map((item) => ({
		id: resolve(openQuestionMap, item.key, "openQuestion"),
		question: item.question,
		status: item.status,
		blocking: item.blocking,
		...(item.answer !== undefined && { answer: item.answer }),
		provenance: resolveProvenance(item.provenance),
		blockedEntityRefs: [],
	}));

	const requirements: Requirement[] = draft.requirements.map((item) => ({
		id: resolve(requirementMap, item.key, "requirement"),
		statement: item.statement,
		kind: item.kind,
		provenance: resolveProvenance(item.provenance),
		priority: item.priority,
		risk: item.risk,
		openQuestionIds: item.openQuestionKeys.map((key) =>
			resolve(openQuestionMap, key, "openQuestion"),
		),
	}));

	const features: Feature[] = draft.features.map((item) => ({
		id: resolve(featureMap, item.key, "feature"),
		name: item.name,
		description: item.description,
		...(item.parentKey !== undefined && {
			parentFeatureId: resolve(featureMap, item.parentKey, "feature"),
		}),
		requirementIds: item.requirementKeys.map((key) =>
			resolve(requirementMap, key, "requirement"),
		),
		targets: item.targets,
		provenance: resolveProvenance(item.provenance),
		risk: item.risk,
	}));

	const testCases: TestCase[] = draft.testCases.map((item) => ({
		id: resolve(caseMap, item.key, "testCase"),
		title: item.title,
		objective: item.objective,
		type: item.type,
		priority: item.priority,
		risk: item.risk,
		riskRationale: item.riskRationale,
		provenance: resolveProvenance(item.provenance),
		requirementIds: item.requirementKeys.map((key) =>
			resolve(requirementMap, key, "requirement"),
		),
		featureIds: item.featureKeys.map((key) =>
			resolve(featureMap, key, "feature"),
		),
		qualityTags: item.qualityTags,
		actor: item.actor,
		target: item.target,
		preconditions: item.preconditions,
		dependsOnCaseIds: item.dependsOnCaseKeys.map((key) =>
			resolve(caseMap, key, "testCase"),
		),
		consumesDataRequirementIds: item.consumesDataKeys.map((key) =>
			resolve(dataMap, key, "dataRequirement"),
		),
		producesDataRequirementIds: item.producesDataKeys.map((key) =>
			resolve(dataMap, key, "dataRequirement"),
		),
		postconditions: item.postconditions,
		cleanup: {
			intent: item.cleanup.intent,
			dataRequirementIds: item.cleanup.dataKeys.map((key) =>
				resolve(dataMap, key, "dataRequirement"),
			),
			afterCaseIds: item.cleanup.afterCaseKeys.map((key) =>
				resolve(caseMap, key, "testCase"),
			),
			...(item.cleanup.instructions !== undefined && {
				instructions: item.cleanup.instructions,
			}),
		},
		automation: item.automation,
	}));

	const dataRequirements: DataRequirement[] = draft.dataRequirements.map(
		(item) => ({
			id: resolve(dataMap, item.key, "dataRequirement"),
			name: item.name,
			description: item.description,
			kind: item.kind,
			provisioning: item.provisioning,
			sensitivity: item.sensitivity,
			provenance: resolveProvenance(item.provenance),
			...(item.requiredState !== undefined && {
				requiredState: item.requiredState,
			}),
		}),
	);

	const steps: Step[] = draft.steps.map((item) => ({
		id: resolve(stepMap, item.key, "step"),
		testCaseId: resolve(caseMap, item.caseKey, "testCase"),
		order: item.order,
		description: item.description,
		action: item.action,
		provenance: resolveProvenance(item.provenance),
	}));

	const assertions: Assertion[] = draft.assertions.map((item) => {
		const testCaseId = resolve(caseMap, item.caseKey, "testCase");
		// ponytail: passthrough matcher payload; validateTestGraph's assertionSchema
		// is the gate on matcher/expected agreement and routes bad ones to repair.
		return {
			id: stableId("assertion", testCaseId, normKey(item.key)),
			testCaseId,
			...(item.stepKey !== undefined && {
				stepId: resolve(stepMap, item.stepKey, "step"),
			}),
			provenance: resolveProvenance(item.provenance),
			subject: item.subject,
			observationPoint: item.observationPoint,
			...(item.note !== undefined && { note: item.note }),
			matcher: item.matcher,
			...(item.expected !== undefined && { expected: item.expected }),
			...(item.pattern !== undefined && { pattern: item.pattern }),
			...(item.flags !== undefined && { flags: item.flags }),
			...(item.schemaRef !== undefined && { schemaRef: item.schemaRef }),
		} as Assertion;
	});

	const generation: GenerationMetadata = {
		id: createStableId("generation", planId, meta.generationKey ?? "initial"),
		generatedAt: meta.generatedAt,
		methodologyVersion: meta.methodologyVersion,
		workflowVersion: meta.workflowVersion,
		inputFingerprint: ingested.inputFingerprint,
		...(meta.repositoryRevision !== undefined && {
			repositoryRevision: meta.repositoryRevision,
		}),
		generator: meta.generator,
		status: meta.status,
		warnings: meta.warnings,
	};

	return {
		schemaVersion: TEST_GRAPH_SCHEMA_VERSION,
		projectId,
		planId,
		planVersion: meta.planVersion ?? 1,
		title: ingested.title,
		status: meta.status,
		createdAt: meta.createdAt,
		updatedAt: meta.updatedAt,
		generation,
		sources: ingested.sources.map((source) => source.node),
		evidence,
		requirements,
		features,
		testCases,
		steps,
		assertions,
		dataRequirements,
		openQuestions,
	};
}
