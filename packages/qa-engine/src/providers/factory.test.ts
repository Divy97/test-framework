import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import type { ProviderConfig } from "./config.js";
import { ProviderError } from "./errors.js";
import { composeRawProvider, createProvider } from "./factory.js";
import { createFakeProvider } from "./fake/fake-provider.js";
import type {
	GenerationRequest,
	ProviderCapabilities,
	RawGeneration,
	RawProvider,
} from "./types.js";

const anthropicConfig: ProviderConfig = {
	provider: "anthropic",
	model: "claude-opus-4-8",
	keySource: { kind: "env", var: "ANTHROPIC_API_KEY" },
};
const env = (v: Record<string, string>) => (n: string) => v[n];

const caps = (
	structuredOutput: ProviderCapabilities["structuredOutput"],
): ProviderCapabilities => ({
	structuredOutput,
	supportsSystemPrompt: true,
	supportsCancellation: true,
});

function rawStub(
	structuredOutput: ProviderCapabilities["structuredOutput"],
	gen: (req: GenerationRequest) => RawGeneration,
): RawProvider {
	return {
		id: "stub",
		capabilities: () => caps(structuredOutput),
		generate: async (req) => gen(req),
	};
}

const resilienceDeps = {
	now: () => 0,
	sleep: async () => {},
	random: () => 1,
	timeoutSignal: () => new AbortController().signal,
};

const req = (over: object = {}): GenerationRequest => ({
	messages: [{ role: "user", content: "hi" }],
	maxOutputTokens: 64,
	...over,
});

test("an injected fake provider short-circuits config (no adapter, no key)", async () => {
	const fake = createFakeProvider([], { model: "fake-x" });
	// A deliberately key-less env: the short-circuit must not resolve config.
	const provider = await createProvider(anthropicConfig, {
		fakeProvider: fake,
		getEnv: env({}),
	});
	assert.equal(provider, fake);
	assert.equal(provider.id, "fake");
});

test("an invocation override reaches the resolved provider", async () => {
	const provider = await createProvider(anthropicConfig, {
		getEnv: env({ ANTHROPIC_API_KEY: "k" }),
		invocation: { model: "claude-haiku-4-5" },
	});
	assert.equal(provider.model, "claude-haiku-4-5");

	const baseline = await createProvider(anthropicConfig, {
		getEnv: env({ ANTHROPIC_API_KEY: "k" }),
	});
	assert.equal(baseline.model, "claude-opus-4-8");
});

test("openrouter config resolves via the openai-compatible adapter", async () => {
	const provider = await createProvider(
		{
			provider: "openrouter",
			model: "anthropic/claude-opus-4-8",
			keySource: { kind: "env", var: "OPENROUTER_API_KEY" },
		},
		{ getEnv: env({ OPENROUTER_API_KEY: "k" }) },
	);
	assert.equal(provider.id, "openrouter");
	assert.equal(provider.model, "anthropic/claude-opus-4-8");
});

test("claude-cli config resolves keylessly via the host-model adapter", async () => {
	// A deliberately key-less env: claude-cli must resolve without any key.
	const provider = await createProvider(
		{ provider: "claude-cli", model: "opus" },
		{ getEnv: env({}) },
	);
	assert.equal(provider.id, "claude-cli");
	assert.equal(provider.model, "opus");
	assert.equal(provider.capabilities("opus").structuredOutput, "prompted");
});

test("invalid config (raw apiKey) rejects with PROVIDER_CONFIG_INVALID", async () => {
	await assert.rejects(
		createProvider(
			{ ...anthropicConfig, apiKey: "sk-ant-x" } as unknown as ProviderConfig,
			{ getEnv: env({ ANTHROPIC_API_KEY: "k" }) },
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_CONFIG_INVALID",
	);
});

test("missing env key rejects with PROVIDER_CONFIG_INVALID", async () => {
	await assert.rejects(
		createProvider(anthropicConfig, { getEnv: env({}) }),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_CONFIG_INVALID",
	);
});

test("composed provider gates structured output on capability", async () => {
	const provider = composeRawProvider(
		rawStub("none", () => {
			throw new Error("should not be called");
		}),
		{ model: "m", resilienceDeps },
	);
	await assert.rejects(
		provider.generate(req({ schema: z.object({ a: z.number() }) }), {
			timeoutMs: 100,
		}),
		(e) =>
			e instanceof ProviderError &&
			e.code === "PROVIDER_UNSUPPORTED_CAPABILITY",
	);
});

test("composed provider validates structured output through the seam", async () => {
	const schema = z.object({ a: z.number() });
	const provider = composeRawProvider(
		rawStub("tool", () => ({
			output: { kind: "json", value: { a: 7 } },
			usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			model: "m",
			finishReason: "tool_use",
		})),
		{ model: "m", resilienceDeps },
	);
	const result = await provider.generate(req({ schema }), { timeoutMs: 100 });
	assert.deepEqual(result.data, { a: 7 });
});

test("composed provider returns text when no schema is requested", async () => {
	const provider = composeRawProvider(
		rawStub("tool", () => ({
			output: { kind: "text", value: "plain answer" },
			usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			model: "m",
			finishReason: "stop",
		})),
		{ model: "m", resilienceDeps },
	);
	const result = await provider.generate(req(), { timeoutMs: 100 });
	assert.equal(result.text, "plain answer");
	assert.equal(result.data, undefined);
});
