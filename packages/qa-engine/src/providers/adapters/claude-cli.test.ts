import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ProviderError } from "../errors.js";
import type { GenerationRequest } from "../types.js";
import {
	buildClaudeArgs,
	buildClaudePrompt,
	type ClaudeRunner,
	createClaudeCliAdapter,
	normalizeClaudeContent,
	parseClaudeEnvelope,
} from "./claude-cli.js";

// A valid `--output-format json` envelope, as observed from the real CLI.
function envelope(over: Record<string, unknown> = {}): string {
	return JSON.stringify({
		type: "result",
		subtype: "success",
		is_error: false,
		result: "hello",
		usage: { input_tokens: 12, output_tokens: 3 },
		...over,
	});
}

const req = (over: Partial<GenerationRequest> = {}): GenerationRequest => ({
	messages: [{ role: "user", content: "hi" }],
	maxOutputTokens: 64,
	...over,
});

// --- buildClaudePrompt --------------------------------------------------------

test("buildClaudePrompt prepends the system block and labels turns", () => {
	const prompt = buildClaudePrompt(
		req({
			system: "You are a tester.",
			messages: [
				{ role: "user", content: "first" },
				{ role: "assistant", content: "ok" },
				{ role: "user", content: "second" },
			],
		}),
	);
	assert.match(prompt, /^You are a tester\./);
	assert.match(prompt, /User: first/);
	assert.match(prompt, /Assistant: ok/);
	assert.match(prompt, /User: second/);
});

test("buildClaudePrompt embeds the JSON Schema and a JSON-only instruction when a schema is present", () => {
	const schema = z.object({ answer: z.number() });
	const prompt = buildClaudePrompt(req({ schema }));
	assert.match(prompt, /ONLY a single JSON object/);
	// The converted JSON Schema must be embedded (object type + the field name).
	assert.match(prompt, /"type": "object"/);
	assert.match(prompt, /"answer"/);
});

test("buildClaudePrompt omits the schema instruction for a plain text request", () => {
	const prompt = buildClaudePrompt(req());
	assert.doesNotMatch(prompt, /JSON Schema/);
});

// --- buildClaudeArgs ----------------------------------------------------------

test("buildClaudeArgs selects the model and pins the isolation flags", () => {
	const args = buildClaudeArgs("opus");
	assert.deepEqual(args.slice(0, 5), [
		"-p",
		"--output-format",
		"json",
		"--model",
		"opus",
	]);
	// Isolation flags that make this a pure completion (no hooks/MCP/tools).
	for (const flag of [
		"--no-session-persistence",
		"--strict-mcp-config",
		"--mcp-config",
		"--tools",
		"--disable-slash-commands",
		"--setting-sources",
	]) {
		assert.ok(args.includes(flag), `expected ${flag} in args`);
	}
});

// --- normalizeClaudeContent ---------------------------------------------------

test("normalizeClaudeContent strips a ```json fence", () => {
	assert.equal(normalizeClaudeContent('```json\n{"a":1}\n```'), '{"a":1}');
});

test("normalizeClaudeContent strips a bare ``` fence", () => {
	assert.equal(normalizeClaudeContent('```\n{"a":1}\n```'), '{"a":1}');
});

test("normalizeClaudeContent trims unfenced content unchanged", () => {
	assert.equal(normalizeClaudeContent('  {"a":1}  '), '{"a":1}');
});

// --- parseClaudeEnvelope ------------------------------------------------------

test("parseClaudeEnvelope returns normalized text + usage from a valid envelope", () => {
	const gen = parseClaudeEnvelope(envelope({ result: "pong" }), "opus");
	assert.deepEqual(gen.output, { kind: "text", value: "pong" });
	assert.equal(gen.model, "opus");
	assert.equal(gen.finishReason, "stop");
	assert.equal(gen.usage.inputTokens, 12);
	assert.equal(gen.usage.outputTokens, 3);
	assert.equal(gen.usage.totalTokens, 15);
});

test("parseClaudeEnvelope normalizes a fenced JSON result", () => {
	const gen = parseClaudeEnvelope(
		envelope({ result: '```json\n{"answer":7}\n```' }),
		"opus",
	);
	assert.equal(gen.output.value, '{"answer":7}');
});

test("parseClaudeEnvelope maps usage zeros when usage is absent", () => {
	const gen = parseClaudeEnvelope(
		JSON.stringify({ result: "x", is_error: false }),
		"opus",
	);
	assert.deepEqual(gen.usage, {
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	});
});

