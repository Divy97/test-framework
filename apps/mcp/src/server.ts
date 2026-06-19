import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EngineRuntime } from "./engine-runtime.js";
import { createEngineHandlers } from "./handlers.js";
import { type MakeContext, registerEngineTools } from "./tools.js";

export const mcpServerManifest = {
	name: "test-framework",
	version: "0.1.0",
} as const;

/**
 * Builds the `EngineRuntime` for the server. The provider/scan/clock are built
 * once and reused; the `workspaceRoot` it carries is the configured/default root
 * (the roots policy may override it per call). Production builds this from local
 * BYOK config; tests inject a fake-backed runtime.
 */
export type RuntimeFactory = () => Promise<EngineRuntime>;

export function createMcpServer(runtimeFactory: RuntimeFactory): McpServer {
	const server = new McpServer(mcpServerManifest);
	const handlers = createEngineHandlers();

	const makeContext: MakeContext = async (extra) => {
		const runtime = await runtimeFactory();
		return {
			runtime,
			root: runtime.workspaceRoot,
			...(extra.signal !== undefined && { signal: extra.signal }),
		};
	};

	registerEngineTools(server, handlers, makeContext);
	return server;
}
