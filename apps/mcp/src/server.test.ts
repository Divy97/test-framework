import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { TestCase } from "@test-framework/core";
import {
	analyzeFeatureOutputSchema,
	exportTestCasesInputSchema,
	exportTestCasesOutputSchema,
	generateTestCasesOutputSchema,
	mapFeatureOutputSchema,
	reviewTestCasesOutputSchema,
} from "@test-framework/planner";
import { createMcpServer } from "./server.js";
import { createStubToolHandlers } from "./stub-handlers.js";

const expectedToolNames = [
	"analyze_feature",
	"export_test_cases",
	"generate_test_cases",
	"map_feature",
	"review_test_cases",
];

async function connectInMemoryClient(): Promise<Client> {
	const server = createMcpServer();
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: "in-memory-test", version: "0.1.0" });
	await client.connect(clientTransport);
	return client;
}

function jsonTextOf(result: unknown) {
	const content =
		(result as { content?: Array<{ type: string; text?: string }> }).content ??
		[];
	const textBlocks = content.filter((block) => block.type === "text");
	assert.equal(textBlocks.length, 1);
	return JSON.parse(textBlocks[0]?.text ?? "null");
}

const validTestCase: TestCase = {
	id: "TC-001",
	title: "Verify checkout",
	type: "positive",
	priority: "p1",
	objective: "User can checkout with a valid cart",
	preconditions: [],
	testDataAccounts: [],
	steps: ["Open cart", "Complete checkout"],
	expectedResults: ["Order confirmed"],
	postconditions: [],
	relatedFilesRoutesApis: [],
	evidenceSource: "inferred",
	automationReadiness: "manual",
};

test("planner exposes five valid output contracts", () => {
	assert.ok(analyzeFeatureOutputSchema);
	assert.ok(mapFeatureOutputSchema);
	assert.ok(generateTestCasesOutputSchema);
	assert.ok(reviewTestCasesOutputSchema);
	assert.ok(exportTestCasesOutputSchema);
});

test("export output accepts a preview receipt", () => {
	assert.equal(
		exportTestCasesOutputSchema.safeParse({
			status: "preview",
			testCases: [],
			artifacts: [
				{
					format: "json",
					path: "/repo/.test-framework/test-cases.json",
					written: false,
				},
			],
		}).success,
		true,
	);
});

test("output schemas stay forward-compatible (non-strict)", () => {
	assert.equal(
		exportTestCasesOutputSchema.safeParse({
			status: "preview",
			testCases: [],
			artifacts: [],
			extra: "forward-compatible field",
		}).success,
		true,
	);
});

test("export input rejects an empty repo path", () => {
	assert.equal(
		exportTestCasesInputSchema.safeParse({
			repoPath: "",
			testCases: [validTestCase],
		}).success,
		false,
	);
});

test("export input rejects an unsupported format", () => {
	assert.equal(
		exportTestCasesInputSchema.safeParse({
			repoPath: "/repo",
			testCases: [validTestCase],
			formats: ["pdf"],
		}).success,
		false,
	);
});

test("export input rejects a malformed test case", () => {
	assert.equal(
		exportTestCasesInputSchema.safeParse({
			repoPath: "/repo",
			testCases: [{ ...validTestCase, priority: "urgent" }],
		}).success,
		false,
	);
});

test("analyzeFeature derives the summary and source references", async () => {
	const handlers = createStubToolHandlers();
	const output = await handlers.analyzeFeature({
		featureRequest: "Add password reset",
		repoPath: "/repo",
		relevantFiles: ["src/auth/reset.ts"],
	});

	assert.equal(output.normalizedPrd.featureSummary, "Add password reset");
	assert.deepEqual(
		output.normalizedPrd.sourceReferences.map((ref) => ref.path),
		["src/auth/reset.ts"],
	);
	assert.equal(analyzeFeatureOutputSchema.safeParse(output).success, true);
});

test("mapFeature emits one feature, one criterion, empty repo scan", async () => {
	const handlers = createStubToolHandlers();
	const analysis = await handlers.analyzeFeature({
		featureRequest: "Add password reset",
		repoPath: "/repo",
		relevantFiles: ["src/auth/reset.ts"],
	});
	const output = await handlers.mapFeature({
		normalizedPrd: analysis.normalizedPrd,
		repoPath: "/repo",
		relevantFiles: ["src/auth/reset.ts"],
	});

	assert.equal(output.featureMap.length, 1);
	assert.equal(output.acceptanceCriteria.length, 1);
	assert.deepEqual(output.repoScan.routesPages, []);
	assert.equal(output.repoScan.framework, null);
	assert.equal(mapFeatureOutputSchema.safeParse(output).success, true);
});

test("generateTestCases emits TC-001 derived from the first criterion", async () => {
	const handlers = createStubToolHandlers();
	const analysis = await handlers.analyzeFeature({
		featureRequest: "Add password reset",
		repoPath: "/repo",
		relevantFiles: [],
	});
	const mapping = await handlers.mapFeature({
		normalizedPrd: analysis.normalizedPrd,
		repoPath: "/repo",
		relevantFiles: [],
	});
	const output = await handlers.generateTestCases({
		normalizedPrd: analysis.normalizedPrd,
		featureMap: mapping.featureMap,
		acceptanceCriteria: mapping.acceptanceCriteria,
		userHints: [],
	});

	assert.equal(output.testCases.length, 1);
	assert.equal(output.testCases[0]?.id, "TC-001");
	assert.equal(
		output.testCases[0]?.objective,
		mapping.acceptanceCriteria[0]?.statement,
	);
	assert.equal(generateTestCasesOutputSchema.safeParse(output).success, true);
});

