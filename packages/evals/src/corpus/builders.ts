import {
	type Action,
	type Assertion,
	createStableId,
	type EvidenceLocator,
	type GenerationMetadata,
	type PlanStatus,
	type Priority,
	type Provenance,
	type QualityTag,
	type RequirementKind,
	type Risk,
	type Target,
	type TestCaseType,
	type TestGraphV1,
} from "@test-framework/qa-engine";
import {
	type Annotation,
	annotationSchema,
	type ExtraClassification,
	type Satisfaction,
} from "../schema/annotation.js";
import type { Arm, RecordKind } from "../schema/common.js";

type Strength = "explicit" | "inferred" | "assumption";

type ProvenanceDraft = {
	strength: Strength;
	evidenceRefs?: string[];
	rationale?: string;
};

type SourceDraft = {
	ref: string;
	kind: TestGraphV1["sources"][number]["kind"];
	title: string;
	supplied: boolean;
	locator?: string;
};

type EvidenceDraft = {
	ref: string;
	sourceRef: string;
	kind: TestGraphV1["evidence"][number]["kind"];
	claim: string;
	locator?: EvidenceLocator;
};

type RequirementDraft = ProvenanceDraft & {
	ref: string;
	statement: string;
	kind: RequirementKind;
	priority: Priority;
	risk: Risk;
};

type FeatureDraft = ProvenanceDraft & {
	ref: string;
	name: string;
	description: string;
	requirementRefs: string[];
	targets: Target[];
	risk: Risk;
};

type DataDraft = ProvenanceDraft & {
	ref: string;
	name: string;
	description: string;
	kind: TestGraphV1["dataRequirements"][number]["kind"];
	provisioning: TestGraphV1["dataRequirements"][number]["provisioning"];
	sensitivity: TestGraphV1["dataRequirements"][number]["sensitivity"];
};

type StepDraft = { description: string; action: Action } & ProvenanceDraft;

// Distributive Omit so per-matcher fields (expected/pattern/schemaRef) survive
// instead of collapsing to the union's common keys.
type DistributiveOmit<T, K extends keyof T> = T extends unknown
	? Omit<T, K>
	: never;
type AssertionMatcher = DistributiveOmit<
	Assertion,
	"id" | "testCaseId" | "stepId" | "provenance"
>;
type AssertionDraft = AssertionMatcher &
	ProvenanceDraft & { ref: string; stepRef?: string };

type CaseDraft = ProvenanceDraft & {
	ref: string;
	title: string;
	objective: string;
	type: TestCaseType;
	priority: Priority;
	risk: Risk;
	riskRationale: string;
	requirementRefs: string[];
	featureRefs?: string[];
	qualityTags: QualityTag[];
	actor: TestGraphV1["testCases"][number]["actor"];
	target: Target;
	preconditions?: TestGraphV1["testCases"][number]["preconditions"];
	dependsOnRefs?: string[];
	consumesRefs?: string[];
	producesRefs?: string[];
	postconditions?: TestGraphV1["testCases"][number]["postconditions"];
	cleanup?: TestGraphV1["testCases"][number]["cleanup"];
	automation?: TestGraphV1["testCases"][number]["automation"];
	steps: StepDraft[];
	assertions: AssertionDraft[];
};

export type GraphDraft = {
	fixtureId: string;
	arm: string;
	title: string;
	status: PlanStatus;
	generator: GenerationMetadata["generator"];
	generationStatus: GenerationMetadata["status"];
	sources: SourceDraft[];
	evidence: EvidenceDraft[];
	requirements: RequirementDraft[];
	features?: FeatureDraft[];
	data?: DataDraft[];
	cases: CaseDraft[];
};

export type IdResolver = (kind: string, ref: string) => string;

const ts = "2026-06-15T10:00:00.000Z";

function provenance(draft: ProvenanceDraft, idOf: IdResolver): Provenance {
	const evidenceIds = (draft.evidenceRefs ?? []).map((ref) =>
		idOf("evidence", ref),
	);
	if (draft.strength === "assumption") {
		return {
			kind: "assumption",
			evidenceIds,
			rationale: draft.rationale ?? "Stated assumption.",
		} as unknown as Provenance;
	}
	if (draft.strength === "inferred") {
		return (draft.rationale === undefined
			? { kind: "inferred", evidenceIds }
			: {
					kind: "inferred",
					evidenceIds,
					rationale: draft.rationale,
				}) as unknown as Provenance;
	}
	return { kind: "explicit", evidenceIds } as unknown as Provenance;
}

