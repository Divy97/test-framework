import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createProvider } from "../factory.js";

/**
 * Real provider smoke tests. Each is auto-skipped unless `RUN_LIVE_PROVIDER` and
 * that provider's key are set, so CI (which never has a key) is always green.
 * Run locally with, e.g.:
 *   RUN_LIVE_PROVIDER=1 ANTHROPIC_API_KEY=sk-ant-... pnpm test
 *   RUN_LIVE_PROVIDER=1 OPENROUTER_API_KEY=sk-or-... pnpm test
 */

const live = Boolean(
	process.env.RUN_LIVE_PROVIDER && process.env.ANTHROPIC_API_KEY,
);
const liveOpenRouter = Boolean(
	process.env.RUN_LIVE_PROVIDER && process.env.OPENROUTER_API_KEY,
);

const schema = z.object({ answer: z.number() });
const prompt = 'Respond with the JSON object {"answer": 7}.';

test("anthropic adapter returns normalized usage and validated structured data", {
	skip: !live,
}, async () => {
	const provider = await createProvider({
		provider: "anthropic",
		model: "claude-haiku-4-5",
		keySource: { kind: "env", var: "ANTHROPIC_API_KEY" },
	});

	const result = await provider.generate(
		{
			messages: [{ role: "user", content: prompt }],
			maxOutputTokens: 256,
			schema,
		},
		{ timeoutMs: 30_000 },
	);

	assert.equal(typeof result.data?.answer, "number");
	assert.ok(result.usage.totalTokens > 0);
	assert.equal(typeof result.providerRequestId, "string");
});

test("openrouter adapter returns normalized usage and validated structured data", {
	skip: !liveOpenRouter,
}, async () => {
	const provider = await createProvider({
		provider: "openrouter",
		model: "openai/gpt-4o-mini",
		keySource: { kind: "env", var: "OPENROUTER_API_KEY" },
	});

	const result = await provider.generate(
		{
			messages: [{ role: "user", content: prompt }],
			maxOutputTokens: 256,
			schema,
		},
		{ timeoutMs: 30_000 },
	);

	assert.equal(typeof result.data?.answer, "number");
	assert.ok(result.usage.totalTokens > 0);
	assert.equal(typeof result.providerRequestId, "string");
});
