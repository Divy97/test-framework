import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { ProviderError } from "../errors.js";
import { extractAnthropicGeneration } from "./anthropic.js";
import { extractOpenRouterGeneration } from "./openrouter.js";

// Synthetic SDK payloads. The adapters pass the real SDK response objects to
// these extractors; tests build the minimal shape the extractor reads and cast
// once through `unknown` (the same pattern as the http-error tests).
function anthropicMessage(over: Record<string, unknown>): Anthropic.Message {
	return {
		id: "msg_1",
		type: "message",
		role: "assistant",
		model: "claude-opus-4-8",
		stop_reason: "end_turn",
		stop_sequence: null,
		content: [{ type: "text", text: "hello", citations: null }],
		usage: { input_tokens: 10, output_tokens: 5 },
		...over,
	} as unknown as Anthropic.Message;
}

function openRouterCompletion(
	over: Record<string, unknown>,
): OpenAI.Chat.Completions.ChatCompletion {
	return {
		id: "cmpl_1",
		object: "chat.completion",
		created: 0,
		model: "openai/gpt-4o",
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				message: { role: "assistant", content: "hello", refusal: null },
				logprobs: null,
			},
		],
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		...over,
	} as unknown as OpenAI.Chat.Completions.ChatCompletion;
}

const isInvalidOutput = (e: unknown) =>
	e instanceof ProviderError && e.code === "MODEL_OUTPUT_INVALID";

// --- Anthropic ---

test("anthropic: structured request extracts tool_use input as json", () => {
	const message = anthropicMessage({
		stop_reason: "tool_use",
		content: [{ type: "tool_use", id: "tu_1", name: "emit", input: { a: 7 } }],
	});
	const gen = extractAnthropicGeneration(message, true);
	assert.deepEqual(gen.output, { kind: "json", value: { a: 7 } });
	assert.equal(gen.finishReason, "tool_use");
	assert.equal(gen.model, "claude-opus-4-8");
	assert.equal(gen.providerRequestId, "msg_1");
});

test("anthropic: structured request with no tool_use rejects as MODEL_OUTPUT_INVALID", () => {
	const message = anthropicMessage({
		content: [{ type: "text", text: "no tool here", citations: null }],
	});
	assert.throws(
		() => extractAnthropicGeneration(message, true),
		isInvalidOutput,
	);
});

test("anthropic: unstructured request joins text blocks", () => {
	const message = anthropicMessage({
		content: [
			{ type: "text", text: "foo", citations: null },
			{ type: "tool_use", id: "x", name: "emit", input: {} },
			{ type: "text", text: "bar", citations: null },
		],
	});
	const gen = extractAnthropicGeneration(message, false);
	assert.deepEqual(gen.output, { kind: "text", value: "foobar" });
});

test("anthropic: usage normalizes totals and surfaces cached input tokens", () => {
	const message = anthropicMessage({
		usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 4 },
	});
	const gen = extractAnthropicGeneration(message, false);
	assert.deepEqual(gen.usage, {
		inputTokens: 10,
		outputTokens: 5,
		totalTokens: 15,
		cachedInputTokens: 4,
	});
});

test("anthropic: finish reasons map to the neutral taxonomy", () => {
	const cases: Array<[string, string]> = [
		["end_turn", "stop"],
		["stop_sequence", "stop"],
		["max_tokens", "length"],
		["refusal", "content_filter"],
		["pause_turn", "other"],
	];
	for (const [stop, expected] of cases) {
		const gen = extractAnthropicGeneration(
			anthropicMessage({ stop_reason: stop }),
			false,
		);
		assert.equal(gen.finishReason, expected, `${stop} -> ${expected}`);
	}
});

// --- OpenRouter ---

test("openrouter: structured request extracts tool call arguments as raw text", () => {
	const completion = openRouterCompletion({
		choices: [
			{
				index: 0,
				finish_reason: "tool_calls",
				logprobs: null,
				message: {
					role: "assistant",
					content: null,
					refusal: null,
					tool_calls: [
						{
							id: "call_1",
							type: "function",
							function: { name: "emit", arguments: '{"a":7}' },
						},
					],
				},
			},
		],
	});
	const gen = extractOpenRouterGeneration(completion, true);
	// The seam strict-parses this string; the adapter must not parse it.
	assert.deepEqual(gen.output, { kind: "text", value: '{"a":7}' });
	assert.equal(gen.finishReason, "tool_use");
	assert.equal(gen.model, "openai/gpt-4o");
	assert.equal(gen.providerRequestId, "cmpl_1");
});

