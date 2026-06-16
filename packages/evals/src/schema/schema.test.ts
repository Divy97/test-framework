import assert from "node:assert/strict";
import test from "node:test";
import { annotationSchema } from "./annotation.js";
import { fixtureSchema } from "./fixture.js";
import { rubricSchema, thresholdsSchema } from "./rubric.js";

const validFixture = {
	evalSchemaVersion: "eval/v1",
	fixtureId: "demo",
	title: "Demo",
	category: "ui-form",
	brief: "A demo fixture.",
	suppliedSources: [
		{ sourceKey: "s", kind: "feature-request", title: "S", supplied: true },
	],
	expectedRequirements: [
		{
			truthKey: "req:a",
			statement: "A.",
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
			title: "A.",
			requirementKeys: ["req:a"],
			type: "positive",
			priority: "p1",
			risk: "medium",
			expectedAssertionHint: "x",
		},
	],
	forbiddenClaims: [],
};

test("fixture schema accepts a valid fixture", () => {
	assert.equal(fixtureSchema.safeParse(validFixture).success, true);
});

test("fixture schema rejects a scenario referencing an unknown requirement key", () => {
	const bad = {
		...validFixture,
		expectedScenarios: [
			{
				...validFixture.expectedScenarios[0],
				requirementKeys: ["req:missing"],
			},
		],
	};
	assert.equal(fixtureSchema.safeParse(bad).success, false);
});

test("rubric weights must sum to one", () => {
	const base = {
		evalSchemaVersion: "eval/v1",
		riskWeight: { low: 1, medium: 2, high: 3 },
		priorityWeight: { p0: 4, p1: 3, p2: 2, p3: 1 },
		dimensionWeights: {
			requirementRecall: 0.5,
			scenarioCoverage: 0.5,
			unsupportedClaims: 0,
			traceability: 0,
			assertionQuality: 0,
			executionReadiness: 0,
			evidenceCorrectness: 0,
			duplicateLowValue: 0,
			provenanceAccuracy: 0,
		},
	};
	assert.equal(rubricSchema.safeParse(base).success, true);
	const bad = {
		...base,
		dimensionWeights: { ...base.dimensionWeights, requirementRecall: 0.9 },
	};
	assert.equal(rubricSchema.safeParse(bad).success, false);
});

test("thresholds schema bounds the unsupported rate", () => {
	const ok = {
		evalSchemaVersion: "eval/v1",
		maxUnsupportedRate: 0.2,
		minOverall: 0,
		maxRegressionDelta: 0,
		maxUnsupportedRegressionDelta: 0,
	};
	assert.equal(thresholdsSchema.safeParse(ok).success, true);
	assert.equal(
		thresholdsSchema.safeParse({ ...ok, maxUnsupportedRate: 2 }).success,
		false,
	);
	assert.equal(
		thresholdsSchema.safeParse({
			...ok,
			maxUnsupportedRegressionDelta: 2,
		}).success,
		false,
	);
});

test("annotation requires a reason for partial satisfaction", () => {
	const withReason = {
		evalSchemaVersion: "eval/v1",
		fixtureId: "demo",
		arm: "qa-engine",
		recordKind: "synthetic",
		expectValidationFailure: false,
		sourceAnnotations: [],
		requirementAnnotations: [
			{
				requirementId: "req_0000000000000000000a",
				verdict: "maps",
				truthKeys: ["req:a"],
				satisfaction: "partial",
				reason: "weak",
			},
		],
		caseAnnotations: [],
	};
	assert.equal(annotationSchema.safeParse(withReason).success, true);
	const noReason = {
		...withReason,
		requirementAnnotations: [
			{
				requirementId: "req_0000000000000000000a",
				verdict: "maps",
				truthKeys: ["req:a"],
				satisfaction: "partial",
			},
		],
	};
	assert.equal(annotationSchema.safeParse(noReason).success, false);
});
