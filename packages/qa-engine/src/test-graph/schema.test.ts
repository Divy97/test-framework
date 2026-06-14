import assert from "node:assert/strict";
import test from "node:test";
import { actionSchema } from "./actions.js";
import { assertionSchema } from "./assertions.js";
import { jsonValueSchema, provenanceSchema } from "./common.js";
import { createStableId } from "./ids.js";
import { targetSchema } from "./targets.js";

const evidenceId = createStableId("evidence", "plan_a", "login spec");
const testCaseId = createStableId("testCase", "plan_a", "login succeeds");
const stepId = createStableId("step", testCaseId, "submit form");
const assertionId = createStableId("assertion", testCaseId, "redirected");

const baseAssertion = {
	id: assertionId,
	testCaseId,
	stepId,
	provenance: { kind: "explicit", evidenceIds: [evidenceId] },
	subject: "response",
	observationPoint: { kind: "ui", route: "/dashboard" },
};

test("json values accept null, scalars, arrays, and objects", () => {
	for (const value of [
		null,
		"text",
		0,
		-12.5,
		true,
		false,
		[1, "two", null, { nested: true }],
		{ a: 1, b: [false], c: { d: null } },
	]) {
		assert.equal(jsonValueSchema.safeParse(value).success, true, String(value));
	}
});

test("json values reject undefined, functions, NaN, and infinity", () => {
	assert.equal(jsonValueSchema.safeParse(undefined).success, false);
	assert.equal(
		jsonValueSchema.safeParse(() => null).success,
		false,
	);
	assert.equal(jsonValueSchema.safeParse(Number.NaN).success, false);
	assert.equal(
		jsonValueSchema.safeParse(Number.POSITIVE_INFINITY).success,
		false,
	);
	assert.equal(jsonValueSchema.safeParse({ a: undefined }).success, false);
});

test("provenance parses each classification structurally", () => {
	assert.equal(
		provenanceSchema.safeParse({ kind: "explicit", evidenceIds: [evidenceId] })
			.success,
		true,
	);
	assert.equal(
		provenanceSchema.safeParse({
			kind: "inferred",
			evidenceIds: [],
			rationale: "deduced from contract",
		}).success,
		true,
	);
	assert.equal(
		provenanceSchema.safeParse({
			kind: "assumption",
			evidenceIds: [],
			rationale: "assumed default",
		}).success,
		true,
	);
	assert.equal(
		provenanceSchema.safeParse({ kind: "assumption", evidenceIds: [] }).success,
		false,
	);
	assert.equal(
		provenanceSchema.safeParse({
			kind: "explicit",
			evidenceIds: [evidenceId],
			extra: 1,
		}).success,
		false,
	);
});

test("targets require target-specific fields", () => {
	assert.equal(
		targetSchema.safeParse({ kind: "ui", route: "/login" }).success,
		true,
	);
	assert.equal(targetSchema.safeParse({ kind: "ui" }).success, false);
	assert.equal(
		targetSchema.safeParse({ kind: "api", method: "GET", path: "/api/x" })
			.success,
		true,
	);
	assert.equal(
		targetSchema.safeParse({ kind: "api", path: "/api/x" }).success,
		false,
	);
	assert.equal(
		targetSchema.safeParse({
			kind: "integration",
			system: "stripe",
			operation: "charge",
		}).success,
		true,
	);
	assert.equal(
		targetSchema.safeParse({ kind: "generic", description: "side effect" })
			.success,
		true,
	);
	assert.equal(
		targetSchema.safeParse({ kind: "api", method: "FETCH", path: "/x" })
			.success,
		false,
	);
});

test("action union rejects mismatched fields", () => {
	assert.equal(
		actionSchema.safeParse({ kind: "navigate", route: "/home" }).success,
		true,
	);
	assert.equal(
		actionSchema.safeParse({
			kind: "interact",
			operation: "click",
			selector: "#submit",
		}).success,
		true,
	);
	assert.equal(
		actionSchema.safeParse({ kind: "navigate", selector: "#x" }).success,
		false,
	);
	assert.equal(
		actionSchema.safeParse({
			kind: "interact",
			operation: "teleport",
			selector: "#x",
		}).success,
		false,
	);
	assert.equal(
		actionSchema.safeParse({
			kind: "request",
			method: "POST",
			path: "/api/x",
			body: { a: 1 },
		}).success,
		true,
	);
});

test("equals assertion accepts a json expected value", () => {
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "equals",
			expected: { ok: true },
		}).success,
		true,
	);
});

test("exists assertion forbids expected", () => {
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "exists",
			expected: true,
		}).success,
		false,
	);
	assert.equal(
		assertionSchema.safeParse({ ...baseAssertion, matcher: "exists" }).success,
		true,
	);
});

test("presence matchers all forbid expected", () => {
	for (const matcher of [
		"notExists",
		"visible",
		"hidden",
		"enabled",
		"disabled",
	]) {
		assert.equal(
			assertionSchema.safeParse({ ...baseAssertion, matcher }).success,
			true,
			matcher,
		);
		assert.equal(
			assertionSchema.safeParse({ ...baseAssertion, matcher, expected: 1 })
				.success,
			false,
			matcher,
		);
	}
});

test("numeric matchers reject string expected values", () => {
	for (const matcher of [
		"greaterThan",
		"greaterThanOrEqual",
		"lessThan",
		"lessThanOrEqual",
	]) {
		assert.equal(
			assertionSchema.safeParse({ ...baseAssertion, matcher, expected: 10 })
				.success,
			true,
			matcher,
		);
		assert.equal(
			assertionSchema.safeParse({ ...baseAssertion, matcher, expected: "10" })
				.success,
			false,
			matcher,
		);
		assert.equal(
			assertionSchema.safeParse({
				...baseAssertion,
				matcher,
				expected: Number.NaN,
			}).success,
			false,
			matcher,
		);
	}
});

test("statusCode accepts only integers 100..599", () => {
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "statusCode",
			expected: 200,
		}).success,
		true,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "statusCode",
			expected: 99,
		}).success,
		false,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "statusCode",
			expected: 600,
		}).success,
		false,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "statusCode",
			expected: 200.5,
		}).success,
		false,
	);
});

test("count accepts only nonnegative integers", () => {
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "count",
			expected: 0,
		}).success,
		true,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "count",
			expected: -1,
		}).success,
		false,
	);
});

test("matches accepts only valid regex flags without duplicates", () => {
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "matches",
			pattern: "^ok$",
			flags: "gi",
		}).success,
		true,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "matches",
			pattern: "^ok$",
		}).success,
		true,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "matches",
			pattern: "^ok$",
			flags: "gg",
		}).success,
		false,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "matches",
			pattern: "^ok$",
			flags: "z",
		}).success,
		false,
	);
});

test("conformsToSchema requires a schemaRef string", () => {
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "conformsToSchema",
			schemaRef: "user.schema.json",
		}).success,
		true,
	);
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "conformsToSchema",
		}).success,
		false,
	);
});
