import assert from "node:assert/strict";
import test from "node:test";
import { isRetryable, ProviderError, RETRYABLE } from "./errors.js";

test("only transient and timeout are retryable", () => {
	assert.deepEqual([...RETRYABLE].sort(), [
		"PROVIDER_TIMEOUT",
		"PROVIDER_TRANSIENT",
	]);
	assert.equal(isRetryable("PROVIDER_TRANSIENT"), true);
	assert.equal(isRetryable("PROVIDER_TIMEOUT"), true);
	assert.equal(isRetryable("PROVIDER_AUTH"), false);
	assert.equal(isRetryable("MODEL_OUTPUT_INVALID"), false);
	assert.equal(isRetryable("PROVIDER_CANCELLED"), false);
});

test("ProviderError carries code, retryable flag, and request id", () => {
	const err = new ProviderError("PROVIDER_QUOTA", "out of credit", false, {
		providerRequestId: "req_123",
	});
	assert.equal(err.name, "ProviderError");
	assert.equal(err.code, "PROVIDER_QUOTA");
	assert.equal(err.retryable, false);
	assert.equal(err.providerRequestId, "req_123");
	assert.ok(err instanceof Error);
});

test("ProviderError never serializes its cause or any extra payload", () => {
	const err = new ProviderError("PROVIDER_AUTH", "bad key", false, {
		cause: new Error("sk-ant-secret-leaked-here"),
	});
	// toJSON / JSON.stringify must not surface the cause (which could hold a key).
	const serialized = JSON.stringify(err);
	assert.equal(serialized.includes("sk-ant-secret-leaked-here"), false);
	// cause is reachable for redacted logging, but not auto-serialized.
	assert.ok(err.cause instanceof Error);
});

test("retryAfterMs is optional and defaults to undefined", () => {
	const plain = new ProviderError("PROVIDER_TRANSIENT", "503", true);
	assert.equal(plain.retryAfterMs, undefined);
	const withAfter = new ProviderError("PROVIDER_TRANSIENT", "429", true, {
		retryAfterMs: 2000,
	});
	assert.equal(withAfter.retryAfterMs, 2000);
});
