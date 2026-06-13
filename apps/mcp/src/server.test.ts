import assert from "node:assert/strict";
import test from "node:test";
import {
	analyzeFeatureOutputSchema,
	exportTestCasesInputSchema,
	exportTestCasesOutputSchema,
	generateTestCasesOutputSchema,
	mapFeatureOutputSchema,
	reviewTestCasesOutputSchema,
} from "@test-framework/planner";

const validTestCase = {
	id: "TC-001",
	title: "Verify checkout",
	type: "positive",
	priority: "p1",
	objective: "User can checkout with a valid cart",
	preconditions: [],
	testDataAccounts: [],
	steps: ["Open cart", "Complete checkout"],
	expectedResults: ["Order confirmed"],
	postconditions: [],
	relatedFilesRoutesApis: [],
	evidenceSource: "inferred",
	automationReadiness: "manual",
};

test("planner exposes five valid output contracts", () => {
	assert.ok(analyzeFeatureOutputSchema);
	assert.ok(mapFeatureOutputSchema);
	assert.ok(generateTestCasesOutputSchema);
	assert.ok(reviewTestCasesOutputSchema);
	assert.ok(exportTestCasesOutputSchema);
});

test("export output accepts a preview receipt", () => {
	assert.equal(
		exportTestCasesOutputSchema.safeParse({
			status: "preview",
			testCases: [],
			artifacts: [
				{
					format: "json",
					path: "/repo/.test-framework/test-cases.json",
					written: false,
				},
			],
		}).success,
		true,
	);
});

test("output schemas stay forward-compatible (non-strict)", () => {
	assert.equal(
		exportTestCasesOutputSchema.safeParse({
			status: "preview",
			testCases: [],
			artifacts: [],
			extra: "forward-compatible field",
		}).success,
		true,
	);
});

test("export input rejects an empty repo path", () => {
	assert.equal(
		exportTestCasesInputSchema.safeParse({
			repoPath: "",
			testCases: [validTestCase],
		}).success,
		false,
	);
});

test("export input rejects an unsupported format", () => {
	assert.equal(
		exportTestCasesInputSchema.safeParse({
			repoPath: "/repo",
			testCases: [validTestCase],
			formats: ["pdf"],
		}).success,
		false,
	);
});

test("export input rejects a malformed test case", () => {
	assert.equal(
		exportTestCasesInputSchema.safeParse({
			repoPath: "/repo",
			testCases: [{ ...validTestCase, priority: "urgent" }],
		}).success,
		false,
	);
});
