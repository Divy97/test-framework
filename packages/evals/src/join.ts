import type { Assertion, Step, TestGraphV1 } from "@test-framework/qa-engine";
import type {
	Annotation,
	AssertionAnnotation,
	CaseAnnotation,
	RequirementAnnotation,
	SourceAnnotation,
} from "./schema/annotation.js";
import type { Fixture } from "./schema/fixture.js";
import type { Rubric } from "./schema/rubric.js";

/** A single dimension's score in [0,1] plus human-readable explanation lines. */
export type DimensionResult = { score: number; explain: string[] };

export type RequirementCoverage = "covered" | "partial" | "missed";

/**
 * Everything a scorer needs for one Candidate, indexed once. The graph is already
 * validated; annotations are keyed by the Candidate entity id they target.
 */
export type CandidateContext = {
	fixture: Fixture;
	graph: TestGraphV1;
	annotation: Annotation;
	rubric: Rubric;
	sourceAnnoById: Map<string, SourceAnnotation>;
	requirementAnnoById: Map<string, RequirementAnnotation>;
	caseAnnoById: Map<string, CaseAnnotation>;
	assertionAnnoById: Map<string, AssertionAnnotation>;
};

export function buildContext(
	fixture: Fixture,
	graph: TestGraphV1,
	annotation: Annotation,
	rubric: Rubric,
): CandidateContext {
	const sourceAnnoById = new Map<string, SourceAnnotation>();
	for (const item of annotation.sourceAnnotations) {
		sourceAnnoById.set(item.sourceId, item);
	}
	const requirementAnnoById = new Map<string, RequirementAnnotation>();
	for (const item of annotation.requirementAnnotations) {
		requirementAnnoById.set(item.requirementId, item);
	}
	const caseAnnoById = new Map<string, CaseAnnotation>();
	for (const item of annotation.caseAnnotations) {
		caseAnnoById.set(item.caseId, item);
	}
	const assertionAnnoById = new Map<string, AssertionAnnotation>();
	for (const item of annotation.assertionAnnotations ?? []) {
		assertionAnnoById.set(item.assertionId, item);
	}
	return {
		fixture,
		graph,
		annotation,
		rubric,
		sourceAnnoById,
		requirementAnnoById,
		caseAnnoById,
		assertionAnnoById,
	};
}

/** truthKey -> the strongest coverage any mapped Candidate requirement provides. */
export function requirementCoverage(
	ctx: CandidateContext,
): Map<string, RequirementCoverage> {
	const coverage = new Map<string, RequirementCoverage>();
	for (const requirement of ctx.fixture.expectedRequirements) {
		coverage.set(requirement.truthKey, "missed");
	}
	for (const item of ctx.annotation.requirementAnnotations) {
		if (item.verdict !== "maps") continue;
		for (const truthKey of item.truthKeys) {
			if (!coverage.has(truthKey)) continue;
			if (item.satisfaction === "full") {
				coverage.set(truthKey, "covered");
			} else if (coverage.get(truthKey) !== "covered") {
				coverage.set(truthKey, "partial");
			}
		}
	}
	return coverage;
}

/** Candidate requirement id -> requirement truth keys it maps to. */
function requirementTruthKeysById(
	ctx: CandidateContext,
): Map<string, string[]> {
	const byId = new Map<string, string[]>();
	for (const item of ctx.annotation.requirementAnnotations) {
		if (item.verdict === "maps") byId.set(item.requirementId, item.truthKeys);
	}
	return byId;
}

/**
 * Requirement truth keys that are not merely stated but actually exercised by a
 * Candidate case (via the graph `requirementIds` join). Distinguishes a plan that
 * lists a requirement from one that writes a case for it.
 */
export function testedRequirementKeys(ctx: CandidateContext): Set<string> {
	const truthKeysByReqId = requirementTruthKeysById(ctx);
	const tested = new Set<string>();
	for (const testCase of ctx.graph.testCases) {
		for (const requirementId of testCase.requirementIds) {
			for (const truthKey of truthKeysByReqId.get(requirementId) ?? []) {
				tested.add(truthKey);
			}
		}
	}
	return tested;
}

/** Assertions grouped by their owning test case id, in graph order. */
export function assertionsByCase(graph: TestGraphV1): Map<string, Assertion[]> {
	const byCase = new Map<string, Assertion[]>();
	for (const assertion of graph.assertions) {
		const bucket = byCase.get(assertion.testCaseId) ?? [];
		bucket.push(assertion);
		byCase.set(assertion.testCaseId, bucket);
	}
	return byCase;
}

/** Steps grouped by their owning test case id, in graph order. */
export function stepsByCase(graph: TestGraphV1): Map<string, Step[]> {
	const byCase = new Map<string, Step[]>();
	for (const step of graph.steps) {
		const bucket = byCase.get(step.testCaseId) ?? [];
		bucket.push(step);
		byCase.set(step.testCaseId, bucket);
	}
	return byCase;
}

/** scenario truthKey -> satisfaction in {0, 0.5, 1} from mapped Candidate cases. */
export function scenarioSatisfaction(
	ctx: CandidateContext,
): Map<string, number> {
	const satisfaction = new Map<string, number>();
	for (const scenario of ctx.fixture.expectedScenarios) {
		satisfaction.set(scenario.truthKey, 0);
	}
	for (const item of ctx.annotation.caseAnnotations) {
		if (item.verdict !== "maps") continue;
		const credit = item.satisfaction === "full" ? 1 : 0.5;
		for (const truthKey of item.truthKeys) {
			if (!satisfaction.has(truthKey)) continue;
			satisfaction.set(
				truthKey,
				Math.max(satisfaction.get(truthKey) ?? 0, credit),
			);
		}
	}
	return satisfaction;
}
