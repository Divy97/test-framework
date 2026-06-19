import OpenAI from "openai";
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
import { mapHttpError } from "./http-error.js";

/**
 * OpenRouter adapter. OpenRouter is OpenAI-compatible, so it is driven through
 * the official `openai` SDK pointed at the OpenRouter base URL. Loaded ONLY via
 * dynamic `import()` in the factory, so the SDK stays off the common import path.
 *
 * Structured output uses a forced "emit" function tool (broadest model support
 * on OpenRouter) plus a `require_parameters` routing hint; if a model answers
 * with content instead of a tool call, the extractor falls back to the message
 * content. The seam validates the returned JSON against the caller schema.
 * Models are namespaced, e.g. `anthropic/claude-opus-4-8`, `openai/gpt-4o`.
 */

export interface OpenRouterAdapterOptions {
	key: Secret;
	model: string;
	baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const STRUCTURED_TOOL = "emit";

const CAPABILITIES: ProviderCapabilities = {
	structuredOutput: "tool",
	supportsSystemPrompt: true,
	supportsCancellation: true,
};

/**
 * Normalize structured content emitted as a plain message (some OpenRouter
 * sub-providers answer with content instead of a forced tool call). Trims
 * surrounding whitespace and, if the body is wrapped in a markdown code fence
 * (```json … ``` or ``` … ```), strips the fence so only the JSON remains.
 * The result is handed to the seam, which strict-parses + Zod-validates it.
 */
function normalizeStructuredContent(content: string): string {
	const trimmed = content.trim();
	const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
	return (fence?.[1] ?? trimmed).trim();
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
			return "length";
		case "tool_calls":
		case "function_call":
			return "tool_use";
		case "content_filter":
			return "content_filter";
		default:
			return "other";
	}
}

function normalizeUsage(
	usage: OpenAI.Completions.CompletionUsage | undefined,
): NormalizedUsage {
	const inputTokens = usage?.prompt_tokens ?? 0;
	const outputTokens = usage?.completion_tokens ?? 0;
	const cached = usage?.prompt_tokens_details?.cached_tokens;
	return {
		inputTokens,
		outputTokens,
		totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
		...(cached != null && { cachedInputTokens: cached }),
	};
}

/**
 * Pure extraction of a neutral `RawGeneration` from an OpenAI-compatible
 * response. Split out so the no-choices guard, structured tool-call / content
 * fallback, usage normalization, and finish-reason mapping are deterministically
 * unit-testable without a live call (see extract.test.ts).
 */
export function extractOpenRouterGeneration(
	completion: OpenAI.Chat.Completions.ChatCompletion,
	wantSchema: boolean,
): RawGeneration {
	const choice = completion.choices[0];
	if (choice === undefined) {
		throw new ProviderError(
			"MODEL_OUTPUT_INVALID",
			"openrouter returned no choices",
			false,
			{ providerRequestId: completion.id },
		);
	}

	let output: RawOutput;
	if (wantSchema) {
		const toolCall = choice.message.tool_calls?.find(
			(tc) => tc.type === "function",
		);
		if (toolCall !== undefined) {
			// arguments is a JSON string; the seam strict-parses + validates it.
			output = { kind: "text", value: toolCall.function.arguments };
		} else {
			// Fallback: many OpenRouter models emit the structured JSON as message
			// content rather than a forced tool call. Normalize and hand it to the
			// seam, which strict-parses + validates it exactly as tool-call args.
			const content = normalizeStructuredContent(choice.message.content ?? "");
			if (content === "") {
				throw new ProviderError(
					"MODEL_OUTPUT_INVALID",
					"model returned neither a tool call nor content",
					false,
					{ providerRequestId: completion.id },
				);
			}
			output = { kind: "text", value: content };
		}
	} else {
		output = { kind: "text", value: choice.message.content ?? "" };
	}

	return {
		output,
		usage: normalizeUsage(completion.usage),
		model: completion.model,
		finishReason: mapFinishReason(choice.finish_reason),
		providerRequestId: completion.id,
	};
}

export function createOpenRouterAdapter(
	options: OpenRouterAdapterOptions,
): RawProvider {
	const client = options.key.use(
		(apiKey) =>
			new OpenAI({
				apiKey,
				baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
				maxRetries: 0,
			}),
	);

	return {
		id: "openrouter",
		capabilities: () => CAPABILITIES,
		async generate(
			req: GenerationRequest,
			signal: AbortSignal,
		): Promise<RawGeneration> {
			const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
				...(req.system !== undefined
					? [{ role: "system" as const, content: req.system }]
					: []),
				...req.messages.map((m) => ({ role: m.role, content: m.content })),
			];

			const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
				{
					model: options.model,
					max_tokens: req.maxOutputTokens,
					messages,
					...(req.temperature !== undefined && {
						temperature: req.temperature,
					}),
					...(req.schema && {
						tools: [
							{
								type: "function",
								function: {
									name: STRUCTURED_TOOL,
									description: "Emit the structured result for this request.",
									parameters: toProviderSchema(req.schema) as Record<
										string,
										unknown
									>,
								},
							},
						],
						tool_choice: {
							type: "function",
							function: { name: STRUCTURED_TOOL },
						},
						// OpenRouter-specific routing hint (untyped by the openai SDK):
						// only route to sub-providers that honor tools/tool_choice.
						...({ provider: { require_parameters: true } } as {
							provider: { require_parameters: boolean };
						}),
					}),
				};

			let completion: OpenAI.Chat.Completions.ChatCompletion;
			try {
				completion = await client.chat.completions.create(params, { signal });
			} catch (err) {
				// Aborts are disambiguated by the resilience wrapper via the composed
				// signal — rethrow them untouched.
				if (signal.aborted) throw err;
				throw mapHttpError(err);
			}

			return extractOpenRouterGeneration(completion, req.schema !== undefined);
		},
	};
}
