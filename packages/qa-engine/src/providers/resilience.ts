import { ProviderError } from "./errors.js";
import { type LogEntry, safeLogFields } from "./redaction.js";
import { DEFAULT_RETRY_POLICY, type RetryDeps, withRetry } from "./retry.js";
import type { RawGeneration, RetryPolicy } from "./types.js";

/**
 * Resilience dependencies. `timeoutSignal` is injectable so tests drive
 * timeouts deterministically; production defaults to `AbortSignal.timeout`.
 */
export interface ResilienceDeps extends RetryDeps {
	timeoutSignal: (ms: number) => AbortSignal;
	log?: (entry: LogEntry) => void;
}

export interface ResilienceContext {
	provider: string;
	model: string;
}

export interface ResilienceOptions {
	timeoutMs: number;
	retry?: RetryPolicy;
	callerSignal?: AbortSignal;
	deps: ResilienceDeps;
	ctx: ResilienceContext;
}

function isAbortError(err: unknown): boolean {
	return err instanceof DOMException
		? err.name === "AbortError"
		: (err as { name?: string } | null)?.name === "AbortError";
}

/**
 * Wrap a single-attempt raw call with timeout, cancellation, retry, and
 * allowlist logging. Each attempt runs under a signal composed from the caller's
 * signal and a fresh internal timeout. On abort we disambiguate by source:
 * caller-aborted ⇒ `PROVIDER_CANCELLED` (immediate, non-retryable); the internal
 * timeout firing ⇒ `PROVIDER_TIMEOUT` (retryable). Already-mapped
 * `ProviderError`s from the adapter pass through unchanged.
 */
export async function withResilience(
	raw: (signal: AbortSignal) => Promise<RawGeneration>,
	opts: ResilienceOptions,
): Promise<RawGeneration> {
	const { timeoutMs, callerSignal, deps, ctx } = opts;
	const policy = opts.retry ?? DEFAULT_RETRY_POLICY;

	const emit = (
		attempt: number,
		durationMs: number,
		extra: Partial<LogEntry>,
	) => {
		deps.log?.(
			safeLogFields({
				provider: ctx.provider,
				model: ctx.model,
				attempt,
				durationMs,
				...extra,
			}),
		);
	};

	return withRetry(
		async (attemptNo) => {
			const started = deps.now();
			const timeout = deps.timeoutSignal(timeoutMs);
			const composed = AbortSignal.any(
				callerSignal ? [callerSignal, timeout] : [timeout],
			);

			try {
				const result = await raw(composed);
				emit(attemptNo, deps.now() - started, {
					usage: result.usage,
					providerRequestId: result.providerRequestId,
				});
				return result;
			} catch (err) {
				if (isAbortError(err) || composed.aborted) {
					const cancelled = Boolean(callerSignal?.aborted);
					const mapped = cancelled
						? new ProviderError("PROVIDER_CANCELLED", "caller aborted", false)
						: new ProviderError(
								"PROVIDER_TIMEOUT",
								`attempt timed out after ${timeoutMs}ms`,
								true,
							);
					emit(attemptNo, deps.now() - started, { code: mapped.code });
					throw mapped;
				}
				const mapped =
					err instanceof ProviderError
						? err
						: new ProviderError(
								"PROVIDER_TRANSIENT",
								"unexpected adapter error",
								true,
								{
									cause: err,
								},
							);
				emit(attemptNo, deps.now() - started, { code: mapped.code });
				throw mapped;
			}
		},
		policy,
		deps,
		callerSignal,
	);
}