test("openrouter: structured request with no tool call falls back to raw json content", () => {
	const completion = openRouterCompletion({
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				logprobs: null,
				message: { role: "assistant", content: '{"a":7}', refusal: null },
			},
		],
	});
	// No tool call: the seam strict-parses the message content as the output.
	const gen = extractOpenRouterGeneration(completion, true);
	assert.deepEqual(gen.output, { kind: "text", value: '{"a":7}' });
	assert.equal(gen.finishReason, "stop");
});

test("openrouter: structured request strips a ```json markdown fence from content", () => {
	const completion = openRouterCompletion({
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				logprobs: null,
				message: {
					role: "assistant",
					content: '```json\n{"a":7}\n```',
					refusal: null,
				},
			},
		],
	});
	const gen = extractOpenRouterGeneration(completion, true);
	assert.deepEqual(gen.output, { kind: "text", value: '{"a":7}' });
});

test("openrouter: structured request strips a bare ``` fence from content", () => {
	const completion = openRouterCompletion({
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				logprobs: null,
				message: {
					role: "assistant",
					content: '```\n{"a":7}\n```',
					refusal: null,
				},
			},
		],
	});
	const gen = extractOpenRouterGeneration(completion, true);
	assert.deepEqual(gen.output, { kind: "text", value: '{"a":7}' });
});

test("openrouter: structured request with no tool call and empty content rejects as MODEL_OUTPUT_INVALID", () => {
	const blankContent = openRouterCompletion({
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				logprobs: null,
				message: { role: "assistant", content: "   \n  ", refusal: null },
			},
		],
	});
	assert.throws(
		() => extractOpenRouterGeneration(blankContent, true),
		isInvalidOutput,
	);

	const nullContent = openRouterCompletion({
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				logprobs: null,
				message: { role: "assistant", content: null, refusal: null },
			},
		],
	});
	assert.throws(
		() => extractOpenRouterGeneration(nullContent, true),
		isInvalidOutput,
	);
});

test("openrouter: empty choices rejects as MODEL_OUTPUT_INVALID", () => {
	const completion = openRouterCompletion({ choices: [] });
	assert.throws(
		() => extractOpenRouterGeneration(completion, false),
		isInvalidOutput,
	);
});

test("openrouter: unstructured request returns message content (null -> empty string)", () => {
	const withContent = extractOpenRouterGeneration(
		openRouterCompletion({}),
		false,
	);
	assert.deepEqual(withContent.output, { kind: "text", value: "hello" });

	const nullContent = openRouterCompletion({
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				logprobs: null,
				message: { role: "assistant", content: null, refusal: null },
			},
		],
	});
	assert.deepEqual(extractOpenRouterGeneration(nullContent, false).output, {
		kind: "text",
		value: "",
	});
});

test("openrouter: usage normalizes and falls back to summed total when absent", () => {
	const full = extractOpenRouterGeneration(
		openRouterCompletion({
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
				prompt_tokens_details: { cached_tokens: 3 },
			},
		}),
		false,
	);
	assert.deepEqual(full.usage, {
		inputTokens: 10,
		outputTokens: 5,
		totalTokens: 15,
		cachedInputTokens: 3,
	});

	const noTotal = extractOpenRouterGeneration(
		openRouterCompletion({
			usage: { prompt_tokens: 7, completion_tokens: 2 },
		}),
		false,
	);
	assert.equal(noTotal.usage.totalTokens, 9);
});

test("openrouter: finish reasons map to the neutral taxonomy", () => {
	const cases: Array<[string, string]> = [
		["stop", "stop"],
		["length", "length"],
		["tool_calls", "tool_use"],
		["function_call", "tool_use"],
		["content_filter", "content_filter"],
		["", "other"],
	];
	for (const [reason, expected] of cases) {
		const completion = openRouterCompletion({
			choices: [
				{
					index: 0,
					finish_reason: reason,
					logprobs: null,
					message: { role: "assistant", content: "x", refusal: null },
				},
			],
		});
		assert.equal(
			extractOpenRouterGeneration(completion, false).finishReason,
			expected,
			`${reason} -> ${expected}`,
		);
	}
});
