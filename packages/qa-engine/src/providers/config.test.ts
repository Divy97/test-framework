import assert from "node:assert/strict";
import test from "node:test";
import { providerConfigSchema } from "./config.js";

const valid = {
	provider: "anthropic",
	model: "claude-opus-4-8",
	keySource: { kind: "env", var: "ANTHROPIC_API_KEY" },
} as const;

test("accepts a minimal env-keyed anthropic config", () => {
	const parsed = providerConfigSchema.parse(valid);
	assert.equal(parsed.provider, "anthropic");
	assert.equal(parsed.keySource.kind, "env");
});

test("accepts the openrouter provider", () => {
	assert.equal(
		providerConfigSchema.safeParse({ ...valid, provider: "openrouter" })
			.success,
		true,
	);
});

test("rejects the fake provider as a configurable value (DI-only test seam)", () => {
	assert.equal(
		providerConfigSchema.safeParse({ ...valid, provider: "fake" }).success,
		false,
	);
});

test("rejects a raw apiKey field outright (strict, no key in config)", () => {
	const result = providerConfigSchema.safeParse({
		...valid,
		apiKey: "sk-ant-leaked",
	});
	assert.equal(result.success, false);
});

test("rejects an empty env var name", () => {
	assert.equal(
		providerConfigSchema.safeParse({
			...valid,
			keySource: { kind: "env", var: "" },
		}).success,
		false,
	);
});

test("rejects an unknown provider", () => {
	assert.equal(
		providerConfigSchema.safeParse({ ...valid, provider: "openai" }).success,
		false,
	);
});

test("rejects unknown top-level keys", () => {
	assert.equal(
		providerConfigSchema.safeParse({ ...valid, surprise: true }).success,
		false,
	);
});
