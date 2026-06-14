import assert from "node:assert/strict";
import test from "node:test";
import { TestGraphValidationError } from "./findings.js";
import { createStableId } from "./ids.js";
import {
	buildValidTestGraph,
	loadJsonFixture,
	testGraphIds,
} from "./test-helpers.js";
import {
	parseTestGraph,
	validatePlanRevisionTransition,
	validateTestGraph,
} from "./validate.js";

const { planId, projectId, evidenceId, requirementId } = testGraphIds;

function at<T>(items: readonly T[], position: number): T {
	const value = items[position];
	if (value === undefined) {
		throw new Error(`missing element at index ${position}`);
	}
	return value;
}

function codesOf(input: unknown): string[] {
	const result = validateTestGraph(input);
	return result.valid ? [] : result.findings.map((finding) => finding.code);
}

function uniqueCodes(input: unknown): string[] {
	return [...new Set(codesOf(input))].sort();
}

const base = buildValidTestGraph();

// --- Valid fixtures -------------------------------------------------------

test("valid fixtures produce zero findings", async () => {
	for (const name of ["ui-api-integration", "assumption-blocked"]) {
		const input = await loadJsonFixture(`valid/${name}.json`);
		const result = validateTestGraph(input);
		assert.equal(result.valid, true, name);
		assert.deepEqual(result.valid ? result.findings : null, []);
	}
});

// --- Fixture matrix -------------------------------------------------------

const FIXTURE_MATRIX: ReadonlyArray<{
	fixture: string;
	valid: boolean;
	requiredFinding?: string;
}> = [
	{ fixture: "valid/ui-api-integration.json", valid: true },
	{ fixture: "valid/assumption-blocked.json", valid: true },
	{
		fixture: "invalid/dangling-links.json",
		valid: false,
		requiredFinding: "DANGLING_REFERENCE",
	},
	{
		fixture: "invalid/duplicate-ids.json",
		valid: false,
		requiredFinding: "DUPLICATE_ID",
	},
	{
		fixture: "invalid/dependency-cycle.json",
		valid: false,
		requiredFinding: "DEPENDENCY_CYCLE",
	},
	{
		fixture: "invalid/malformed-assertions.json",
		valid: false,
		requiredFinding: "MALFORMED_ASSERTION",
	},
	{
		fixture: "invalid/unsupported-state.json",
		valid: false,
		requiredFinding: "UNSUPPORTED_STATE",
	},
];

test("every fixture validates as expected", async () => {
	for (const entry of FIXTURE_MATRIX) {
		const result = validateTestGraph(await loadJsonFixture(entry.fixture));
		assert.equal(result.valid, entry.valid, entry.fixture);
		if (!result.valid && entry.requiredFinding !== undefined) {
			assert.ok(
				result.findings.some(
					(finding) => finding.code === entry.requiredFinding,
				),
				`${entry.fixture} should report ${entry.requiredFinding}`,
			);
		}
	}
});

// --- Invalid fixture matrix ----------------------------------------------