/**
 * Compiles a compact draft into a real `test-graph/v1` graph with deterministic
 * stable IDs, plus an `idOf` resolver so the matching Annotation can be authored
 * against the same entities. The assembled object is branded via a cast and is
 * always validated by the corpus builder before it is written.
 */
export function compileGraph(draft: GraphDraft): {
	graph: TestGraphV1;
	idOf: IdResolver;
} {
	const projectId = createStableId(
		"project",
		"test-framework",
		draft.fixtureId,
	);
	const planId = createStableId("plan", projectId, draft.arm);
	const idOf: IdResolver = (kind, ref) =>
		createStableId(
			kind as Parameters<typeof createStableId>[0],
			planId,
			`${kind}:${ref}`,
		);

	const graph = {
		schemaVersion: "test-graph/v1",
		projectId,
		planId,
		planVersion: 1,
		title: draft.title,
		status: draft.status,
		createdAt: ts,
		updatedAt: ts,
		generation: {
			id: createStableId("generation", planId, "gen"),
			generatedAt: ts,
			methodologyVersion: "0.1.0",
			workflowVersion: "0.1.0",
			inputFingerprint: `sha256:${draft.fixtureId}-${draft.arm}`,
			generator: draft.generator,
			status: draft.generationStatus,
			warnings: [],
		},
		sources: draft.sources.map((source) => ({
			id: idOf("source", source.ref),
			kind: source.kind,
			title: source.title,
			supplied: source.supplied,
			...(source.locator !== undefined ? { locator: source.locator } : {}),
		})),
		evidence: draft.evidence.map((evidence) => ({
			id: idOf("evidence", evidence.ref),
			sourceId: idOf("source", evidence.sourceRef),
			kind: evidence.kind,
			claim: evidence.claim,
			...(evidence.locator !== undefined ? { locator: evidence.locator } : {}),
		})),
		requirements: draft.requirements.map((requirement) => ({
			id: idOf("requirement", requirement.ref),
			statement: requirement.statement,
			kind: requirement.kind,
			provenance: provenance(requirement, idOf),
			priority: requirement.priority,
			risk: requirement.risk,
			openQuestionIds: [],
		})),
		features: (draft.features ?? []).map((feature) => ({
			id: idOf("feature", feature.ref),
			name: feature.name,
			description: feature.description,
			requirementIds: feature.requirementRefs.map((ref) =>
				idOf("requirement", ref),
			),
			targets: feature.targets,
			provenance: provenance(feature, idOf),
			risk: feature.risk,
		})),
		dataRequirements: (draft.data ?? []).map((data) => ({
			id: idOf("dataRequirement", data.ref),
			name: data.name,
			description: data.description,
			kind: data.kind,
			provisioning: data.provisioning,
			sensitivity: data.sensitivity,
			provenance: provenance(data, idOf),
		})),
		testCases: draft.cases.map((testCase) => ({
			id: idOf("testCase", testCase.ref),
			title: testCase.title,
			objective: testCase.objective,
			type: testCase.type,
			priority: testCase.priority,
			risk: testCase.risk,
			riskRationale: testCase.riskRationale,
			provenance: provenance(testCase, idOf),
			requirementIds: testCase.requirementRefs.map((ref) =>
				idOf("requirement", ref),
			),
			featureIds: (testCase.featureRefs ?? []).map((ref) =>
				idOf("feature", ref),
			),
			qualityTags: testCase.qualityTags,
			actor: testCase.actor,
			target: testCase.target,
			preconditions: testCase.preconditions ?? [],
			dependsOnCaseIds: (testCase.dependsOnRefs ?? []).map((ref) =>
				idOf("testCase", ref),
			),
			consumesDataRequirementIds: (testCase.consumesRefs ?? []).map((ref) =>
				idOf("dataRequirement", ref),
			),
			producesDataRequirementIds: (testCase.producesRefs ?? []).map((ref) =>
				idOf("dataRequirement", ref),
			),
			postconditions: testCase.postconditions ?? [],
			cleanup: testCase.cleanup ?? {
				intent: "none",
				dataRequirementIds: [],
				afterCaseIds: [],
			},
			automation: testCase.automation ?? { readiness: "ready", blockers: [] },
		})),
		steps: draft.cases.flatMap((testCase) =>
			testCase.steps.map((step, index) => ({
				id: idOf("step", `${testCase.ref}:${index + 1}`),
				testCaseId: idOf("testCase", testCase.ref),
				order: index + 1,
				description: step.description,
				action: step.action,
				provenance: provenance(step, idOf),
			})),
		),
		assertions: draft.cases.flatMap((testCase) =>
			testCase.assertions.map((assertion) => {
				const stepId =
					assertion.stepRef !== undefined
						? { stepId: idOf("step", `${testCase.ref}:${assertion.stepRef}`) }
						: {};
				const { ref, stepRef, strength, evidenceRefs, rationale, ...matcher } =
					assertion;
				void ref;
				void stepRef;
				void strength;
				void evidenceRefs;
				void rationale;
				return {
					id: idOf("assertion", assertion.ref),
					testCaseId: idOf("testCase", testCase.ref),
					provenance: provenance(assertion, idOf),
					...stepId,
					...matcher,
				};
			}),
		),
		openQuestions: [],
	};

	return { graph: graph as unknown as TestGraphV1, idOf };
}

