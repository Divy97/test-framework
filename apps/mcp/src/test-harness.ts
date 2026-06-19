import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
	type createFakeProvider,
	type FakeOutcome,
	fakeOk,
} from "@test-framework/qa-engine";
import type { EngineRuntime } from "./engine-runtime.js";
import { createMcpServer, type RuntimeFactory } from "./server.js";

/**
 * Shared test harness for the MCP adapter suites. Lives in a non-`*.test.ts`
 * module so a suite can import it without re-registering another suite's tests
 * (a test file importing another test file double-runs it under `tsx --test`).
 */

export const FIXED_NOW = () => Date.parse("2026-06-19T00:00:00.000Z");

// --- scripted stage payloads (mirrors qa-engine/engine.test.ts happyScript) ----

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
const CASES = {
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
};
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

export function happyScript(): FakeOutcome[] {
	return [
		fakeOk({ data: EVIDENCE }),
		fakeOk({ data: REQUIREMENTS }),
		fakeOk({ data: FEATURES }),
		fakeOk({ data: CASES }),
		fakeOk({ data: DETAILS }),
		fakeOk({ data: REVIEW }),
	];
}

export const CREATE_ARGS = {
	project: { name: "Acme Loyalty" },
	title: "Login feature",
	sources: [
		{
			kind: "feature-request" as const,
			title: "Login brief",
			content: "Users must log in with email and password.",
		},
	],
};

export async function tempRoot(prefix = "mcp-adapter-"): Promise<string> {
	return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

export function fakeRuntimeFactory(
	provider: ReturnType<typeof createFakeProvider>,
	workspaceRoot: string,
): RuntimeFactory {
	const runtime: EngineRuntime = { provider, now: FIXED_NOW, workspaceRoot };
	return async () => runtime;
}

export async function connectInMemoryClient(
	runtimeFactory: RuntimeFactory,
): Promise<Client> {
	const server = createMcpServer(runtimeFactory);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: "in-memory-test", version: "0.1.0" });
	await client.connect(clientTransport);
	return client;
}
