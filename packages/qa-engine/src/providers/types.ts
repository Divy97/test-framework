import type { ZodType } from "zod";

/**
 * Provider-neutral contract. The QA Engine depends only on these types plus the
 * error taxonomy and config — never on a vendor SDK. Adapters translate a single
 * provider into this shape; the seam owns resilience and validation.
 */

export type FinishReason =
	| "stop"
	| "length"
	| "content_filter"
	| "tool_use"
	| "other";

export interface Message {
	role: "user" | "assistant";
	content: string;
}

export interface GenerationRequest<T = unknown> {
	system?: string;
	/** Conversation turns; a single-prompt request is one user message. */
	messages: Message[];
	/** Present ⇒ structured generation; the seam validates the response against it. */
	schema?: ZodType<T>;
	/** Explicit budget; no hidden default. */
	maxOutputTokens: number;
	temperature?: number;
}

export interface GenerationCallOptions {
	/** Caller cancellation. */
	signal?: AbortSignal;
	/** Per-attempt wall-clock budget. */
	timeoutMs: number;
	/** Retry policy; the seam applies defaults when omitted. */
	retry?: RetryPolicy;
}

export interface RetryPolicy {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	maxElapsedMs: number;
}

/** Normalized, non-secret token counts. Cost is deferred (decision #9). */
export interface NormalizedUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	cachedInputTokens?: number;
	reasoningTokens?: number;
}

export interface GenerationResult<T = unknown> {
	/** Set when no schema was supplied. */
	text?: string;
	/** Set and validated when a schema was supplied. */
	data?: T;
	usage: NormalizedUsage;
	model: string;
	finishReason: FinishReason;
	/** Non-secret provider-side request identifier, when available. */
	providerRequestId?: string;
}

export interface ProviderCapabilities {
	structuredOutput: "native" | "tool" | "prompted" | "none";
	maxOutputTokens?: number;
	supportsSystemPrompt: boolean;
	supportsCancellation: boolean;
}

export interface ModelProvider {
	readonly id: string;
	/** The resolved model id this provider is bound to. */
	readonly model: string;
	capabilities(model: string): ProviderCapabilities;
	generate<T>(
		req: GenerationRequest<T>,
		opts: GenerationCallOptions,
	): Promise<GenerationResult<T>>;
}

/**
 * Normalized raw output of a single adapter attempt, before the seam validates
 * it against the caller schema. `native`/`tool` channels yield `json`; the
 * `prompted` channel yields `text` that the seam strict-parses.
 */
export type RawOutput =
	| { kind: "json"; value: unknown }
	| { kind: "text"; value: string };

export interface RawGeneration {
	output: RawOutput;
	usage: NormalizedUsage;
	model: string;
	finishReason: FinishReason;
	providerRequestId?: string;
}

/**
 * Low-level adapter surface: one attempt, no retry/timeout/validation. The seam
 * wraps this with resilience and structured-output validation to produce a
 * `ModelProvider`. Adapters throw `ProviderError` (see `errors.ts`).
 */
export interface RawProvider {
	readonly id: string;
	capabilities(model: string): ProviderCapabilities;
	generate(req: GenerationRequest, signal: AbortSignal): Promise<RawGeneration>;
}
