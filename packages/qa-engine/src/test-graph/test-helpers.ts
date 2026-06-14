import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createStableId } from "./ids.js";
import type { TestGraphV1 } from "./schema.js";
import { TEST_GRAPH_SCHEMA_VERSION } from "./version.js";

/**
 * Test-only fixture loader. Resolves paths relative to `test/fixtures/` so test
 * files do not hardcode brittle relative paths. Not part of the public API.
 */
export async function loadJsonFixture(relativePath: string): Promise<unknown> {
	const fileUrl = new URL(
		`../../test/fixtures/${relativePath}`,
		import.meta.url,
	);
	const raw = await readFile(fileURLToPath(fileUrl), "utf8");
	return JSON.parse(raw) as unknown;
}

const PROJECT_ID = createStableId("project", "test-framework", "demo");
const PLAN_ID = createStableId("plan", PROJECT_ID, "demo plan");
const SOURCE_ID = createStableId("source", PLAN_ID, "feature request");
const EVIDENCE_ID = createStableId("evidence", PLAN_ID, "login claim");
const REQUIREMENT_ID = createStableId(
	"requirement",
	PLAN_ID,
	"user can log in",
);
const FEATURE_ID = createStableId("feature", PLAN_ID, "authentication");
const CASE_ID = createStableId("testCase", PLAN_ID, "login succeeds");
const STEP_ID = createStableId("step", CASE_ID, "submit credentials");
const ASSERTION_ID = createStableId(
	"assertion",
	CASE_ID,
	"redirects to dashboard",
);
const GENERATION_ID = createStableId("generation", PLAN_ID, "initial");

/**
 * Builds the smallest graph that satisfies every structural and invariant rule
 * for a `complete` plan. Tests clone and mutate it to construct invalid graphs
 * and revision-transition pairs. Test-only; never exported from the package.
 */
export function buildValidTestGraph(
	overrides: Partial<TestGraphV1> = {},
): TestGraphV1 {
	const base: TestGraphV1 = {
		schemaVersion: TEST_GRAPH_SCHEMA_VERSION,
		projectId: PROJECT_ID,
		planId: PLAN_ID,
		planVersion: 1,
		title: "Demo plan",
		status: "complete",
		createdAt: "2026-06-14T10:00:00.000Z",
		updatedAt: "2026-06-14T10:00:00.000Z",
		generation: {
			id: GENERATION_ID,
			generatedAt: "2026-06-14T10:00:00.000Z",
			methodologyVersion: "1.0.0",
			workflowVersion: "1.0.0",
			inputFingerprint: "demo-fingerprint",
			generator: { kind: "manual" },
			status: "complete",
			warnings: [],
		},
		sources: [
			{
				id: SOURCE_ID,
				kind: "feature-request",
				title: "Login feature request",
				supplied: true,
			},
		],
		evidence: [
			{
				id: EVIDENCE_ID,
				sourceId: SOURCE_ID,
				kind: "statement",
				claim: "Users must be able to log in with email and password.",
			},
		],
		requirements: [
			{
				id: REQUIREMENT_ID,
				statement: "A registered user can log in with valid credentials.",
				kind: "functional",
				provenance: { kind: "explicit", evidenceIds: [EVIDENCE_ID] },
				priority: "p0",
				risk: "high",
				openQuestionIds: [],
			},
		],
		features: [
			{
				id: FEATURE_ID,
				name: "Authentication",
				description: "Email and password authentication.",
				requirementIds: [REQUIREMENT_ID],
				targets: [{ kind: "ui", route: "/login" }],
				provenance: { kind: "explicit", evidenceIds: [EVIDENCE_ID] },
				risk: "high",
			},
		],
		testCases: [
			{
				id: CASE_ID,
				title: "Login succeeds with valid credentials",
				objective: "Verify a registered user can log in.",
				type: "positive",
				priority: "p0",
				risk: "high",
				riskRationale: "Authentication is the entry point to the product.",
				provenance: { kind: "explicit", evidenceIds: [EVIDENCE_ID] },
				requirementIds: [REQUIREMENT_ID],
				featureIds: [FEATURE_ID],
				qualityTags: ["functional", "security"],
				actor: {
					role: "registered-user",
					authentication: "anonymous",
					permissions: [],
				},
				target: { kind: "ui", route: "/login" },
				preconditions: [{ description: "A registered account exists." }],
				dependsOnCaseIds: [],
				consumesDataRequirementIds: [],
				producesDataRequirementIds: [],
				postconditions: [{ description: "User is on the dashboard." }],
				cleanup: {
					intent: "none",
					dataRequirementIds: [],
					afterCaseIds: [],
				},
				automation: { readiness: "ready", blockers: [] },
			},
		],
		steps: [
			{
				id: STEP_ID,
				testCaseId: CASE_ID,
				order: 1,
				description: "Submit valid credentials on the login form.",
				action: {
					kind: "interact",
					operation: "submit",
					selector: "#login-form",
				},
				provenance: { kind: "explicit", evidenceIds: [EVIDENCE_ID] },
			},
		],
		assertions: [
			{
				id: ASSERTION_ID,
				testCaseId: CASE_ID,
				stepId: STEP_ID,
				provenance: { kind: "explicit", evidenceIds: [EVIDENCE_ID] },
				subject: "current route",
				observationPoint: { kind: "ui", route: "/dashboard" },
				matcher: "equals",
				expected: "/dashboard",
			},
		],
		dataRequirements: [],
		openQuestions: [],
	};

	return { ...base, ...overrides };
}

export const testGraphIds = {
	projectId: PROJECT_ID,
	planId: PLAN_ID,
	sourceId: SOURCE_ID,
	evidenceId: EVIDENCE_ID,
	requirementId: REQUIREMENT_ID,
	featureId: FEATURE_ID,
	caseId: CASE_ID,
	stepId: STEP_ID,
	assertionId: ASSERTION_ID,
	generationId: GENERATION_ID,
} as const;
