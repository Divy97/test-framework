import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeTestGraph, serializeTestGraph } from "./canonical-json.js";
import type { Provenance } from "./common.js";
import { TestGraphValidationError } from "./findings.js";
import { type TestGraphV1, testGraphV1Schema } from "./schema.js";
import {
	buildValidTestGraph,
	loadJsonFixture,
	loadTextFixture,
} from "./test-helpers.js";

const FIXTURE = "valid/ui-api-integration.json";

/**
 * A reorder-independent census of a graph's identity and link structure: every
 * entity id, every typed reference edge, and every provenance claim, each sorted
 * so two graphs compare equal regardless of array order.
 */
function graphInventory(graph: TestGraphV1): {
	ids: string[];
	edges: string[];
	provenance: string[];
} {
	const ids: string[] = [];
	const edges: string[] = [];
	const provenance: string[] = [];

	const edge = (
		fromKind: string,
		fromId: string,
		field: string,
		toKind: string,
		toId: string,
	): void => {
		edges.push(`${fromKind}/${fromId}/${field}->${toKind}/${toId}`);
	};
	const prov = (kind: string, id: string, value: Provenance): void => {
		provenance.push(
			`${kind}/${id}:${value.kind}|${[...value.evidenceIds].sort().join(",")}|${value.rationale ?? ""}`,
		);
	};

	for (const source of graph.sources) ids.push(source.id);
	for (const evidence of graph.evidence) {
		ids.push(evidence.id);
		edge("evidence", evidence.id, "sourceId", "source", evidence.sourceId);
	}
	for (const requirement of graph.requirements) {
		ids.push(requirement.id);
		prov("requirement", requirement.id, requirement.provenance);
		for (const questionId of requirement.openQuestionIds) {
			edge(
				"requirement",
				requirement.id,
				"openQuestionIds",
				"openQuestion",
				questionId,
			);
		}
	}
	for (const feature of graph.features) {
		ids.push(feature.id);
		prov("feature", feature.id, feature.provenance);
		if (feature.parentFeatureId !== undefined) {
			edge(
				"feature",
				feature.id,
				"parentFeatureId",
				"feature",
				feature.parentFeatureId,
			);
		}
		for (const requirementId of feature.requirementIds) {
			edge(
				"feature",
				feature.id,
				"requirementIds",
				"requirement",
				requirementId,
			);
		}
	}
	for (const testCase of graph.testCases) {
		ids.push(testCase.id);
		prov("testCase", testCase.id, testCase.provenance);
		for (const requirementId of testCase.requirementIds) {
			edge(
				"testCase",
				testCase.id,
				"requirementIds",
				"requirement",
				requirementId,
			);
		}
		for (const featureId of testCase.featureIds) {
			edge("testCase", testCase.id, "featureIds", "feature", featureId);
		}
		for (const caseId of testCase.dependsOnCaseIds) {
			edge("testCase", testCase.id, "dependsOnCaseIds", "testCase", caseId);
		}
		for (const dataId of testCase.consumesDataRequirementIds) {
			edge("testCase", testCase.id, "consumes", "dataRequirement", dataId);
		}
		for (const dataId of testCase.producesDataRequirementIds) {
			edge("testCase", testCase.id, "produces", "dataRequirement", dataId);
		}
		for (const dataId of testCase.cleanup.dataRequirementIds) {
			edge("testCase", testCase.id, "cleanupData", "dataRequirement", dataId);
		}
		for (const caseId of testCase.cleanup.afterCaseIds) {
			edge("testCase", testCase.id, "cleanupAfter", "testCase", caseId);
		}
	}
	for (const step of graph.steps) {
		ids.push(step.id);
		prov("step", step.id, step.provenance);
		edge("step", step.id, "testCaseId", "testCase", step.testCaseId);
	}
	for (const assertion of graph.assertions) {
		ids.push(assertion.id);
		prov("assertion", assertion.id, assertion.provenance);
		edge(
			"assertion",
			assertion.id,
			"testCaseId",
			"testCase",
			assertion.testCaseId,
		);
		if (assertion.stepId !== undefined) {
			edge("assertion", assertion.id, "stepId", "step", assertion.stepId);
		}
	}
	for (const data of graph.dataRequirements) {
		ids.push(data.id);
		prov("dataRequirement", data.id, data.provenance);
	}
	for (const question of graph.openQuestions) {
		ids.push(question.id);
		prov("openQuestion", question.id, question.provenance);
		for (const ref of question.blockedEntityRefs) {
			edge("openQuestion", question.id, "blockedEntityRefs", ref.kind, ref.id);
		}
	}
	ids.push(graph.generation.id);

	return {
		ids: ids.sort(),
		edges: edges.sort(),
		provenance: provenance.sort(),
	};
}

test("canonical round-trip preserves the full id/link/provenance inventory", async () => {
	const raw = await loadJsonFixture(FIXTURE);
	const before = graphInventory(testGraphV1Schema.parse(raw));
	const after = graphInventory(
		testGraphV1Schema.parse(JSON.parse(serializeTestGraph(raw))),
	);
	assert.deepEqual(after, before);
});

