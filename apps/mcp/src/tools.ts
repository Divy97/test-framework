import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
	ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
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

async function runTool<T>(
	operation: () => Promise<T>,
): Promise<CallToolResult> {
	try {
		const output = await operation();
		return successResult(output as Record<string, unknown>);
	} catch (error) {
		return engineErrorToToolResult(error);
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
			runTool(async () =>
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
			runTool(async () =>
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
			runTool(async () => handlers.getTestPlan(args, await makeContext(extra))),
	);
}
