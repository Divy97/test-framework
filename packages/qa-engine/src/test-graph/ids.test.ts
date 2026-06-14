import assert from "node:assert/strict";
import test from "node:test";
import {
	createStableId,
	requirementIdSchema,
	testCaseIdSchema,
} from "./ids.js";

test("creates stable scoped ids", () => {
	assert.equal(
		createStableId("requirement", "plan_a", "password reset"),
		"req_067f66f43a5064b4a7b0",
	);
	assert.equal(
		createStableId("testCase", "plan_a", "password reset"),
		"case_447efda3dcc43b284e11",
	);
});

test("separates ids by prefix kind", () => {
	const requirement = createStableId("requirement", "plan_a", "password reset");
	const testCase = createStableId("testCase", "plan_a", "password reset");
	assert.notEqual(requirement, testCase);
	assert.ok(requirement.startsWith("req_"));
	assert.ok(testCase.startsWith("case_"));
});

test("separates ids by scope", () => {
	assert.notEqual(
		createStableId("requirement", "plan_a", "password reset"),
		createStableId("requirement", "plan_b", "password reset"),
	);
});

test("separates ids by semantic key", () => {
	assert.notEqual(
		createStableId("requirement", "plan_a", "password reset"),
		createStableId("requirement", "plan_a", "password change"),
	);
});

test("rejects blank or non-normalized identity keys", () => {
	assert.throws(() => createStableId("requirement", "plan_a", ""));
	assert.throws(() =>
		createStableId("requirement", "plan_a", " password reset "),
	);
});

test("rejects blank or non-normalized scope ids", () => {
	assert.throws(() => createStableId("requirement", "", "password reset"));
	assert.throws(() =>
		createStableId("requirement", " plan_a ", "password reset"),
	);
});

test("id schemas accept matching ids and reject others", () => {
	const requirement = createStableId("requirement", "plan_a", "password reset");
	const testCase = createStableId("testCase", "plan_a", "password reset");

	assert.equal(requirementIdSchema.safeParse(requirement).success, true);
	assert.equal(testCaseIdSchema.safeParse(testCase).success, true);

	assert.equal(requirementIdSchema.safeParse(testCase).success, false);
	assert.equal(requirementIdSchema.safeParse("req_NOTHEX").success, false);
	assert.equal(
		requirementIdSchema.safeParse("req_067f66f43a5064b4").success,
		false,
	);
	assert.equal(
		requirementIdSchema.safeParse("067f66f43a5064b4a7b0").success,
		false,
	);
});
