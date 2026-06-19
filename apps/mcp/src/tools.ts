import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
	ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { EngineError } from "@test-framework/qa-engine";
import { engineErrorToToolResult } from "./errors.js";
import type { EngineHandlers, ToolContext } from "./handlers.js";
import { successResult } from "./result.js";
import {
	createTestPlanInputSchema,
	getTestPlanInputSchema,
	getTestPlanOutputSchema,
	planResultOutputSchema,
	refineTestPlanInputSchema,
} from "./tool-schemas.js";

export const toolNames = [
	"create_test_plan",
	"refine_test_plan",
	"get_test_plan",
] as const;

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Builds the per-call context (runtime + resolved root + signal) from the request. */
export type MakeContext = (extra: ToolExtra) => Promise<ToolContext>;

const generativeAnnotations: ToolAnnotations = {
	// create/refine call a model and write a new plan/revision (not destructive).
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: true,
};

const readOnlyAnnotations: ToolAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

/**
 * Translate a failed tool operation into a tool error result. The SDK fires
 * `extra.signal` on `notifications/cancelled`; when the call fails *and* the
 * client cancelled, the cause is cancellation regardless of the code the engine
 * bubbled up (a bare provider may surface a raw AbortError), so it is mapped
 * deterministically to `PROVIDER_CANCELLED`.
 */
export function failureToToolResult(
	error: unknown,
	signal?: AbortSignal,
): CallToolResult {
	if (signal?.aborted) {
		return engineErrorToToolResult(
			new EngineError("PROVIDER_CANCELLED", "Request was cancelled."),
		);
	}
	return engineErrorToToolResult(error);
}

async function runTool<T>(
	extra: ToolExtra,
	operation: () => Promise<T>,
): Promise<CallToolResult> {
	try {
		const output = await operation();
		return successResult(output as Record<string, unknown>);
	} catch (error) {
		return failureToToolResult(error, extra.signal);
	}
}

export function registerEngineTools(
	server: McpServer,
	handlers: EngineHandlers,
	makeContext: MakeContext,
): void {
	server.registerTool(
		"create_test_plan",
		{
			title: "Create Test Plan",
			description:
				"Generate a validated, persisted QA test plan from a product brief and optional repository context. Calls your configured model with your key (BYOK).",
			inputSchema: createTestPlanInputSchema,
			outputSchema: planResultOutputSchema,
			annotations: generativeAnnotations,
		},
		async (args, extra) =>
			runTool(extra, async () =>
				handlers.createTestPlan(args, await makeContext(extra)),
			),
	);

	server.registerTool(
		"refine_test_plan",
		{
			title: "Refine Test Plan",
			description:
				"Revise an existing test plan from scoped feedback into a new versioned revision. Calls your configured model with your key (BYOK).",
			inputSchema: refineTestPlanInputSchema,
			outputSchema: planResultOutputSchema,
			annotations: generativeAnnotations,
		},
		async (args, extra) =>
			runTool(extra, async () =>
				handlers.refineTestPlan(args, await makeContext(extra)),
			),
	);

	server.registerTool(
		"get_test_plan",
		{
			title: "Get Test Plan",
			description:
				"Read a persisted test plan's metadata, a bounded summary, and its artifact paths. Read-only; writes nothing and calls no model.",
			inputSchema: getTestPlanInputSchema,
			outputSchema: getTestPlanOutputSchema,
			annotations: readOnlyAnnotations,
		},
		async (args, extra) =>
			runTool(extra, async () =>
				handlers.getTestPlan(args, await makeContext(extra)),
			),
	);
}
