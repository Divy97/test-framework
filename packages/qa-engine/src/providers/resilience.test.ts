import assert from "node:assert/strict";
import test from "node:test";
import { ProviderError } from "./errors.js";
import type { LogEntry } from "./redaction.js";
import { type ResilienceDeps, withResilience } from "./resilience.js";
import type { RawGeneration } from "./types.js";

const okResult: RawGeneration = {
	output: { kind: "text", value: "hi" },
	usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
	model: "m",
	finishReason: "stop",
	providerRequestId: "req_1",
};

function deps(opts: {
	timeoutSignal: () => AbortSignal;
	log?: (e: LogEntry) => void;
}): ResilienceDeps {
	let t = 0;
	return {
		now: () => t,
		sleep: async (ms) => {
			t += ms;
		},
		random: () => 1,
		timeoutSignal: opts.timeoutSignal,
		log: opts.log,
	};
}

const liveSignal = () => new AbortController().signal;

const policy = {
	maxAttempts: 2,
	baseDelayMs: 10,
	maxDelayMs: 10,
	maxElapsedMs: 1_000_000,
};

test("returns the raw result and logs one allowlisted entry on success", async () => {
	const logs: LogEntry[] = [];
	const out = await withResilience(async () => okResult, {
		timeoutMs: 1000,
		retry: policy,
		deps: deps({ timeoutSignal: liveSignal, log: (e) => logs.push(e) }),
		ctx: { provider: "anthropic", model: "m" },
	});
	assert.equal(out.providerRequestId, "req_1");
	assert.equal(logs.length, 1);
	assert.equal(logs[0]?.attempt, 1);
	assert.deepEqual(
		Object.keys(logs[0] ?? {}).sort(),
		[
			"attempt",
			"durationMs",
			"model",
			"providerRequestId",
			"provider",
			"usage",
		].sort(),
	);
});

test("an internal timeout becomes PROVIDER_TIMEOUT and is retried within budget", async () => {
	let calls = 0;
	await assert.rejects(
		withResilience(
			async (signal) => {
				calls++;
				if (signal.aborted) throw new DOMException("aborted", "AbortError");
				return okResult;
			},
			{
				timeoutMs: 1000,
				retry: policy,
				deps: deps({ timeoutSignal: () => AbortSignal.abort() }),
				ctx: { provider: "anthropic", model: "m" },
			},
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_TIMEOUT",
	);
	assert.equal(calls, 2); // retried up to maxAttempts
});

test("a pre-aborted caller signal becomes PROVIDER_CANCELLED, attempt never runs", async () => {
	const controller = new AbortController();
	controller.abort();
	let calls = 0;
	await assert.rejects(
		withResilience(
			async () => {
				calls++;
				return okResult;
			},
			{
				timeoutMs: 1000,
				retry: policy,
				callerSignal: controller.signal,
				deps: deps({ timeoutSignal: liveSignal }),
				ctx: { provider: "anthropic", model: "m" },
			},
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_CANCELLED",
	);
	assert.equal(calls, 0);
});

test("caller cancellation during an attempt wins over timeout and is not retried", async () => {
	const controller = new AbortController();
	let calls = 0;
	await assert.rejects(
		withResilience(
			async () => {
				calls++;
				controller.abort(); // caller cancels mid-flight
				throw new DOMException("aborted", "AbortError");
			},
			{
				timeoutMs: 1000,
				retry: policy,
				callerSignal: controller.signal,
				deps: deps({ timeoutSignal: liveSignal }),
				ctx: { provider: "anthropic", model: "m" },
			},
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_CANCELLED",
	);
	assert.equal(calls, 1);
});

test("a mapped ProviderError from the adapter passes through with its retryability", async () => {
	let calls = 0;
	await assert.rejects(
		withResilience(
			async () => {
				calls++;
				throw new ProviderError("PROVIDER_AUTH", "401", false);
			},
			{
				timeoutMs: 1000,
				retry: policy,
				deps: deps({ timeoutSignal: liveSignal }),
				ctx: { provider: "anthropic", model: "m" },
			},
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_AUTH",
	);
	assert.equal(calls, 1); // auth is non-retryable
});
