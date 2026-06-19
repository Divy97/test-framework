import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	createFakeProvider,
	type FakeOutcome,
	fakeOk,
	parseTestGraph,
	type TestGraphV1,
} from "@test-framework/qa-engine";
import { baseDraft, baseFixture } from "../test-helpers.js";
import { compileGraph } from "./builders.js";
import {
	buildCreatePlanInput,
	providerConfigFor,
	recordQaEngineArm,
	recordRawModelArm,
	requireLiveConfig,
	validateAndSerialize,
} from "./record-arms.js";

/**
 * Fake-backed coverage of the recording tool's non-live machinery. The live call
 * path (a real `createProvider`) is exercised only in the gated Slice 3 step with a
 * key; here every path runs keylessly via the deterministic fake.
 */

const FIXED_NOW = () => Date.parse("2026-06-19T00:00:00.000Z");

// The engine's minimal valid happy path: one scripted outcome per internal stage
// (evidence -> requirements -> features -> cases -> details -> review).
function happyEngineScript(): FakeOutcome[] {
	const evidence = {
		evidence: [
			{
				key: "claim",
				sourceKey: baseFixture().title,
				kind: "statement",
				claim: "The fixture brief states a requirement.",
			},
		],
	};
	const requirements = {
		requirements: [
			{
				key: "req",
				statement: "A user can perform the core action.",
				kind: "functional",
				provenance: { kind: "explicit", evidenceKeys: ["claim"] },
				priority: "p0",
				risk: "high",
				openQuestionKeys: [],
			},
		],
		openQuestions: [],
	};
	const features = {
		features: [
			{
				key: "core",
				name: "Core",
				description: "Core behaviour.",
				requirementKeys: ["req"],
				targets: [{ kind: "ui", route: "/" }],
				provenance: { kind: "explicit", evidenceKeys: ["claim"] },
				risk: "high",
			},
		],
	};
	const cases = {
		testCases: [
			{
				key: "happy",
				title: "Core action succeeds",
				objective: "Verify the core action.",
				type: "positive",
				priority: "p0",
				risk: "high",
				riskRationale: "Primary path.",
				provenance: { kind: "explicit", evidenceKeys: ["claim"] },
				requirementKeys: ["req"],
				featureKeys: ["core"],
				qualityTags: ["functional"],
				actor: { role: "user", authentication: "anonymous", permissions: [] },
				target: { kind: "ui", route: "/" },
				preconditions: [{ description: "The app is reachable." }],
				dependsOnCaseKeys: [],
				consumesDataKeys: [],
				producesDataKeys: [],
				postconditions: [{ description: "The action is recorded." }],
				cleanup: { intent: "none", dataKeys: [], afterCaseKeys: [] },
				automation: { readiness: "ready", blockers: [] },
			},
		],
	};
	const details = {
		dataRequirements: [],
		steps: [
			{
				key: "act",
				caseKey: "happy",
				order: 1,
				description: "Perform the core action.",
				action: { kind: "interact", operation: "submit", selector: "#form" },
				provenance: { kind: "explicit", evidenceKeys: ["claim"] },
			},
		],
		assertions: [
			{
				key: "ok",
				caseKey: "happy",
				stepKey: "act",
				provenance: { kind: "explicit", evidenceKeys: ["claim"] },
				subject: "status",
				observationPoint: { kind: "ui", route: "/" },
				matcher: "equals",
				expected: "ok",
			},
		],
	};
	const review = { blocking: false, findings: [] };

	return [
		fakeOk({ data: evidence }),
		fakeOk({ data: requirements }),
		fakeOk({ data: features }),
		fakeOk({ data: cases }),
		fakeOk({ data: details }),
		fakeOk({ data: review }),
	];
}

test("buildCreatePlanInput turns a fixture into a brief + supplied sources", () => {
	const input = buildCreatePlanInput(baseFixture());
	assert.equal(input.title, baseFixture().title);
	assert.equal(input.sources[0]?.kind, "feature-request");
	assert.equal(input.sources[0]?.content, baseFixture().brief);
	// The one supplied source becomes its own source.
	assert.equal(input.sources.length, 2);
	assert.equal(input.sources[1]?.title, "Spec");
});

test("providerConfigFor references the key by env, never inlines it", () => {
	const config = providerConfigFor({
		provider: "anthropic",
		model: "claude-opus-4-8",
		keyVar: "ANTHROPIC_API_KEY",
	});
	assert.deepEqual(config.keySource, {
		kind: "env",
		var: "ANTHROPIC_API_KEY",
	});
	assert.ok(!("apiKey" in config), "config must not carry a raw key");
});

test("requireLiveConfig throws without RUN_LIVE_PROVIDER", () => {
	assert.throws(
		() => requireLiveConfig({ ANTHROPIC_API_KEY: "sk-ant-x" }),
		/RUN_LIVE_PROVIDER/,
	);
});

test("requireLiveConfig throws when no provider key is present", () => {
	assert.throws(
		() => requireLiveConfig({ RUN_LIVE_PROVIDER: "1" }),
		/ANTHROPIC_API_KEY or OPENROUTER_API_KEY/,
	);
});

test("requireLiveConfig resolves anthropic when its key is set", () => {
	const live = requireLiveConfig({
		RUN_LIVE_PROVIDER: "1",
		ANTHROPIC_API_KEY: "sk-ant-x",
	});
	assert.equal(live.provider, "anthropic");
	assert.equal(live.keyVar, "ANTHROPIC_API_KEY");
});

test("validateAndSerialize emits canonical, re-parseable bytes for a valid graph", () => {
	const { graph } = compileGraph(baseDraft());
	const text = validateAndSerialize(graph as TestGraphV1, "unit/qa-engine");
	assert.ok(text.endsWith("\n"));
	// Round-trips: parsing then re-serializing is byte-identical.
	assert.equal(
		validateAndSerialize(parseTestGraph(JSON.parse(text)), "unit/qa-engine"),
		text,
	);
});

test("validateAndSerialize throws on an invalid captured graph", () => {
	const broken = { schemaVersion: "test-graph/v1" } as unknown as TestGraphV1;
	assert.throws(
		() => validateAndSerialize(broken, "unit/raw-model"),
		/invalid/,
	);
});

test("recordQaEngineArm drives createPlan through the fake and returns a valid graph", async () => {
	const root = await mkdtemp(join(tmpdir(), "record-arms-test-"));
	try {
		const graph = await recordQaEngineArm(buildCreatePlanInput(baseFixture()), {
			provider: createFakeProvider(happyEngineScript()),
			now: FIXED_NOW,
			workspaceRoot: root,
		});
		// The wiring produced a graph the canonical-write path accepts.
		const text = validateAndSerialize(graph, "unit/qa-engine");
		assert.ok(text.length > 0);
		assert.equal(graph.schemaVersion, "test-graph/v1");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("recordRawModelArm asks for a structured graph and returns the model's graph", async () => {
	const { graph } = compileGraph(baseDraft());
	// The fake validates ok.data against the request schema (test-graph/v1), so a
	// passing result here means the same contract holds for a real adapter.
	const provider = createFakeProvider([fakeOk({ data: graph })], {
		recordCalls: true,
	});
	const captured = await recordRawModelArm(
		buildCreatePlanInput(baseFixture()),
		{
			provider,
			now: FIXED_NOW,
			workspaceRoot: "/unused",
		},
	);
	assert.equal(captured.schemaVersion, "test-graph/v1");
	assert.equal(provider.calls.length, 1);
	assert.ok(
		provider.calls[0]?.req.schema,
		"raw-model must request structured output",
	);
});
