import { z } from "zod";
import { graphEntityKindSchema } from "./common.js";

/**
 * The closed set of deterministic finding codes. Tests assert exact codes, so
 * this union and the validator must stay in lockstep.
 */
export const testGraphFindingCodeSchema = z.enum([
	"SCHEMA_INVALID",
	"MALFORMED_ASSERTION",
	"UNSUPPORTED_STATE",
	"UNSUPPORTED_SCHEMA_VERSION",
	"DUPLICATE_ID",
	"DUPLICATE_REFERENCE",
	"DANGLING_REFERENCE",
	"REFERENCE_KIND_MISMATCH",
	"PROVENANCE_EVIDENCE_REQUIRED",
	"PROVENANCE_RATIONALE_REQUIRED",
	"EXPLICIT_SOURCE_REQUIRED",
	"CASE_REQUIREMENT_REQUIRED",
	"DUPLICATE_STEP_ORDER",
	"NONCONTIGUOUS_STEP_ORDER",
	"ASSERTION_STEP_CASE_MISMATCH",
	"DEPENDENCY_SELF_REFERENCE",
	"DEPENDENCY_CYCLE",
	"FEATURE_CYCLE",
	"MULTIPLE_DATA_PRODUCERS",
	"MISSING_DATA_PRODUCER",
	"CLEANUP_SELF_REFERENCE",
	"CLEANUP_DATA_NOT_USED",
	"QUESTION_ANSWER_STATE_INVALID",
	"COMPLETE_PLAN_BLOCKED",
	"GENERATION_STATUS_MISMATCH",
	"PROJECT_ID_CHANGED",
	"PLAN_ID_CHANGED",
	"PLAN_VERSION_NOT_INCREMENTED",
	"PLAN_CREATED_AT_CHANGED",
	"PLAN_UPDATED_AT_NOT_ADVANCED",
]);
export type TestGraphFindingCode = z.infer<typeof testGraphFindingCodeSchema>;

export const testGraphFindingSeveritySchema = z.enum(["error", "warning"]);
export type TestGraphFindingSeverity = z.infer<
	typeof testGraphFindingSeveritySchema
>;

export const testGraphFindingSchema = z
	.object({
		code: testGraphFindingCodeSchema,
		severity: testGraphFindingSeveritySchema,
		message: z.string().min(1),
		path: z.string().min(1),
		entity: z
			.object({ kind: graphEntityKindSchema, id: z.string().min(1) })
			.strict()
			.optional(),
		relatedIds: z.array(z.string().min(1)),
	})
	.strict();
export type TestGraphFinding = z.infer<typeof testGraphFindingSchema>;

const SEVERITY_RANK: Record<TestGraphFindingSeverity, number> = {
	error: 0,
	warning: 1,
};

/** Compare code units, never locale order, so sorting is platform-stable. */
function compareCodeUnits(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/**
 * Total order over findings: severity, code, entity kind, entity id, JSON path,
 * message, then related ids. Never depends on insertion or hash-map order.
 */
export function compareFindings(
	a: TestGraphFinding,
	b: TestGraphFinding,
): number {
	if (a.severity !== b.severity) {
		return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
	}
	if (a.code !== b.code) return compareCodeUnits(a.code, b.code);

	const kindOrder = compareCodeUnits(
		a.entity?.kind ?? "",
		b.entity?.kind ?? "",
	);
	if (kindOrder !== 0) return kindOrder;

	const idOrder = compareCodeUnits(a.entity?.id ?? "", b.entity?.id ?? "");
	if (idOrder !== 0) return idOrder;

	const pathOrder = compareCodeUnits(a.path, b.path);
	if (pathOrder !== 0) return pathOrder;

	const messageOrder = compareCodeUnits(a.message, b.message);
	if (messageOrder !== 0) return messageOrder;

	return compareCodeUnits(a.relatedIds.join(","), b.relatedIds.join(","));
}

export function sortFindings(
	findings: readonly TestGraphFinding[],
): TestGraphFinding[] {
	return [...findings].sort(compareFindings);
}

/**
 * The single typed error thrown by `parseTestGraph`. It carries the same sorted
 * findings that `validateTestGraph` would return, so callers never re-derive
 * them from a raw Zod error.
 */
export class TestGraphValidationError extends Error {
	readonly code = "PLAN_INVARIANT_FAILED" as const;

	constructor(readonly findings: readonly TestGraphFinding[]) {
		super("Test Graph validation failed.");
		this.name = "TestGraphValidationError";
	}
}