test("parseClaudeEnvelope carries cache_read_input_tokens when present", () => {
	const gen = parseClaudeEnvelope(
		envelope({ usage: { input_tokens: 2, cache_read_input_tokens: 99 } }),
		"opus",
	);
	assert.equal(gen.usage.cachedInputTokens, 99);
});

test("parseClaudeEnvelope throws MODEL_OUTPUT_INVALID on unparseable stdout", () => {
	assert.throws(
		() => parseClaudeEnvelope("not json", "opus"),
		(e) => e instanceof ProviderError && e.code === "MODEL_OUTPUT_INVALID",
	);
});

test("parseClaudeEnvelope throws MODEL_OUTPUT_INVALID on an error result", () => {
	assert.throws(
		() =>
			parseClaudeEnvelope(
				envelope({ is_error: true, result: "Not logged in" }),
				"opus",
			),
		(e) => e instanceof ProviderError && e.code === "MODEL_OUTPUT_INVALID",
	);
});

test("parseClaudeEnvelope throws MODEL_OUTPUT_INVALID on an empty result", () => {
	assert.throws(
		() => parseClaudeEnvelope(envelope({ result: "   " }), "opus"),
		(e) => e instanceof ProviderError && e.code === "MODEL_OUTPUT_INVALID",
	);
});

test("parseClaudeEnvelope never leaks the raw stdout in the error message", () => {
	try {
		parseClaudeEnvelope("/Users/secret/path garbage", "opus");
		assert.fail("expected throw");
	} catch (err) {
		assert.ok(err instanceof ProviderError);
		assert.doesNotMatch(err.message, /secret/);
	}
});

// --- createClaudeCliAdapter (with injected runner, no spawn) -------------------

test("adapter capabilities advertise prompted structured output and cancellation", () => {
	const adapter = createClaudeCliAdapter({ model: "opus" });
	const caps = adapter.capabilities("opus");
	assert.equal(caps.structuredOutput, "prompted");
	assert.equal(caps.supportsSystemPrompt, true);
	assert.equal(caps.supportsCancellation, true);
	assert.equal(adapter.id, "claude-cli");
});

test("adapter generate (text branch) feeds the prompt to the runner and returns the result", async () => {
	let seenArgs: string[] = [];
	let seenStdin = "";
	const runClaude: ClaudeRunner = async (args, stdin) => {
		seenArgs = args;
		seenStdin = stdin;
		return envelope({ result: "the answer" });
	};
	const adapter = createClaudeCliAdapter({ model: "opus", runClaude });

	const gen = await adapter.generate(
		req({ system: "be terse", messages: [{ role: "user", content: "q?" }] }),
		new AbortController().signal,
	);

	assert.equal(gen.output.value, "the answer");
	assert.ok(seenArgs.includes("--model"));
	assert.match(seenStdin, /be terse/);
	assert.match(seenStdin, /User: q\?/);
});

test("adapter generate (structured branch) embeds the schema in the runner stdin", async () => {
	const schema = z.object({ answer: z.number() });
	let seenStdin = "";
	const runClaude: ClaudeRunner = async (_args, stdin) => {
		seenStdin = stdin;
		return envelope({ result: '{"answer": 42}' });
	};
	const adapter = createClaudeCliAdapter({ model: "opus", runClaude });

	const gen = await adapter.generate(
		req({ schema }),
		new AbortController().signal,
	);

	assert.match(seenStdin, /JSON Schema/);
	assert.equal(gen.output.value, '{"answer": 42}');
});

test("adapter generate propagates a runner ProviderError untouched", async () => {
	const runClaude: ClaudeRunner = async () => {
		throw new ProviderError("PROVIDER_TRANSIENT", "spawn failed", true);
	};
	const adapter = createClaudeCliAdapter({ model: "opus", runClaude });
	await assert.rejects(
		adapter.generate(req(), new AbortController().signal),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_TRANSIENT",
	);
});

test("adapter generate rethrows the abort reason from the runner", async () => {
	const controller = new AbortController();
	const reason = new DOMException("aborted", "AbortError");
	const runClaude: ClaudeRunner = async (_args, _stdin, signal) => {
		// Simulate the default runner's contract: reject with the abort reason.
		controller.abort(reason);
		throw signal.reason;
	};
	const adapter = createClaudeCliAdapter({ model: "opus", runClaude });
	await assert.rejects(
		adapter.generate(req(), controller.signal),
		(e) => e === reason,
	);
});
