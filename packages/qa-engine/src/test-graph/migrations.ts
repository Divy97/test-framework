import type { TestGraphV1 } from "./schema.js";
import { parseTestGraph } from "./validate.js";
import { detectSchemaVersion, TEST_GRAPH_SCHEMA_VERSION } from "./version.js";

export type TestGraphMigrationErrorCode =
	| "UNSUPPORTED_SCHEMA_VERSION"
	| "MIGRATION_FAILED";

function buildMessage(
	code: TestGraphMigrationErrorCode,
	version: string | null,
	hop: { from: string; to: string } | null,
): string {
	if (code === "UNSUPPORTED_SCHEMA_VERSION") {
		return `Unsupported schema version ${version === null ? "(missing)" : JSON.stringify(version)}.`;
	}
	return `Migration failed at hop ${hop?.from ?? "?"} -> ${hop?.to ?? "?"}.`;
}

/** The single typed error for any migration failure. Identifies the failing hop. */
export class TestGraphMigrationError extends Error {
	constructor(
		readonly code: TestGraphMigrationErrorCode,
		readonly version: string | null = null,
		readonly hop: { from: string; to: string } | null = null,
		cause?: unknown,
	) {
		super(
			buildMessage(code, version, hop),
			cause !== undefined ? { cause } : undefined,
		);
		this.name = "TestGraphMigrationError";
	}
}

/**
 * One adjacent upgrade. `migrate` receives a deep clone and must return a new
 * value for the `to` version; `validate` must reject anything that is not a
 * well-formed `to` graph. There is intentionally no downgrade direction.
 */
export type Migration<TFrom = unknown, TTo = unknown> = {
	from: string;
	to: string;
	migrate(input: TFrom): TTo;
	validate(input: unknown): TTo;
};

export type MigrationRegistry = {
	readonly versions: readonly string[];
	migrate(input: unknown): unknown;
};

/**
 * Builds a frozen, adjacent-only migration registry. `versions` defines the
 * upgrade order; there must be exactly one migration per adjacent pair, each
 * declared strictly `versions[i] -> versions[i + 1]`. Skipped, duplicated, and
 * downgrade migrations are rejected at construction time.
 */
export function createMigrationRegistry(
	versions: readonly string[],
	migrations: readonly Migration[],
): MigrationRegistry {
	if (versions.length === 0) {
		throw new Error("A migration registry needs at least one version.");
	}
	if (new Set(versions).size !== versions.length) {
		throw new Error("Migration versions must be unique.");
	}

	const indexByVersion = new Map(
		versions.map((value, index) => [value, index]),
	);
	const migrationByPair = new Map<string, Migration>();

	for (const migration of migrations) {
		const fromIndex = indexByVersion.get(migration.from);
		const toIndex = indexByVersion.get(migration.to);
		if (fromIndex === undefined || toIndex === undefined) {
			throw new Error(
				`Migration ${migration.from} -> ${migration.to} references an unknown version.`,
			);
		}
		if (toIndex !== fromIndex + 1) {
			throw new Error(
				`Migration ${migration.from} -> ${migration.to} is not a forward adjacent step.`,
			);
		}
		const key = `${migration.from}->${migration.to}`;
		if (migrationByPair.has(key)) {
			throw new Error(`Duplicate migration for ${key}.`);
		}
		migrationByPair.set(key, migration);
	}

	for (let i = 0; i < versions.length - 1; i++) {
		const key = `${versions[i]}->${versions[i + 1]}`;
		if (!migrationByPair.has(key)) {
			throw new Error(`Missing migration for adjacent pair ${key}.`);
		}
	}

	function migrate(input: unknown): unknown {
		const version = detectSchemaVersion(input);
		const startIndex =
			version === null ? undefined : indexByVersion.get(version);
		if (startIndex === undefined) {
			throw new TestGraphMigrationError("UNSUPPORTED_SCHEMA_VERSION", version);
		}

		let current = structuredClone(input);
		for (let i = startIndex; i < versions.length - 1; i++) {
			const from = versions[i] as string;
			const to = versions[i + 1] as string;
			const migration = migrationByPair.get(`${from}->${to}`) as Migration;
			try {
				const migrated = migration.migrate(structuredClone(current));
				current = migration.validate(migrated);
			} catch (cause) {
				throw new TestGraphMigrationError(
					"MIGRATION_FAILED",
					version,
					{ from, to },
					cause,
				);
			}
		}
		return current;
	}

	return Object.freeze({ versions: [...versions], migrate });
}

/**
 * Current-version entrypoint. V1 is the first durable graph, so the registry
 * ships only the identity path: a current graph is validated and returned, and
 * any other version is rejected. No invented production V0 conversion exists.
 */
export function migrateTestGraph(input: unknown): TestGraphV1 {
	const version = detectSchemaVersion(input);
	if (version === TEST_GRAPH_SCHEMA_VERSION) {
		return parseTestGraph(input);
	}
	throw new TestGraphMigrationError("UNSUPPORTED_SCHEMA_VERSION", version);
}