function shuffle<T>(values: readonly T[]): T[] {
	const result = [...values];
	for (let i = result.length - 1; i > 0; i--) {
		// Deterministic permutation so the test itself stays reproducible.
		const j = (i * 7 + 3) % (i + 1);
		const a = result[i];
		const b = result[j];
		if (a !== undefined && b !== undefined) {
			result[i] = b;
			result[j] = a;
		}
	}
	return result;
}

test("canonical output matches the golden fixture", async () => {
	const input = await loadJsonFixture(FIXTURE);
	const expected = await loadTextFixture(
		"expected/ui-api-integration.canonical.json",
	);
	assert.equal(serializeTestGraph(input), expected);
});

test("shuffled keys and top-level arrays produce the same canonical output", async () => {
	const input = (await loadJsonFixture(FIXTURE)) as Record<string, unknown>;
	const expected = await loadTextFixture(
		"expected/ui-api-integration.canonical.json",
	);
	const shuffled: Record<string, unknown> = {};
	for (const key of Object.keys(input).reverse()) {
		const value = input[key];
		shuffled[key] = Array.isArray(value) ? shuffle(value) : value;
	}
	assert.equal(serializeTestGraph(shuffled), expected);
});

test("canonical output is idempotent", async () => {
	const input = await loadJsonFixture(FIXTURE);
	const first = serializeTestGraph(input);
	const second = serializeTestGraph(JSON.parse(first));
	assert.equal(second, first);
});

test("serialization does not mutate its input", async () => {
	const input = await loadJsonFixture(FIXTURE);
	const frozen = JSON.stringify(input);
	serializeTestGraph(input);
	assert.equal(JSON.stringify(input), frozen);
});

test("output uses tab indentation and exactly one trailing newline", async () => {
	const output = serializeTestGraph(await loadJsonFixture(FIXTURE));
	assert.ok(output.endsWith("\n"));
	assert.ok(!output.endsWith("\n\n"));
	assert.ok(output.includes('\n\t"schemaVersion"'));
});

test("steps sort by case id then order then id", async () => {
	const graph = canonicalizeTestGraph(await loadJsonFixture(FIXTURE));
	for (let i = 1; i < graph.steps.length; i++) {
		const previous = graph.steps[i - 1];
		const current = graph.steps[i];
		if (previous === undefined || current === undefined) continue;
		const ordered =
			previous.testCaseId < current.testCaseId ||
			(previous.testCaseId === current.testCaseId &&
				(previous.order < current.order ||
					(previous.order === current.order && previous.id <= current.id)));
		assert.ok(ordered, `${previous.id} should precede ${current.id}`);
	}
});

test("assertions sort by case id then step order then id", async () => {
	const graph = canonicalizeTestGraph(await loadJsonFixture(FIXTURE));
	const stepOrder = new Map<string, number>(
		graph.steps.map((step) => [step.id, step.order]),
	);
	const orderOf = (stepId: string | undefined): number =>
		stepId !== undefined
			? (stepOrder.get(stepId) ?? Number.MAX_SAFE_INTEGER)
			: Number.MAX_SAFE_INTEGER;
	for (let i = 1; i < graph.assertions.length; i++) {
		const previous = graph.assertions[i - 1];
		const current = graph.assertions[i];
		if (previous === undefined || current === undefined) continue;
		const sameCase = previous.testCaseId === current.testCaseId;
		const ordered =
			previous.testCaseId < current.testCaseId ||
			(sameCase &&
				(orderOf(previous.stepId) < orderOf(current.stepId) ||
					(orderOf(previous.stepId) === orderOf(current.stepId) &&
						previous.id <= current.id)));
		assert.ok(ordered, `${previous.id} should precede ${current.id}`);
	}
});

test("set-like id arrays are sorted lexically", async () => {
	const graph = canonicalizeTestGraph(await loadJsonFixture(FIXTURE));
	for (const feature of graph.features) {
		const ids = feature.requirementIds;
		assert.deepEqual(ids, [...ids].sort());
	}
});

test("authored-order arrays are preserved", () => {
	const input = buildValidTestGraph({
		testCases: [
			{
				...buildValidTestGraphCase(),
				preconditions: [
					{ description: "second-step precondition" },
					{ description: "first-step precondition" },
				],
			},
		],
	});
	const canonical = canonicalizeTestGraph(input);
	assert.deepEqual(canonical.testCases[0]?.preconditions, [
		{ description: "second-step precondition" },
		{ description: "first-step precondition" },
	]);
});

function buildValidTestGraphCase() {
	const testCase = buildValidTestGraph().testCases[0];
	if (testCase === undefined) throw new Error("builder lost its test case");
	return testCase;
}

test("serialization refuses invalid input instead of repairing it", () => {
	const duplicated = buildValidTestGraph();
	const requirement = duplicated.requirements[0];
	if (requirement === undefined)
		throw new Error("builder lost its requirement");
	const invalid = {
		...duplicated,
		requirements: [requirement, requirement],
	};
	assert.throws(
		() => serializeTestGraph(invalid),
		(error: unknown) => error instanceof TestGraphValidationError,
	);
});
