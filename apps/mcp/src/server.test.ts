import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ProgressNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import {
	createFakeProvider,
	EngineError,
	fakeHang,
} from "@test-framework/qa-engine";
import {
	CREATE_ARGS,
	connectInMemoryClient,
	fakeRuntimeFactory,
	happyScript,
	tempRoot,
} from "./test-harness.js";
import type { ArtifactPaths } from "./tool-schemas.js";
import { failureToToolResult } from "./tools.js";

const expectedToolNames = [
	"create_test_plan",
	"get_test_plan",
	"refine_test_plan",
];

function jsonTextOf(result: unknown) {
	const content =
		(result as { content?: Array<{ type: string; text?: string }> }).content ??
		[];
	const textBlocks = content.filter((block) => block.type === "text");
	assert.equal(textBlocks.length, 1);
	return JSON.parse(textBlocks[0]?.text ?? "null");
}

// --- Slice 1: tool surface + handlers ------------------------------------------

test("server lists exactly the three engine tools with JSON schemas", async () => {
	const root = await tempRoot();
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(createFakeProvider([]), root),
	);
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
		await rm(root, { recursive: true, force: true });
	}
});

test("create_test_plan returns the engine result projected to the tool schema", async () => {
	const root = await tempRoot();
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(createFakeProvider(happyScript()), root),
	);
	try {
		const result = await client.callTool({
			name: "create_test_plan",
			arguments: CREATE_ARGS,
		});
		assert.notEqual(result.isError, true);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.ok(typeof structured.planId === "string");
		assert.equal(structured.status, "complete");
		assert.equal(structured.planVersion, 1);
		assert.ok(typeof structured.planDir === "string");
		const artifacts = structured.artifacts as ArtifactPaths;
		assert.ok(artifacts.planJson.endsWith("plan.json"));
		assert.ok(artifacts.planMd.endsWith("plan.md"));
		assert.ok(artifacts.generationJson.endsWith("generation.json"));
		assert.deepEqual(jsonTextOf(result), structured);
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("get_test_plan returns metadata + summary + paths and writes nothing", async () => {
	const root = await tempRoot();
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(createFakeProvider(happyScript()), root),
	);
	try {
		const created = await client.callTool({
			name: "create_test_plan",
			arguments: CREATE_ARGS,
		});
		const planId = (created.structuredContent as { planId: string }).planId;
		const planDir = join(root, ".test-framework", "plans", planId);
		const before = await readdir(planDir);

		const got = await client.callTool({
			name: "get_test_plan",
			arguments: { planId },
		});
		assert.notEqual(got.isError, true);
		const structured = got.structuredContent as Record<string, unknown>;
		assert.equal(structured.planId, planId);
		assert.equal(structured.planVersion, 1);
		const summary = structured.summary as Record<string, number>;
		assert.equal(summary.requirements, 1);
		assert.equal(summary.features, 1);
		assert.equal(summary.testCases, 1);
		assert.equal(summary.assertions, 1);
		const artifacts = structured.artifacts as ArtifactPaths;
		assert.ok(artifacts.planJson.endsWith("plan.json"));

		// get is read-only: the plan directory is unchanged.
		const after = await readdir(planDir);
		assert.deepEqual(after.sort(), before.sort());
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("invalid create_test_plan input is rejected before the engine runs", async () => {
	const root = await tempRoot();
	const provider = createFakeProvider(happyScript(), { recordCalls: true });
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(provider, root),
	);
	try {
		const result = await client.callTool({
			name: "create_test_plan",
			arguments: { project: { name: "Acme" }, title: "x", sources: [] },
		});
		assert.equal(result.isError, true);
		// SDK rejects the empty `sources` against the input schema; no model call.
		assert.equal(provider.calls.length, 0);
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});

// --- Slice 3: cancellation aborts the in-flight model call ---------------------

test("create_test_plan aborts the in-flight model call when the client cancels", async () => {
	const root = await tempRoot();
	// First stage hangs forever; only an abort can settle it. The later script
	// entries must never be consumed — proving the in-flight generate was aborted.
	const provider = createFakeProvider([fakeHang(), ...happyScript()], {
		recordCalls: true,
	});
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(provider, root),
	);
	const abort = new AbortController();
	try {
		const call = client.callTool(
			{ name: "create_test_plan", arguments: CREATE_ARGS },
			undefined,
			{ signal: abort.signal },
		);
		// Abort after a tick so the request is in flight at the hanging stage.
		setTimeout(() => abort.abort(), 10);

		// The cancelled call settles promptly via abort — not by the script running
		// to completion (the hang would otherwise never resolve).
		await assert.rejects(call, "cancelled call must reject promptly");

		// Let the server's aborted handler unwind.
		await new Promise((resolve) => setTimeout(resolve, 20));

		// The in-flight generate was aborted: exactly one stage call started, and
		// the later script entries (happyScript) were never consumed.
		assert.equal(provider.calls.length, 1);
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("failureToToolResult trusts the engine's typed code and never overrides it", () => {
	// The signal-based override was removed: a genuine failure must keep its code
	// even when a client cancel is in flight. The engine (not the adapter) maps a
	// real abort to PROVIDER_CANCELLED, so overriding here would hide auth/output
	// failures that merely coincided with a cancel.
	const auth = failureToToolResult(
		new EngineError("PROVIDER_AUTH", "rejected key sk-ant at /tmp/x"),
	);
	assert.equal(
		(auth.structuredContent as { error: { code: string } }).error.code,
		"PROVIDER_AUTH",
	);

	const cancelled = failureToToolResult(
		new EngineError("PROVIDER_CANCELLED", "Request was cancelled."),
	);
	assert.equal(
		(cancelled.structuredContent as { error: { code: string } }).error.code,
		"PROVIDER_CANCELLED",
	);
});

// --- Slice 4: progress reporting (opt-in) --------------------------------------

test("create_test_plan emits monotonic progress when a token is supplied", async () => {
	const root = await tempRoot();
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(createFakeProvider(happyScript()), root),
	);
	const progress: Array<{ progress: number; total?: number }> = [];
	try {
		const result = await client.callTool(
			{ name: "create_test_plan", arguments: CREATE_ARGS },
			undefined,
			{
				onprogress: (event) => {
					progress.push({ progress: event.progress, total: event.total });
				},
			},
		);
		assert.notEqual(result.isError, true);
		assert.ok(
			progress.length >= 1,
			"expected at least one progress notification",
		);
		let previous = Number.NEGATIVE_INFINITY;
		for (const event of progress) {
			assert.ok(event.progress >= previous, "progress must be non-decreasing");
			previous = event.progress;
			assert.equal(event.total, 2);
		}
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("no progress notifications are emitted without a token", async () => {
	const root = await tempRoot();
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(createFakeProvider(happyScript()), root),
	);
	let progressCount = 0;
	// Register before the call: with no `onprogress`, the SDK attaches no
	// progressToken, so the server's gated reporter emits nothing.
	client.setNotificationHandler(ProgressNotificationSchema, () => {
		progressCount += 1;
	});
	try {
		const result = await client.callTool({
			name: "create_test_plan",
			arguments: CREATE_ARGS,
		});
		assert.notEqual(result.isError, true);
		await new Promise((resolve) => setTimeout(resolve, 10));
		assert.equal(progressCount, 0);
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});

// --- Slice 5: roots / project-root confinement ---------------------------------

test("create_test_plan rejects a repo path escaping the root before any engine call", async () => {
	const root = await tempRoot();
	const provider = createFakeProvider(happyScript(), { recordCalls: true });
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(provider, root),
	);
	try {
		const result = await client.callTool({
			name: "create_test_plan",
			arguments: { ...CREATE_ARGS, repo: { path: "../../etc" } },
		});
		assert.equal(result.isError, true);
		const error = (result.structuredContent as { error: { code: string } })
			.error;
		assert.equal(error.code, "REPO_ACCESS_DENIED");
		// Rejected before the engine runs: no model call.
		assert.equal(provider.calls.length, 0);
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});

// --- built stdio handshake (full bootstrap in slice 6) -------------------------

function builtStdioTransport(): StdioClientTransport {
	return new StdioClientTransport({
		command: process.execPath,
		args: [join(process.cwd(), "dist/index.js")],
		cwd: process.cwd(),
		stderr: "pipe",
	});
}

test("built stdio server completes the MCP handshake and lists the three tools", async () => {
	const client = new Client({ name: "stdio-test", version: "0.1.0" });
	try {
		await client.connect(builtStdioTransport());
		const listed = await client.listTools();
		assert.deepEqual(
			listed.tools.map((tool) => tool.name).sort(),
			expectedToolNames,
		);
	} finally {
		await client.close();
	}
});

test("built stdio server answers a no-provider INVALID_INPUT deterministically", async () => {
	// The provider is constructed lazily, so this empty-`sources` call is rejected
	// by the input schema before any provider is built — no key needed.
	const client = new Client({ name: "stdio-invalid-test", version: "0.1.0" });
	try {
		await client.connect(builtStdioTransport());
		const result = await client.callTool({
			name: "create_test_plan",
			arguments: { project: { name: "Acme" }, title: "x", sources: [] },
		});
		assert.equal(result.isError, true);
	} finally {
		await client.close();
	}
});

// --- Slice 6: gated live BYOK smoke test ---------------------------------------

const live = Boolean(
	process.env.RUN_LIVE_PROVIDER && process.env.ANTHROPIC_API_KEY,
);

test("live create_test_plan over a real provider persists a valid plan", {
	skip: !live,
}, async () => {
	const { createProvider } = await import("@test-framework/qa-engine");
	const root = await tempRoot();
	const provider = await createProvider({
		provider: "anthropic",
		model: "claude-haiku-4-5",
		keySource: { kind: "env", var: "ANTHROPIC_API_KEY" },
	});
	const client = await connectInMemoryClient(async () => ({
		provider,
		workspaceRoot: root,
		now: () => Date.now(),
	}));
	try {
		const result = await client.callTool({
			name: "create_test_plan",
			arguments: CREATE_ARGS,
		});
		assert.notEqual(result.isError, true);
		const structured = result.structuredContent as { planId?: string };
		assert.ok(typeof structured.planId === "string");
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});
