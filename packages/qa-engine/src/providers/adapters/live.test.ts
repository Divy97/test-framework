import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { z } from "zod";
import { requirementsStageSchema } from "../../engine/drafts.js";
import { createProvider } from "../factory.js";

/**
 * Real provider smoke tests. Each is auto-skipped unless `RUN_LIVE_PROVIDER` and
 * that provider's key are set, so CI (which never has a key) is always green.
 * Run locally with, e.g.:
 *   RUN_LIVE_PROVIDER=1 ANTHROPIC_API_KEY=sk-ant-... pnpm test
 *   RUN_LIVE_PROVIDER=1 OPENROUTER_API_KEY=sk-or-... pnpm test
 *   RUN_LIVE_CLAUDE_CLI=1 pnpm test     # keyless host-model (claude on PATH)
 */

const live = Boolean(
	process.env.RUN_LIVE_PROVIDER && process.env.ANTHROPIC_API_KEY,
);
const liveOpenRouter = Boolean(
	process.env.RUN_LIVE_PROVIDER && process.env.OPENROUTER_API_KEY,
);

/** The claude-cli smoke needs the gate set AND `claude` actually on PATH. */
function claudeOnPath(): boolean {
	try {
		execFileSync("claude", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}
const liveClaudeCli =
	Boolean(process.env.RUN_LIVE_CLAUDE_CLI) && claudeOnPath();

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

test("claude-cli adapter returns validated structured data for a trivial schema", {
	skip: !liveClaudeCli,
}, async () => {
	const provider = await createProvider({
		provider: "claude-cli",
		model: "haiku",
	});

	const result = await provider.generate(
		{
			messages: [{ role: "user", content: prompt }],
			maxOutputTokens: 256,
			schema,
		},
		{ timeoutMs: 120_000 },
	);

	assert.equal(typeof result.data?.answer, "number");
});

test("claude-cli adapter satisfies a COMPLEX schema (discriminated union + nesting)", {
	skip: !liveClaudeCli,
}, async () => {
	const provider = await createProvider({
		provider: "claude-cli",
		model: "haiku",
	});

	const result = await provider.generate(
		{
			system: "You are a QA engineer. Emit a requirements stage for the brief.",
			messages: [
				{
					role: "user",
					content:
						"Brief: users can log in with email + password. " +
						"Produce ONE requirement (kind functional) and ONE open question " +
						'(status open), each with provenance kind "inferred" and at least ' +
						"one evidenceKey. The requirement's openQuestionKeys must reference " +
						"the open question's key.",
				},
			],
			maxOutputTokens: 4096,
			schema: requirementsStageSchema,
		},
		{ timeoutMs: 120_000 },
	);

	// The seam validated against requirementsStageSchema, which nests the
	// provenance discriminated union — proving the complex case works.
	assert.ok((result.data?.requirements.length ?? 0) >= 1);
	assert.ok((result.data?.openQuestions.length ?? 0) >= 1);
	const prov = result.data?.requirements[0]?.provenance;
	assert.ok(prov !== undefined);
	assert.ok(["explicit", "inferred", "assumption"].includes(prov.kind));
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
