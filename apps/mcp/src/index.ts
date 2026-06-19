import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { EngineRuntime } from "./engine-runtime.js";
import { createMcpServer } from "./server.js";

async function buildRuntime(): Promise<EngineRuntime> {
	throw new Error("runtime bootstrap is wired in slice 6");
}

async function main(): Promise<void> {
	const server = createMcpServer(buildRuntime);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error: unknown) => {
	// Diagnostics go to stderr only; stdout is the MCP transport.
	console.error(error);
	process.exitCode = 1;
});
