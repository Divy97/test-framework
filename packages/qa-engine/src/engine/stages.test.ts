import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createFakeProvider,
	fakeError,
	fakeOk,
} from "../providers/fake/fake-provider.js";
import { type PlanDraft, planDraftSchema } from "./drafts.js";
import { EngineError } from "./errors.js";
import { runRefineStage } from "./stages.js";
import type { EngineDeps } from "./types.js";

const FULL_DRAFT: PlanDraft = {
	evidence: [
		{
			key: "login-claim",
			sourceKey: "Login brief",
			kind: "statement",
			claim: "Users must log in with email and password.",
		},
	],
	requirements: [
		{
			key: "user-can-login",
			statement: "A registered user can log in with valid credentials.",
			kind: "functional",
			provenance: { kind: "explicit", evidenceKeys: ["login-claim"] },
			priority: "p0",
			risk: "high",
			openQuestionKeys: [],
		},
	],
	openQuestions: [],
	features: [
		{
			key: "authentication",
			name: "Authentication",
			description: "Email and password authentication.",
			requirementKeys: ["user-can-login"],
			targets: [{ kind: "ui", route: "/login" }],
			provenance: { kind: "explicit", evidenceKeys: ["login-claim"] },
			risk: "high",
		},
	],
	testCases: [
		{
			key: "login-succeeds",
			title: "Login succeeds with valid credentials",
			objective: "Verify a registered user can log in.",
			type: "positive",
			priority: "p0",
			risk: "high",
			riskRationale: "Authentication is the entry point.",
			provenance: { kind: "explicit", evidenceKeys: ["login-claim"] },
			requirementKeys: ["user-can-login"],
			featureKeys: ["authentication"],
			qualityTags: ["functional", "security"],
			actor: {
				role: "registered-user",
				authentication: "anonymous",
				permissions: [],
			},
			target: { kind: "ui", route: "/login" },
			preconditions: [{ description: "A registered account exists." }],
			dependsOnCaseKeys: [],
			consumesDataKeys: [],
			producesDataKeys: [],
			postconditions: [{ description: "User is on the dashboard." }],
			cleanup: { intent: "none", dataKeys: [], afterCaseKeys: [] },
			automation: { readiness: "ready", blockers: [] },
		},
	],
	dataRequirements: [],
	steps: [
		{
			key: "submit-credentials",
			caseKey: "login-succeeds",
			order: 1,
			description: "Submit valid credentials on the login form.",
			action: {
				kind: "interact",
				operation: "submit",
				selector: "#login-form",
			},
			provenance: { kind: "explicit", evidenceKeys: ["login-claim"] },
		},
	],
	assertions: [
		{
			key: "redirects-to-dashboard",
			caseKey: "login-succeeds",
			stepKey: "submit-credentials",
			provenance: { kind: "explicit", evidenceKeys: ["login-claim"] },
			subject: "current route",
			observationPoint: { kind: "ui", route: "/dashboard" },
			matcher: "equals",
			expected: "/dashboard",
		},
	],
};

function depsWith(provider: EngineDeps["provider"]): EngineDeps {
	return { provider, now: () => 0, workspaceRoot: "/unused" };
}

test("runRefineStage returns a PlanDraft and tracks usage", async () => {
	const deps = depsWith(
		createFakeProvider([
			fakeOk({
				data: FULL_DRAFT,
				usage: { inputTokens: 11, outputTokens: 22, totalTokens: 33 },
			}),
		]),
	);

	const result = await runRefineStage(deps, FULL_DRAFT, "Add a negative case.");

	// Refine honors the same structured full-draft contract as every other stage.
	assert.equal(planDraftSchema.safeParse(result.data).success, true);
	assert.deepEqual(result.usage, {
		inputTokens: 11,
		outputTokens: 22,
		totalTokens: 33,
	});
});

test("runRefineStage maps schema-invalid output to MODEL_OUTPUT_INVALID", async () => {
	// Non-ProviderError (schema mismatch) falls back to MODEL_OUTPUT_INVALID, the
	// same mapping every stage uses for bad structured output.
	const deps = depsWith(
		createFakeProvider([fakeOk({ data: { evidence: "not-an-array" } })]),
	);

	await assert.rejects(
		runRefineStage(deps, FULL_DRAFT, "Add a negative case."),
		(err: unknown) =>
			err instanceof EngineError && err.code === "MODEL_OUTPUT_INVALID",
	);
});

test("runRefineStage passes a ProviderError code through unchanged", async () => {
	// A seam error keeps its code (failure-mapping parity with other stages).
	const deps = depsWith(createFakeProvider([fakeError("PROVIDER_TRANSIENT")]));

	await assert.rejects(
		runRefineStage(deps, FULL_DRAFT, "Add a negative case."),
		(err: unknown) =>
			err instanceof EngineError && err.code === "PROVIDER_TRANSIENT",
	);
});
