import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	createFakeProvider,
	EngineError,
	type EngineErrorCode,
} from "@test-framework/qa-engine";
import { engineErrorToToolResult } from "./errors.js";
import {
	CREATE_ARGS,
	connectInMemoryClient,
	fakeRuntimeFactory,
	happyScript,
} from "./server.test.js";

/**
 * Every `EngineErrorCode`. Codes whose mapping curates the message (provider/IO
 * classes) must NOT echo the raw engine message; codes that pass through
 * (`INVALID_INPUT`, `PLAN_INVARIANT_FAILED`) surface the engine-authored text,
 * which is already path/secret-free.
 */
const CURATED: readonly EngineErrorCode[] = [
	"REPO_ACCESS_DENIED",
	"CONTEXT_LIMIT_REACHED",
	"PROVIDER_AUTH",
	"PROVIDER_QUOTA",
	"PROVIDER_TRANSIENT",
	"PROVIDER_TIMEOUT",
	"PROVIDER_CANCELLED",
	"PROVIDER_UNSUPPORTED_CAPABILITY",
	"PROVIDER_CONFIG_INVALID",
	"MODEL_OUTPUT_INVALID",
	"PLAN_INVARIANT_FAILED",
	"ARTIFACT_NOT_FOUND",
	"ARTIFACT_WRITE_FAILED",
	"ARTIFACT_CONFLICT",
];
const PASSTHROUGH: readonly EngineErrorCode[] = ["INVALID_INPUT"];

const ALL_CODES: readonly EngineErrorCode[] = [...CURATED, ...PASSTHROUGH];

// A raw message seeded with everything that must never reach the host.
const LEAKY = "boom at /etc/secret with key sk-ant-xyz: Error: nested";

function errorOf(result: unknown): {
	code: string;
	message: string;
	retryable: boolean;
} {
	const structured = (result as { structuredContent?: { error?: unknown } })
		.structuredContent;
	assert.ok(structured?.error, "expected structuredContent.error");
	return structured.error as {
		code: string;
		message: string;
		retryable: boolean;
	};
}

test("every EngineErrorCode maps to a secret-free tool error with the documented code", () => {
	for (const code of ALL_CODES) {
		const result = engineErrorToToolResult(new EngineError(code, LEAKY));
		assert.equal(result.isError, true);
		const error = errorOf(result);
		assert.equal(error.code, code);
		assert.equal(typeof error.message, "string");
		assert.equal(typeof error.retryable, "boolean");
	}
});

test("curated provider/IO messages never leak paths, keys, or SDK detail", () => {
	for (const code of CURATED) {
		const error = errorOf(
			engineErrorToToolResult(new EngineError(code, LEAKY)),
		);
		assert.ok(!error.message.includes("/etc/secret"), `${code} leaked a path`);
		assert.ok(!error.message.includes("sk-ant"), `${code} leaked key material`);
		assert.ok(!error.message.includes("Error:"), `${code} leaked SDK detail`);
	}
});

test("INVALID_INPUT surfaces the engine-authored (already safe) message verbatim", () => {
	const error = errorOf(
		engineErrorToToolResult(
			new EngineError("INVALID_INPUT", "sources must not be empty"),
		),
	);
	assert.equal(error.message, "sources must not be empty");
});

test("PLAN_INVARIANT_FAILED appends a findings count, never paths", () => {
	const err = new EngineError("PLAN_INVARIANT_FAILED", "graph invalid", {
		findings: [
			{ severity: "blocking", code: "x", message: "a" },
			{ severity: "blocking", code: "y", message: "b" },
		] as never,
	});
	const error = errorOf(engineErrorToToolResult(err));
	assert.equal(error.code, "PLAN_INVARIANT_FAILED");
	assert.ok(error.message.includes("2 finding"), error.message);
});

test("a non-EngineError maps to INTERNAL with no leaked message", () => {
	const error = errorOf(engineErrorToToolResult(new Error(LEAKY)));
	assert.equal(error.code, "INTERNAL");
	assert.equal(error.message, "Unexpected server error.");
	assert.ok(!error.message.includes("/etc/secret"));
	assert.ok(!error.message.includes("sk-ant"));
});

// --- ARTIFACT_CONFLICT through the real refine path ----------------------------

async function tempRoot(): Promise<string> {
	return realpath(await mkdtemp(join(tmpdir(), "mcp-errors-")));
}

test("a stale refine_test_plan surfaces the ARTIFACT_CONFLICT code", async () => {
	const root = await tempRoot();
	// happyScript creates v1; the conflict guard throws before any refine spend.
	const client = await connectInMemoryClient(
		fakeRuntimeFactory(createFakeProvider(happyScript()), root),
	);
	try {
		const created = await client.callTool({
			name: "create_test_plan",
			arguments: CREATE_ARGS,
		});
		const planId = (created.structuredContent as { planId: string }).planId;

		const refined = await client.callTool({
			name: "refine_test_plan",
			arguments: {
				planId,
				feedback: "Cover the locked-account case.",
				expectedVersion: 99,
			},
		});
		assert.equal(refined.isError, true);
		assert.equal(errorOf(refined).code, "ARTIFACT_CONFLICT");
	} finally {
		await client.close();
		await rm(root, { recursive: true, force: true });
	}
});
