import type { AnnoSpec, GraphDraft } from "./builders.js";

/**
 * The calibrated corpus. Each fixture has a Ground Truth and three arms authored as
 * hand-authored calibration tiers (`synthetic`): qa-engine = strong, host-only =
 * mediocre, raw-model = weak (often intentionally invalid). The Ground Truth is a
 * plain object validated by `fixtureSchema` in the builder.
 */
export type FixtureBuild = {
	fixture: unknown;
	arms: { draft: GraphDraft; anno: AnnoSpec }[];
};

const anonUser = {
	role: "user",
	authentication: "anonymous" as const,
	permissions: [] as string[],
};
const authUser = {
	role: "user",
	authentication: "authenticated" as const,
	permissions: [] as string[],
};
const sys = {
	role: "system",
	authentication: "not-applicable" as const,
	permissions: [] as string[],
};

const modelGen = {
	generator: { kind: "model", provider: "anthropic", model: "claude-opus-4-8" },
	generationStatus: "complete",
} as const;
const draftGen = {
	generator: { kind: "model", provider: "anthropic", model: "claude-opus-4-8" },
	generationStatus: "incomplete",
} as const;

// Common single supplied source + one evidence, reused by most arms.
function spec(claim: string): {
	sources: GraphDraft["sources"];
	evidence: GraphDraft["evidence"];
} {
	return {
		sources: [
			{
				ref: "spec",
				kind: "feature-request",
				title: "Feature spec",
				supplied: true,
			},
		],
		evidence: [{ ref: "e1", sourceRef: "spec", kind: "statement", claim }],
	};
}

// ---------------------------------------------------------------------------
// 1. UI form with validation and state behavior.
// ---------------------------------------------------------------------------

