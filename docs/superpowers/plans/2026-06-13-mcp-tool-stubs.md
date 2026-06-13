# MCP Tool Stubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the five V1 planner tools through a real local MCP stdio server, with validated inputs and structured outputs backed by the existing domain schemas.

**Architecture:** Keep `apps/mcp` as a thin protocol adapter. Operation contracts stay in `packages/planner`; domain entities remain in `packages/core`; artifact path knowledge remains in `packages/artifacts`. Initial handlers are deterministic, input-derived stubs with no model, database, network, or filesystem writes.

**Tech Stack:** Node.js, TypeScript, `@modelcontextprotocol/sdk@1.29.0`, Zod 4, Node test runner through `tsx`, Turborepo, pnpm.

---

## Scope

Included:

- Install and pin the stable MCP TypeScript SDK.
- Replace placeholder MCP startup with `McpServer` and `StdioServerTransport`.
- Register `analyze_feature`, `map_feature`, `generate_test_cases`, `review_test_cases`, and `export_test_cases`.
- Complete input/output contracts for all five operations.
- Return both MCP text content and validated `structuredContent`.
- Add deterministic stub handlers.
- Add protocol-level tests through in-memory and stdio transports.
- Document local client configuration.

Excluded:

- LLM provider integration or BYOK configuration.
- Real repo scanning.
- Real artifact writes.
- Database access.
- HTTP MCP transport.
- Auth.
- Playwright generation or test execution.

## Grill Decisions

These questions were walked in dependency order. Questions answerable from the repo or current official docs were resolved without user input.

### 1. Which MCP SDK line should we adopt?

**Answer:** Pin `@modelcontextprotocol/sdk@1.29.0`.

**Why:** It is the current stable v1 release. The split `@modelcontextprotocol/server` package is `2.0.0-alpha.2`; alpha is avoidable risk for the first production foundation.

### 2. Which transport should V1 expose?

**Answer:** Stdio only.

**Why:** `docs/v1-mvp.md` defines a developer-only local MCP product. Official SDK docs identify stdio as the transport for local, process-spawned integrations. HTTP adds hosting, sessions, network security, and auth concerns outside V1.

### 3. Should `apps/mcp` own business logic?

**Answer:** No. It owns MCP registration, transport startup, and conversion to MCP results. Stub domain behavior is isolated behind a handler interface so model-backed planner services can replace it later.

### 4. Where should operation schemas live?

**Answer:** `packages/planner`.

**Why:** `packages/core` already owns reusable entities such as normalized PRDs and test cases. Tool request/response envelopes are application contracts, not core entities.

### 5. Must every tool return a core entity?

**Answer:** Four tools return envelopes containing core entities. `export_test_cases` consumes and echoes validated `TestCase[]`, plus an artifact receipt. An export receipt is not a core QA entity, so forcing it into `packages/core` would weaken the boundary.

### 6. Should the stubs call a model or scan the repository?

**Answer:** No. They are deterministic and input-derived.

**Why:** This slice verifies protocol and contracts. Model and scan behavior need separate plans, provider decisions, safety limits, and fixtures.

### 7. Should `export_test_cases` write files now?

**Answer:** No. Return `status: "preview"`, expected paths, and `written: false`.

**Why:** The requested work is five stubs. A real writer needs path confinement, overwrite policy, atomic writes, Markdown rendering, and failure recovery. The preview contract can later support `status: "written"` without redesigning the tool.

### 8. Should responses contain text, structured data, or both?

**Answer:** Both.

**Why:** `structuredContent` is machine-consumable and validated against `outputSchema`; JSON text remains useful for clients that only surface content blocks.

### 9. Who validates tool inputs and outputs?

**Answer:** Zod schemas supplied directly to `registerTool`.

**Why:** SDK v1 accepts full Zod object schemas and validates inputs. When `outputSchema` exists, successful calls must provide matching `structuredContent`, which the SDK validates.

### 10. How should failures be represented?

**Answer:** Invalid input is rejected by the SDK. Unexpected handler failures return `isError: true` with a concise text block and no structured content.

**Why:** This follows MCP tool error semantics and avoids returning invalid success payloads.

