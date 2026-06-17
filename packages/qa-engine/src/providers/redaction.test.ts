import assert from "node:assert/strict";
import test from "node:test";
import { maskSecrets, safeLogFields } from "./redaction.js";

test("masks Anthropic-style keys", () => {
	const out = maskSecrets("auth failed for sk-ant-api03-AbCd_1234-EfGh");
	assert.equal(out.includes("sk-ant-api03-AbCd_1234-EfGh"), false);
	assert.ok(out.includes("[redacted]"));
});

test("masks generic sk- keys and Bearer tokens", () => {
	assert.equal(
		maskSecrets("key=sk-proj-ABCDEFGH12345678").includes(
			"sk-proj-ABCDEFGH12345678",
		),
		false,
	);
	const bearer = maskSecrets("Authorization: Bearer abc.def-123_XYZ");
	assert.equal(bearer.includes("abc.def-123_XYZ"), false);
	assert.ok(bearer.includes("Bearer [redacted]"));
});

test("masks the exact resolved key value, whatever its shape", () => {
	const key = "weird-internal-token-not-sk-prefixed";
	const out = maskSecrets(`db said ${key} is invalid`, [key]);
	assert.equal(out.includes(key), false);
});

test("allowlist logging keeps only safe fields and drops everything else", () => {
	const entry = safeLogFields({
		provider: "anthropic",
		model: "claude-opus-4-8",
		code: "PROVIDER_TIMEOUT",
		attempt: 2,
		durationMs: 1234,
		usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
		providerRequestId: "req_1",
		// hostile / accidental extras that must never be logged:
		apiKey: "sk-ant-leaked",
		messages: [{ role: "user", content: "secret prompt" }],
		authorization: "Bearer xyz",
	} as never);
	assert.deepEqual(
		Object.keys(entry).sort(),
		[
			"attempt",
			"code",
			"durationMs",
			"model",
			"providerRequestId",
			"provider",
			"usage",
		].sort(),
	);
	const serialized = JSON.stringify(entry);
	assert.equal(serialized.includes("sk-ant-leaked"), false);
	assert.equal(serialized.includes("secret prompt"), false);
});

test("safeLogFields omits absent optional fields", () => {
	const entry = safeLogFields({
		provider: "fake",
		model: "fake-1",
		attempt: 1,
		durationMs: 3,
	});
	assert.equal("code" in entry, false);
	assert.equal("usage" in entry, false);
	assert.equal("providerRequestId" in entry, false);
});
