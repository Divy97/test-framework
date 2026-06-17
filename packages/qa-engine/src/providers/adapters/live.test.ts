import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createProvider } from "../factory.js";

/**
 * Real Anthropic smoke test. Auto-skipped unless BOTH `RUN_LIVE_PROVIDER` and
 * `ANTHROPIC_API_KEY` are set, so CI (which never has the key) is always green.
 * Run locally with: RUN_LIVE_PROVIDER=1 ANTHROPIC_API_KEY=sk-ant-... pnpm test
 */

const live = Boolean(
	process.env.RUN_LIVE_PROVIDER && process.env.ANTHROPIC_API_KEY,
);

test("anthropic adapter returns normalized usage and validated structured data", {
	skip: !live,
}, async () => {
	const provider = await createProvider({
		provider: "anthropic",
		model: "claude-haiku-4-5",
		keySource: { kind: "env", var: "ANTHROPIC_API_KEY" },
	});

	const schema = z.object({ answer: z.number() });
	const result = await provider.generate(
		{
			messages: [
				{
					role: "user",
					content: 'Respond with the JSON object {"answer": 7}.',
				},
			],
			maxOutputTokens: 256,
			schema,
		},
		{ timeoutMs: 30_000 },
	);

	assert.equal(typeof result.data?.answer, "number");
	assert.ok(result.usage.totalTokens > 0);
	assert.equal(typeof result.providerRequestId, "string");
});
