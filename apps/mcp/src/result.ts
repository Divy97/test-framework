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

/** Machine-branchable tool error envelope returned to the host. */
export interface ToolError {
	code: string;
	message: string;
	retryable: boolean;
}

/**
 * Typed error result: `isError: true`, a curated `{ error }` structuredContent,
 * and a matching text block. The message is already curated/secret-free by the
 * caller (see `errors.ts`).
 */
export function typedErrorResult(error: ToolError): CallToolResult {
	const structuredContent = { error };
	return {
		content: [
			{ type: "text", text: JSON.stringify(structuredContent, null, 2) },
		],
		structuredContent,
		isError: true,
	};
}
