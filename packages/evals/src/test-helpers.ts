import { parseTestGraph, serializeTestGraph } from "@test-framework/qa-engine";
import {
	type AnnoSpec,
	buildAnnotation,
	compileGraph,
	type GraphDraft,
} from "./corpus/builders.js";
import { scoreCandidate } from "./harness/score-candidate.js";
import { buildContext, type CandidateContext } from "./join.js";
import { type Fixture, fixtureSchema } from "./schema/fixture.js";
import type { CandidateResult } from "./schema/result.js";
import {
	type Rubric,
	rubricSchema,
	type Thresholds,
	thresholdsSchema,
} from "./schema/rubric.js";

export const RUBRIC: Rubric = rubricSchema.parse({
	evalSchemaVersion: "eval/v1",
	riskWeight: { low: 1, medium: 2, high: 3 },
	priorityWeight: { p0: 4, p1: 3, p2: 2, p3: 1 },
	dimensionWeights: {
		requirementRecall: 0.18,
		scenarioCoverage: 0.18,
		unsupportedClaims: 0.15,
		traceability: 0.12,
		assertionQuality: 0.12,
		executionReadiness: 0.1,
		evidenceCorrectness: 0.08,
		duplicateLowValue: 0.04,
		provenanceAccuracy: 0.03,
	},
});

export const THRESHOLDS: Thresholds = thresholdsSchema.parse({
	evalSchemaVersion: "eval/v1",
	maxUnsupportedRate: 0.15,
	minOverall: 0,
	maxRegressionDelta: 0,
	maxUnsupportedRegressionDelta: 0,
});

/** A minimal one-requirement, one-scenario fixture for unit tests. */
export function baseFixture(): Fixture {
	return fixtureSchema.parse({
		evalSchemaVersion: "eval/v1",
		fixtureId: "unit",
		title: "Unit fixture",
		category: "ui-form",
		brief: "A unit-test fixture.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "feature-request",
				title: "Spec",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:a",
				statement: "Requirement A.",
				kind: "functional",
				expectedStrength: "explicit",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:a",
				title: "Scenario A.",
				requirementKeys: ["req:a"],
				type: "positive",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "status 200",
			},
		],
		forbiddenClaims: [],
	});
}

const anon = {
	role: "user",
	authentication: "anonymous" as const,
	permissions: [] as string[],
};

/** A minimal valid draft covering req:a / scn:a; override `cases` to vary it. */
export function baseDraft(overrides: Partial<GraphDraft> = {}): GraphDraft {
	return {
		fixtureId: "unit",
		arm: "qa-engine",
		title: "Unit plan",
		status: "complete",
		generator: {
			kind: "model",
			provider: "anthropic",
			model: "claude-opus-4-8",
		},
		generationStatus: "complete",
		sources: [
			{ ref: "spec", kind: "feature-request", title: "Spec", supplied: true },
		],
		evidence: [
			{
				ref: "e1",
				sourceRef: "spec",
				kind: "statement",
				claim: "Requirement A holds.",
			},
		],
		requirements: [
			{
				ref: "a",
				statement: "Requirement A.",
				kind: "functional",
				strength: "explicit",
				evidenceRefs: ["e1"],
				priority: "p1",
				risk: "medium",
			},
		],
		cases: [
			{
				ref: "c1",
				title: "Covers A",
				objective: "Verify A.",
				type: "positive",
				priority: "p1",
				risk: "medium",
				riskRationale: "Core.",
				strength: "explicit",
				evidenceRefs: ["e1"],
				requirementRefs: ["a"],
				qualityTags: ["functional"],
				actor: anon,
				target: { kind: "api", method: "GET", path: "/a" },
				steps: [
					{
						description: "Call A.",
						action: { kind: "request", method: "GET", path: "/a" },
						strength: "explicit",
						evidenceRefs: ["e1"],
					},
				],
				assertions: [
					{
						ref: "c1a",
						subject: "status",
						observationPoint: { kind: "api", method: "GET", path: "/a" },
						matcher: "statusCode",
						expected: 200,
						strength: "explicit",
						evidenceRefs: ["e1"],
						stepRef: "1",
					},
				],
			},
		],
		...overrides,
	};
}

export function baseAnno(overrides: Partial<AnnoSpec> = {}): AnnoSpec {
	return {
		recordKind: "synthetic",
		expectValidationFailure: false,
		requirements: [
			{ ref: "a", map: { keys: ["req:a"], satisfaction: "full" } },
		],
		cases: [{ ref: "c1", map: { keys: ["scn:a"], satisfaction: "full" } }],
		...overrides,
	};
}

export function makeContext(
	fixture: Fixture,
	draft: GraphDraft,
	anno: AnnoSpec,
): CandidateContext {
	const { graph, idOf } = compileGraph(draft);
	const annotation = buildAnnotation(draft, idOf, anno);
	return buildContext(fixture, parseTestGraph(graph), annotation, RUBRIC);
}

export function scoreOne(
	fixture: Fixture,
	draft: GraphDraft,
	anno: AnnoSpec,
): CandidateResult {
	const { graph, idOf } = compileGraph(draft);
	const annotation = buildAnnotation(draft, idOf, anno);
	const valid = (() => {
		try {
			return serializeTestGraph(graph);
		} catch {
			return JSON.stringify(graph);
		}
	})();
	return scoreCandidate({
		arm: "qa-engine",
		fixture,
		annotation,
		graphInput: graph,
		leakageText: valid,
		rubric: RUBRIC,
		thresholds: THRESHOLDS,
	});
}
