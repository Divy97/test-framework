import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestCase } from "@test-framework/core";
import {
	analyzeFeatureOutputSchema,
	exportTestCasesInputSchema,
	exportTestCasesOutputSchema,
	generateTestCasesOutputSchema,
	mapFeatureOutputSchema,
	reviewTestCasesOutputSchema,
} from "@test-framework/planner";
import { createStubToolHandlers } from "./stub-handlers.js";

const validTestCase: TestCase = {
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

test("analyzeFeature derives the summary and source references", async () => {
	const handlers = createStubToolHandlers();
	const output = await handlers.analyzeFeature({
		featureRequest: "Add password reset",
		repoPath: "/repo",
		relevantFiles: ["src/auth/reset.ts"],
	});

	assert.equal(output.normalizedPrd.featureSummary, "Add password reset");
	assert.deepEqual(
		output.normalizedPrd.sourceReferences.map((ref) => ref.path),
		["src/auth/reset.ts"],
	);
	assert.equal(analyzeFeatureOutputSchema.safeParse(output).success, true);
});

test("mapFeature emits one feature, one criterion, empty repo scan", async () => {
	const handlers = createStubToolHandlers();
	const analysis = await handlers.analyzeFeature({
		featureRequest: "Add password reset",
		repoPath: "/repo",
		relevantFiles: ["src/auth/reset.ts"],
	});
	const output = await handlers.mapFeature({
		normalizedPrd: analysis.normalizedPrd,
		repoPath: "/repo",
		relevantFiles: ["src/auth/reset.ts"],
	});

	assert.equal(output.featureMap.length, 1);
	assert.equal(output.acceptanceCriteria.length, 1);
	assert.deepEqual(output.repoScan.routesPages, []);
	assert.equal(output.repoScan.framework, null);
	assert.equal(mapFeatureOutputSchema.safeParse(output).success, true);
});

test("generateTestCases emits TC-001 derived from the first criterion", async () => {
	const handlers = createStubToolHandlers();
	const analysis = await handlers.analyzeFeature({
		featureRequest: "Add password reset",
		repoPath: "/repo",
		relevantFiles: [],
	});
	const mapping = await handlers.mapFeature({
		normalizedPrd: analysis.normalizedPrd,
		repoPath: "/repo",
		relevantFiles: [],
	});
	const output = await handlers.generateTestCases({
		normalizedPrd: analysis.normalizedPrd,
		featureMap: mapping.featureMap,
		acceptanceCriteria: mapping.acceptanceCriteria,
		userHints: [],
	});

	assert.equal(output.testCases.length, 1);
	assert.equal(output.testCases[0]?.id, "TC-001");
	assert.equal(
		output.testCases[0]?.objective,
		mapping.acceptanceCriteria[0]?.statement,
	);
	assert.equal(generateTestCasesOutputSchema.safeParse(output).success, true);
});

test("reviewTestCases flags a high finding only when no cases are supplied", async () => {
	const handlers = createStubToolHandlers();

	const empty = await handlers.reviewTestCases({
		testCases: [],
		acceptanceCriteria: [],
	});
	assert.equal(empty.findings.length, 1);
	assert.equal(empty.findings[0]?.severity, "high");

	const populated = await handlers.reviewTestCases({
		testCases: [validTestCase],
		acceptanceCriteria: [],
	});
	assert.deepEqual(populated.findings, []);
	assert.equal(reviewTestCasesOutputSchema.safeParse(populated).success, true);
});

test("exportTestCases previews paths without writing files", async () => {
	const handlers = createStubToolHandlers();
	const repoPath = join(tmpdir(), "test-framework-export-preview-check");
	const output = await handlers.exportTestCases({
		repoPath,
		testCases: [validTestCase],
		formats: ["json", "markdown"],
	});

	assert.equal(output.status, "preview");
	assert.equal(output.artifacts.length, 2);
	assert.ok(output.artifacts.every((artifact) => artifact.written === false));
	assert.ok(
		output.artifacts.every((artifact) => artifact.path.startsWith(repoPath)),
	);
	assert.equal(exportTestCasesOutputSchema.safeParse(output).success, true);
	assert.equal(existsSync(join(repoPath, ".test-framework")), false);
});
