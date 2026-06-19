import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildValidTestGraph } from "../test-graph/test-helpers.js";
import { EngineError } from "./errors.js";
import { type GenerationManifest, persistPlan, readPlan } from "./persist.js";

const MANIFEST: GenerationManifest = {
	generatedAt: "2026-06-19T00:00:00.000Z",
	methodologyVersion: "1.0.0",
	workflowVersion: "1.0.0",
	inputFingerprint: "demo-fingerprint",
	generator: { kind: "model", provider: "fake", model: "fake-1" },
	status: "complete",
	warnings: [],
	usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
};

test("persistPlan writes canonical artifacts and read-back validates", async () => {
	const root = await mkdtemp(join(tmpdir(), "qa-persist-"));
	try {
		const graph = buildValidTestGraph();
		const dir = await persistPlan(graph, MANIFEST, root);
		const planJson = await readFile(join(dir, "plan.json"), "utf8");
		assert.ok(planJson.endsWith("\n"));
		assert.equal(JSON.parse(planJson).planId, graph.planId);
		const loaded = await readPlan(root, graph.planId);
		assert.deepEqual(loaded, graph);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("persistPlan throws ARTIFACT_WRITE_FAILED when the root is unwritable", async () => {
	const parent = await mkdtemp(join(tmpdir(), "qa-persist-"));
	try {
		// workspaceRoot is a regular file, so mkdir under it fails (ENOTDIR).
		const fileRoot = join(parent, "not-a-dir");
		await writeFile(fileRoot, "blocker", "utf8");
		const graph = buildValidTestGraph();
		await assert.rejects(
			persistPlan(graph, MANIFEST, fileRoot),
			(err: unknown) =>
				err instanceof EngineError && err.code === "ARTIFACT_WRITE_FAILED",
		);
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("persistPlan cleans its temp dir when the final plan path is blocked", async () => {
	const root = await mkdtemp(join(tmpdir(), "qa-persist-"));
	try {
		const graph = buildValidTestGraph();
		const plansRoot = join(root, ".test-framework", "plans");
		await mkdir(plansRoot, { recursive: true });
		const blockedPath = join(plansRoot, graph.planId);
		await writeFile(blockedPath, "blocker", "utf8");

		await assert.rejects(
			persistPlan(graph, MANIFEST, root),
			(err: unknown) =>
				err instanceof EngineError && err.code === "ARTIFACT_WRITE_FAILED",
		);
		assert.equal(await readFile(blockedPath, "utf8"), "blocker");
		assert.deepEqual(await readdir(plansRoot), [graph.planId]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
