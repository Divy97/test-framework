import { ProviderError } from "../providers/errors.js";
import type { TestGraphFinding } from "../test-graph/findings.js";

/**
 * The engine's single typed error. Provider-originated codes pass through
 * verbatim (a `ProviderError.code` is a subset of this union) so a caller can
 * branch on auth/quota/transient/timeout without reaching behind the seam.
 * Engine-specific codes cover input, repo access, validation, and persistence.
 */
export type EngineErrorCode =
	// passthrough from the provider seam
	| "PROVIDER_AUTH"
	| "PROVIDER_QUOTA"
	| "PROVIDER_TRANSIENT"
	| "PROVIDER_TIMEOUT"
	| "PROVIDER_CANCELLED"
	| "PROVIDER_UNSUPPORTED_CAPABILITY"
	| "PROVIDER_CONFIG_INVALID"
	| "MODEL_OUTPUT_INVALID"
	// engine-specific
	| "INVALID_INPUT"
	| "REPO_ACCESS_DENIED"
	| "CONTEXT_LIMIT_REACHED"
	| "PLAN_INVARIANT_FAILED"
	| "ARTIFACT_NOT_FOUND"
	| "ARTIFACT_WRITE_FAILED"
	| "ARTIFACT_CONFLICT";

export interface EngineErrorOptions {
	cause?: unknown;
	/** Set on PLAN_INVARIANT_FAILED: the validator findings that blocked the plan. */
	findings?: readonly TestGraphFinding[];
}

export class EngineError extends Error {
	readonly code: EngineErrorCode;
	readonly findings?: readonly TestGraphFinding[];

	constructor(
		code: EngineErrorCode,
		message: string,
		options?: EngineErrorOptions,
	) {
		super(
			message,
			options?.cause === undefined ? undefined : { cause: options.cause },
		);
		this.name = "EngineError";
		this.code = code;
		this.findings = options?.findings;
	}
}

/** Map a seam `ProviderError` onto the engine taxonomy (code passthrough). */
export function fromProviderError(err: ProviderError): EngineError {
	return new EngineError(err.code, err.message, { cause: err });
}

/** True for a DOMException/Error that signals an aborted operation. */
function isAbortError(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as { name?: unknown }).name === "AbortError"
	);
}

/** Wrap any thrown value as an EngineError, mapping ProviderError specially. */
export function asEngineError(
	err: unknown,
	fallback: EngineErrorCode,
): EngineError {
	if (err instanceof EngineError) return err;
	if (err instanceof ProviderError) return fromProviderError(err);
	// An aborted in-flight call is a cancellation, never invalid output — classify
	// it as such whatever surfaced the abort. A resilience-wrapped provider already
	// throws PROVIDER_CANCELLED; a bare provider rejects with a raw AbortError, which
	// must not be mislabeled with the fallback (e.g. MODEL_OUTPUT_INVALID).
	if (isAbortError(err)) {
		return new EngineError("PROVIDER_CANCELLED", "Request was cancelled.", {
			cause: err,
		});
	}
	const message = err instanceof Error ? err.message : String(err);
	return new EngineError(fallback, message, { cause: err });
}
