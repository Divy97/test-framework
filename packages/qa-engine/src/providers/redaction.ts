import type { NormalizedUsage } from "./types.js";

/**
 * Secret-safe logging. Two layers:
 *
 *  1. Allowlist (primary). `safeLogFields` emits only a fixed, non-secret shape.
 *     Request bodies, messages, headers, and config never pass through it.
 *  2. Masking (defense in depth). `maskSecrets` scrubs known key shapes and any
 *     exact key value before a `cause` string is logged.
 *
 * This module must NOT import `evals/leakage.ts` — that would create a
 * qa-engine → evals dependency cycle.
 */

const REDACTED = "[redacted]";

// Order matters: exact values first, then specific shapes, then Bearer.
const ANTHROPIC_KEY = /sk-ant-[A-Za-z0-9_-]+/g;
const GENERIC_SK_KEY = /sk-[A-Za-z0-9_-]{8,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9._-]+/gi;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mask known key shapes plus any supplied exact secret values. */
export function maskSecrets(text: string, extraSecrets: string[] = []): string {
	let out = text;
	for (const secret of extraSecrets) {
		if (secret.length > 0) {
			out = out.replaceAll(new RegExp(escapeRegExp(secret), "g"), REDACTED);
		}
	}
	out = out.replace(ANTHROPIC_KEY, REDACTED);
	out = out.replace(GENERIC_SK_KEY, REDACTED);
	out = out.replace(BEARER, `Bearer ${REDACTED}`);
	return out;
}

/** The only shape the seam's logger is allowed to emit. */
export interface LogEntry {
	provider: string;
	model: string;
	code?: string;
	attempt: number;
	durationMs: number;
	usage?: NormalizedUsage;
	providerRequestId?: string;
}

interface LogInput {
	provider: string;
	model: string;
	attempt: number;
	durationMs: number;
	code?: string;
	usage?: NormalizedUsage;
	providerRequestId?: string;
}

/**
 * Project an arbitrary object down to the allowlisted `LogEntry`. Unknown fields
 * (a stray `apiKey`, `messages`, headers) are dropped, never logged. Optional
 * fields are omitted when absent so they don't appear as `undefined`.
 */
export function safeLogFields(input: LogInput): LogEntry {
	const entry: LogEntry = {
		provider: input.provider,
		model: input.model,
		attempt: input.attempt,
		durationMs: input.durationMs,
	};
	if (input.code !== undefined) entry.code = input.code;
	if (input.usage !== undefined) entry.usage = input.usage;
	if (input.providerRequestId !== undefined) {
		entry.providerRequestId = input.providerRequestId;
	}
	return entry;
}
