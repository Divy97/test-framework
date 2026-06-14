import assert from "node:assert/strict";
import test from "node:test";
import {
	createMigrationRegistry,
	type Migration,
	migrateTestGraph,
	TestGraphMigrationError,
} from "./migrations.js";
import { buildValidTestGraph, loadJsonFixture } from "./test-helpers.js";

type FakeGraph = {
	schemaVersion: string;
	id: string;
	links: string[];
	trail: string[];
};

function fakeMigration(from: string, to: string): Migration {
	return {
		from,
		to,
		migrate(input) {
			const graph = input as FakeGraph;
			return {
				...graph,
				schemaVersion: to,
				trail: [...graph.trail, `${from}->${to}`],
			} satisfies FakeGraph;
		},
		validate(input) {
			const graph = input as FakeGraph;
			if (graph.schemaVersion !== to) {
				throw new Error(`expected ${to}, received ${graph.schemaVersion}`);
			}
			return graph;
		},
	};
}

const FAKE_VERSIONS = ["test/v0", "test/v1", "test/v2"] as const;

// --- Current-version entrypoint ------------------------------------------

test("current V1 input validates without mutation", async () => {
	const input = await loadJsonFixture("valid/ui-api-integration.json");
	const frozen = JSON.stringify(input);
	const graph = migrateTestGraph(input);
	assert.equal(graph.schemaVersion, "test-graph/v1");
	assert.equal(JSON.stringify(input), frozen);
});

test("unknown future version is rejected", () => {
	const input = { ...buildValidTestGraph(), schemaVersion: "test-graph/v2" };
	assert.throws(
		() => migrateTestGraph(input),
		(error: unknown) =>
			error instanceof TestGraphMigrationError &&
			error.code === "UNSUPPORTED_SCHEMA_VERSION",
	);
});

test("missing version is rejected", () => {
	const input: Record<string, unknown> = { ...buildValidTestGraph() };
	delete input.schemaVersion;
	assert.throws(
		() => migrateTestGraph(input),
		(error: unknown) =>
			error instanceof TestGraphMigrationError &&
			error.code === "UNSUPPORTED_SCHEMA_VERSION",
	);
});

// --- Generic registry -----------------------------------------------------

test("registry migrates adjacent versions in order", () => {
	const registry = createMigrationRegistry(FAKE_VERSIONS, [
		fakeMigration("test/v0", "test/v1"),
		fakeMigration("test/v1", "test/v2"),
	]);
	const result = registry.migrate({
		schemaVersion: "test/v0",
		id: "keep-me",
		links: ["a", "b"],
		trail: [],
	}) as FakeGraph;
	assert.equal(result.schemaVersion, "test/v2");
	assert.deepEqual(result.trail, ["test/v0->test/v1", "test/v1->test/v2"]);
});

test("registry preserves ids and links it is not asked to change", () => {
	const registry = createMigrationRegistry(FAKE_VERSIONS, [
		fakeMigration("test/v0", "test/v1"),
		fakeMigration("test/v1", "test/v2"),
	]);
	const result = registry.migrate({
		schemaVersion: "test/v0",
		id: "stable-id",
		links: ["link-1", "link-2"],
		trail: [],
	}) as FakeGraph;
	assert.equal(result.id, "stable-id");
	assert.deepEqual(result.links, ["link-1", "link-2"]);
});

test("registry snapshots and freezes its version order", () => {
	const versions = ["test/v0", "test/v1"];
	const registry = createMigrationRegistry(versions, [
		fakeMigration("test/v0", "test/v1"),
	]);
	versions.push("test/v2");

	const result = registry.migrate({
		schemaVersion: "test/v0",
		id: "stable-id",
		links: [],
		trail: [],
	}) as FakeGraph;
	assert.equal(result.schemaVersion, "test/v1");
	assert.deepEqual(registry.versions, ["test/v0", "test/v1"]);
	assert.equal(Object.isFrozen(registry.versions), true);
	assert.throws(() => (registry.versions as string[]).push("test/v9"));
});

test("a skipped-edge migration is rejected at construction", () => {
	assert.throws(
		() =>
			createMigrationRegistry(FAKE_VERSIONS, [
				fakeMigration("test/v0", "test/v1"),
				fakeMigration("test/v0", "test/v2"),
			]),
		/not a forward adjacent step/,
	);
});

test("a downgrade migration is rejected at construction", () => {
	assert.throws(
		() =>
			createMigrationRegistry(
				["test/v0", "test/v1"],
				[fakeMigration("test/v1", "test/v0")],
			),
		/not a forward adjacent step/,
	);
});

test("a missing adjacent migration is rejected at construction", () => {
	assert.throws(
		() =>
			createMigrationRegistry(FAKE_VERSIONS, [
				fakeMigration("test/v0", "test/v1"),
			]),
		/Missing migration/,
	);
});

test("output is validated at each hop and the failing hop is identified", () => {
	const broken: Migration = {
		from: "test/v0",
		to: "test/v1",
		migrate(input) {
			const graph = input as FakeGraph;
			// Returns the wrong version, so the hop validator must reject it.
			return { ...graph, schemaVersion: "test/vX", trail: graph.trail };
		},
		validate(input) {
			const graph = input as FakeGraph;
			if (graph.schemaVersion !== "test/v1") {
				throw new Error("invalid v1 output");
			}
			return graph;
		},
	};
	const registry = createMigrationRegistry(["test/v0", "test/v1"], [broken]);
	assert.throws(
		() =>
			registry.migrate({
				schemaVersion: "test/v0",
				id: "x",
				links: [],
				trail: [],
			}),
		(error: unknown) => {
			assert.ok(error instanceof TestGraphMigrationError);
			assert.equal(error.code, "MIGRATION_FAILED");
			assert.deepEqual(error.hop, { from: "test/v0", to: "test/v1" });
			return true;
		},
	);
});

test("an unknown input version is rejected by the registry", () => {
	const registry = createMigrationRegistry(FAKE_VERSIONS, [
		fakeMigration("test/v0", "test/v1"),
		fakeMigration("test/v1", "test/v2"),
	]);
	assert.throws(
		() => registry.migrate({ schemaVersion: "test/v9", trail: [] }),
		(error: unknown) =>
			error instanceof TestGraphMigrationError &&
			error.code === "UNSUPPORTED_SCHEMA_VERSION",
	);
});
