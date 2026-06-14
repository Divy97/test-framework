import assert from "node:assert/strict";
import test from "node:test";
import { renderTestGraphMarkdown as renderFromBarrel } from "../index.js";
import { createStableId } from "./ids.js";
import { renderTestGraphMarkdown } from "./markdown.js";
import {
	buildValidTestGraph,
	loadJsonFixture,
	loadTextFixture,
	testGraphIds,
} from "./test-helpers.js";

const FIXTURE = "valid/ui-api-integration.json";

function firstRequirement() {
	const requirement = buildValidTestGraph().requirements[0];
	if (requirement === undefined)
		throw new Error("builder lost its requirement");
	return requirement;
}

function firstTestCase() {
	const testCase = buildValidTestGraph().testCases[0];
	if (testCase === undefined) throw new Error("builder lost its test case");
	return testCase;
}

function firstStep() {
	const step = buildValidTestGraph().steps[0];
	if (step === undefined) throw new Error("builder lost its step");
	return step;
}

test("markdown matches the golden fixture", async () => {
	const input = await loadJsonFixture(FIXTURE);
	const expected = await loadTextFixture("expected/ui-api-integration.md");
	assert.equal(renderTestGraphMarkdown(input), expected);
});

test("markdown retains execution-critical graph data", async () => {
	const graph = await loadJsonFixture(FIXTURE);
	const markdown = renderTestGraphMarkdown(graph);
	for (const token of [
		"plan_",
		"req_",
		"case_",
		"Provenance: explicit",
		"Consumes",
		"Produces",
		"Depends on",
		"Postconditions",
		"Cleanup",
		"Blockers",
	]) {
		assert.match(markdown, new RegExp(token), token);
	}
});

test("markdown ends with exactly one trailing newline", async () => {
	const markdown = renderTestGraphMarkdown(await loadJsonFixture(FIXTURE));
	assert.ok(markdown.endsWith("\n"));
	assert.ok(!markdown.endsWith("\n\n"));
});

test("markdown escapes special characters in inline fields", () => {
	const markdown = renderTestGraphMarkdown(
		buildValidTestGraph({ title: "Pipe | star * under _ angle <b>" }),
	);
	assert.match(markdown, /# Pipe \\\| star \\\* under \\_ angle &lt;b&gt;/);
});

test("multiline prose stays on a single readable line", () => {
	const markdown = renderTestGraphMarkdown(
		buildValidTestGraph({
			requirements: [
				{ ...firstRequirement(), statement: "first line\nsecond line" },
			],
		}),
	);
	assert.match(markdown, /Statement: first line second line/);
});

test("inline code cannot break its Markdown line", () => {
	const markdown = renderTestGraphMarkdown(
		buildValidTestGraph({
			testCases: [
				{
					...firstTestCase(),
					target: { kind: "ui", selector: "button`\n# injected" },
				},
			],
		}),
	);
	const targetLine = markdown
		.split("\n")
		.find((line) => line.startsWith("- Target:"));
	assert.match(targetLine ?? "", /button` # injected/);
	assert.doesNotMatch(markdown, /^# injected$/m);
});

test("markdown retains request headers, invoke input, and required data state", () => {
	const base = buildValidTestGraph();
	const dataId = createStableId("dataRequirement", base.planId, "account");
	const requestMarkdown = renderTestGraphMarkdown(
		buildValidTestGraph({
			dataRequirements: [
				{
					id: dataId,
					name: "Account",
					description: "Existing account state.",
					kind: "account",
					provisioning: "existing",
					sensitivity: "internal",
					provenance: firstRequirement().provenance,
					requiredState: { enabled: true },
				},
			],
			testCases: [
				{
					...firstTestCase(),
					consumesDataRequirementIds: [dataId],
				},
			],
			steps: [
				{
					...firstStep(),
					action: {
						kind: "request",
						method: "POST",
						path: "/login",
						headers: { "X-Trace": "trace-1" },
						body: { email: "user@example.com" },
					},
				},
			],
		}),
	);
	assert.match(requestMarkdown, /headers .*X-Trace.*trace-1/);
	assert.match(requestMarkdown, /Required state: .*enabled.*true/);

	const invokeMarkdown = renderTestGraphMarkdown(
		buildValidTestGraph({
			steps: [
				{
					...firstStep(),
					action: {
						kind: "invoke",
						system: "billing",
						operation: "charge",
						input: { accountId: testGraphIds.caseId },
					},
				},
			],
		}),
	);
	assert.match(invokeMarkdown, /input .*accountId/);
});

test("the renderer does not mutate its input", async () => {
	const input = await loadJsonFixture(FIXTURE);
	const frozen = JSON.stringify(input);
	renderTestGraphMarkdown(input);
	assert.equal(JSON.stringify(input), frozen);
});

test("rendering is deterministic across runs", async () => {
	const input = await loadJsonFixture(FIXTURE);
	assert.equal(renderTestGraphMarkdown(input), renderTestGraphMarkdown(input));
});

test("the public barrel re-exports the same renderer", async () => {
	const input = await loadJsonFixture(FIXTURE);
	assert.equal(renderFromBarrel(input), renderTestGraphMarkdown(input));
});
