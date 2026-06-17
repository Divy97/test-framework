import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderConfig } from "./config.js";
import { ProviderError } from "./errors.js";
import { resolveConfig } from "./resolve-config.js";

const base: ProviderConfig = {
	provider: "anthropic",
	model: "claude-opus-4-8",
	keySource: { kind: "env", var: "ANTHROPIC_API_KEY" },
	defaults: { maxOutputTokens: 1024, timeoutMs: 30_000 },
};

const env = (vars: Record<string, string>) => (name: string) => vars[name];

test("resolves the key from the named env var into a Secret", () => {
	const resolved = resolveConfig(base, {
		getEnv: env({ ANTHROPIC_API_KEY: "sk-ant-xyz" }),
	});
	assert.equal(
		resolved.key.use((v) => v),
		"sk-ant-xyz",
	);
	assert.equal(resolved.model, "claude-opus-4-8");
});

test("missing env key throws PROVIDER_CONFIG_INVALID", () => {
	try {
		resolveConfig(base, { getEnv: env({}) });
		assert.fail("expected throw");
	} catch (err) {
		assert.ok(err instanceof ProviderError);
		assert.equal(err.code, "PROVIDER_CONFIG_INVALID");
	}
});

test("empty env key throws PROVIDER_CONFIG_INVALID", () => {
	assert.throws(
		() => resolveConfig(base, { getEnv: env({ ANTHROPIC_API_KEY: "" }) }),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_CONFIG_INVALID",
	);
});

test("invocation overrides win over config; absent invocation falls back", () => {
	const overridden = resolveConfig(base, {
		getEnv: env({ ANTHROPIC_API_KEY: "k" }),
		invocation: { model: "claude-haiku-4-5", maxOutputTokens: 256 },
	});
	assert.equal(overridden.model, "claude-haiku-4-5");
	assert.equal(overridden.defaults.maxOutputTokens, 256);
	// timeoutMs not overridden → falls back to config
	assert.equal(overridden.defaults.timeoutMs, 30_000);

	const fallback = resolveConfig(base, {
		getEnv: env({ ANTHROPIC_API_KEY: "k" }),
	});
	assert.equal(fallback.model, "claude-opus-4-8");
	assert.equal(fallback.defaults.maxOutputTokens, 1024);
});
