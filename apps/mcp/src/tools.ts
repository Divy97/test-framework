import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
	CallToolResult,
	ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import {
	analyzeFeatureInputSchema,
	analyzeFeatureOutputSchema,
	exportTestCasesInputSchema,
	exportTestCasesOutputSchema,
	generateTestCasesInputSchema,
	generateTestCasesOutputSchema,
	mapFeatureInputSchema,
	mapFeatureOutputSchema,
	reviewTestCasesInputSchema,
	reviewTestCasesOutputSchema,
} from "@test-framework/planner";
import type { ToolHandlers } from "./handlers.js";
import { errorResult, successResult } from "./result.js";

export const toolNames = [
	"analyze_feature",
	"map_feature",
	"generate_test_cases",
	"review_test_cases",
	"export_test_cases",
] as const;

const readOnlyAnnotations: ToolAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

const stubNotice =
	"Implementation is a deterministic, input-derived stub: no model, repository scan, network, or filesystem access.";

async function runTool<T>(
	operation: () => Promise<T>,
): Promise<CallToolResult> {
	try {
		const output = await operation();
		return successResult(output as Record<string, unknown>);
	} catch (error) {
		return errorResult(error);
	}
}

export function registerPlannerTools(
	server: McpServer,
	handlers: ToolHandlers,
): void {
	server.registerTool(
		"analyze_feature",
		{
			title: "Analyze Feature",
			description: `Normalize a feature request into a structured PRD. ${stubNotice}`,
			inputSchema: analyzeFeatureInputSchema,
			outputSchema: analyzeFeatureOutputSchema,
			annotations: readOnlyAnnotations,
		},
		(args) => runTool(() => handlers.analyzeFeature(args)),
	);

	server.registerTool(
		"map_feature",
		{
			title: "Map Feature",
			description: `Map a normalized PRD to features, acceptance criteria, and a repo scan. ${stubNotice}`,
			inputSchema: mapFeatureInputSchema,
			outputSchema: mapFeatureOutputSchema,
			annotations: readOnlyAnnotations,
		},
		(args) => runTool(() => handlers.mapFeature(args)),
	);

	server.registerTool(
		"generate_test_cases",
		{
			title: "Generate Test Cases",
			description: `Generate test cases from a feature map and acceptance criteria. ${stubNotice}`,
			inputSchema: generateTestCasesInputSchema,
			outputSchema: generateTestCasesOutputSchema,
			annotations: readOnlyAnnotations,
		},
		(args) => runTool(() => handlers.generateTestCases(args)),
	);

	server.registerTool(
		"review_test_cases",
		{
			title: "Review Test Cases",
			description: `Review test cases and surface review findings. ${stubNotice}`,
			inputSchema: reviewTestCasesInputSchema,
			outputSchema: reviewTestCasesOutputSchema,
			annotations: readOnlyAnnotations,
		},
		(args) => runTool(() => handlers.reviewTestCases(args)),
	);

	server.registerTool(
		"export_test_cases",
		{
			title: "Export Test Cases",
			description: `Preview the artifact paths for exported test cases. ${stubNotice} Returns status "preview" and writes no files.`,
			inputSchema: exportTestCasesInputSchema,
			outputSchema: exportTestCasesOutputSchema,
			annotations: readOnlyAnnotations,
		},
		(args) => runTool(() => handlers.exportTestCases(args)),
	);
}
