import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	createFakeProvider,
	type FakeOutcome,
	fakeError,
	fakeOk,
} from "../providers/fake/fake-provider.js";
import type { TestGraphV1 } from "../test-graph/schema.js";
import {
	validatePlanRevisionTransition,
	validateTestGraph,
} from "../test-graph/validate.js";
import { decomposePlan } from "./decompose.js";
import { createPlan, loadPlan, refinePlan } from "./engine.js";
import { EngineError } from "./errors.js";
import type { CreatePlanInput, EngineDeps } from "./types.js";

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

const FIXED_NOW = () => Date.parse("2026-06-19T00:00:00.000Z");

// Stage payloads that together form one minimal valid plan.
const EVIDENCE = {
	evidence: [
		{
			key: "login-claim",
			sourceKey: "Login brief",
			kind: "statement",
			claim: "Users must log in with email and password.",
		},
	],
};
const REQUIREMENTS = {
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
};
const FEATURES = {
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
};
function caseWith(requirementKeys: string[]) {
	return {
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
				requirementKeys,
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
	};
}
const DETAILS = {
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
const REVIEW = { blocking: false, findings: [] };

const FULL_DRAFT = {
	evidence: EVIDENCE.evidence,
	requirements: REQUIREMENTS.requirements,
	openQuestions: REQUIREMENTS.openQuestions,
	features: FEATURES.features,
	testCases: caseWith(["user-can-login"]).testCases,
	dataRequirements: DETAILS.dataRequirements,
	steps: DETAILS.steps,
	assertions: DETAILS.assertions,
};

function happyScript(): FakeOutcome[] {
	return [
		fakeOk({ data: EVIDENCE }),
		fakeOk({ data: REQUIREMENTS }),
		fakeOk({ data: FEATURES }),
		fakeOk({ data: caseWith(["user-can-login"]) }),
		fakeOk({ data: DETAILS }),
		fakeOk({ data: REVIEW }),
	];
}

async function tempRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), "qa-engine-"));
}

