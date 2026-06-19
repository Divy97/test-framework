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

/**
 * Translate a failed tool operation into a tool error result. The engine already
 * classifies an aborted call as PROVIDER_CANCELLED (see `asEngineError`), so the
 * adapter trusts the engine's typed code rather than overriding it on
 * `signal.aborted` — an override would mislabel a genuine failure (auth, invalid
 * output, …) that merely coincided with a client cancel.
 */
export function failureToToolResult(error: unknown): CallToolResult {
	return engineErrorToToolResult(error);
}

const PROGRESS_TOTAL = 2;

/**
 * Coarse, opt-in progress around a single engine call. The adapter cannot see
 * the engine's internal stage boundaries (ADR-0003 keeps them private), so it
 * reports only start/done with a fixed `total`. Emits nothing unless the client
 * requested progress via `extra._meta.progressToken`.
 */
async function reportProgress(
	extra: ToolExtra,
	progress: number,
	message: string,
): Promise<void> {
	const progressToken = extra._meta?.progressToken;
	if (progressToken === undefined) return;
	await extra.sendNotification({
		method: "notifications/progress",
		params: { progressToken, progress, total: PROGRESS_TOTAL, message },
	});
}

/** Run an engine operation while bracketing it with coarse opt-in progress. */
async function runWithProgress<T>(
	extra: ToolExtra,
	operation: () => Promise<T>,
): Promise<CallToolResult> {
	return runTool(async () => {
		await reportProgress(extra, 0, "Generating plan…");
		const output = await operation();
		await reportProgress(extra, PROGRESS_TOTAL, "Done");
		return output;
	});
}

async function runTool<T>(
	operation: () => Promise<T>,
): Promise<CallToolResult> {
	try {
		const output = await operation();
		return successResult(output as Record<string, unknown>);
	} catch (error) {
		return failureToToolResult(error);
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
			runWithProgress(extra, async () =>
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
			runWithProgress(extra, async () =>
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
