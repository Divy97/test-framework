import assert from "node:assert/strict";
import test from "node:test";
import { ProviderError } from "./errors.js";
import { type RetryDeps, withRetry } from "./retry.js";

const policy = {
	maxAttempts: 3,
	baseDelayMs: 100,
	maxDelayMs: 1000,
	maxElapsedMs: 1_000_000,
};

/** Deterministic fake clock: sleep records its delay and advances `now`. */
function harness(random = () => 1) {
	let t = 0;
	const sleeps: number[] = [];
	const deps: RetryDeps = {
		now: () => t,
		sleep: async (ms) => {
			sleeps.push(ms);
			t += ms;
		},
		random,
	};
	return { deps, sleeps };
}

const transient = () => new ProviderError("PROVIDER_TRANSIENT", "503", true);

test("retries transient errors up to maxAttempts, then throws", async () => {
	const { deps } = harness();
	let calls = 0;
	await assert.rejects(
		withRetry(
			async () => {
				calls++;
				throw transient();
			},
			policy,
			deps,
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_TRANSIENT",
	);
	assert.equal(calls, 3);
});

test("does not retry non-retryable errors", async () => {
	const { deps } = harness();
	let calls = 0;
	await assert.rejects(
		withRetry(
			async () => {
				calls++;
				throw new ProviderError("PROVIDER_AUTH", "401", false);
			},
			policy,
			deps,
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_AUTH",
	);
	assert.equal(calls, 1);
});

test("returns the value on first success without sleeping", async () => {
	const { deps, sleeps } = harness();
	const out = await withRetry(async () => 42, policy, deps);
	assert.equal(out, 42);
	assert.deepEqual(sleeps, []);
});

test("backoff is exponential and capped (full jitter at random()=1)", async () => {
	const { deps, sleeps } = harness(() => 1);
	await assert.rejects(
		withRetry(
			async () => {
				throw transient();
			},
			{ ...policy, maxAttempts: 4, maxDelayMs: 300 },
			deps,
		),
	);
	// attempts 1,2,3 fail then sleep; 4th fails terminally. delays: 100,200,300(capped)
	assert.deepEqual(sleeps, [100, 200, 300]);
});

test("honors Retry-After even when jitter would pick a smaller delay", async () => {
	const { deps, sleeps } = harness(() => 0);
	await assert.rejects(
		withRetry(
			async () => {
				throw new ProviderError("PROVIDER_TRANSIENT", "429", true, {
					retryAfterMs: 5000,
				});
			},
			{ ...policy, maxAttempts: 2 },
			deps,
		),
	);
	assert.deepEqual(sleeps, [5000]);
});

test("gives up when the next delay would exceed the elapsed budget", async () => {
	const { deps } = harness(() => 1);
	let calls = 0;
	await assert.rejects(
		withRetry(
			async () => {
				calls++;
				throw transient();
			},
			{ ...policy, maxAttempts: 10, maxElapsedMs: 150 },
			deps,
		),
	);
	// first delay 100 fits (elapsed 0+100<=150); after that elapsed=100, next 200 > 150 → give up.
	assert.equal(calls, 2);
});

test("a pre-aborted signal throws CANCELLED without calling the attempt", async () => {
	const { deps } = harness();
	const controller = new AbortController();
	controller.abort();
	let calls = 0;
	await assert.rejects(
		withRetry(
			async () => {
				calls++;
				return 1;
			},
			policy,
			deps,
			controller.signal,
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_CANCELLED",
	);
	assert.equal(calls, 0);
});

test("aborting during backoff stops retrying with CANCELLED", async () => {
	const controller = new AbortController();
	let t = 0;
	const deps: RetryDeps = {
		now: () => t,
		sleep: async (ms) => {
			t += ms;
			controller.abort(); // signal fires while we are 'sleeping'
			throw new Error("aborted");
		},
		random: () => 1,
	};
	let calls = 0;
	await assert.rejects(
		withRetry(
			async () => {
				calls++;
				throw transient();
			},
			policy,
			deps,
			controller.signal,
		),
		(e) => e instanceof ProviderError && e.code === "PROVIDER_CANCELLED",
	);
	assert.equal(calls, 1);
});
