export const TEST_GRAPH_SCHEMA_VERSION = "test-graph/v1" as const;
export const PROJECT_SCHEMA_VERSION = "project/v1" as const;

export type TestGraphSchemaVersion = typeof TEST_GRAPH_SCHEMA_VERSION;
export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;

/**
 * Reads the declared `schemaVersion` from arbitrary input without mutating it.
 * Returns `null` when the field is absent or not a string so callers can map
 * that into an explicit unsupported-version finding rather than throwing.
 */
export function detectSchemaVersion(input: unknown): string | null {
	if (
		typeof input === "object" &&
		input !== null &&
		"schemaVersion" in input &&
		typeof (input as { schemaVersion: unknown }).schemaVersion === "string"
	) {
		return (input as { schemaVersion: string }).schemaVersion;
	}

	return null;
}
