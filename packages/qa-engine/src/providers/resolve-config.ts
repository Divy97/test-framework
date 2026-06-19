import type { KeySource, ProviderConfig, ProviderDefaults } from "./config.js";
import { ProviderError } from "./errors.js";
import { Secret } from "./secret.js";

/**
 * Per-call overrides. Precedence is `invocation > project-config > env`
 * (decision #4). This checkpoint implements `invocation` + the env-resolved key;
 * the project-config-file source lands with the Artifact Workspace (#7) as an
 * additional resolver inserted between these two tiers.
 */
export interface InvocationOverrides {
	model?: string;
	maxOutputTokens?: number;
	timeoutMs?: number;
	temperature?: number;
}

export interface ResolvedConfig {
	provider: ProviderConfig["provider"];
	model: string;
	baseUrl?: string;
	defaults: ProviderDefaults;
	/**
	 * The resolved key, never the raw string. Absent for keyless providers
	 * (e.g. `claude-cli`, which uses the local Claude Code subscription).
	 */
	key?: Secret;
}

function resolveKey(
	keySource: KeySource,
	getEnv: (name: string) => string | undefined,
): Secret {
	// Only the `env` kind is resolvable in V1; the schema guarantees that.
	const raw = getEnv(keySource.var);
	if (raw === undefined || raw.length === 0) {
		throw new ProviderError(
			"PROVIDER_CONFIG_INVALID",
			`API key env var "${keySource.var}" is not set.`,
			false,
		);
	}
	return new Secret(raw);
}

export function resolveConfig(
	config: ProviderConfig,
	opts: {
		getEnv: (name: string) => string | undefined;
		invocation?: InvocationOverrides;
	},
): ResolvedConfig {
	const { invocation } = opts;
	const configDefaults = config.defaults ?? {};

	// invocation wins; absent fields fall back to the config baseline.
	const defaults: ProviderDefaults = {
		maxOutputTokens:
			invocation?.maxOutputTokens ?? configDefaults.maxOutputTokens,
		timeoutMs: invocation?.timeoutMs ?? configDefaults.timeoutMs,
		temperature: invocation?.temperature ?? configDefaults.temperature,
	};

	return {
		provider: config.provider,
		model: invocation?.model ?? config.model,
		baseUrl: config.baseUrl,
		defaults,
		// Keyless providers (claude-cli) carry no keySource; the config schema
		// guarantees keyed providers always have one.
		...(config.keySource !== undefined && {
			key: resolveKey(config.keySource, opts.getEnv),
		}),
	};
}
