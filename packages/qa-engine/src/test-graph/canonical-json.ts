import type { Assertion } from "./assertions.js";
import type { GraphEntityRef, Provenance } from "./common.js";
import type {
	DataRequirement,
	Feature,
	OpenQuestion,
	Requirement,
	Step,
	TestCase,
	TestGraphV1,
} from "./schema.js";
import { parseTestGraph } from "./validate.js";

/** Compare by code units, never locale order. */
function compareCodeUnits(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

function sortedStrings<T extends string>(values: readonly T[]): T[] {
	return [...values].sort(compareCodeUnits);
}

function sortedById<T extends { id: string }>(values: readonly T[]): T[] {
	return [...values].sort((a, b) => compareCodeUnits(a.id, b.id));
}

function canonicalProvenance(provenance: Provenance): Provenance {
	const evidenceIds = sortedStrings(provenance.evidenceIds);
	if (provenance.kind === "explicit") return { ...provenance, evidenceIds };
	if (provenance.kind === "inferred") return { ...provenance, evidenceIds };
	return { ...provenance, evidenceIds };
}

function canonicalRequirement(requirement: Requirement): Requirement {
	return {
		...requirement,
		openQuestionIds: sortedStrings(requirement.openQuestionIds),
		provenance: canonicalProvenance(requirement.provenance),
	};
}

function canonicalFeature(feature: Feature): Feature {
	return {
		...feature,
		requirementIds: sortedStrings(feature.requirementIds),
		provenance: canonicalProvenance(feature.provenance),
	};
}

function canonicalTestCase(testCase: TestCase): TestCase {
	return {
		...testCase,
		requirementIds: sortedStrings(testCase.requirementIds),
		featureIds: sortedStrings(testCase.featureIds),
		qualityTags: sortedStrings(testCase.qualityTags),
		dependsOnCaseIds: sortedStrings(testCase.dependsOnCaseIds),
		consumesDataRequirementIds: sortedStrings(
			testCase.consumesDataRequirementIds,
		),
		producesDataRequirementIds: sortedStrings(
			testCase.producesDataRequirementIds,
		),
		provenance: canonicalProvenance(testCase.provenance),
		cleanup: {
			...testCase.cleanup,
			dataRequirementIds: sortedStrings(testCase.cleanup.dataRequirementIds),
			afterCaseIds: sortedStrings(testCase.cleanup.afterCaseIds),
		},
	};
}

function canonicalStep(step: Step): Step {
	return { ...step, provenance: canonicalProvenance(step.provenance) };
}

function canonicalAssertion(assertion: Assertion): Assertion {
	return {
		...assertion,
		provenance: canonicalProvenance(assertion.provenance),
	};
}

function canonicalDataRequirement(
	dataRequirement: DataRequirement,
): DataRequirement {
	return {
		...dataRequirement,
		provenance: canonicalProvenance(dataRequirement.provenance),
	};
}

function compareRefs(a: GraphEntityRef, b: GraphEntityRef): number {
	return compareCodeUnits(a.kind, b.kind) || compareCodeUnits(a.id, b.id);
}

function canonicalOpenQuestion(question: OpenQuestion): OpenQuestion {
	return {
		...question,
		provenance: canonicalProvenance(question.provenance),
		blockedEntityRefs: [...question.blockedEntityRefs].sort(compareRefs),
	};
}

/**
 * Produces a structurally identical Test Graph with deterministic array order.
 * Set-like ID arrays and enum tag sets sort lexically; steps sort by case then
 * order then ID; assertions sort by case then their step's order then ID.
 * Authored-order arrays (preconditions, postconditions, warnings, blockers,
 * permissions, targets) are preserved. The input is never mutated.
 */
export function canonicalizeTestGraph(input: unknown): TestGraphV1 {
	const graph = parseTestGraph(input);

	const stepOrderById = new Map<string, number>(
		graph.steps.map((step) => [step.id, step.order]),
	);
	const assertionOrder = (assertion: Assertion): number =>
		assertion.stepId !== undefined
			? (stepOrderById.get(assertion.stepId) ?? Number.MAX_SAFE_INTEGER)
			: Number.MAX_SAFE_INTEGER;

	return {
		...graph,
		sources: sortedById(graph.sources),
		evidence: sortedById(graph.evidence),
		requirements: sortedById(graph.requirements).map(canonicalRequirement),
		features: sortedById(graph.features).map(canonicalFeature),
		testCases: sortedById(graph.testCases).map(canonicalTestCase),
		steps: [...graph.steps]
			.sort(
				(a, b) =>
					compareCodeUnits(a.testCaseId, b.testCaseId) ||
					a.order - b.order ||
					compareCodeUnits(a.id, b.id),
			)
			.map(canonicalStep),
		assertions: [...graph.assertions]
			.sort(
				(a, b) =>
					compareCodeUnits(a.testCaseId, b.testCaseId) ||
					assertionOrder(a) - assertionOrder(b) ||
					compareCodeUnits(a.id, b.id),
			)
			.map(canonicalAssertion),
		dataRequirements: sortedById(graph.dataRequirements).map(
			canonicalDataRequirement,
		),
		openQuestions: sortedById(graph.openQuestions).map(canonicalOpenQuestion),
	};
}

/** Recursively sort object keys; never reorder array elements. */
function deepSortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(deepSortKeys);
	if (value !== null && typeof value === "object") {
		const source = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(source).sort(compareCodeUnits)) {
			Object.defineProperty(sorted, key, {
				value: deepSortKeys(source[key]),
				enumerable: true,
				configurable: true,
				writable: true,
			});
		}
		return sorted;
	}
	return value;
}

/**
 * Canonical JSON: validated, deterministically ordered, tab-indented, and
 * terminated by exactly one newline. `JSON.parse` then `serializeTestGraph` is
 * byte-stable after the first canonicalization.
 */
export function serializeTestGraph(input: unknown): string {
	const canonical = canonicalizeTestGraph(input);
	return `${JSON.stringify(deepSortKeys(canonical), null, "\t")}\n`;
}
