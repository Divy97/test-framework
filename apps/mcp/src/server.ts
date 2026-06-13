import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolHandlers } from "./handlers.js";
import { createToolHandlers } from "./tool-handlers.js";
import { registerPlannerTools } from "./tools.js";

export const mcpServerManifest = {
	name: "test-framework",
	version: "0.1.0",
} as const;

export function createMcpServer(
	handlers: ToolHandlers = createToolHandlers(),
): McpServer {
	const server = new McpServer(mcpServerManifest);
	registerPlannerTools(server, handlers);
	return server;
}
