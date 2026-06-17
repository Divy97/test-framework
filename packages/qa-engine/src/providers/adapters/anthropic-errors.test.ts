import assert from "node:assert/strict";
import test from "node:test";
import { mapAnthropicError } from "./anthropic-errors.js";

const headers = (h: Record<string, string>) => ({
	get: (k: string) => h[k.toLowerCase()] ?? null,
});

test("401 / 403 map to non-retryable PROVIDER_AUTH", () => {
	assert.equal(mapAnthropicError({ status: 401 }).code, "PROVIDER_AUTH");
	assert.equal(mapAnthropicError({ status: 403 }).retryable, false);
});

test("429 rate limit is retryable transient and carries Retry-After", () => {
	const err = mapAnthropicError({
		status: 429,
		message: "rate limit exceeded",
		headers: headers({ "retry-after": "2" }),
	});
	assert.equal(err.code, "PROVIDER_TRANSIENT");
	assert.equal(err.retryable, true);
	assert.equal(err.retryAfterMs, 2000);
});

test("credit/quota exhaustion maps to non-retryable PROVIDER_QUOTA", () => {
	assert.equal(
		mapAnthropicError({ status: 429, message: "credit balance is too low" })
			.code,
		"PROVIDER_QUOTA",
	);
	assert.equal(
		mapAnthropicError({ status: 400, message: "billing quota exhausted" }).code,
		"PROVIDER_QUOTA",
	);
});

test("400 about tool/schema maps to PROVIDER_UNSUPPORTED_CAPABILITY", () => {
	const err = mapAnthropicError({
		status: 400,
		message: "tool input_schema is not valid",
	});
	assert.equal(err.code, "PROVIDER_UNSUPPORTED_CAPABILITY");
	assert.equal(err.retryable, false);
});

test("other 400 maps to non-retryable PROVIDER_CONFIG_INVALID", () => {
	assert.equal(
		mapAnthropicError({
			status: 400,
			message: "messages: roles must alternate",
		}).code,
		"PROVIDER_CONFIG_INVALID",
	);
});

test("5xx and overloaded map to retryable transient", () => {
	for (const status of [500, 502, 503, 529]) {
		const err = mapAnthropicError({ status });
		assert.equal(err.code, "PROVIDER_TRANSIENT", `status ${status}`);
		assert.equal(err.retryable, true);
	}
});

test("network errors with no status map to retryable transient", () => {
	const err = mapAnthropicError({ message: "socket hang up" });
	assert.equal(err.code, "PROVIDER_TRANSIENT");
	assert.equal(err.retryable, true);
});

test("masks secret shapes in the SDK message so toJSON cannot leak them", () => {
	const err = mapAnthropicError({
		status: 400,
		message: "bad request: Authorization Bearer sk-ant-api03-leakme rejected",
	});
	assert.equal(err.message.includes("sk-ant-api03-leakme"), false);
	assert.equal(JSON.stringify(err).includes("sk-ant-api03-leakme"), false);
});

test("the original error is preserved as cause but never serialized", () => {
	const original = new Error("sk-ant-should-not-leak");
	const err = mapAnthropicError({ status: 401, cause: original, message: "x" });
	assert.equal(JSON.stringify(err).includes("sk-ant-should-not-leak"), false);
});
