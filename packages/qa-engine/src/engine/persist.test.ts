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
import {
	type GenerationManifest,
	persistPlan,
	persistRevision,
	readPlan,
} from "./persist.js";

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

// --- Revision (refine) writer -------------------------------------------------

// A second generation id, distinct from the v1 fixture's "initial" id, that
// still satisfies the gen_<20 hex> id pattern.
const V2_GEN_ID = `gen_${"0".repeat(19)}2`;

/** A valid n -> n+1 revision of the demo plan with a later updatedAt. */
function revision(version: number): ReturnType<typeof buildValidTestGraph> {
	const base = buildValidTestGraph();
	return buildValidTestGraph({
		planVersion: version,
		updatedAt: "2026-06-15T10:00:00.000Z",
		generation: {
			...base.generation,
			id: V2_GEN_ID as typeof base.generation.id,
			generatedAt: "2026-06-15T10:00:00.000Z",
		},
	});
}

test("persistRevision overwrites in place and read-back validates", async () => {
	const root = await mkdtemp(join(tmpdir(), "qa-revise-"));
	try {
		const v1 = buildValidTestGraph();
		const dir = await persistPlan(v1, MANIFEST, root);

		const v2 = revision(2);
		const returnedDir = await persistRevision(v2, MANIFEST, root, {
			expectedVersion: 1,
		});

		assert.equal(returnedDir, dir);
		const loaded = await readPlan(root, v1.planId);
		assert.equal(loaded.planVersion, 2);
		const entries = (await readdir(dir)).sort();
		assert.deepEqual(entries, ["generation.json", "plan.json", "plan.md"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("persistRevision throws ARTIFACT_CONFLICT on version mismatch and leaves v1 untouched", async () => {
	const root = await mkdtemp(join(tmpdir(), "qa-revise-"));
	try {
		const v1 = buildValidTestGraph();
		const dir = await persistPlan(v1, MANIFEST, root);
		const before = await readFile(join(dir, "plan.json"), "utf8");

		const v2 = revision(2);
		await assert.rejects(
			persistRevision(v2, MANIFEST, root, { expectedVersion: 99 }),
			(err: unknown) =>
				err instanceof EngineError && err.code === "ARTIFACT_CONFLICT",
		);

		// No write happened: plan.json is byte-identical to v1.
		assert.equal(await readFile(join(dir, "plan.json"), "utf8"), before);
		assert.equal((await readPlan(root, v1.planId)).planVersion, 1);
		assert.equal((await readdir(dir)).includes(".lock"), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("persistRevision throws ARTIFACT_CONFLICT when the lock is already held", async () => {
	const root = await mkdtemp(join(tmpdir(), "qa-revise-"));
	try {
		const v1 = buildValidTestGraph();
		const dir = await persistPlan(v1, MANIFEST, root);
		const before = await readFile(join(dir, "plan.json"), "utf8");
		await writeFile(join(dir, ".lock"), "9999", "utf8");

		const v2 = revision(2);
		await assert.rejects(
			persistRevision(v2, MANIFEST, root, { expectedVersion: 1 }),
			(err: unknown) => {
				assert.ok(err instanceof EngineError);
				assert.equal(err.code, "ARTIFACT_CONFLICT");
				assert.match(err.message, /in progress/);
				// The lock path is named so a user can remove a stale lock.
				assert.match(err.message, /\.lock/);
				return true;
			},
		);

		// The pre-existing lock is NOT removed (fail-closed; not ours to clear).
		assert.equal((await readdir(dir)).includes(".lock"), true);
		assert.equal(await readFile(join(dir, "plan.json"), "utf8"), before);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("persistRevision releases the lock on success", async () => {
	const root = await mkdtemp(join(tmpdir(), "qa-revise-"));
	try {
		const v1 = buildValidTestGraph();
		const dir = await persistPlan(v1, MANIFEST, root);
		await persistRevision(revision(2), MANIFEST, root, {
			expectedVersion: 1,
		});
		assert.equal((await readdir(dir)).includes(".lock"), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("persistRevision releases the lock and leaves v1 loadable on a write failure", async () => {
	const root = await mkdtemp(join(tmpdir(), "qa-revise-"));
	try {
		const v1 = buildValidTestGraph();
		const dir = await persistPlan(v1, MANIFEST, root);
		const before = await readFile(join(dir, "plan.json"), "utf8");

		// Defensive guard: a candidate that does not advance the base by exactly one
		// fails ARTIFACT_WRITE_FAILED after the lock is acquired, before any write.
		const badRevision = revision(3);
		await assert.rejects(
			persistRevision(badRevision, MANIFEST, root, { expectedVersion: 1 }),
			(err: unknown) =>
				err instanceof EngineError && err.code === "ARTIFACT_WRITE_FAILED",
		);

		// Previous revision intact and loadable; no lock left behind.
		assert.equal(await readFile(join(dir, "plan.json"), "utf8"), before);
		assert.equal((await readPlan(root, v1.planId)).planVersion, 1);
		assert.equal((await readdir(dir)).includes(".lock"), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