test("reviewTestCases flags a high finding only when no cases are supplied", async () => {
	const handlers = createStubToolHandlers();

	const empty = await handlers.reviewTestCases({
		testCases: [],
		acceptanceCriteria: [],
	});
	assert.equal(empty.findings.length, 1);
	assert.equal(empty.findings[0]?.severity, "high");

	const populated = await handlers.reviewTestCases({
		testCases: [validTestCase],
		acceptanceCriteria: [],
	});
	assert.deepEqual(populated.findings, []);
	assert.equal(reviewTestCasesOutputSchema.safeParse(populated).success, true);
});

test("exportTestCases previews paths without writing files", async () => {
	const handlers = createStubToolHandlers();
	const repoPath = join(tmpdir(), "test-framework-export-preview-check");
	const output = await handlers.exportTestCases({
		repoPath,
		testCases: [validTestCase],
		formats: ["json", "markdown"],
	});

	assert.equal(output.status, "preview");
	assert.equal(output.artifacts.length, 2);
	assert.ok(output.artifacts.every((artifact) => artifact.written === false));
	assert.ok(
		output.artifacts.every((artifact) => artifact.path.startsWith(repoPath)),
	);
	assert.equal(exportTestCasesOutputSchema.safeParse(output).success, true);
	assert.equal(existsSync(join(repoPath, ".test-framework")), false);
});

test("server lists exactly the five V1 tools with JSON schemas", async () => {
	const client = await connectInMemoryClient();
	try {
		const listed = await client.listTools();
		assert.deepEqual(
			listed.tools.map((tool) => tool.name).sort(),
			expectedToolNames,
		);
		for (const tool of listed.tools) {
			assert.equal(tool.inputSchema.type, "object");
			assert.equal(tool.outputSchema?.type, "object");
		}
	} finally {
		await client.close();
	}
});

test("the five tools chain and return validated structured content", async () => {
	const client = await connectInMemoryClient();
	try {
		const analyze = await client.callTool({
			name: "analyze_feature",
			arguments: {
				featureRequest: "Add password reset",
				repoPath: "/repo",
				relevantFiles: ["src/auth/reset.ts"],
			},
		});
		assert.notEqual(analyze.isError, true);
		const analyzeStructured = analyzeFeatureOutputSchema.parse(
			analyze.structuredContent,
		);
		assert.deepEqual(jsonTextOf(analyze), analyze.structuredContent);

		const map = await client.callTool({
			name: "map_feature",
			arguments: {
				normalizedPrd: analyzeStructured.normalizedPrd,
				repoPath: "/repo",
				relevantFiles: ["src/auth/reset.ts"],
			},
		});
		assert.notEqual(map.isError, true);
		const mapStructured = mapFeatureOutputSchema.parse(map.structuredContent);
		assert.deepEqual(jsonTextOf(map), map.structuredContent);

		const generate = await client.callTool({
			name: "generate_test_cases",
			arguments: {
				normalizedPrd: analyzeStructured.normalizedPrd,
				featureMap: mapStructured.featureMap,
				acceptanceCriteria: mapStructured.acceptanceCriteria,
			},
		});
		assert.notEqual(generate.isError, true);
		const generateStructured = generateTestCasesOutputSchema.parse(
			generate.structuredContent,
		);
		assert.deepEqual(jsonTextOf(generate), generate.structuredContent);

		const review = await client.callTool({
			name: "review_test_cases",
			arguments: {
				testCases: generateStructured.testCases,
				acceptanceCriteria: mapStructured.acceptanceCriteria,
			},
		});
		assert.notEqual(review.isError, true);
		reviewTestCasesOutputSchema.parse(review.structuredContent);
		assert.deepEqual(jsonTextOf(review), review.structuredContent);

		const exported = await client.callTool({
			name: "export_test_cases",
			arguments: {
				repoPath: "/repo",
				testCases: generateStructured.testCases,
			},
		});
		assert.notEqual(exported.isError, true);
		exportTestCasesOutputSchema.parse(exported.structuredContent);
		assert.deepEqual(jsonTextOf(exported), exported.structuredContent);
	} finally {
		await client.close();
	}
});

test("invalid analyze_feature input is rejected before the handler runs", async () => {
	const client = await connectInMemoryClient();
	try {
		const result = await client.callTool({
			name: "analyze_feature",
			arguments: { featureRequest: "", repoPath: "/repo" },
		});
		assert.equal(result.isError, true);
		assert.equal(result.structuredContent, undefined);
		const message = (result.content as Array<{ text?: string }>)[0]?.text ?? "";
		assert.match(message, /validation/i);
	} finally {
		await client.close();
	}
});

test("built stdio server completes the MCP handshake", async () => {
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [join(process.cwd(), "dist/index.js")],
		cwd: process.cwd(),
		stderr: "pipe",
	});
	const client = new Client({ name: "stdio-test", version: "0.1.0" });

	try {
		await client.connect(transport);
		const listed = await client.listTools();
		assert.deepEqual(
			listed.tools.map((tool) => tool.name).sort(),
			expectedToolNames,
		);
	} finally {
		await client.close();
	}
});
