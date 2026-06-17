import { type ProviderConfig, providerConfigSchema } from "./config.js";
import { ProviderError } from "./errors.js";
import { createFakeProvider } from "./fake/fake-provider.js";
import type { LogEntry } from "./redaction.js";
import { type ResilienceDeps, withResilience } from "./resilience.js";
import { type InvocationOverrides, resolveConfig } from "./resolve-config.js";
import { validateOutput } from "./structured-output.js";
import type {
	GenerationCallOptions,
	GenerationRequest,
	GenerationResult,
	ModelProvider,
	RawProvider,
} from "./types.js";

/**
 * Injectable dependencies. All default to real implementations; tests pass
 * fakes for deterministic time, randomness, env, and timeouts.
 */
export interface ProviderDeps {
	now?: () => number;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	random?: () => number;
	getEnv?: (name: string) => string | undefined;
	timeoutSignal?: (ms: number) => AbortSignal;
	log?: (entry: LogEntry) => void;
	/** Used when `config.provider === "fake"`; lets a test wire a scripted fake. */
	fakeProvider?: ModelProvider;
	invocation?: InvocationOverrides;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new DOMException("aborted", "AbortError"));
			},
			{ once: true },
		);
	});
}

function resilienceDepsFrom(deps?: ProviderDeps): ResilienceDeps {
	return {
		now: deps?.now ?? (() => Date.now()),
		sleep: deps?.sleep ?? defaultSleep,
		random: deps?.random ?? Math.random,
		timeoutSignal: deps?.timeoutSignal ?? ((ms) => AbortSignal.timeout(ms)),
		log: deps?.log,
	};
}

/**
 * Wrap a low-level `RawProvider` into a full `ModelProvider`: gate structured
 * requests on capability, run each call through the resilience wrapper, and
 * validate structured output through the seam (never the adapter).
 */
export function composeRawProvider(
	raw: RawProvider,
	opts: { model: string; resilienceDeps: ResilienceDeps },
): ModelProvider {
	return {
		id: raw.id,
		capabilities: (model) => raw.capabilities(model),
		async generate<T>(
			req: GenerationRequest<T>,
			callOpts: GenerationCallOptions,
		): Promise<GenerationResult<T>> {
			const caps = raw.capabilities(opts.model);
			if (req.schema && caps.structuredOutput === "none") {
				throw new ProviderError(
					"PROVIDER_UNSUPPORTED_CAPABILITY",
					`model ${opts.model} cannot produce structured output`,
					false,
				);
			}

			const result = await withResilience(
				(signal) => raw.generate(req, signal),
				{
					timeoutMs: callOpts.timeoutMs,
					retry: callOpts.retry,
					callerSignal: callOpts.signal,
					deps: opts.resilienceDeps,
					ctx: { provider: raw.id, model: opts.model },
				},
			);

			const base = {
				usage: result.usage,
				model: result.model,
				finishReason: result.finishReason,
				...(result.providerRequestId !== undefined && {
					providerRequestId: result.providerRequestId,
				}),
			};

			if (req.schema) {
				return { ...base, data: validateOutput(result.output, req.schema) };
			}
			const text =
				result.output.kind === "text"
					? result.output.value
					: JSON.stringify(result.output.value);
			return { ...base, text };
		},
	};
}

/**
 * Construct a provider from config via dependency injection. The engine receives
 * the returned `ModelProvider` and depends only on the neutral interface. The
 * vendor SDK is loaded lazily — only the `anthropic` branch dynamic-imports the
 * adapter, so `fake` (and the common import path) never pulls it in.
 */
export async function createProvider(
	config: ProviderConfig,
	deps?: ProviderDeps,
): Promise<ModelProvider> {
	const parsed = providerConfigSchema.safeParse(config);
	if (!parsed.success) {
		throw new ProviderError(
			"PROVIDER_CONFIG_INVALID",
			`invalid provider config: ${parsed.error.message}`,
			false,
		);
	}

	const resolved = resolveConfig(parsed.data, {
		getEnv: deps?.getEnv ?? ((name) => process.env[name]),
		invocation: deps?.invocation,
	});

	if (resolved.provider === "fake") {
		return (
			deps?.fakeProvider ?? createFakeProvider([], { model: resolved.model })
		);
	}

	// Lazy: the SDK-backed adapter is imported only when actually selected.
	const { createAnthropicAdapter } = await import("./adapters/anthropic.js");
	const raw = createAnthropicAdapter({
		key: resolved.key,
		model: resolved.model,
		baseUrl: resolved.baseUrl,
	});
	return composeRawProvider(raw, {
		model: resolved.model,
		resilienceDeps: resilienceDepsFrom(deps),
	});
}