type MapSpec = { keys: string[]; satisfaction: Satisfaction; reason?: string };
type ExtraSpec = { classification: ExtraClassification; reason: string };

type EntityAnnoSpec = {
	ref: string;
	map?: MapSpec;
	extra?: ExtraSpec;
	supportsCitedEvidence?: boolean;
};

export type AnnoSpec = {
	recordKind: RecordKind;
	expectValidationFailure: boolean;
	requirements: EntityAnnoSpec[];
	cases: EntityAnnoSpec[];
	assertions?: {
		ref: string;
		supportsCitedEvidence: boolean;
		reason?: string;
	}[];
};

function entityAnnotation(
	kind: "requirement" | "testCase",
	idField: "requirementId" | "caseId",
	spec: EntityAnnoSpec,
	idOf: IdResolver,
): unknown {
	const id = idOf(kind, spec.ref);
	if (spec.extra !== undefined) {
		return {
			[idField]: id,
			verdict: "extra",
			classification: spec.extra.classification,
			reason: spec.extra.reason,
			...(spec.supportsCitedEvidence !== undefined
				? { supportsCitedEvidence: spec.supportsCitedEvidence }
				: {}),
		};
	}
	if (spec.map === undefined) {
		throw new Error(`annotation for ${kind} ${spec.ref} needs map or extra`);
	}
	return {
		[idField]: id,
		verdict: "maps",
		truthKeys: spec.map.keys,
		satisfaction: spec.map.satisfaction,
		...(spec.map.reason !== undefined ? { reason: spec.map.reason } : {}),
		...(spec.supportsCitedEvidence !== undefined
			? { supportsCitedEvidence: spec.supportsCitedEvidence }
			: {}),
	};
}

/**
 * Builds and validates the Annotation for a compiled draft. Throws if the spec
 * does not annotate every Candidate requirement and case, so an incomplete
 * annotation fails at authoring time rather than as a runtime integrity Hard-Fail.
 */
export function buildAnnotation(
	draft: GraphDraft,
	idOf: IdResolver,
	spec: AnnoSpec,
): Annotation {
	const requirementRefs = new Set(draft.requirements.map((item) => item.ref));
	const caseRefs = new Set(draft.cases.map((item) => item.ref));
	for (const item of spec.requirements) requirementRefs.delete(item.ref);
	for (const item of spec.cases) caseRefs.delete(item.ref);
	if (requirementRefs.size > 0 || caseRefs.size > 0) {
		throw new Error(
			`annotation for ${draft.fixtureId}/${draft.arm} misses refs: ${[...requirementRefs, ...caseRefs].join(", ")}`,
		);
	}

	const object = {
		evalSchemaVersion: "eval/v1",
		fixtureId: draft.fixtureId,
		arm: draft.arm as Arm,
		recordKind: spec.recordKind,
		expectValidationFailure: spec.expectValidationFailure,
		sourceAnnotations: draft.sources.map((source) => ({
			sourceId: idOf("source", source.ref),
			sourceKey: source.ref,
		})),
		requirementAnnotations: spec.requirements.map((item) =>
			entityAnnotation("requirement", "requirementId", item, idOf),
		),
		caseAnnotations: spec.cases.map((item) =>
			entityAnnotation("testCase", "caseId", item, idOf),
		),
		...(spec.assertions !== undefined
			? {
					assertionAnnotations: spec.assertions.map((item) => ({
						assertionId: idOf("assertion", item.ref),
						supportsCitedEvidence: item.supportsCitedEvidence,
						...(item.reason !== undefined ? { reason: item.reason } : {}),
					})),
				}
			: {}),
	};

	return annotationSchema.parse(object);
}
