import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function successResult(
	structuredContent: Record<string, unknown>,
): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(structuredContent, null, 2),
			},
		],
		structuredContent,
	};
}

export function errorResult(error: unknown): CallToolResult {
	const message = error instanceof Error ? error.message : "Unknown tool error";
	return {
		content: [{ type: "text", text: message }],
		isError: true,
	};
}