const uiForm: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "ui-form-validation",
		title: "Signup form validation and submit state",
		category: "ui-form",
		brief:
			"A signup form validates email and disables submit until the form is valid.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "feature-request",
				title: "Feature spec",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:email-valid",
				statement: "Email is required and must be a valid address.",
				kind: "functional",
				expectedStrength: "explicit",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
			{
				truthKey: "req:submit-gated",
				statement: "Submit is disabled until the form is valid.",
				kind: "ux",
				expectedStrength: "inferred",
				priority: "p2",
				risk: "low",
				mustCover: false,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:invalid-email-error",
				title: "Invalid email shows inline error",
				requirementKeys: ["req:email-valid"],
				type: "negative",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "inline error visible and submit blocked",
			},
			{
				truthKey: "scn:valid-enables-submit",
				title: "Valid form enables submit",
				requirementKeys: ["req:submit-gated"],
				type: "positive",
				priority: "p2",
				risk: "low",
				expectedAssertionHint: "submit becomes enabled",
			},
		],
		forbiddenClaims: [],
	},
	arms: [
		{
			draft: {
				fixtureId: "ui-form-validation",
				arm: "qa-engine",
				title: "Signup form plan",
				status: "complete",
				...modelGen,
				...spec(
					"Email is required and must be valid; submit stays disabled until valid.",
				),
				requirements: [
					{
						ref: "email",
						statement: "Email is required and valid.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
					{
						ref: "gated",
						statement: "Submit disabled until valid.",
						kind: "ux",
						strength: "inferred",
						evidenceRefs: ["e1"],
						rationale: "Standard form UX.",
						priority: "p2",
						risk: "low",
					},
				],
				cases: [
					{
						ref: "invalid",
						title: "Invalid email shows error",
						objective: "Reject a malformed email inline.",
						type: "negative",
						priority: "p1",
						risk: "medium",
						riskRationale: "Bad input must be caught.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["email"],
						qualityTags: ["functional"],
						actor: anonUser,
						target: { kind: "ui", route: "/signup" },
						steps: [
							{
								description: "Type an invalid email and blur.",
								action: {
									kind: "interact",
									operation: "fill",
									selector: "#email",
									value: "nope",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "err",
								subject: "email error text",
								observationPoint: {
									kind: "ui",
									route: "/signup",
									selector: "#email-error",
								},
								matcher: "contains",
								expected: "valid email",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
							{
								ref: "blocked",
								subject: "submit disabled",
								observationPoint: {
									kind: "ui",
									route: "/signup",
									selector: "#submit",
								},
								matcher: "disabled",
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
					},
					{
						ref: "valid",
						title: "Valid form enables submit",
						objective: "Enable submit once valid.",
						type: "positive",
						priority: "p2",
						risk: "low",
						riskRationale: "Primary path.",
						strength: "inferred",
						evidenceRefs: ["e1"],
						requirementRefs: ["gated"],
						qualityTags: ["usability"],
						actor: anonUser,
						target: { kind: "ui", route: "/signup" },
						steps: [
							{
								description: "Type a valid email.",
								action: {
									kind: "interact",
									operation: "fill",
									selector: "#email",
									value: "a@b.co",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "enabled",
								subject: "submit enabled",
								observationPoint: {
									kind: "ui",
									route: "/signup",
									selector: "#submit",
								},
								matcher: "enabled",
								strength: "inferred",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "email",
						map: { keys: ["req:email-valid"], satisfaction: "full" },
					},
					{
						ref: "gated",
						map: { keys: ["req:submit-gated"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "invalid",
						map: { keys: ["scn:invalid-email-error"], satisfaction: "full" },
					},
					{
						ref: "valid",
						map: { keys: ["scn:valid-enables-submit"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "ui-form-validation",
				arm: "host-only",
				title: "Signup form plan",
				status: "draft",
				...draftGen,
				...spec("Email is required and must be valid."),
				requirements: [
					{
						ref: "email",
						statement: "Email is required.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "invalid",
						title: "Invalid email",
						objective: "Check the email.",
						type: "negative",
						priority: "p1",
						risk: "medium",
						riskRationale: "Input check.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["email"],
						qualityTags: ["functional"],
						actor: anonUser,
						target: { kind: "ui", route: "/signup" },
						automation: { readiness: "partial", blockers: ["needs selector"] },
						steps: [
							{
								description: "Type bad email.",
								action: {
									kind: "interact",
									operation: "fill",
									selector: "#email",
									value: "nope",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "shown",
								subject: "error",
								observationPoint: {
									kind: "ui",
									route: "/signup",
									selector: "#email-error",
								},
								matcher: "visible",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "email",
						map: { keys: ["req:email-valid"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "invalid",
						map: {
							keys: ["scn:invalid-email-error"],
							satisfaction: "partial",
							reason: "No submit-blocked assertion.",
						},
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "ui-form-validation",
				arm: "raw-model",
				title: "Signup form plan",
				status: "draft",
				...draftGen,
				...spec("Email is required."),
				requirements: [
					{
						ref: "email",
						statement: "Email required.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "loose",
						title: "Check the form",
						objective: "Make sure it works.",
						type: "positive",
						priority: "p2",
						risk: "low",
						riskRationale: "General.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: [],
						qualityTags: [],
						actor: anonUser,
						target: { kind: "generic", description: "the form" },
						steps: [
							{
								description: "Open form.",
								action: { kind: "observe", subject: "form" },
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "loaded",
								subject: "page",
								observationPoint: { kind: "generic", description: "page" },
								matcher: "exists",
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: true,
				requirements: [
					{
						ref: "email",
						map: { keys: ["req:email-valid"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "loose",
						extra: {
							classification: "unsupported-invented",
							reason: "No requirement; vague.",
						},
					},
				],
			},
		},
	],
};

// ---------------------------------------------------------------------------
// 2. Authorization-sensitive API.
// ---------------------------------------------------------------------------

const authzApi: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "authz-api",
		title: "Owner-only task deletion API",
		category: "authz-api",
		brief:
			"Only a task owner may delete it; listing returns only the caller's tasks. No admin override.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "api-spec",
				title: "Task API spec",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:owner-only-delete",
				statement: "Only the owner may delete a task.",
				kind: "security",
				expectedStrength: "explicit",
				priority: "p0",
				risk: "high",
				mustCover: true,
			},
			{
				truthKey: "req:list-scoped",
				statement: "List returns only the caller's tasks.",
				kind: "security",
				expectedStrength: "inferred",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:non-owner-delete-403",
				title: "Non-owner delete forbidden",
				requirementKeys: ["req:owner-only-delete"],
				type: "security",
				priority: "p0",
				risk: "high",
				expectedAssertionHint: "DELETE returns 403 and task still exists",
			},
			{
				truthKey: "scn:list-only-own",
				title: "List only own tasks",
				requirementKeys: ["req:list-scoped"],
				type: "positive",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "list excludes other users' tasks",
			},
		],
		forbiddenClaims: [
			{
				claimKey: "claim:admin-override",
				statement: "Admins can delete any task — the spec forbids an override.",
			},
		],
	},
	arms: [
		{
			draft: {
				fixtureId: "authz-api",
				arm: "qa-engine",
				title: "Task authz plan",
				status: "complete",
				...modelGen,
				...spec(
					"Only owners delete tasks; list is scoped to the caller; no admin override.",
				),
				requirements: [
					{
						ref: "owner",
						statement: "Only owner may delete.",
						kind: "security",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p0",
						risk: "high",
					},
					{
						ref: "scoped",
						statement: "List scoped to caller.",
						kind: "security",
						strength: "inferred",
						evidenceRefs: ["e1"],
						rationale: "Implied by ownership.",
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "nonowner",
						title: "Non-owner delete is 403",
						objective: "Reject delete by a non-owner.",
						type: "security",
						priority: "p0",
						risk: "high",
						riskRationale: "Authz must fail closed.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["owner"],
						qualityTags: ["security"],
						actor: authUser,
						target: { kind: "api", method: "DELETE", path: "/tasks/{id}" },
						steps: [
							{
								description: "Delete a task owned by another user.",
								action: {
									kind: "request",
									method: "DELETE",
									path: "/tasks/42",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "s403",
								subject: "response.status",
								observationPoint: {
									kind: "api",
									method: "DELETE",
									path: "/tasks/{id}",
								},
								matcher: "statusCode",
								expected: 403,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
							{
								ref: "still",
								subject: "task exists",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/tasks/{id}",
								},
								matcher: "statusCode",
								expected: 200,
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
					},
					{
						ref: "list",
						title: "List returns only own tasks",
						objective: "Scope list to caller.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Leakage risk.",
						strength: "inferred",
						evidenceRefs: ["e1"],
						requirementRefs: ["scoped"],
						qualityTags: ["security"],
						actor: authUser,
						target: { kind: "api", method: "GET", path: "/tasks" },
						steps: [
							{
								description: "List tasks as the caller.",
								action: { kind: "request", method: "GET", path: "/tasks" },
								strength: "inferred",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "owned",
								subject: "every task.ownerId",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/tasks",
								},
								matcher: "equals",
								expected: "self",
								strength: "inferred",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "owner",
						map: { keys: ["req:owner-only-delete"], satisfaction: "full" },
					},
					{
						ref: "scoped",
						map: { keys: ["req:list-scoped"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "nonowner",
						map: { keys: ["scn:non-owner-delete-403"], satisfaction: "full" },
					},
					{
						ref: "list",
						map: { keys: ["scn:list-only-own"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "authz-api",
				arm: "host-only",
				title: "Task authz plan",
				status: "draft",
				...draftGen,
				...spec("Only owners delete tasks."),
				requirements: [
					{
						ref: "owner",
						statement: "Only owner deletes.",
						kind: "security",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p0",
						risk: "high",
					},
				],
				cases: [
					{
						ref: "nonowner",
						title: "Non-owner delete",
						objective: "Check authz.",
						type: "security",
						priority: "p0",
						risk: "high",
						riskRationale: "Authz.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["owner"],
						qualityTags: ["security"],
						actor: authUser,
						target: { kind: "api", method: "DELETE", path: "/tasks/{id}" },
						steps: [
							{
								description: "Delete other's task.",
								action: {
									kind: "request",
									method: "DELETE",
									path: "/tasks/42",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "s403",
								subject: "response.status",
								observationPoint: {
									kind: "api",
									method: "DELETE",
									path: "/tasks/{id}",
								},
								matcher: "statusCode",
								expected: 403,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "owner",
						map: { keys: ["req:owner-only-delete"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "nonowner",
						map: { keys: ["scn:non-owner-delete-403"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "authz-api",
				arm: "raw-model",
				title: "Task authz plan",
				status: "draft",
				...draftGen,
				...spec("Tasks can be deleted."),
				requirements: [
					{
						ref: "del",
						statement: "Tasks can be deleted.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "low",
					},
				],
				cases: [
					{
						ref: "delete",
						title: "Delete a task",
						objective: "Delete works.",
						type: "positive",
						priority: "p2",
						risk: "low",
						riskRationale: "Happy path.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: [],
						qualityTags: [],
						actor: authUser,
						target: { kind: "api", method: "DELETE", path: "/tasks/{id}" },
						steps: [
							{
								description: "Delete a task.",
								action: { kind: "request", method: "DELETE", path: "/tasks/1" },
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "ok",
								subject: "status",
								observationPoint: {
									kind: "api",
									method: "DELETE",
									path: "/tasks/{id}",
								},
								matcher: "statusCode",
								expected: 200,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: true,
				requirements: [
					{
						ref: "del",
						extra: {
							classification: "unsupported-invented",
							reason: "Ignores ownership entirely.",
						},
					},
				],
				cases: [
					{
						ref: "delete",
						extra: {
							classification: "unsupported-invented",
							reason: "No requirement; ignores authz.",
						},
					},
				],
			},
		},
	],
};

// ---------------------------------------------------------------------------
// 3. Stateful / idempotent workflow.
// ---------------------------------------------------------------------------

const statefulWorkflow: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "stateful-workflow",
		title: "Idempotent order submission",
		category: "stateful-workflow",
		brief:
			"Submitting an order twice with the same idempotency key must create at most one order; retries after timeout are safe.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "feature-request",
				title: "Order spec",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:idempotent-submit",
				statement: "Duplicate submit creates at most one order.",
				kind: "business-rule",
				expectedStrength: "explicit",
				priority: "p0",
				risk: "high",
				mustCover: true,
			},
			{
				truthKey: "req:retry-safe",
				statement: "Retry after timeout does not duplicate.",
				kind: "constraint",
				expectedStrength: "inferred",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:duplicate-submit-once",
				title: "Duplicate submit creates one order",
				requirementKeys: ["req:idempotent-submit"],
				type: "negative",
				priority: "p0",
				risk: "high",
				expectedAssertionHint: "order count is exactly 1",
			},
			{
				truthKey: "scn:retry-after-timeout",
				title: "Retry after timeout is safe",
				requirementKeys: ["req:retry-safe"],
				type: "edge",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "second attempt does not create a new order",
			},
		],
		forbiddenClaims: [],
	},
	arms: [
		{
			draft: {
				fixtureId: "stateful-workflow",
				arm: "qa-engine",
				title: "Idempotency plan",
				status: "complete",
				...modelGen,
				...spec(
					"Duplicate submit with same key creates one order; retries are safe.",
				),
				requirements: [
					{
						ref: "idem",
						statement: "Duplicate submit creates one order.",
						kind: "business-rule",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p0",
						risk: "high",
					},
					{
						ref: "retry",
						statement: "Retry after timeout is safe.",
						kind: "constraint",
						strength: "inferred",
						evidenceRefs: ["e1"],
						rationale: "Network retries imply idempotency.",
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "twice",
						title: "Submit twice creates one order",
						objective: "Verify idempotency key dedupes.",
						type: "negative",
						priority: "p0",
						risk: "high",
						riskRationale: "Double charge risk.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["idem"],
						qualityTags: ["data-integrity"],
						actor: authUser,
						target: { kind: "api", method: "POST", path: "/orders" },
						steps: [
							{
								description: "Submit order with key K.",
								action: {
									kind: "request",
									method: "POST",
									path: "/orders",
									body: { key: "K" },
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
							{
								description: "Submit again with key K.",
								action: {
									kind: "request",
									method: "POST",
									path: "/orders",
									body: { key: "K" },
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "one",
								subject: "orders with key K",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/orders",
								},
								matcher: "count",
								expected: 1,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "2",
							},
						],
					},
					{
						ref: "retry",
						title: "Retry after timeout is safe",
						objective: "Verify retry does not duplicate.",
						type: "edge",
						priority: "p1",
						risk: "medium",
						riskRationale: "Timeouts cause retries.",
						strength: "inferred",
						evidenceRefs: ["e1"],
						requirementRefs: ["retry"],
						qualityTags: ["reliability"],
						actor: authUser,
						target: { kind: "api", method: "POST", path: "/orders" },
						steps: [
							{
								description: "Retry the timed-out submit.",
								action: {
									kind: "request",
									method: "POST",
									path: "/orders",
									body: { key: "K" },
								},
								strength: "inferred",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "stillone",
								subject: "orders with key K",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/orders",
								},
								matcher: "count",
								expected: 1,
								strength: "inferred",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "idem",
						map: { keys: ["req:idempotent-submit"], satisfaction: "full" },
					},
					{
						ref: "retry",
						map: { keys: ["req:retry-safe"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "twice",
						map: { keys: ["scn:duplicate-submit-once"], satisfaction: "full" },
					},
					{
						ref: "retry",
						map: { keys: ["scn:retry-after-timeout"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "stateful-workflow",
				arm: "host-only",
				title: "Idempotency plan",
				status: "draft",
				...draftGen,
				...spec("Submitting twice should not duplicate."),
				requirements: [
					{
						ref: "idem",
						statement: "No duplicate orders.",
						kind: "business-rule",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p0",
						risk: "high",
					},
				],
				cases: [
					{
						ref: "twice",
						title: "Submit twice",
						objective: "Check dedupe.",
						type: "negative",
						priority: "p0",
						risk: "high",
						riskRationale: "Dedupe.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["idem"],
						qualityTags: ["data-integrity"],
						actor: authUser,
						target: { kind: "api", method: "POST", path: "/orders" },
						steps: [
							{
								description: "Submit twice.",
								action: {
									kind: "request",
									method: "POST",
									path: "/orders",
									body: { key: "K" },
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "one",
								subject: "order count",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/orders",
								},
								matcher: "count",
								expected: 1,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "idem",
						map: { keys: ["req:idempotent-submit"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "twice",
						map: { keys: ["scn:duplicate-submit-once"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "stateful-workflow",
				arm: "raw-model",
				title: "Idempotency plan",
				status: "draft",
				...draftGen,
				...spec("Orders can be submitted."),
				requirements: [
					{
						ref: "submit",
						statement: "Orders submit.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p2",
						risk: "low",
					},
				],
				cases: [
					{
						ref: "submit",
						title: "Submit an order",
						objective: "Order works.",
						type: "positive",
						priority: "p2",
						risk: "low",
						riskRationale: "Happy path.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: [],
						qualityTags: [],
						actor: authUser,
						target: { kind: "api", method: "POST", path: "/orders" },
						steps: [
							{
								description: "Submit one order.",
								action: { kind: "request", method: "POST", path: "/orders" },
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "ok",
								subject: "status",
								observationPoint: {
									kind: "api",
									method: "POST",
									path: "/orders",
								},
								matcher: "statusCode",
								expected: 201,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: true,
				requirements: [
					{
						ref: "submit",
						extra: {
							classification: "unsupported-invented",
							reason: "Ignores idempotency.",
						},
					},
				],
				cases: [
					{
						ref: "submit",
						extra: {
							classification: "unsupported-invented",
							reason: "No requirement; no idempotency.",
						},
					},
				],
			},
		},
	],
};

// ---------------------------------------------------------------------------
// 4. Third-party integration failure.
// ---------------------------------------------------------------------------

const integrationFailure: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "integration-failure",
		title: "Payment gateway timeout handling",
		category: "integration-failure",
		brief:
			"On payment gateway timeout the order is not confirmed and is rolled back; retries are bounded.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "document",
				title: "Payments spec",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:timeout-rollback",
				statement: "Gateway timeout rolls back the order.",
				kind: "constraint",
				expectedStrength: "explicit",
				priority: "p0",
				risk: "high",
				mustCover: true,
			},
			{
				truthKey: "req:bounded-retry",
				statement: "Retries are bounded.",
				kind: "non-functional",
				expectedStrength: "inferred",
				priority: "p1",
				risk: "medium",
				mustCover: false,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:timeout-rolls-back",
				title: "Timeout rolls back order",
				requirementKeys: ["req:timeout-rollback"],
				type: "negative",
				priority: "p0",
				risk: "high",
				expectedAssertionHint: "order is not confirmed after timeout",
			},
			{
				truthKey: "scn:retry-bounded",
				title: "Retries are bounded",
				requirementKeys: ["req:bounded-retry"],
				type: "edge",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "no more than N retries",
			},
		],
		forbiddenClaims: [],
	},
	arms: [
		{
			draft: {
				fixtureId: "integration-failure",
				arm: "qa-engine",
				title: "Payment failure plan",
				status: "complete",
				...modelGen,
				...spec(
					"On gateway timeout the order is rolled back and retries are bounded.",
				),
				requirements: [
					{
						ref: "rollback",
						statement: "Timeout rolls back order.",
						kind: "constraint",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p0",
						risk: "high",
					},
					{
						ref: "bounded",
						statement: "Retries bounded.",
						kind: "non-functional",
						strength: "inferred",
						evidenceRefs: ["e1"],
						rationale: "Avoid retry storms.",
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "timeout",
						title: "Timeout rolls back order",
						objective: "Verify rollback on gateway timeout.",
						type: "negative",
						priority: "p0",
						risk: "high",
						riskRationale: "Money at stake.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["rollback"],
						qualityTags: ["reliability"],
						actor: sys,
						target: {
							kind: "integration",
							system: "payments",
							operation: "charge",
						},
						steps: [
							{
								description: "Invoke charge that times out.",
								action: {
									kind: "invoke",
									system: "payments",
									operation: "charge",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "unconf",
								subject: "order.status",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/orders/1",
								},
								matcher: "equals",
								expected: "rolled_back",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
					{
						ref: "bounded",
						title: "Retries are bounded",
						objective: "Verify bounded retries.",
						type: "edge",
						priority: "p1",
						risk: "medium",
						riskRationale: "Retry storms.",
						strength: "inferred",
						evidenceRefs: ["e1"],
						requirementRefs: ["bounded"],
						qualityTags: ["reliability"],
						actor: sys,
						target: {
							kind: "integration",
							system: "payments",
							operation: "charge",
						},
						steps: [
							{
								description: "Force repeated timeouts.",
								action: {
									kind: "invoke",
									system: "payments",
									operation: "charge",
								},
								strength: "inferred",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "atmost",
								subject: "retry count",
								observationPoint: {
									kind: "integration",
									system: "payments",
									operation: "charge",
								},
								matcher: "lessThanOrEqual",
								expected: 3,
								strength: "inferred",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "rollback",
						map: { keys: ["req:timeout-rollback"], satisfaction: "full" },
					},
					{
						ref: "bounded",
						map: { keys: ["req:bounded-retry"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "timeout",
						map: { keys: ["scn:timeout-rolls-back"], satisfaction: "full" },
					},
					{
						ref: "bounded",
						map: { keys: ["scn:retry-bounded"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "integration-failure",
				arm: "host-only",
				title: "Payment failure plan",
				status: "draft",
				...draftGen,
				...spec("Timeout should roll back the order."),
				requirements: [
					{
						ref: "rollback",
						statement: "Timeout rolls back.",
						kind: "constraint",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p0",
						risk: "high",
					},
				],
				cases: [
					{
						ref: "timeout",
						title: "Timeout case",
						objective: "Check rollback.",
						type: "negative",
						priority: "p0",
						risk: "high",
						riskRationale: "Money.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["rollback"],
						qualityTags: ["reliability"],
						actor: sys,
						target: {
							kind: "integration",
							system: "payments",
							operation: "charge",
						},
						steps: [
							{
								description: "Timeout charge.",
								action: {
									kind: "invoke",
									system: "payments",
									operation: "charge",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "rb",
								subject: "order rolled back",
								observationPoint: {
									kind: "integration",
									system: "payments",
									operation: "charge",
								},
								matcher: "exists",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "rollback",
						map: { keys: ["req:timeout-rollback"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "timeout",
						map: {
							keys: ["scn:timeout-rolls-back"],
							satisfaction: "partial",
							reason: "Presence-only assertion; no concrete status check.",
						},
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "integration-failure",
				arm: "raw-model",
				title: "Payment failure plan",
				status: "draft",
				...draftGen,
				...spec("Payments work."),
				requirements: [
					{
						ref: "pay",
						statement: "Payment succeeds.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "low",
					},
				],
				cases: [
					{
						ref: "happy",
						title: "Payment succeeds",
						objective: "Charge works.",
						type: "positive",
						priority: "p2",
						risk: "low",
						riskRationale: "Happy path.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: [],
						qualityTags: [],
						actor: sys,
						target: { kind: "generic", description: "payment" },
						steps: [
							{
								description: "Charge a card.",
								action: { kind: "observe", subject: "payment" },
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "ok",
								subject: "charged",
								observationPoint: { kind: "generic", description: "payment" },
								matcher: "exists",
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: true,
				requirements: [
					{
						ref: "pay",
						extra: {
							classification: "unsupported-invented",
							reason: "Only covers the happy path; ignores failure.",
						},
					},
				],
				cases: [
					{
						ref: "happy",
						extra: {
							classification: "unsupported-invented",
							reason: "No requirement; ignores timeout/rollback.",
						},
					},
				],
			},
		},
	],
};

// ---------------------------------------------------------------------------
// 5. Contradictory / incomplete specification.
// ---------------------------------------------------------------------------

const contradictorySpec: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "contradictory-spec",
		title: "Underspecified password policy",
		category: "contradictory-spec",
		brief:
			"The spec requires a strong password but never states the minimum length or lockout policy.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "document",
				title: "Auth spec (incomplete)",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:password-min",
				statement: "A minimum password length applies (value unspecified).",
				kind: "constraint",
				expectedStrength: "assumption",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
			{
				truthKey: "req:lockout",
				statement: "An account lockout policy applies (value unspecified).",
				kind: "security",
				expectedStrength: "assumption",
				priority: "p2",
				risk: "low",
				mustCover: false,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:short-password-rejected",
				title: "Short password rejected under assumed minimum",
				requirementKeys: ["req:password-min"],
				type: "negative",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "password below assumed minimum is rejected",
			},
		],
		forbiddenClaims: [],
	},
	arms: [
		{
			draft: {
				fixtureId: "contradictory-spec",
				arm: "qa-engine",
				title: "Password policy plan",
				status: "complete",
				...modelGen,
				...spec(
					"Passwords must be strong; minimum length and lockout are unspecified.",
				),
				requirements: [
					{
						ref: "min",
						statement: "Assume a minimum password length of 12.",
						kind: "constraint",
						strength: "assumption",
						evidenceRefs: ["e1"],
						rationale: "Length unspecified; assuming 12 as a safe default.",
						priority: "p1",
						risk: "medium",
					},
					{
						ref: "lock",
						statement: "Assume lockout after 5 attempts.",
						kind: "security",
						strength: "assumption",
						evidenceRefs: ["e1"],
						rationale: "Lockout unspecified; assuming 5.",
						priority: "p2",
						risk: "low",
					},
				],
				cases: [
					{
						ref: "short",
						title: "Short password rejected",
						objective: "Reject below assumed minimum.",
						type: "negative",
						priority: "p1",
						risk: "medium",
						riskRationale: "Weak passwords are risky.",
						strength: "assumption",
						evidenceRefs: ["e1"],
						rationale: "Based on assumed minimum.",
						requirementRefs: ["min"],
						qualityTags: ["security"],
						actor: anonUser,
						target: { kind: "api", method: "POST", path: "/signup" },
						steps: [
							{
								description: "Submit an 8-char password.",
								action: {
									kind: "request",
									method: "POST",
									path: "/signup",
									body: { password: "short123" },
								},
								strength: "assumption",
								evidenceRefs: ["e1"],
								rationale: "Assumed minimum is 12.",
							},
						],
						assertions: [
							{
								ref: "rej",
								subject: "response.status",
								observationPoint: {
									kind: "api",
									method: "POST",
									path: "/signup",
								},
								matcher: "statusCode",
								expected: 422,
								strength: "assumption",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "min",
						map: { keys: ["req:password-min"], satisfaction: "full" },
					},
					{ ref: "lock", map: { keys: ["req:lockout"], satisfaction: "full" } },
				],
				cases: [
					{
						ref: "short",
						map: {
							keys: ["scn:short-password-rejected"],
							satisfaction: "full",
						},
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "contradictory-spec",
				arm: "host-only",
				title: "Password policy plan",
				status: "draft",
				...draftGen,
				...spec("Passwords must be strong."),
				requirements: [
					{
						ref: "min",
						statement: "Minimum length is 12.",
						kind: "constraint",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "short",
						title: "Short password",
						objective: "Reject short.",
						type: "negative",
						priority: "p1",
						risk: "medium",
						riskRationale: "Weak password.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["min"],
						qualityTags: ["security"],
						actor: anonUser,
						target: { kind: "api", method: "POST", path: "/signup" },
						steps: [
							{
								description: "Submit short password.",
								action: {
									kind: "request",
									method: "POST",
									path: "/signup",
									body: { password: "short123" },
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "rej",
								subject: "response.status",
								observationPoint: {
									kind: "api",
									method: "POST",
									path: "/signup",
								},
								matcher: "statusCode",
								expected: 422,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "min",
						map: { keys: ["req:password-min"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "short",
						map: {
							keys: ["scn:short-password-rejected"],
							satisfaction: "full",
						},
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "contradictory-spec",
				arm: "raw-model",
				title: "Password policy plan",
				status: "draft",
				...draftGen,
				...spec("Passwords must be strong."),
				requirements: [
					{
						ref: "strong",
						statement: "Passwords are strong.",
						kind: "security",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "vague",
						title: "Password is strong",
						objective: "Ensure strength.",
						type: "positive",
						priority: "p2",
						risk: "low",
						riskRationale: "General.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: [],
						qualityTags: [],
						actor: anonUser,
						target: { kind: "generic", description: "password" },
						steps: [
							{
								description: "Check password.",
								action: { kind: "observe", subject: "password" },
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "x",
								subject: "strong",
								observationPoint: { kind: "generic", description: "password" },
								matcher: "exists",
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: true,
				requirements: [
					{
						ref: "strong",
						extra: {
							classification: "unsupported-invented",
							reason: "No assumed value; not testable.",
						},
					},
				],
				cases: [
					{
						ref: "vague",
						extra: {
							classification: "unsupported-invented",
							reason: "No requirement; vague.",
						},
					},
				],
			},
		},
	],
};

// ---------------------------------------------------------------------------
// 6. Repository evidence conflicting with supplied intent.
// ---------------------------------------------------------------------------

const evidenceConflict: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "evidence-conflict",
		title: "Soft delete intent vs hard-delete code",
		category: "evidence-conflict",
		brief:
			"The spec says deleting a record soft-deletes it. The repository currently hard-deletes. Intended behavior is soft delete.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "feature-request",
				title: "Delete spec",
				supplied: true,
			},
			{
				sourceKey: "repo",
				kind: "repository",
				title: "Repository scan",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:soft-delete",
				statement: "Deleting a record soft-deletes it.",
				kind: "functional",
				expectedStrength: "explicit",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:delete-is-soft",
				title: "Delete marks record as deleted",
				requirementKeys: ["req:soft-delete"],
				type: "positive",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "record still exists with deletedAt set",
			},
		],
		forbiddenClaims: [
			{
				claimKey: "claim:hard-delete",
				statement:
					"Delete permanently removes the record — contradicts the soft-delete intent.",
			},
		],
	},
	arms: [
		{
			draft: {
				fixtureId: "evidence-conflict",
				arm: "qa-engine",
				title: "Soft delete plan",
				status: "complete",
				...modelGen,
				sources: [
					{
						ref: "spec",
						kind: "feature-request",
						title: "Delete spec",
						supplied: true,
					},
					{
						ref: "repo",
						kind: "repository",
						title: "Repository scan",
						supplied: true,
					},
				],
				evidence: [
					{
						ref: "e1",
						sourceRef: "spec",
						kind: "statement",
						claim: "Deleting a record soft-deletes it.",
					},
					{
						ref: "e2",
						sourceRef: "repo",
						kind: "repository-signal",
						claim: "delete() currently issues a hard DELETE.",
					},
				],
				requirements: [
					{
						ref: "soft",
						statement: "Delete soft-deletes the record.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "soft",
						title: "Delete is soft",
						objective: "Verify soft delete despite repo hard-delete.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Repo conflicts with intent.",
						strength: "explicit",
						evidenceRefs: ["e1", "e2"],
						requirementRefs: ["soft"],
						qualityTags: ["data-integrity"],
						actor: authUser,
						target: { kind: "api", method: "DELETE", path: "/records/{id}" },
						steps: [
							{
								description: "Delete a record.",
								action: {
									kind: "request",
									method: "DELETE",
									path: "/records/1",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "deletedAt",
								subject: "record.deletedAt",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/records/1",
								},
								matcher: "exists",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "soft",
						map: { keys: ["req:soft-delete"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "soft",
						map: { keys: ["scn:delete-is-soft"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "evidence-conflict",
				arm: "host-only",
				title: "Soft delete plan",
				status: "draft",
				...draftGen,
				...spec("Delete soft-deletes the record."),
				requirements: [
					{
						ref: "soft",
						statement: "Delete soft-deletes.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "soft",
						title: "Delete soft",
						objective: "Check soft delete.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Intent.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["soft"],
						qualityTags: ["data-integrity"],
						actor: authUser,
						target: { kind: "api", method: "DELETE", path: "/records/{id}" },
						steps: [
							{
								description: "Delete record.",
								action: {
									kind: "request",
									method: "DELETE",
									path: "/records/1",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "gone",
								subject: "deletedAt set",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/records/1",
								},
								matcher: "exists",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "soft",
						map: { keys: ["req:soft-delete"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "soft",
						map: {
							keys: ["scn:delete-is-soft"],
							satisfaction: "partial",
							reason: "Presence-only check; weak observation.",
						},
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "evidence-conflict",
				arm: "raw-model",
				title: "Soft delete plan",
				status: "draft",
				...draftGen,
				sources: [
					{
						ref: "repo",
						kind: "repository",
						title: "Repository scan",
						supplied: true,
					},
				],
				evidence: [
					{
						ref: "e1",
						sourceRef: "repo",
						kind: "repository-signal",
						claim: "delete() issues a hard DELETE.",
					},
				],
				requirements: [
					{
						ref: "hard",
						statement: "Delete permanently removes the record.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "hard",
						title: "Delete removes record",
						objective: "Confirm hard delete (matches repo).",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Trusts repo over intent.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["hard"],
						qualityTags: ["data-integrity"],
						actor: authUser,
						target: { kind: "api", method: "DELETE", path: "/records/{id}" },
						steps: [
							{
								description: "Delete a record.",
								action: {
									kind: "request",
									method: "DELETE",
									path: "/records/1",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "g404",
								subject: "record fetch",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/records/1",
								},
								matcher: "statusCode",
								expected: 404,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "hard",
						extra: {
							classification: "contradicts-truth",
							reason:
								"Asserts hard delete; contradicts the soft-delete intent.",
						},
					},
				],
				cases: [
					{
						ref: "hard",
						extra: {
							classification: "contradicts-truth",
							reason: "Verifies hard delete, which the spec forbids.",
						},
					},
				],
			},
		},
	],
};

// ---------------------------------------------------------------------------
// 7. Adversarial shallow plan with many low-value cases.
// ---------------------------------------------------------------------------

function shallowCase(
	ref: string,
): FixtureBuild["arms"][number]["draft"]["cases"][number] {
	return {
		ref,
		title: `Open search page (${ref})`,
		objective: "Make sure search loads.",
		type: "positive",
		priority: "p2",
		risk: "low",
		riskRationale: "Smoke check.",
		strength: "explicit",
		evidenceRefs: ["e1"],
		requirementRefs: ["search"],
		qualityTags: [],
		actor: anonUser,
		target: { kind: "ui", route: "/search" },
		steps: [
			{
				description: "Open the search page.",
				action: { kind: "navigate", route: "/search" },
				strength: "explicit",
				evidenceRefs: ["e1"],
			},
		],
		assertions: [
			{
				ref: `${ref}-a`,
				subject: "page",
				observationPoint: { kind: "ui", route: "/search" },
				matcher: "visible",
				strength: "explicit",
				evidenceRefs: ["e1"],
				stepRef: "1",
			},
		],
	};
}

const adversarialShallow: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "adversarial-shallow",
		title: "Search returns relevant results",
		category: "adversarial-shallow",
		brief: "A search box returns results ranked by relevance for a query.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "feature-request",
				title: "Search spec",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:search-results",
				statement: "Search returns relevant results for a query.",
				kind: "functional",
				expectedStrength: "explicit",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:query-returns-ranked",
				title: "Query returns ranked results",
				requirementKeys: ["req:search-results"],
				type: "positive",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "results contain the query term, ranked",
			},
		],
		forbiddenClaims: [],
	},
	arms: [
		{
			draft: {
				fixtureId: "adversarial-shallow",
				arm: "qa-engine",
				title: "Search plan",
				status: "complete",
				...modelGen,
				...spec("Search returns relevant results ranked by relevance."),
				requirements: [
					{
						ref: "search",
						statement: "Search returns relevant results.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "ranked",
						title: "Query returns ranked results",
						objective: "Verify relevant ranked results.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Core feature.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["search"],
						qualityTags: ["functional"],
						actor: anonUser,
						target: { kind: "api", method: "GET", path: "/search" },
						steps: [
							{
								description: "Search for 'router'.",
								action: {
									kind: "request",
									method: "GET",
									path: "/search?q=router",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "top",
								subject: "results[0].title",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/search",
								},
								matcher: "contains",
								expected: "router",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
							{
								ref: "count",
								subject: "results length",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/search",
								},
								matcher: "greaterThan",
								expected: 0,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "search",
						map: { keys: ["req:search-results"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "ranked",
						map: { keys: ["scn:query-returns-ranked"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "adversarial-shallow",
				arm: "host-only",
				title: "Search plan",
				status: "draft",
				...draftGen,
				...spec("Search returns results."),
				requirements: [
					{
						ref: "search",
						statement: "Search returns results.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "basic",
						title: "Search returns something",
						objective: "Check results exist.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Core.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["search"],
						qualityTags: ["functional"],
						actor: anonUser,
						target: { kind: "api", method: "GET", path: "/search" },
						steps: [
							{
								description: "Search.",
								action: { kind: "request", method: "GET", path: "/search?q=x" },
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "len",
								subject: "results length",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/search",
								},
								matcher: "greaterThan",
								expected: 0,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "search",
						map: { keys: ["req:search-results"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "basic",
						map: {
							keys: ["scn:query-returns-ranked"],
							satisfaction: "partial",
							reason: "Checks count only, not relevance/ranking.",
						},
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "adversarial-shallow",
				arm: "raw-model",
				title: "Search plan",
				status: "draft",
				...draftGen,
				...spec("Search exists."),
				requirements: [
					{
						ref: "search",
						statement: "Search exists.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					shallowCase("s1"),
					shallowCase("s2"),
					shallowCase("s3"),
					shallowCase("s4"),
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "search",
						map: {
							keys: ["req:search-results"],
							satisfaction: "partial",
							reason: "Stated but only smoke-tested.",
						},
					},
				],
				cases: [
					{
						ref: "s1",
						map: {
							keys: ["scn:query-returns-ranked"],
							satisfaction: "partial",
							reason: "Only checks the page renders.",
						},
					},
					{
						ref: "s2",
						extra: {
							classification: "supported-inferred",
							reason: "Duplicate smoke check, no new value.",
						},
					},
					{
						ref: "s3",
						extra: {
							classification: "supported-inferred",
							reason: "Duplicate smoke check, no new value.",
						},
					},
					{
						ref: "s4",
						extra: {
							classification: "supported-inferred",
							reason: "Duplicate smoke check, no new value.",
						},
					},
				],
			},
		},
	],
};

// ---------------------------------------------------------------------------
// 8. Plan containing unsupported assumptions.
// ---------------------------------------------------------------------------

function inventedReq(
	ref: string,
	statement: string,
): FixtureBuild["arms"][number]["draft"]["requirements"][number] {
	return {
		ref,
		statement,
		kind: "functional",
		strength: "inferred",
		evidenceRefs: ["e1"],
		rationale: "Speculative; not in the spec.",
		priority: "p2",
		risk: "low",
	};
}

const unsupportedAssumptions: FixtureBuild = {
	fixture: {
		evalSchemaVersion: "eval/v1",
		fixtureId: "unsupported-assumptions",
		title: "CSV export",
		category: "unsupported-assumptions",
		brief: "Users can export their data as a CSV file.",
		suppliedSources: [
			{
				sourceKey: "spec",
				kind: "feature-request",
				title: "Export spec",
				supplied: true,
			},
		],
		expectedRequirements: [
			{
				truthKey: "req:export-csv",
				statement: "Users can export data as CSV.",
				kind: "functional",
				expectedStrength: "explicit",
				priority: "p1",
				risk: "medium",
				mustCover: true,
			},
		],
		expectedScenarios: [
			{
				truthKey: "scn:export-downloads-csv",
				title: "Export downloads a CSV",
				requirementKeys: ["req:export-csv"],
				type: "positive",
				priority: "p1",
				risk: "medium",
				expectedAssertionHint: "response is a CSV attachment",
			},
		],
		forbiddenClaims: [],
	},
	arms: [
		{
			draft: {
				fixtureId: "unsupported-assumptions",
				arm: "qa-engine",
				title: "Export plan",
				status: "complete",
				...modelGen,
				...spec("Users can export their data as a CSV file."),
				requirements: [
					{
						ref: "csv",
						statement: "Export data as CSV.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "export",
						title: "Export downloads CSV",
						objective: "Verify CSV download.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Core feature.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["csv"],
						qualityTags: ["functional"],
						actor: authUser,
						target: { kind: "api", method: "GET", path: "/export" },
						steps: [
							{
								description: "Request the export.",
								action: {
									kind: "request",
									method: "GET",
									path: "/export?format=csv",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "ctype",
								subject: "content-type",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/export",
								},
								matcher: "contains",
								expected: "text/csv",
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "csv",
						map: { keys: ["req:export-csv"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "export",
						map: { keys: ["scn:export-downloads-csv"], satisfaction: "full" },
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "unsupported-assumptions",
				arm: "host-only",
				title: "Export plan",
				status: "draft",
				...draftGen,
				...spec("Users can export data as CSV."),
				requirements: [
					{
						ref: "csv",
						statement: "Export as CSV.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
				],
				cases: [
					{
						ref: "export",
						title: "Export CSV",
						objective: "Check export.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Core.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["csv"],
						qualityTags: ["functional"],
						actor: authUser,
						target: { kind: "api", method: "GET", path: "/export" },
						steps: [
							{
								description: "Request export.",
								action: {
									kind: "request",
									method: "GET",
									path: "/export?format=csv",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "ok",
								subject: "status",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/export",
								},
								matcher: "statusCode",
								expected: 200,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "csv",
						map: { keys: ["req:export-csv"], satisfaction: "full" },
					},
				],
				cases: [
					{
						ref: "export",
						map: {
							keys: ["scn:export-downloads-csv"],
							satisfaction: "partial",
							reason: "Only checks 200, not CSV content-type.",
						},
					},
				],
			},
		},
		{
			draft: {
				fixtureId: "unsupported-assumptions",
				arm: "raw-model",
				title: "Export plan",
				status: "draft",
				...draftGen,
				...spec("Users can export data as CSV."),
				requirements: [
					{
						ref: "csv",
						statement: "Export as CSV.",
						kind: "functional",
						strength: "explicit",
						evidenceRefs: ["e1"],
						priority: "p1",
						risk: "medium",
					},
					inventedReq("pdf", "Export also supports PDF."),
					inventedReq("email", "Export is emailed to the user."),
					inventedReq("schedule", "Exports can be scheduled nightly."),
					inventedReq("encrypt", "Exports are encrypted at rest."),
					inventedReq("s3", "Exports upload to an S3 bucket."),
				],
				cases: [
					{
						ref: "export",
						title: "Export CSV",
						objective: "Check export.",
						type: "positive",
						priority: "p1",
						risk: "medium",
						riskRationale: "Core.",
						strength: "explicit",
						evidenceRefs: ["e1"],
						requirementRefs: ["csv"],
						qualityTags: ["functional"],
						actor: authUser,
						target: { kind: "api", method: "GET", path: "/export" },
						steps: [
							{
								description: "Request export.",
								action: {
									kind: "request",
									method: "GET",
									path: "/export?format=csv",
								},
								strength: "explicit",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "ok",
								subject: "status",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/export",
								},
								matcher: "statusCode",
								expected: 200,
								strength: "explicit",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
					{
						ref: "pdf",
						title: "Export PDF",
						objective: "Check PDF export.",
						type: "positive",
						priority: "p2",
						risk: "low",
						riskRationale: "Invented.",
						strength: "inferred",
						evidenceRefs: ["e1"],
						rationale: "Speculative.",
						requirementRefs: ["pdf"],
						qualityTags: [],
						actor: authUser,
						target: { kind: "api", method: "GET", path: "/export" },
						steps: [
							{
								description: "Request PDF.",
								action: {
									kind: "request",
									method: "GET",
									path: "/export?format=pdf",
								},
								strength: "inferred",
								evidenceRefs: ["e1"],
							},
						],
						assertions: [
							{
								ref: "pok",
								subject: "status",
								observationPoint: {
									kind: "api",
									method: "GET",
									path: "/export",
								},
								matcher: "statusCode",
								expected: 200,
								strength: "inferred",
								evidenceRefs: ["e1"],
								stepRef: "1",
							},
						],
					},
				],
			},
			anno: {
				recordKind: "synthetic",
				expectValidationFailure: false,
				requirements: [
					{
						ref: "csv",
						map: { keys: ["req:export-csv"], satisfaction: "full" },
					},
					{
						ref: "pdf",
						extra: {
							classification: "unsupported-invented",
							reason: "PDF export is not in the spec.",
						},
					},
					{
						ref: "email",
						extra: {
							classification: "unsupported-invented",
							reason: "Emailing exports is not in the spec.",
						},
					},
					{
						ref: "schedule",
						extra: {
							classification: "unsupported-invented",
							reason: "Scheduling is not in the spec.",
						},
					},
					{
						ref: "encrypt",
						extra: {
							classification: "unsupported-invented",
							reason: "Encryption-at-rest is not in the spec.",
						},
					},
					{
						ref: "s3",
						extra: {
							classification: "unsupported-invented",
							reason: "S3 upload is not in the spec.",
						},
					},
				],
				cases: [
					{
						ref: "export",
						map: { keys: ["scn:export-downloads-csv"], satisfaction: "full" },
					},
					{
						ref: "pdf",
						extra: {
							classification: "unsupported-invented",
							reason: "Tests an invented PDF feature.",
						},
					},
				],
			},
		},
	],
};

export const CORPUS: FixtureBuild[] = [
	uiForm,
	authzApi,
	statefulWorkflow,
	integrationFailure,
	contradictorySpec,
	evidenceConflict,
	adversarialShallow,
	unsupportedAssumptions,
];
