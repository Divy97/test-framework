import { ProviderError } from "./errors.js";
import type { RetryPolicy } from "./types.js";

/**
 * Deterministic dependencies. Tests inject a fake clock and `random = () => k`
 * so backoff is exact and no real time passes.
 */
export interface RetryDeps {
	now: () => number;
	sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
	random: () => number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
	maxAttempts: 3,
	baseDelayMs: 500,
	maxDelayMs: 8_000,
	maxElapsedMs: 30_000,
};

function cancelled(): ProviderError {
	return new ProviderError(
		"PROVIDER_CANCELLED",
		"cancelled during backoff",
		false,
	);
}

/**
 * Run `attempt` with bounded retry. Only `ProviderError`s flagged `retryable`
 * are retried; everything else throws immediately. Backoff is exponential
 * (`base * 2^(n-1)`, capped at `maxDelayMs`) with full jitter (`random() * cap`),
 * never shorter than a server-advised `retryAfterMs`. Retrying stops once it
 * would push elapsed time past `maxElapsedMs`. A caller-aborted signal converts
 * to `PROVIDER_CANCELLED` and aborts the in-progress backoff.
 */
export async function withRetry<T>(
	attempt: (attemptNo: number) => Promise<T>,
	policy: RetryPolicy,
	deps: RetryDeps,
	signal?: AbortSignal,
): Promise<T> {
	const start = deps.now();

	for (let attemptNo = 1; ; attemptNo++) {
		if (signal?.aborted) throw cancelled();

		try {
			return await attempt(attemptNo);
		} catch (err) {
			if (!(err instanceof ProviderError) || !err.retryable) throw err;
			if (attemptNo >= policy.maxAttempts) throw err;

			const cap = Math.min(
				policy.maxDelayMs,
				policy.baseDelayMs * 2 ** (attemptNo - 1),
			);
			const jittered = deps.random() * cap;
			const delay = Math.max(jittered, err.retryAfterMs ?? 0);

			if (deps.now() - start + delay > policy.maxElapsedMs) throw err;

			try {
				await deps.sleep(delay, signal);
			} catch {
				// A rejecting sleep means the backoff was aborted.
			}
			if (signal?.aborted) throw cancelled();
		}
	}
}
