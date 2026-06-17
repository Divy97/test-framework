/**
 * One discriminated error class for the whole seam, always thrown (never a
 * result-union). A `ProviderError` never carries a key or a raw request body;
 * its `cause` is reachable for redacted logging but is never auto-serialized.
 */

export type ProviderErrorCode =
	| "PROVIDER_AUTH"
	| "PROVIDER_QUOTA"
	| "PROVIDER_TRANSIENT"
	| "PROVIDER_TIMEOUT"
	| "PROVIDER_CANCELLED"
	| "MODEL_OUTPUT_INVALID"
	| "PROVIDER_UNSUPPORTED_CAPABILITY"
	| "PROVIDER_CONFIG_INVALID";

export interface ProviderErrorOptions {
	/** Underlying error; redacted before logging, never auto-serialized. */
	cause?: unknown;
	/** Non-secret provider-side request id, when the provider returns one. */
	providerRequestId?: string;
	/** Server-advised retry delay (from `Retry-After`), honored by the retry loop. */
	retryAfterMs?: number;
}

export class ProviderError extends Error {
	readonly code: ProviderErrorCode;
	readonly retryable: boolean;
	readonly providerRequestId?: string;
	readonly retryAfterMs?: number;

	constructor(
		code: ProviderErrorCode,
		message: string,
		retryable: boolean,
		options?: ProviderErrorOptions,
	) {
		super(
			message,
			options?.cause === undefined ? undefined : { cause: options.cause },
		);
		this.name = "ProviderError";
		this.code = code;
		this.retryable = retryable;
		this.providerRequestId = options?.providerRequestId;
		this.retryAfterMs = options?.retryAfterMs;
	}

	/**
	 * Only safe, non-secret fields are serialized. `cause`, `stack`, and any
	 * vendor payload are deliberately excluded so a key cannot leak via logging
	 * that happens to `JSON.stringify` an error.
	 */
	toJSON(): {
		name: string;
		code: ProviderErrorCode;
		message: string;
		retryable: boolean;
		providerRequestId?: string;
	} {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			retryable: this.retryable,
			providerRequestId: this.providerRequestId,
		};
	}
}

export const RETRYABLE: ReadonlySet<ProviderErrorCode> =
	new Set<ProviderErrorCode>(["PROVIDER_TRANSIENT", "PROVIDER_TIMEOUT"]);

export function isRetryable(code: ProviderErrorCode): boolean {
	return RETRYABLE.has(code);
}
