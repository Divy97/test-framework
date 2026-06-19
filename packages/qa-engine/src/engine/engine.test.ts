import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	createFakeProvider,
	type FakeOutcome,
	fakeError,
	fakeOk,
} from "../providers/fake/fake-provider.js";
import { validateTestGraph } from "../test-graph/validate.js";
import { createPlan, loadPlan } from "./engine.js";
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
