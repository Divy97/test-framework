import Anthropic from "@anthropic-ai/sdk";
import { ProviderError } from "../errors.js";
import type { Secret } from "../secret.js";
import { toProviderSchema } from "../structured-output.js";
import type {
	FinishReason,
	GenerationRequest,
	NormalizedUsage,
	ProviderCapabilities,
	RawGeneration,
	RawOutput,
	RawProvider,
} from "../types.js";
import { mapAnthropicError } from "./anthropic-errors.js";

/**
 * Anthropic adapter. Loaded ONLY via dynamic `import()` in the factory, so
 * `@anthropic-ai/sdk` stays off the common import path (evals imports qa-engine).
 *
 * The adapter does one attempt with no retry of its own — the seam's resilience
 * wrapper owns retry, timeout, and cancellation. Structured output uses a single
 * forced "emit" tool whose `input_schema` is the caller's Zod schema converted to
 * JSON Schema; the seam validates the returned `input` against the same Zod schema.
 */

export interface AnthropicAdapterOptions {
	key: Secret;
	model: string;
	baseUrl?: string;
}

const STRUCTURED_TOOL = "emit";

const CAPABILITIES: ProviderCapabilities = {
	// Anthropic structured output is delivered via a forced tool call in V1.
	structuredOutput: "tool",
	supportsSystemPrompt: true,
	supportsCancellation: true,
};

function mapFinishReason(stop: string | null): FinishReason {
	switch (stop) {
		case "end_turn":
		case "stop_sequence":
			return "stop";
		case "max_tokens":
			return "length";
		case "tool_use":
			return "tool_use";
		case "refusal":
			return "content_filter";
		default:
			return "other";
	}
}

function normalizeUsage(usage: Anthropic.Usage): NormalizedUsage {
	const inputTokens = usage.input_tokens ?? 0;
	const outputTokens = usage.output_tokens ?? 0;
	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens + outputTokens,
		...(usage.cache_read_input_tokens != null && {
			cachedInputTokens: usage.cache_read_input_tokens,
		}),
	};
}

export function createAnthropicAdapter(
	options: AnthropicAdapterOptions,
): RawProvider {
	// One client per provider instance; maxRetries: 0 because the seam retries.
	const client = options.key.use(
		(apiKey) =>
			new Anthropic({
				apiKey,
				...(options.baseUrl !== undefined && { baseURL: options.baseUrl }),
				maxRetries: 0,
			}),
	);

	return {
		id: "anthropic",
		capabilities: () => CAPABILITIES,
		async generate(
			req: GenerationRequest,
			signal: AbortSignal,
		): Promise<RawGeneration> {
			const params: Anthropic.MessageCreateParamsNonStreaming = {
				model: options.model,
				max_tokens: req.maxOutputTokens,
				messages: req.messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
				...(req.system !== undefined && { system: req.system }),
				...(req.temperature !== undefined && { temperature: req.temperature }),
				...(req.schema && {
					tools: [
						{
							name: STRUCTURED_TOOL,
							description: "Emit the structured result for this request.",
							input_schema: toProviderSchema(
								req.schema,
							) as Anthropic.Tool.InputSchema,
						},
					],
					tool_choice: { type: "tool", name: STRUCTURED_TOOL },
				}),
			};

			let message: Anthropic.Message;
			try {
				message = await client.messages.create(params, { signal });
			} catch (err) {
				// Aborts (caller cancel or internal timeout) are disambiguated by the
				// resilience wrapper via the composed signal — rethrow them untouched.
				if (signal.aborted) throw err;
				throw mapAnthropicError(err);
			}

			let output: RawOutput;
			if (req.schema) {
				const toolUse = message.content.find(
					(block) => block.type === "tool_use",
				);
				if (toolUse === undefined) {
					throw new ProviderError(
						"MODEL_OUTPUT_INVALID",
						"expected a tool_use block but the model returned none",
						false,
						{ providerRequestId: message.id },
					);
				}
				output = { kind: "json", value: toolUse.input };
			} else {
				const text = message.content
					.filter((block) => block.type === "text")
					.map((block) => block.text)
					.join("");
				output = { kind: "text", value: text };
			}

			return {
				output,
				usage: normalizeUsage(message.usage),
				model: message.model,
				finishReason: mapFinishReason(message.stop_reason),
				providerRequestId: message.id,
			};
		},
	};
}
