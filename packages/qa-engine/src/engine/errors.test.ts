import assert from "node:assert/strict";
import { test } from "node:test";
import { asEngineError, EngineError } from "./errors.js";
import type { RefinePlanInput } from "./types.js";

test("asEngineError passes an ARTIFACT_CONFLICT through with its code preserved", () => {
	const original = new EngineError(
		"ARTIFACT_CONFLICT",
		"plan changed since it was loaded",
	);
	const wrapped = asEngineError(original, "MODEL_OUTPUT_INVALID");

	// The new code is a first-class member of the taxonomy, never downgraded to
	// the fallback when it flows through asEngineError.
	assert.equal(wrapped, original);
	assert.equal(wrapped.code, "ARTIFACT_CONFLICT");
});

test("asEngineError classifies an AbortError as PROVIDER_CANCELLED, not the fallback", () => {
	// A bare provider (not resilience-wrapped) rejects an aborted call with a raw
	// DOMException; it must be a cancellation, never the MODEL_OUTPUT_INVALID fallback.
	const wrapped = asEngineError(
		new DOMException("aborted", "AbortError"),
		"MODEL_OUTPUT_INVALID",
	);
	assert.equal(wrapped.code, "PROVIDER_CANCELLED");
});

test("RefinePlanInput surface shape is locked", () => {
	const input: RefinePlanInput = {
		planId: "plan_0000000000000000beef",
		feedback: "Add a negative login case.",
		expectedVersion: 1,
	};
	assert.equal(input.planId, "plan_0000000000000000beef");

	// @ts-expect-error planId is required.
	const missingPlanId: RefinePlanInput = { feedback: "x" };
	void missingPlanId;
});
