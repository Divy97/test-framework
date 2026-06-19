import { type ProviderConfig, providerConfigSchema } from "./config.js";
import { ProviderError } from "./errors.js";
import type { LogEntry } from "./redaction.js";
import { type ResilienceDeps, withResilience } from "./resilience.js";
import { type InvocationOverrides, resolveConfig } from "./resolve-config.js";
import type { Secret } from "./secret.js";
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

/**
 * Narrow the optional resolved key to a present `Secret` for keyed providers.
 * The config schema already guarantees a `keySource` for these providers, so a
 * missing key here is an internal invariant violation, not user input.
 */
function requireKey(key: Secret | undefined, provider: string): Secret {
	if (key === undefined) {
		throw new ProviderError(
			"PROVIDER_CONFIG_INVALID",
			`provider ${provider} requires a key but none was resolved`,
			false,
		);
	}
	return key;
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
		model: opts.model,
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
 * the returned `ModelProvider` and depends only on the neutral interface.
 *
 * `deps.fakeProvider` is a pure test seam: when present it short-circuits config
 * entirely, so the deterministic fake is never a configurable production value
 * (a config file can only name a real provider). Real adapters are loaded lazily
 * by dynamic `import()`, so a vendor SDK never reaches the common import path.
 */
export async function createProvider(
	config: ProviderConfig,
	deps?: ProviderDeps,
): Promise<ModelProvider> {
	if (deps?.fakeProvider) return deps.fakeProvider;

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

	let raw: RawProvider;
	switch (resolved.provider) {
		case "anthropic": {
			const { createAnthropicAdapter } = await import(
				"./adapters/anthropic.js"
			);
			raw = createAnthropicAdapter({
				key: requireKey(resolved.key, resolved.provider),
				model: resolved.model,
				baseUrl: resolved.baseUrl,
			});
			break;
		}
		case "openrouter": {
			const { createOpenRouterAdapter } = await import(
				"./adapters/openrouter.js"
			);
			raw = createOpenRouterAdapter({
				key: requireKey(resolved.key, resolved.provider),
				model: resolved.model,
				baseUrl: resolved.baseUrl,
			});
			break;
		}
		case "claude-cli": {
			// Keyless: drives the local `claude` CLI under the user's Claude Code
			// subscription. No key is resolved or passed.
			const { createClaudeCliAdapter } = await import(
				"./adapters/claude-cli.js"
			);
			raw = createClaudeCliAdapter({ model: resolved.model });
			break;
		}
	}

	return composeRawProvider(raw, {
		model: resolved.model,
		resilienceDeps: resilienceDepsFrom(deps),
	});
}
