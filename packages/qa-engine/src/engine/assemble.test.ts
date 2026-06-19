import assert from "node:assert/strict";
import { test } from "node:test";
import { createStableId } from "../test-graph/ids.js";
import { validateTestGraph } from "../test-graph/validate.js";
import { type AssembleMeta, assemble } from "./assemble.js";
import type { PlanDraft } from "./drafts.js";
import { ingest } from "./identity.js";
import type { CreatePlanInput } from "./types.js";

const INPUT: CreatePlanInput = {
	project: { name: "Acme Loyalty" },
	title: "Login feature",
	sources: [
		{
			kind: "feature-request",
			title: "Login brief",
			content: "Users must log in with email and password.",
		},
	],
};

const META: AssembleMeta = {
	generatedAt: "2026-06-19T00:00:00.000Z",
	createdAt: "2026-06-19T00:00:00.000Z",
	updatedAt: "2026-06-19T00:00:00.000Z",
	methodologyVersion: "1.0.0",
	workflowVersion: "1.0.0",
	generator: { kind: "model", provider: "fake", model: "fake-1" },
	status: "complete",
	warnings: [],
};

/** Minimal valid draft: one of each entity, all cross-refs by key. */
function minimalDraft(): PlanDraft {
	return {
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
}

test("assemble turns a slug-keyed draft into a valid test-graph/v1", () => {
	const ingested = ingest(INPUT);
	const graph = assemble(ingested, minimalDraft(), META);

	const result = validateTestGraph(graph);
	assert.equal(result.valid, true, JSON.stringify(result, null, 2));
});

test("assemble derives stable IDs and resolves cross-references by key", () => {
	const ingested = ingest(INPUT);
	const graph = assemble(ingested, minimalDraft(), META);

	// The model never emits IDs; the engine derives them and wires links.
	assert.equal(graph.planId, ingested.planId);
	assert.equal(
		graph.requirements[0]?.provenance.evidenceIds[0],
		graph.evidence[0]?.id,
	);
	assert.equal(
		graph.testCases[0]?.requirementIds[0],
		graph.requirements[0]?.id,
	);
	assert.equal(graph.steps[0]?.testCaseId, graph.testCases[0]?.id);
	assert.equal(graph.assertions[0]?.testCaseId, graph.testCases[0]?.id);
	assert.equal(graph.assertions[0]?.stepId, graph.steps[0]?.id);
});

test("assemble rejects a draft that references an unknown key", () => {
	const ingested = ingest(INPUT);
	const draft = minimalDraft();
	const [requirement] = draft.requirements;
	assert.ok(requirement);
	requirement.provenance = {
		kind: "explicit",
		evidenceKeys: ["does-not-exist"],
	};
	assert.throws(() => assemble(ingested, draft, META), /unknown evidence/);
});

test("assemble rejects a duplicate semantic key within a stage", () => {
	const ingested = ingest(INPUT);
	const draft = minimalDraft();
	const [requirement] = draft.requirements;
	assert.ok(requirement);
	draft.requirements.push({ ...requirement });
	assert.throws(() => assemble(ingested, draft, META), /Duplicate requirement/);
});

test("assemble defaults reproduce a v1 generation node", () => {
	const ingested = ingest(INPUT);
	const graph = assemble(ingested, minimalDraft(), META);

	// No planVersion/generationKey in meta -> the create path is byte-unchanged.
	assert.equal(graph.planVersion, 1);
	assert.equal(
		graph.generation.id,
		createStableId("generation", ingested.planId, "initial"),
	);
});

test("assemble honors an explicit planVersion and generationKey", () => {
	const ingested = ingest(INPUT);
	const v1 = assemble(ingested, minimalDraft(), META);
	const v2 = assemble(ingested, minimalDraft(), {
		...META,
		planVersion: 2,
		generationKey: "revision-2",
	});

	assert.equal(v2.planVersion, 2);
	assert.equal(
		v2.generation.id,
		createStableId("generation", ingested.planId, "revision-2"),
	);
	// Each revision's generation event gets a distinct stable id.
	assert.notEqual(v2.generation.id, v1.generation.id);
});
