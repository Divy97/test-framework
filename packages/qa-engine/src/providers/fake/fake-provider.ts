import type { ProviderErrorCode } from "../errors.js";
import { ProviderError, RETRYABLE } from "../errors.js";
import { validateOutput } from "../structured-output.js";
import type {
	FinishReason,
	GenerationCallOptions,
	GenerationRequest,
	GenerationResult,
	ModelProvider,
	NormalizedUsage,
	ProviderCapabilities,
} from "../types.js";

/**
 * Deterministic fake driven by an ordered list of scripted outcomes. It honors
 * the same `ModelProvider` contract as a real adapter — including validating
 * `ok.data` against the caller schema — so a test that passes against the fake
 * is meaningful for the real provider. No network, env, or SDK.
 */
export type FakeOutcome =
	| {
			kind: "ok";
			data?: unknown;
			text?: string;
			usage?: Partial<NormalizedUsage>;
			finishReason?: FinishReason;
	  }
	| { kind: "error"; code: ProviderErrorCode }
	| { kind: "hang" };

export const fakeOk = (
	args: Omit<Extract<FakeOutcome, { kind: "ok" }>, "kind"> = {},
): FakeOutcome => ({ kind: "ok", ...args });
export const fakeError = (code: ProviderErrorCode): FakeOutcome => ({
	kind: "error",
	code,
});
export const fakeHang = (): FakeOutcome => ({ kind: "hang" });

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
	structuredOutput: "tool",
	supportsSystemPrompt: true,
	supportsCancellation: true,
};

export interface FakeProviderOptions {
	capabilities?: ProviderCapabilities;
	recordCalls?: boolean;
	model?: string;
}

export interface RecordedCall {
	req: GenerationRequest;
	opts: GenerationCallOptions;
}

export interface FakeProvider extends ModelProvider {
	/** The model id this fake was constructed with (echoed on every result). */
	readonly model: string;
	readonly calls: RecordedCall[];
}

function usageOf(partial?: Partial<NormalizedUsage>): NormalizedUsage {
	const inputTokens = partial?.inputTokens ?? 0;
	const outputTokens = partial?.outputTokens ?? 0;
	return {
		inputTokens,
		outputTokens,
		totalTokens: partial?.totalTokens ?? inputTokens + outputTokens,
		...(partial?.cachedInputTokens !== undefined && {
			cachedInputTokens: partial.cachedInputTokens,
		}),
		...(partial?.reasoningTokens !== undefined && {
			reasoningTokens: partial.reasoningTokens,
		}),
	};
}

export function createFakeProvider(
	script: FakeOutcome[],
	options: FakeProviderOptions = {},
): FakeProvider {
	const remaining = [...script];
	const calls: RecordedCall[] = [];
	const model = options.model ?? "fake-1";
	const capabilities = options.capabilities ?? DEFAULT_CAPABILITIES;

	return {
		id: "fake",
		model,
		calls,
		capabilities: () => capabilities,
		generate<T>(
			req: GenerationRequest<T>,
			opts: GenerationCallOptions,
		): Promise<GenerationResult<T>> {
			if (options.recordCalls) {
				calls.push({ req: req as GenerationRequest, opts });
			}

			const outcome = remaining.shift();
			if (outcome === undefined) {
				return Promise.reject(new Error("fake provider script exhausted"));
			}

			if (outcome.kind === "error") {
				return Promise.reject(
					new ProviderError(
						outcome.code,
						`fake: ${outcome.code}`,
						RETRYABLE.has(outcome.code),
					),
				);
			}

			if (outcome.kind === "hang") {
				return new Promise<GenerationResult<T>>((_, reject) => {
					const fail = () => reject(new DOMException("aborted", "AbortError"));
					if (opts.signal?.aborted) return fail();
					opts.signal?.addEventListener("abort", fail, { once: true });
				});
			}

			const usage = usageOf(outcome.usage);
			const finishReason = outcome.finishReason ?? "stop";
			if (req.schema) {
				// Validation throws synchronously; surface it as a rejection so the
				// fake behaves like an async provider (MODEL_OUTPUT_INVALID).
				try {
					const data = validateOutput(
						{ kind: "json", value: outcome.data },
						req.schema,
					);
					return Promise.resolve({ data, usage, model, finishReason });
				} catch (err) {
					return Promise.reject(err);
				}
			}
			return Promise.resolve({
				text: outcome.text ?? "",
				usage,
				model,
				finishReason,
			});
		},
	};
}