test("malformed assertion fixture yields MALFORMED_ASSERTION under /assertions", async () => {
	const input = await loadJsonFixture("invalid/malformed-assertions.json");
	const result = validateTestGraph(input);
	assert.equal(result.valid, false);
	if (result.valid) return;
	assert.deepEqual(
		result.findings.map((finding) => finding.code),
		["MALFORMED_ASSERTION"],
	);
	assert.match(at(result.findings, 0).path, /^\/assertions\//);
});

test("unsupported state fixture yields only UNSUPPORTED_STATE", async () => {
	const input = await loadJsonFixture("invalid/unsupported-state.json");
	assert.deepEqual(codesOf(input), ["UNSUPPORTED_STATE"]);
});

test("dangling fixture yields DANGLING_REFERENCE", async () => {
	const input = await loadJsonFixture("invalid/dangling-links.json");
	assert.deepEqual(codesOf(input), ["DANGLING_REFERENCE"]);
});

test("duplicate-id fixture yields DUPLICATE_ID", async () => {
	const input = await loadJsonFixture("invalid/duplicate-ids.json");
	assert.deepEqual(codesOf(input), ["DUPLICATE_ID"]);
});

test("dependency-cycle fixture yields DEPENDENCY_CYCLE", async () => {
	const input = await loadJsonFixture("invalid/dependency-cycle.json");
	assert.deepEqual(codesOf(input), ["DEPENDENCY_CYCLE"]);
});

// --- Schema version -------------------------------------------------------

test("unknown schema version yields only UNSUPPORTED_SCHEMA_VERSION", () => {
	const graph = { ...buildValidTestGraph(), schemaVersion: "test-graph/v2" };
	assert.deepEqual(codesOf(graph), ["UNSUPPORTED_SCHEMA_VERSION"]);
});

test("missing schema version is rejected without cascade", () => {
	const withoutVersion: Record<string, unknown> = { ...buildValidTestGraph() };
	delete withoutVersion.schemaVersion;
	assert.deepEqual(codesOf(withoutVersion), ["UNSUPPORTED_SCHEMA_VERSION"]);
});

// --- Provenance invariants ------------------------------------------------

test("explicit provenance requires evidence", () => {
	const graph = buildValidTestGraph({
		requirements: [
			{
				...at(base.requirements, 0),
				provenance: { kind: "explicit", evidenceIds: [] },
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["PROVENANCE_EVIDENCE_REQUIRED"]);
});

test("inferred provenance requires evidence or rationale", () => {
	const graph = buildValidTestGraph({
		requirements: [
			{
				...at(base.requirements, 0),
				provenance: { kind: "inferred", evidenceIds: [] },
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["PROVENANCE_RATIONALE_REQUIRED"]);
});

test("explicit provenance must cite supplied sources", () => {
	const graph = buildValidTestGraph({
		sources: [{ ...at(base.sources, 0), supplied: false }],
	});
	assert.deepEqual(uniqueCodes(graph), ["EXPLICIT_SOURCE_REQUIRED"]);
});

// --- Coverage and reference invariants ------------------------------------

test("a case must cover at least one requirement", () => {
	const graph = buildValidTestGraph({
		testCases: [{ ...at(base.testCases, 0), requirementIds: [] }],
	});
	assert.deepEqual(codesOf(graph), ["CASE_REQUIREMENT_REQUIRED"]);
});

test("duplicate references are flagged", () => {
	const graph = buildValidTestGraph({
		testCases: [
			{
				...at(base.testCases, 0),
				requirementIds: [requirementId, requirementId],
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["DUPLICATE_REFERENCE"]);
});

test("blocked entity reference kind mismatch is flagged", () => {
	const graph = buildValidTestGraph({
		openQuestions: [
			{
				id: createStableId("openQuestion", planId, "kind mismatch question"),
				question: "Does this resolve to the wrong kind?",
				status: "open",
				blocking: false,
				provenance: { kind: "explicit", evidenceIds: [evidenceId] },
				blockedEntityRefs: [{ kind: "feature", id: requirementId }],
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["REFERENCE_KIND_MISMATCH"]);
});

test("blocked entity reference to a missing id is dangling", () => {
	const ghost = createStableId("testCase", planId, "ghost case");
	const graph = buildValidTestGraph({
		openQuestions: [
			{
				id: createStableId("openQuestion", planId, "dangling question"),
				question: "Does this resolve at all?",
				status: "open",
				blocking: false,
				provenance: { kind: "explicit", evidenceIds: [evidenceId] },
				blockedEntityRefs: [{ kind: "testCase", id: ghost }],
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["DANGLING_REFERENCE"]);
});

// --- Step ordering --------------------------------------------------------

test("duplicate step orders are flagged", () => {
	const step = at(base.steps, 0);
	const graph = buildValidTestGraph({
		steps: [
			step,
			{
				...step,
				id: createStableId("step", testGraphIds.caseId, "duplicate order"),
				order: 1,
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["DUPLICATE_STEP_ORDER"]);
});

test("noncontiguous step orders are flagged", () => {
	const graph = buildValidTestGraph({
		steps: [{ ...at(base.steps, 0), order: 2 }],
	});
	assert.deepEqual(codesOf(graph), ["NONCONTIGUOUS_STEP_ORDER"]);
});

test("an assertion step must belong to the same case", () => {
	const caseA = at(base.testCases, 0);
	const stepA = at(base.steps, 0);
	const assertionA = at(base.assertions, 0);
	const caseBId = createStableId("testCase", planId, "second case");
	const stepBId = createStableId("step", caseBId, "second step");
	const graph = buildValidTestGraph({
		testCases: [
			caseA,
			{
				...caseA,
				id: caseBId,
				title: "Second case",
				objective: "Holds the mismatched step.",
				dependsOnCaseIds: [],
			},
		],
		steps: [stepA, { ...stepA, id: stepBId, testCaseId: caseBId, order: 1 }],
		assertions: [{ ...assertionA, stepId: stepBId }],
	});
	assert.deepEqual(codesOf(graph), ["ASSERTION_STEP_CASE_MISMATCH"]);
});

// --- Dependency and feature cycles ---------------------------------------

test("a case cannot depend on itself", () => {
	const graph = buildValidTestGraph({
		testCases: [
			{ ...at(base.testCases, 0), dependsOnCaseIds: [testGraphIds.caseId] },
		],
	});
	assert.deepEqual(codesOf(graph), ["DEPENDENCY_SELF_REFERENCE"]);
});

test("feature parent cycles are flagged", () => {
	const graph = buildValidTestGraph({
		features: [
			{ ...at(base.features, 0), parentFeatureId: testGraphIds.featureId },
		],
	});
	assert.deepEqual(codesOf(graph), ["FEATURE_CYCLE"]);
});

// --- Data producers -------------------------------------------------------

test("case-produced data with no producer is flagged", () => {
	const graph = buildValidTestGraph({
		dataRequirements: [
			{
				id: createStableId("dataRequirement", planId, "orphan data"),
				name: "Orphan data",
				description: "Declared case-produced but produced by no case.",
				kind: "record",
				provisioning: "case-produced",
				sensitivity: "none",
				provenance: { kind: "explicit", evidenceIds: [evidenceId] },
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["MISSING_DATA_PRODUCER"]);
});

test("case-produced data with two producers is flagged", () => {
	const caseA = at(base.testCases, 0);
	const stepA = at(base.steps, 0);
	const dataId = createStableId("dataRequirement", planId, "shared data");
	const caseBId = createStableId("testCase", planId, "second producer");
	const stepBId = createStableId("step", caseBId, "second step");
	const graph = buildValidTestGraph({
		dataRequirements: [
			{
				id: dataId,
				name: "Shared data",
				description: "Produced by two cases.",
				kind: "record",
				provisioning: "case-produced",
				sensitivity: "none",
				provenance: { kind: "explicit", evidenceIds: [evidenceId] },
			},
		],
		testCases: [
			{ ...caseA, producesDataRequirementIds: [dataId] },
			{
				...caseA,
				id: caseBId,
				title: "Second producer",
				objective: "Also produces the shared data.",
				producesDataRequirementIds: [dataId],
			},
		],
		steps: [stepA, { ...stepA, id: stepBId, testCaseId: caseBId, order: 1 }],
	});
	assert.deepEqual(codesOf(graph), ["MULTIPLE_DATA_PRODUCERS"]);
});

// --- Cleanup --------------------------------------------------------------

test("cleanup cannot order a case after itself", () => {
	const graph = buildValidTestGraph({
		testCases: [
			{
				...at(base.testCases, 0),
				cleanup: {
					intent: "delete",
					dataRequirementIds: [],
					afterCaseIds: [testGraphIds.caseId],
				},
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["CLEANUP_SELF_REFERENCE"]);
});

test("cleanup data must be used by the owning case", () => {
	const dataId = createStableId(
		"dataRequirement",
		planId,
		"unused cleanup data",
	);
	const graph = buildValidTestGraph({
		dataRequirements: [
			{
				id: dataId,
				name: "Unused data",
				description: "Not consumed or produced by the case cleaning it.",
				kind: "record",
				provisioning: "existing",
				sensitivity: "none",
				provenance: { kind: "explicit", evidenceIds: [evidenceId] },
			},
		],
		testCases: [
			{
				...at(base.testCases, 0),
				cleanup: {
					intent: "delete",
					dataRequirementIds: [dataId],
					afterCaseIds: [],
				},
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["CLEANUP_DATA_NOT_USED"]);
});

// --- Question and plan state ---------------------------------------------

test("answered questions require an answer", () => {
	const graph = buildValidTestGraph({
		openQuestions: [
			{
				id: createStableId("openQuestion", planId, "answer state question"),
				question: "Marked answered without an answer.",
				status: "answered",
				blocking: false,
				provenance: { kind: "explicit", evidenceIds: [evidenceId] },
				blockedEntityRefs: [],
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["QUESTION_ANSWER_STATE_INVALID"]);
});

test("a complete plan cannot retain a blocking question", () => {
	const graph = buildValidTestGraph({
		openQuestions: [
			{
				id: createStableId("openQuestion", planId, "blocking question"),
				question: "Still blocking on a complete plan.",
				status: "open",
				blocking: true,
				provenance: { kind: "explicit", evidenceIds: [evidenceId] },
				blockedEntityRefs: [],
			},
		],
	});
	assert.deepEqual(codesOf(graph), ["COMPLETE_PLAN_BLOCKED"]);
});

test("plan and generation status must agree", () => {
	const graph = buildValidTestGraph({
		generation: { ...base.generation, status: "incomplete" },
	});
	assert.deepEqual(codesOf(graph), ["GENERATION_STATUS_MISMATCH"]);
});

// --- Parse + determinism --------------------------------------------------

test("parseTestGraph throws a typed error with the same findings", async () => {
	const input = await loadJsonFixture("invalid/dangling-links.json");
	const result = validateTestGraph(input);
	assert.equal(result.valid, false);
	assert.throws(
		() => parseTestGraph(input),
		(error: unknown) => {
			assert.ok(error instanceof TestGraphValidationError);
			assert.equal(error.code, "PLAN_INVARIANT_FAILED");
			assert.deepEqual(error.findings, result.valid ? [] : result.findings);
			return true;
		},
	);
});

test("validation output is identical across repeated runs", () => {
	const graph = buildValidTestGraph({
		sources: [{ ...at(base.sources, 0), supplied: false }],
	});
	assert.deepEqual(validateTestGraph(graph), validateTestGraph(graph));
});

// --- Revision transitions -------------------------------------------------

test("a valid n -> n+1 transition has no findings", () => {
	const previous = buildValidTestGraph();
	const next = buildValidTestGraph({
		planVersion: 2,
		updatedAt: "2026-06-15T10:00:00.000Z",
	});
	assert.deepEqual(validatePlanRevisionTransition(previous, next), []);
});

test("changing project id across a revision is flagged", () => {
	const next = buildValidTestGraph({
		planVersion: 2,
		updatedAt: "2026-06-15T10:00:00.000Z",
		projectId: createStableId("project", "test-framework", "other project"),
	});
	assert.deepEqual(
		validatePlanRevisionTransition(buildValidTestGraph(), next).map(
			(finding) => finding.code,
		),
		["PROJECT_ID_CHANGED"],
	);
});

test("changing plan id across a revision is flagged", () => {
	const next = buildValidTestGraph({
		planVersion: 2,
		updatedAt: "2026-06-15T10:00:00.000Z",
		planId: createStableId("plan", projectId, "other plan"),
	});
	assert.deepEqual(
		validatePlanRevisionTransition(buildValidTestGraph(), next).map(
			(finding) => finding.code,
		),
		["PLAN_ID_CHANGED"],
	);
});

test("a non-incrementing plan version is flagged", () => {
	const next = buildValidTestGraph({
		planVersion: 3,
		updatedAt: "2026-06-15T10:00:00.000Z",
	});
	assert.deepEqual(
		validatePlanRevisionTransition(buildValidTestGraph(), next).map(
			(finding) => finding.code,
		),
		["PLAN_VERSION_NOT_INCREMENTED"],
	);
});

test("changing createdAt across a revision is flagged", () => {
	const next = buildValidTestGraph({
		planVersion: 2,
		createdAt: "2026-06-13T10:00:00.000Z",
		updatedAt: "2026-06-15T10:00:00.000Z",
	});
	assert.deepEqual(
		validatePlanRevisionTransition(buildValidTestGraph(), next).map(
			(finding) => finding.code,
		),
		["PLAN_CREATED_AT_CHANGED"],
	);
});

test("a non-advancing updatedAt is flagged", () => {
	const next = buildValidTestGraph({ planVersion: 2 });
	assert.deepEqual(
		validatePlanRevisionTransition(buildValidTestGraph(), next).map(
			(finding) => finding.code,
		),
		["PLAN_UPDATED_AT_NOT_ADVANCED"],
	);
});
