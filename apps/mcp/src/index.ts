import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	createProvider,
	EngineError,
	type ModelProvider,
	type ProviderConfig,
} from "@test-framework/qa-engine";
import type { EngineRuntime } from "./engine-runtime.js";
import { scanRepoForEngine } from "./scan-adapter.js";
import { createMcpServer, type RuntimeFactory } from "./server.js";

/**
 * Minimal server config resolved from the environment. The provider config is a
 * documented object (no config-file parser in V1 — deferred to a later
 * workstream): `TEST_FRAMEWORK_PROVIDER` / `TEST_FRAMEWORK_MODEL` /
 * `TEST_FRAMEWORK_KEY_ENV` select the BYOK provider; the key itself lives in the
 * referenced env var and is resolved by `createProvider` at call time. The
 * workspace root falls back to MCP roots, then `process.cwd()`.
 */
interface ServerConfig {
	providerConfig?: ProviderConfig;
	workspaceRoot?: string;
}

function loadServerConfig(
	getEnv: (name: string) => string | undefined = (name) => process.env[name],
): ServerConfig {
	const provider = getEnv("TEST_FRAMEWORK_PROVIDER");
	const model = getEnv("TEST_FRAMEWORK_MODEL");
	const keyEnv = getEnv("TEST_FRAMEWORK_KEY_ENV");
	const workspaceRoot = getEnv("TEST_FRAMEWORK_ROOT");

	const config: ServerConfig = {};
	if (workspaceRoot !== undefined) config.workspaceRoot = workspaceRoot;
	// Only assemble a provider config when all selectors are present; otherwise
	// leave it unset so the server still starts and only a real create/refine
	// (which needs the provider) surfaces the missing configuration.
	if (
		(provider === "anthropic" || provider === "openrouter") &&
		model !== undefined &&
		keyEnv !== undefined
	) {
		config.providerConfig = {
			provider,
			model,
			keySource: { kind: "env", var: keyEnv },
		};
	}
	return config;
}

/**
 * Build the runtime factory. The provider is constructed lazily on first tool
 * call and memoized — so the stdio handshake and any SDK-rejected
 * `INVALID_INPUT` call need no key, and only a real create/refine requires the
 * configured provider. A missing provider config surfaces as a
 * `PROVIDER_CONFIG_INVALID` engine error (mapped by the translator).
 */
function buildRuntimeFactory(config: ServerConfig): RuntimeFactory {
	let providerPromise: Promise<ModelProvider> | undefined;
	const provider = (): Promise<ModelProvider> => {
		if (providerPromise === undefined) {
			providerPromise = (async () => {
				if (config.providerConfig === undefined) {
					throw new EngineError(
						"PROVIDER_CONFIG_INVALID",
						"Provider configuration is invalid or the key env var is unset.",
					);
				}
				return createProvider(config.providerConfig);
			})();
		}
		return providerPromise;
	};

	return async (): Promise<EngineRuntime> => ({
		provider: await provider(),
		workspaceRoot: config.workspaceRoot ?? process.cwd(),
		scan: scanRepoForEngine,
		now: () => Date.now(),
	});
}

async function main(): Promise<void> {
	const server = createMcpServer(buildRuntimeFactory(loadServerConfig()));
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error: unknown) => {
	// Diagnostics go to stderr only; stdout is the MCP transport.
	console.error(error);
	process.exitCode = 1;
});
