import { ProviderError } from "../errors.js";
import type { Secret } from "../secret.js";
import type {
	GenerationRequest,
	ProviderCapabilities,
	RawGeneration,
	RawProvider,
} from "../types.js";

/**
 * Anthropic adapter. Loaded ONLY via dynamic `import()` in the factory so the
 * vendor SDK stays off the common import path.
 *
 * NOTE (C8): this is the SDK-free skeleton — it declares capabilities and the
 * construction surface but `generate` is not wired to the SDK yet. C9 implements
 * the real `@anthropic-ai/sdk` call, the error mapping, and the live test.
 */

export interface AnthropicAdapterOptions {
	key: Secret;
	model: string;
	baseUrl?: string;
}

const CAPABILITIES: ProviderCapabilities = {
	// Anthropic structured output is delivered via a forced tool call in V1.
	structuredOutput: "tool",
	supportsSystemPrompt: true,
	supportsCancellation: true,
};

export function createAnthropicAdapter(
	options: AnthropicAdapterOptions,
): RawProvider {
	void options;
	return {
		id: "anthropic",
		capabilities: () => CAPABILITIES,
		generate: (
			_req: GenerationRequest,
			_signal: AbortSignal,
		): Promise<RawGeneration> => {
			throw new ProviderError(
				"PROVIDER_CONFIG_INVALID",
				"Anthropic adapter is not implemented yet (lands in C9).",
				false,
			);
		},
	};
}