### 11. Should tools advertise behavior hints?

**Answer:** Yes. Analysis, mapping, generation, and review are read-only, non-destructive, idempotent, and closed-world. Export preview is also read-only in this slice. Change export annotations when real writing is implemented.

### 12. How should we test protocol behavior?

**Answer:** Two layers: in-memory client/server integration and a built stdio child-process smoke test.

**Why:** Direct handler tests cannot prove registration, schemas, JSON-RPC negotiation, or a runnable entrypoint.

### 13. Can the process log to stdout?

**Answer:** No. Stdout is reserved for MCP JSON-RPC. Fatal diagnostics go to stderr through `console.error`.

### 14. Do we need auth?

**Answer:** No. Stdio inherits local process access. Auth belongs to a future remote HTTP transport.

### 15. Do we need the database or API app in this slice?

**Answer:** No. The MCP server should start with no Postgres, Docker, Hono server, or environment keys.

## Verified APIs

| Decision | Verified via | Finding |
| --- | --- | --- |
| Stable package | [npm package metadata](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | Stable SDK is `1.29.0`. |
| Local transport | [Official v1 server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md#stdio) | Use `McpServer` with `StdioServerTransport` for local process-spawned clients. |
| Tool registration | [Official v1 server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/server.md#tools) | `registerTool` accepts Zod input/output schemas and handlers can return text plus `structuredContent`. |
| Output validation | [Official v1 SDK source](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/mcp.ts) | Successful tools with `outputSchema` must return valid `structuredContent`; error results skip output validation. |
| Protocol tests | [Official v1 in-memory transport source](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/inMemory.ts) | `InMemoryTransport.createLinkedPair()` supports client/server tests in one process. |
| Stdio client | [Official v1 client docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/docs/client.md#stdio-transport) | `StdioClientTransport` spawns and connects to a local server process. |

## File Map

Create:

- `apps/mcp/src/result.ts`: successful and failed MCP result helpers.
- `apps/mcp/src/handlers.ts`: transport-independent handler interface for the five operations.
- `apps/mcp/src/stub-handlers.ts`: deterministic implementations of the five operation handlers.
- `apps/mcp/src/tools.ts`: tool names, handler interface, metadata, and registration.
- `apps/mcp/src/server.ts`: pure `createMcpServer()` factory.
- `apps/mcp/src/server.test.ts`: in-memory contract tests and built stdio smoke test.

Modify:

- `pnpm-workspace.yaml`: add stable SDK to catalog.
- `apps/mcp/package.json`: add direct SDK dependency, tests, and correct built start path.
- `packages/planner/src/index.ts`: complete all five operation schemas and inferred types.
- `apps/mcp/src/index.ts`: replace placeholder log with stdio bootstrap.
- `package.json`: add root test command.
- `turbo.json`: add test pipeline.
- `README.md`: document build and MCP client configuration.
- `pnpm-lock.yaml`: lock direct SDK dependency.

Do not modify:

- `packages/core/src/index.ts`: current domain entities are sufficient for this slice.
- `packages/db`: no persistence in this slice.
- `apps/api`: MCP remains independently runnable.

## Contract Shape

Add these schemas and inferred types to `packages/planner/src/index.ts`.

```ts
export const mapFeatureInputSchema = z.object({
	normalizedPrd: normalizedPrdSchema,
	repoPath: z.string().min(1),
	relevantFiles: z.array(z.string().min(1)).default([]),
});

export const generateTestCasesInputSchema = z.object({
	normalizedPrd: normalizedPrdSchema,
	featureMap: z.array(featureMapItemSchema),
	acceptanceCriteria: z.array(acceptanceCriterionSchema),
	userHints: z.array(z.string().min(1)).default([]),
});

export const reviewTestCasesInputSchema = z.object({
	testCases: z.array(testCaseSchema),
	acceptanceCriteria: z.array(acceptanceCriterionSchema).default([]),
});

export const exportFormatSchema = z.enum(["json", "markdown"]);

export const exportTestCasesInputSchema = z.object({
	repoPath: z.string().min(1),
	testCases: z.array(testCaseSchema),
	formats: z.array(exportFormatSchema).min(1).default(["json", "markdown"]),
});

export const exportedArtifactSchema = z.object({
	format: exportFormatSchema,
	path: z.string().min(1),
	written: z.boolean(),
});

export const exportTestCasesOutputSchema = z.object({
	status: z.enum(["preview", "written"]),
	testCases: z.array(testCaseSchema),
	artifacts: z.array(exportedArtifactSchema),
});

export type AnalyzeFeatureInput = z.infer<typeof analyzeFeatureInputSchema>;
export type AnalyzeFeatureOutput = z.infer<typeof analyzeFeatureOutputSchema>;
export type MapFeatureInput = z.infer<typeof mapFeatureInputSchema>;
export type MapFeatureOutput = z.infer<typeof mapFeatureOutputSchema>;
export type GenerateTestCasesInput = z.infer<typeof generateTestCasesInputSchema>;
export type GenerateTestCasesOutput = z.infer<typeof generateTestCasesOutputSchema>;
export type ReviewTestCasesInput = z.infer<typeof reviewTestCasesInputSchema>;
export type ReviewTestCasesOutput = z.infer<typeof reviewTestCasesOutputSchema>;
export type ExportTestCasesInput = z.infer<typeof exportTestCasesInputSchema>;
export type ExportTestCasesOutput = z.infer<typeof exportTestCasesOutputSchema>;
```

Keep existing output envelopes unchanged except for adding `exportTestCasesOutputSchema`. This minimizes contract churn.

## Task 1: Add Test Pipeline and Direct SDK Dependency

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `apps/mcp/package.json`
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add SDK catalog entry**

Add the exact stable version:

```yaml
catalog:
  "@modelcontextprotocol/sdk": 1.29.0
```

- [ ] **Step 2: Add MCP dependency and scripts**

Update `apps/mcp/package.json`:

```json
{
	"scripts": {
		"build": "tsdown",
		"check-types": "tsc -b",
		"dev": "tsx watch src/index.ts",
		"start": "node dist/index.js",
		"test": "pnpm build && tsx --test src/**/*.test.ts"
	},
	"dependencies": {
		"@modelcontextprotocol/sdk": "catalog:"
	}
}
```

Preserve all existing dependencies. Correct `start` from `dist/index.mjs` to the actual tsdown output `dist/index.js`.

- [ ] **Step 3: Add root and Turbo test tasks**

Add to root `package.json`:

```json
"test": "turbo test"
```

Add to `turbo.json` tasks:

```json
"test": {
	"dependsOn": ["^test"],
	"cache": false
}
```

Do not make `test` persistent. The MCP package's test script builds its own executable before stdio testing.

- [ ] **Step 4: Install and verify resolution**

Run:

```bash
pnpm install
pnpm --filter mcp list @modelcontextprotocol/sdk --depth 0
```

Expected: install succeeds and version is `1.29.0`.

- [ ] **Step 5: Commit dependency foundation**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json apps/mcp/package.json
git commit -m ":construction_worker: build(mcp): add MCP SDK and test pipeline"
```

## Task 2: Complete Planner Operation Contracts

**Files:**

- Modify: `packages/planner/src/index.ts`
- Create initially failing test: `apps/mcp/src/server.test.ts`

- [ ] **Step 1: Write contract imports and failing schema tests**

Create `apps/mcp/src/server.test.ts` with a contract test that imports every input/output schema and verifies representative payloads. Start with this minimal test so missing exports fail:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
	analyzeFeatureOutputSchema,
	exportTestCasesOutputSchema,
	generateTestCasesOutputSchema,
	mapFeatureOutputSchema,
	reviewTestCasesOutputSchema,
} from "@test-framework/planner";

test("planner exposes five valid output contracts", () => {
	assert.ok(analyzeFeatureOutputSchema);
	assert.ok(mapFeatureOutputSchema);
	assert.ok(generateTestCasesOutputSchema);
	assert.ok(reviewTestCasesOutputSchema);
	assert.ok(exportTestCasesOutputSchema);
});
```

- [ ] **Step 2: Run test and confirm red state**

Run:

```bash
pnpm --filter mcp test
```

Expected: TypeScript/module failure because `exportTestCasesOutputSchema` does not exist.

- [ ] **Step 3: Add complete schemas and types**

Implement the shapes from **Contract Shape**. Also add missing input schemas:

- `mapFeatureInputSchema`
- `generateTestCasesInputSchema`
- `reviewTestCasesInputSchema`
- `exportTestCasesInputSchema`

Keep `analyzeFeatureInputSchema` as-is. Export inferred input and output types for all operations.

- [ ] **Step 4: Expand schema tests with concrete valid and invalid payloads**

Use the smallest valid core objects. Assert:

```ts
assert.equal(exportTestCasesOutputSchema.safeParse({
	status: "preview",
	testCases: [],
	artifacts: [
		{ format: "json", path: "/repo/.test-framework/test-cases.json", written: false },
	],
}).success, true);

assert.equal(exportTestCasesOutputSchema.safeParse({
	status: "preview",
	testCases: [],
	artifacts: [],
	extra: "not allowed only if schemas later become strict",
}).success, true);
```

Do not add `.strict()` in this slice; MCP clients may attach forward-compatible fields. Add invalid assertions for empty `repoPath`, unsupported format, and malformed core entity values.

- [ ] **Step 5: Verify contracts**

Run:

```bash
pnpm --filter @test-framework/planner check-types
pnpm --filter mcp test
```

Expected: both pass.

- [ ] **Step 6: Commit contracts**

```bash
git add packages/planner/src/index.ts apps/mcp/src/server.test.ts
git commit -m ":sparkles: feat(planner): complete MCP tool contracts"
```

## Task 3: Build Deterministic Stub Handlers

**Files:**

- Create: `apps/mcp/src/handlers.ts`
- Create: `apps/mcp/src/stub-handlers.ts`
- Modify: `apps/mcp/src/server.test.ts`

- [ ] **Step 1: Write failing handler tests**

Import `createStubToolHandlers` and assert these invariants:

- `analyzeFeature` sets `featureSummary` from `featureRequest` and maps `relevantFiles` to source references.
- `mapFeature` emits one feature and one acceptance criterion, with empty repo scan categories.
- `generateTestCases` emits one `TC-001` case whose objective derives from the first criterion or feature summary.
- `reviewTestCases` returns a high-severity finding only when no cases are supplied.
- `exportTestCases` returns requested artifact paths with `status: "preview"` and `written: false` without creating files.
- Every return value parses with its operation output schema.

Use a temporary repo path for export and assert `existsSync(join(repoPath, ".test-framework")) === false` after the call.

- [ ] **Step 2: Run tests and confirm red state**

Run:

```bash
pnpm --filter mcp test
```

Expected: module-not-found failure for `./stub-handlers.js`.

- [ ] **Step 3: Implement the handler interface and deterministic outputs**

Create `apps/mcp/src/handlers.ts`:

```ts
import type {
	AnalyzeFeatureInput,
	AnalyzeFeatureOutput,
	ExportTestCasesInput,
	ExportTestCasesOutput,
	GenerateTestCasesInput,
	GenerateTestCasesOutput,
	MapFeatureInput,
	MapFeatureOutput,
	ReviewTestCasesInput,
	ReviewTestCasesOutput,
} from "@test-framework/planner";

export interface ToolHandlers {
	analyzeFeature(input: AnalyzeFeatureInput): Promise<AnalyzeFeatureOutput>;
	mapFeature(input: MapFeatureInput): Promise<MapFeatureOutput>;
	generateTestCases(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput>;
	reviewTestCases(input: ReviewTestCasesInput): Promise<ReviewTestCasesOutput>;
	exportTestCases(input: ExportTestCasesInput): Promise<ExportTestCasesOutput>;
}
```

Create `apps/mcp/src/stub-handlers.ts`. Export one factory with five async methods. Parse every output before returning it:

```ts
export function createStubToolHandlers(): ToolHandlers {
	return {
		async analyzeFeature(input) {
			return analyzeFeatureOutputSchema.parse({
				normalizedPrd: {
					featureSummary: input.featureRequest,
					userRoles: [],
					goals: [input.featureRequest],
					inScopeBehavior: [input.featureRequest],
					outOfScopeBehavior: [],
					businessRules: [],
					uiStates: [],
					dataRules: [],
					apiContracts: [],
					authPermissionRules: [],
					edgeCases: [],
					openQuestions: [],
					sourceReferences: input.relevantFiles.map((path) => ({
						label: "Relevant implementation file",
						path,
					})),
				},
			});
		},
		async mapFeature(input) {
			const summary = input.normalizedPrd.featureSummary;
			return mapFeatureOutputSchema.parse({
				featureMap: [{
					feature: summary,
					subFeature: summary,
					userFlow: summary,
					screensRoutes: [],
					componentsFiles: input.relevantFiles,
					apisDataStores: [],
					dependencies: [],
					riskLevel: "medium",
				}],
				acceptanceCriteria: [{
					id: "AC-001",
					statement: `The feature satisfies: ${summary}`,
					strength: "assumption",
					evidenceSource: "inferred",
					sourceReferences: input.normalizedPrd.sourceReferences,
				}],
				repoScan: {
					framework: null,
					packageManager: null,
					routesPages: [],
					components: [],
					apiHandlers: [],
					dbSchemasModels: [],
					existingTests: [],
					authMiddleware: [],
					validationSchemas: [],
					featureFlags: [],
					externalIntegrations: [],
				},
			});
		},
		async generateTestCases(input) {
			const objective = input.acceptanceCriteria[0]?.statement
				?? input.normalizedPrd.featureSummary;
			return generateTestCasesOutputSchema.parse({
				testCases: [{
					id: "TC-001",
					title: `Verify ${input.normalizedPrd.featureSummary}`,
					type: "positive",
					priority: "p1",
					objective,
					preconditions: [],
					testDataAccounts: [],
					steps: ["Exercise the described feature flow"],
					expectedResults: [objective],
					postconditions: [],
					relatedFilesRoutesApis: input.featureMap.flatMap(
						(item) => item.componentsFiles,
					),
					evidenceSource: "inferred",
					automationReadiness: "manual",
				}],
			});
		},
		async reviewTestCases(input) {
			return reviewTestCasesOutputSchema.parse({
				findings: input.testCases.length > 0 ? [] : [{
					id: "RF-001",
					severity: "high",
					summary: "No test cases were provided",
					recommendation: "Generate at least one test case before review",
					relatedTestCaseIds: [],
				}],
			});
		},
		async exportTestCases(input) {
			const paths = {
				json: artifactPaths.testCasesJson,
				markdown: artifactPaths.testCasesMarkdown,
			} as const;
			return exportTestCasesOutputSchema.parse({
				status: "preview",
				testCases: input.testCases,
				artifacts: input.formats.map((format) => ({
					format,
					path: join(input.repoPath, paths[format]),
					written: false,
				})),
			});
		},
	};
}
```

Import the planner schemas, `artifactPaths`, and `join`. Import `ToolHandlers` as a type from `./handlers.js`.

- [ ] **Step 4: Run handler tests**

Run:

```bash
pnpm --filter mcp test
pnpm --filter mcp check-types
```

Expected: all handler tests and type checks pass.

- [ ] **Step 5: Commit deterministic handlers**

```bash
git add apps/mcp/src/handlers.ts apps/mcp/src/stub-handlers.ts apps/mcp/src/server.test.ts
git commit -m ":sparkles: feat(mcp): add typed planner stubs"
```

## Task 4: Register the Five MCP Tools

**Files:**

- Create: `apps/mcp/src/result.ts`
- Create: `apps/mcp/src/tools.ts`
- Create: `apps/mcp/src/server.ts`
- Modify: `apps/mcp/src/server.test.ts`

- [ ] **Step 1: Add failing in-memory protocol tests**

Use `Client` and `InMemoryTransport.createLinkedPair()` to connect to `createMcpServer()`.

Test exact names in exact order after sorting:

```ts
const expectedToolNames = [
	"analyze_feature",
	"export_test_cases",
	"generate_test_cases",
	"map_feature",
	"review_test_cases",
];
```

For each listed tool, assert `inputSchema.type === "object"` and `outputSchema.type === "object"`. Close the client and server in test cleanup so failed assertions do not leave open handles.

Call all five tools in a chain:

1. `analyze_feature` with a feature request, repo path, and relevant file.
2. `map_feature` with the returned normalized PRD.
3. `generate_test_cases` with returned feature map and criteria.
4. `review_test_cases` with returned cases and criteria.
5. `export_test_cases` with returned cases.

For every result:

- Assert `isError !== true`.
- Assert one JSON text content block exists.
- Parse `structuredContent` with the exported output schema.
- Assert parsed text content deeply equals structured content.

Also assert an invalid `analyze_feature` call with an empty `featureRequest` rejects.

- [ ] **Step 2: Run tests and confirm red state**

Run:

```bash
pnpm --filter mcp test
```

Expected: module-not-found failure for `./server.js`.

- [ ] **Step 3: Add result helpers**

Create `apps/mcp/src/result.ts`:

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function successResult(
	structuredContent: Record<string, unknown>,
): CallToolResult {
	return {
		content: [{
			type: "text",
			text: JSON.stringify(structuredContent, null, 2),
		}],
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
```

- [ ] **Step 4: Add registration adapter**

Create `apps/mcp/src/tools.ts` with:

```ts
export const toolNames = [
	"analyze_feature",
	"map_feature",
	"generate_test_cases",
	"review_test_cases",
	"export_test_cases",
] as const;
```

Import `ToolHandlers` from `./handlers.js`; do not redefine it in the protocol adapter.

Add `registerPlannerTools(server, handlers)`. Register each tool with:

- Human-readable title.
- Specific description stating that implementation is deterministic stub behavior.
- Its full Zod input schema.
- Its full Zod output schema.
- `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.
- A callback that awaits the matching handler and returns `successResult(output)`.
- A callback `catch` that returns `errorResult(error)`.

Use a small private `runTool` wrapper to avoid repeating try/catch:

```ts
async function runTool<T extends Record<string, unknown>>(
	operation: () => Promise<T>,
): Promise<CallToolResult> {
	try {
		return successResult(await operation());
	} catch (error) {
		return errorResult(error);
	}
}
```

- [ ] **Step 5: Add pure server factory**

Create `apps/mcp/src/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createStubToolHandlers } from "./stub-handlers.js";
import type { ToolHandlers } from "./handlers.js";
import { registerPlannerTools } from "./tools.js";

export const mcpServerManifest = {
	name: "test-framework",
	version: "0.1.0",
} as const;

export function createMcpServer(
	handlers: ToolHandlers = createStubToolHandlers(),
): McpServer {
	const server = new McpServer(mcpServerManifest);
	registerPlannerTools(server, handlers);
	return server;
}
```

Do not connect a transport in this factory. Transport-free construction enables tests and later HTTP support without duplicating registration.

- [ ] **Step 6: Run protocol tests**

Run:

```bash
pnpm --filter mcp test
pnpm --filter mcp check-types
```

Expected: five tools listed; all calls return schema-valid structured content; invalid input rejects.

- [ ] **Step 7: Commit protocol adapter**

```bash
git add apps/mcp/src/result.ts apps/mcp/src/tools.ts apps/mcp/src/server.ts apps/mcp/src/server.test.ts
git commit -m ":sparkles: feat(mcp): register planner tools"
```

## Task 5: Wire Stdio Entrypoint and Smoke Test

**Files:**

- Modify: `apps/mcp/src/index.ts`
- Modify: `apps/mcp/src/server.test.ts`

- [ ] **Step 1: Add failing built-process smoke test**

In `apps/mcp/src/server.test.ts`, use `StdioClientTransport`:

```ts
test("built stdio server completes MCP handshake", async () => {
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
```

The package test script builds first, so `dist/index.js` must exist.

- [ ] **Step 2: Run test and confirm red state**

Run:

```bash
pnpm --filter mcp test
```

Expected: handshake fails because current entrypoint only prints placeholder JSON and exits.

- [ ] **Step 3: Replace placeholder with stdio bootstrap**

Replace `apps/mcp/src/index.ts`:

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
	const server = createMcpServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
```

Do not write startup messages to stdout.

- [ ] **Step 4: Run transport verification**

Run:

```bash
pnpm --filter mcp test
pnpm --filter mcp check-types
pnpm --filter mcp build
```

Expected: in-memory and stdio tests pass; build emits `apps/mcp/dist/index.js`.

- [ ] **Step 5: Commit stdio server**

```bash
git add apps/mcp/src/index.ts apps/mcp/src/server.test.ts
git commit -m ":sparkles: feat(mcp): run local stdio server"
```

## Task 6: Document Client Setup and Run Full Gates

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Document build and client configuration**

Add an `MCP Server` section with:

```bash
pnpm install
pnpm --filter mcp build
```

Document this generic client config, replacing the path with the checked-out repo path:

```json
{
	"mcpServers": {
		"test-framework": {
			"command": "node",
			"args": [
				"/absolute/path/to/test-framework/apps/mcp/dist/index.js"
			]
		}
	}
}
```

List the five tool names. State explicitly:

- Outputs are deterministic stubs.
- No model key, database, Docker service, API server, or auth is required.
- `export_test_cases` previews paths and does not write files yet.

- [ ] **Step 2: Run all repository gates**

Run:

```bash
pnpm test
pnpm check-types
pnpm build
pnpm check
```

Expected:

- MCP protocol tests pass.
- All workspace type checks pass.
- All apps/packages build.
- Biome exits zero.

Because `pnpm check` writes formatting fixes, inspect `git diff` afterward and confirm only intended files changed.

- [ ] **Step 3: Run contract audit**

Run:

```bash
rg -n "analyze_feature|map_feature|generate_test_cases|review_test_cases|export_test_cases" apps/mcp README.md
rg -n "console\.log" apps/mcp/src
git diff --check
git status --short
```

Expected:

- All five names appear in registration, tests, and docs.
- No `console.log` remains in the stdio process.
- No whitespace errors.
- No generated `.test-framework` directory exists.

- [ ] **Step 4: Commit docs**

```bash
git add README.md
git commit -m ":memo: docs(mcp): document local client setup"
```

## Acceptance Criteria

- [ ] `pnpm --filter mcp start` launches a stdio MCP server after build and stays alive awaiting a client.
- [ ] MCP initialization succeeds through `StdioClientTransport`.
- [ ] `tools/list` returns exactly the five V1 tool names.
- [ ] Every tool advertises input and output JSON schemas.
- [ ] Every valid call returns JSON text and schema-valid `structuredContent`.
- [ ] Invalid input is rejected before handler execution.
- [ ] Stub outputs are deterministic and derived from input.
- [ ] `export_test_cases` performs no filesystem write.
- [ ] Server startup requires no auth, model key, database, Docker, Hono app, or network access.
- [ ] Stdout contains only MCP protocol traffic.
- [ ] `pnpm test`, `pnpm check-types`, `pnpm build`, and `pnpm check` pass.

## Risks and Controls

| Risk | Control |
| --- | --- |
| Alpha SDK churn | Pin stable `@modelcontextprotocol/sdk@1.29.0`. |
| Stdout corrupts JSON-RPC | No stdout logging; smoke-test real child process. |
| Schemas drift from tool results | Register `outputSchema`; parse outputs in stubs; parse again in client tests. |
| MCP adapter becomes business layer | Inject `ToolHandlers`; keep server factory protocol-only. |
| Stub behavior mistaken for production analysis | Describe stubs in tool metadata and README; export reports `preview`. |
| Export writes outside repo | No writes in this slice; later writer requires path-confinement plan. |
| Direct dependency hidden by transitive install | Add explicit workspace dependency and version assertion. |

## Follow-On Plans

Implement separately after this foundation is merged:

1. Real safe repo scanner with ignore rules, size limits, symlink policy, and evidence references.
2. BYOK provider abstraction and model-backed `analyze_feature`/`map_feature`.
3. Quality-driven test generation and review prompts with golden fixtures.
4. Atomic JSON/Markdown artifact writer with repo-root confinement and overwrite policy.
