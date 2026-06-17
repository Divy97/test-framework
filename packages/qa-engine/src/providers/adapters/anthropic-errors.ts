import { ProviderError, type ProviderErrorCode } from "../errors.js";

/**
 * Pure mapping from an Anthropic SDK error (or a network error) to a
 * `ProviderError`. No SDK import — it inspects the duck-typed shape
 * (`status`, `message`, `headers`) so it is fully unit-testable with synthetic
 * errors. The error-mapping table lives in the plan and the tests.
 */

interface ErrorLike {
	status?: number;
	message?: string;
	headers?: { get?(key: string): string | null } | Record<string, string>;
	cause?: unknown;
}

function header(
	headers: ErrorLike["headers"],
	key: string,
): string | undefined {
	if (!headers) return undefined;
	if (typeof (headers as { get?: unknown }).get === "function") {
		return (headers as { get(k: string): string | null }).get(key) ?? undefined;
	}
	const value = (headers as Record<string, string>)[key];
	return value ?? undefined;
}

function retryAfterMs(headers: ErrorLike["headers"]): number | undefined {
	const raw = header(headers, "retry-after");
	if (raw === undefined) return undefined;
	const seconds = Number(raw);
	return Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
}

const QUOTA = /credit|quota|billing|insufficient/i;
const UNSUPPORTED = /tool|schema|structured|unsupported|input_schema/i;

export function mapAnthropicError(err: unknown): ProviderError {
	const e = (err ?? {}) as ErrorLike;
	const status = e.status;
	const message = e.message ?? "anthropic request failed";

	const make = (code: ProviderErrorCode, retryable: boolean): ProviderError =>
		new ProviderError(code, message, retryable, {
			cause: e.cause ?? err,
			retryAfterMs: retryable ? retryAfterMs(e.headers) : undefined,
		});

	// Credit/quota exhaustion is non-retryable regardless of 400 vs 429.
	if ((status === 429 || status === 400) && QUOTA.test(message)) {
		return make("PROVIDER_QUOTA", false);
	}

	switch (status) {
		case 401:
		case 403:
			return make("PROVIDER_AUTH", false);
		case 429:
			return make("PROVIDER_TRANSIENT", true);
		case 400:
			return UNSUPPORTED.test(message)
				? make("PROVIDER_UNSUPPORTED_CAPABILITY", false)
				: make("PROVIDER_CONFIG_INVALID", false);
		case 500:
		case 502:
		case 503:
		case 529:
			return make("PROVIDER_TRANSIENT", true);
		default:
			// No status (network reset / socket hang-up) or an unrecognized code:
			// treat as a retryable transient fault.
			return make("PROVIDER_TRANSIENT", true);
	}
}
