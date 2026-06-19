import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { EngineError, type EngineErrorCode } from "@test-framework/qa-engine";
import { typedErrorResult } from "./result.js";

/**
 * Normative `EngineErrorCode -> MCP error` translation. Every tool error returns
 * `{ isError: true, structuredContent: { error: { code, message, retryable } } }`.
 *
 * Provider/IO classes get a *curated*, code-specific message (never `err.message`
 * verbatim) so filesystem paths, SDK detail, env values, and key material can
 * never leak. Engine-authored `INVALID_INPUT` / `PLAN_INVARIANT_FAILED` messages
 * are already safe (they reference graph keys, not secrets) and pass through;
 * `PLAN_INVARIANT_FAILED` additionally appends a findings *count* (never paths).
 * A non-`EngineError` throwable becomes a generic `INTERNAL` (no `err.message`).
 */

interface Mapping {
	retryable: boolean;
	/** Curated message; when omitted, the engine-authored message passes through. */
	message?: string;
}

const TABLE: Record<EngineErrorCode, Mapping> = {
	INVALID_INPUT: { retryable: false },
	REPO_ACCESS_DENIED: {
		retryable: false,
		message: "Repository path is outside the project root or unreadable.",
	},
	CONTEXT_LIMIT_REACHED: {
		retryable: false,
		message: "Context budget reached; plan may be partial (see warnings).",
	},
	PROVIDER_AUTH: {
		retryable: false,
		message: "Model provider rejected the credentials.",
	},
	PROVIDER_QUOTA: {
		retryable: false,
		message: "Model provider quota/billing exhausted.",
	},
	PROVIDER_TRANSIENT: {
		retryable: true,
		message: "Transient provider error after retries.",
	},
	PROVIDER_TIMEOUT: {
		retryable: true,
		message: "Model call timed out after retries.",
	},
	PROVIDER_CANCELLED: { retryable: false, message: "Request was cancelled." },
	PROVIDER_UNSUPPORTED_CAPABILITY: {
		retryable: false,
		message: "Selected model cannot produce structured output.",
	},
	PROVIDER_CONFIG_INVALID: {
		retryable: false,
		message: "Provider configuration is invalid or the key env var is unset.",
	},
	MODEL_OUTPUT_INVALID: {
		retryable: false,
		message: "Model output failed validation and could not be repaired.",
	},
	PLAN_INVARIANT_FAILED: {
		retryable: false,
		message: "Generated plan violated graph invariants.",
	},
	ARTIFACT_NOT_FOUND: {
		retryable: false,
		message: "No plan exists for the given planId.",
	},
	ARTIFACT_WRITE_FAILED: {
		retryable: false,
		message: "Atomic plan write failed; previous revision is intact.",
	},
	ARTIFACT_CONFLICT: {
		retryable: false,
		message: "Plan changed since it was loaded; reload and refine again.",
	},
};

/** Translate any thrown value into the deterministic, secret-free tool error envelope. */
export function engineErrorToToolResult(err: unknown): CallToolResult {
	if (err instanceof EngineError) {
		const mapping = TABLE[err.code];
		// Engine-authored messages for these codes are safe to surface verbatim.
		let message = mapping.message ?? err.message;
		if (err.code === "PLAN_INVARIANT_FAILED" && err.findings !== undefined) {
			message = `${message} (${err.findings.length} finding(s))`;
		}
		return typedErrorResult({
			code: err.code,
			message,
			retryable: mapping.retryable,
		});
	}
	return typedErrorResult({
		code: "INTERNAL",
		message: "Unexpected server error.",
		retryable: false,
	});
}