function depsWith(script: FakeOutcome[], workspaceRoot: string): EngineDeps {
	return {
		provider: createFakeProvider(script),
		now: FIXED_NOW,
		workspaceRoot,
	};
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

test("createPlan produces a valid persisted test-graph/v1 from a brief", async () => {
	const root = await tempRoot();
	try {
		const result = await createPlan(INPUT, depsWith(happyScript(), root));

		assert.equal(validateTestGraph(result.graph).valid, true);
		assert.equal(result.status, "complete");
		assert.ok(await exists(join(result.planDir, "plan.json")));
		assert.ok(await exists(join(result.planDir, "plan.md")));
		assert.ok(await exists(join(result.planDir, "generation.json")));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan is byte-stable under a fixed clock and scripted fake", async () => {
	const rootA = await tempRoot();
	const rootB = await tempRoot();
	try {
		const a = await createPlan(INPUT, depsWith(happyScript(), rootA));
		const b = await createPlan(INPUT, depsWith(happyScript(), rootB));

		const bytesA = await readFile(join(a.planDir, "plan.json"), "utf8");
		const bytesB = await readFile(join(b.planDir, "plan.json"), "utf8");
		assert.equal(bytesA, bytesB);
		const genA = await readFile(join(a.planDir, "generation.json"), "utf8");
		const genB = await readFile(join(b.planDir, "generation.json"), "utf8");
		assert.equal(genA, genB);
	} finally {
		await rm(rootA, { recursive: true, force: true });
		await rm(rootB, { recursive: true, force: true });
	}
});

test("loadPlan round-trips a persisted plan", async () => {
	const root = await tempRoot();
	try {
		const created = await createPlan(INPUT, depsWith(happyScript(), root));
		const loaded = await loadPlan(
			{ planId: created.graph.planId },
			{ workspaceRoot: root },
		);
		assert.deepEqual(loaded, created.graph);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan repairs an invalid draft within budget", async () => {
	const root = await tempRoot();
	try {
		// Cases stage emits a case covering zero requirements -> CASE_REQUIREMENT_REQUIRED.
		// The repair stage returns a corrected full draft.
		const script: FakeOutcome[] = [
			fakeOk({ data: EVIDENCE }),
			fakeOk({ data: REQUIREMENTS }),
			fakeOk({ data: FEATURES }),
			fakeOk({ data: caseWith([]) }),
			fakeOk({ data: DETAILS }),
			fakeOk({ data: REVIEW }),
			fakeOk({ data: FULL_DRAFT }), // repair
		];
		const result = await createPlan(INPUT, depsWith(script, root));
		assert.equal(validateTestGraph(result.graph).valid, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan throws PLAN_INVARIANT_FAILED and writes nothing when repair budget is spent", async () => {
	const root = await tempRoot();
	try {
		const script: FakeOutcome[] = [
			fakeOk({ data: EVIDENCE }),
			fakeOk({ data: REQUIREMENTS }),
			fakeOk({ data: FEATURES }),
			fakeOk({ data: caseWith([]) }),
			fakeOk({ data: DETAILS }),
			fakeOk({ data: REVIEW }),
		];
		const deps = { ...depsWith(script, root), repairBudget: 0 };
		await assert.rejects(createPlan(INPUT, deps), (err: unknown) => {
			assert.ok(err instanceof EngineError);
			assert.equal(err.code, "PLAN_INVARIANT_FAILED");
			return true;
		});
		assert.equal(await exists(join(root, ".test-framework")), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan maps a provider error to a typed EngineError and writes nothing", async () => {
	const root = await tempRoot();
	try {
		const deps = depsWith([fakeError("PROVIDER_AUTH")], root);
		await assert.rejects(createPlan(INPUT, deps), (err: unknown) => {
			assert.ok(err instanceof EngineError);
			assert.equal(err.code, "PROVIDER_AUTH");
			return true;
		});
		assert.equal(await exists(join(root, ".test-framework")), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan rejects empty input before any model call", async () => {
	const root = await tempRoot();
	try {
		const deps = depsWith([], root);
		await assert.rejects(
			createPlan({ ...INPUT, title: "   " }, deps),
			(err: unknown) => {
				assert.ok(err instanceof EngineError);
				assert.equal(err.code, "INVALID_INPUT");
				return true;
			},
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan maps a failed repo scan to REPO_ACCESS_DENIED before any model call", async () => {
	const root = await tempRoot();
	try {
		const deps: EngineDeps = {
			...depsWith([], root),
			scan: () => Promise.reject(new Error("path escapes repo root")),
		};
		await assert.rejects(
			createPlan({ ...INPUT, repo: { path: "/outside" } }, deps),
			(err: unknown) =>
				err instanceof EngineError && err.code === "REPO_ACCESS_DENIED",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan surfaces a truncated repo scan as a warning, not an error", async () => {
	const root = await tempRoot();
	try {
		const deps: EngineDeps = {
			...depsWith(happyScript(), root),
			scan: () =>
				Promise.resolve({ signals: ["uses bcrypt"], truncated: true }),
		};
		const result = await createPlan({ ...INPUT, repo: { path: "." } }, deps);
		assert.ok(result.warnings.some((w) => /truncated/i.test(w)));
		assert.ok(
			result.graph.generation.warnings.some((w) => /truncated/i.test(w)),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createPlan maps schema-mismatched model output to MODEL_OUTPUT_INVALID", async () => {
	const root = await tempRoot();
	try {
		const deps = depsWith(
			[fakeOk({ data: { evidence: "not-an-array" } })],
			root,
		);
		await assert.rejects(createPlan(INPUT, deps), (err: unknown) => {
			assert.ok(err instanceof EngineError);
			assert.equal(err.code, "MODEL_OUTPUT_INVALID");
			return true;
		});
		assert.equal(await exists(join(root, ".test-framework")), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadPlan rejects a malformed planId and a missing plan", async () => {
	const root = await tempRoot();
	try {
		await assert.rejects(
			loadPlan({ planId: "../escape" }, { workspaceRoot: root }),
			(err: unknown) =>
				err instanceof EngineError && err.code === "INVALID_INPUT",
		);
		await assert.rejects(
			loadPlan(
				{ planId: "plan_0000000000000000beef" },
				{ workspaceRoot: root },
			),
			(err: unknown) =>
				err instanceof EngineError && err.code === "ARTIFACT_NOT_FOUND",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// --- refinePlan ---------------------------------------------------------------

// A clock strictly after FIXED_NOW so the revision's updatedAt advances.
const LATER_NOW = () => Date.parse("2026-06-20T00:00:00.000Z");

const FEEDBACK = "Add a negative login case for locked-out accounts.";

/**
 * Script for one refine: the refine stage re-emits the decomposed (id-keyed)
 * draft of `previous`, then review. Keying by the previous graph's own ids keeps
 * every entity id constant across the revision.
 */
function refineScript(previous: TestGraphV1): FakeOutcome[] {
	const { draft } = decomposePlan(previous);
	return [fakeOk({ data: draft }), fakeOk({ data: REVIEW })];
}

async function createV1(root: string): Promise<TestGraphV1> {
	const created = await createPlan(INPUT, depsWith(happyScript(), root));
	return created.graph;
}

function refineDepsWith(
	script: FakeOutcome[],
	workspaceRoot: string,
): EngineDeps {
	return {
		provider: createFakeProvider(script),
		now: LATER_NOW,
		workspaceRoot,
	};
}

test("refinePlan produces a v2 revision that passes both validators", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		const result = await refinePlan(
			{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
			refineDepsWith(refineScript(v1), root),
		);

		assert.equal(result.graph.planVersion, 2);
		assert.equal(result.previousVersion, 1);
		assert.equal(validateTestGraph(result.graph).valid, true);
		assert.deepEqual(validatePlanRevisionTransition(v1, result.graph), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refinePlan preserves planId/projectId/createdAt and advances updatedAt", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		const result = await refinePlan(
			{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
			refineDepsWith(refineScript(v1), root),
		);

		assert.equal(result.graph.planId, v1.planId);
		assert.equal(result.graph.projectId, v1.projectId);
		assert.equal(result.graph.createdAt, v1.createdAt);
		assert.ok(
			Date.parse(result.graph.updatedAt) > Date.parse(v1.updatedAt),
			"updatedAt must strictly advance",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refinePlan is byte-stable across runs", async () => {
	const rootA = await tempRoot();
	const rootB = await tempRoot();
	try {
		const v1a = await createV1(rootA);
		const v1b = await createV1(rootB);
		const a = await refinePlan(
			{ planId: v1a.planId, feedback: FEEDBACK, expectedVersion: 1 },
			refineDepsWith(refineScript(v1a), rootA),
		);
		const b = await refinePlan(
			{ planId: v1b.planId, feedback: FEEDBACK, expectedVersion: 1 },
			refineDepsWith(refineScript(v1b), rootB),
		);

		const bytesA = await readFile(join(a.planDir, "plan.json"), "utf8");
		const bytesB = await readFile(join(b.planDir, "plan.json"), "utf8");
		assert.equal(bytesA, bytesB);
	} finally {
		await rm(rootA, { recursive: true, force: true });
		await rm(rootB, { recursive: true, force: true });
	}
});

test("refinePlan throws ARTIFACT_CONFLICT on a stale expectedVersion and writes nothing", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		const before = await loadPlan(
			{ planId: v1.planId },
			{ workspaceRoot: root },
		);
		await assert.rejects(
			refinePlan(
				{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 0 },
				refineDepsWith(refineScript(v1), root),
			),
			(err: unknown) =>
				err instanceof EngineError && err.code === "ARTIFACT_CONFLICT",
		);
		const after = await loadPlan(
			{ planId: v1.planId },
			{ workspaceRoot: root },
		);
		assert.equal(after.planVersion, 1);
		assert.deepEqual(after, before);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refinePlan throws ARTIFACT_NOT_FOUND for an unknown plan", async () => {
	const root = await tempRoot();
	try {
		await assert.rejects(
			refinePlan(
				{ planId: "plan_0000000000000000beef", feedback: FEEDBACK },
				refineDepsWith([], root),
			),
			(err: unknown) =>
				err instanceof EngineError && err.code === "ARTIFACT_NOT_FOUND",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refinePlan rejects empty feedback and a malformed planId before any model call", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		// Empty feedback: no stage runs (provider script is empty).
		await assert.rejects(
			refinePlan(
				{ planId: v1.planId, feedback: "   " },
				refineDepsWith([], root),
			),
			(err: unknown) =>
				err instanceof EngineError && err.code === "INVALID_INPUT",
		);
		// Malformed planId.
		await assert.rejects(
			refinePlan(
				{ planId: "../escape", feedback: FEEDBACK },
				refineDepsWith([], root),
			),
			(err: unknown) =>
				err instanceof EngineError && err.code === "INVALID_INPUT",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refinePlan maps a provider error to a typed EngineError and leaves v1 intact", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		await assert.rejects(
			refinePlan(
				{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
				refineDepsWith([fakeError("PROVIDER_AUTH")], root),
			),
			(err: unknown) =>
				err instanceof EngineError && err.code === "PROVIDER_AUTH",
		);
		const after = await loadPlan(
			{ planId: v1.planId },
			{ workspaceRoot: root },
		);
		assert.equal(after.planVersion, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refinePlan throws PLAN_INVARIANT_FAILED when repair budget is spent and leaves v1 intact", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		// Refine emits a case covering zero requirements -> CASE_REQUIREMENT_REQUIRED,
		// and review; with repairBudget 0 the invalid draft is terminal.
		const { draft } = decomposePlan(v1);
		const broken = {
			...draft,
			testCases: draft.testCases.map((testCase) => ({
				...testCase,
				requirementKeys: [],
			})),
		};
		const deps: EngineDeps = {
			...refineDepsWith(
				[fakeOk({ data: broken }), fakeOk({ data: REVIEW })],
				root,
			),
			repairBudget: 0,
		};
		await assert.rejects(
			refinePlan(
				{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
				deps,
			),
			(err: unknown) =>
				err instanceof EngineError && err.code === "PLAN_INVARIANT_FAILED",
		);
		const after = await loadPlan(
			{ planId: v1.planId },
			{ workspaceRoot: root },
		);
		assert.equal(after.planVersion, 1);
		assert.deepEqual(after, v1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("two concurrent refines: exactly one wins, the loser gets ARTIFACT_CONFLICT, plan stays coherent", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		const [a, b] = await Promise.allSettled([
			refinePlan(
				{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
				refineDepsWith(refineScript(v1), root),
			),
			refinePlan(
				{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
				refineDepsWith(refineScript(v1), root),
			),
		]);

		const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
		const rejected = [a, b].filter((r) => r.status === "rejected");
		assert.equal(fulfilled.length, 1, "exactly one refine wins");
		assert.equal(rejected.length, 1, "exactly one refine loses");
		const loser = rejected[0] as PromiseRejectedResult;
		assert.ok(loser.reason instanceof EngineError);
		assert.equal(loser.reason.code, "ARTIFACT_CONFLICT");

		// The persisted plan is exactly one coherent v2 revision.
		const loaded = await loadPlan(
			{ planId: v1.planId },
			{ workspaceRoot: root },
		);
		assert.equal(validateTestGraph(loaded).valid, true);
		assert.equal(loaded.planVersion, 2);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a refine race leaves no .lock behind", async () => {
	const root = await tempRoot();
	try {
		const v1 = await createV1(root);
		await Promise.allSettled([
			refinePlan(
				{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
				refineDepsWith(refineScript(v1), root),
			),
			refinePlan(
				{ planId: v1.planId, feedback: FEEDBACK, expectedVersion: 1 },
				refineDepsWith(refineScript(v1), root),
			),
		]);
		const planDir = join(root, ".test-framework", "plans", v1.planId);
		assert.equal((await readdir(planDir)).includes(".lock"), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
