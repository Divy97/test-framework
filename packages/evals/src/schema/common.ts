import { z } from "zod";

/** Eval contract version. Independent of the Test Graph `schemaVersion`. */
export const EVAL_SCHEMA_VERSION = "eval/v1" as const;
export type EvalSchemaVersion = typeof EVAL_SCHEMA_VERSION;

export const evalSchemaVersionSchema = z.literal(EVAL_SCHEMA_VERSION);

/** The workflow that produced a Candidate. Differs only in workflow, not schema. */
export const armSchema = z.enum(["raw-model", "host-only", "qa-engine"]);
export type Arm = z.infer<typeof armSchema>;

/** Whether a Candidate is a hand-authored calibration artifact or real output. */
export const recordKindSchema = z.enum(["synthetic", "recorded"]);
export type RecordKind = z.infer<typeof recordKindSchema>;

/** The eight representative fixture shapes the corpus must cover. */
export const fixtureCategorySchema = z.enum([
	"ui-form",
	"authz-api",
	"stateful-workflow",
	"integration-failure",
	"contradictory-spec",
	"evidence-conflict",
	"adversarial-shallow",
	"unsupported-assumptions",
]);
export type FixtureCategory = z.infer<typeof fixtureCategorySchema>;

/** Truth keys are stable, prefixed, kebab identifiers authored in the fixture. */
export const requirementTruthKeySchema = z.string().regex(/^req:[a-z0-9-]+$/);
export const scenarioTruthKeySchema = z.string().regex(/^scn:[a-z0-9-]+$/);
export const claimKeySchema = z.string().regex(/^claim:[a-z0-9-]+$/);

/**
 * The closed set of scored quality dimensions. The rubric weights and the result
 * object both key off this exact list, so adding a dimension is a single edit.
 */
export const DIMENSION_KEYS = [
	"requirementRecall",
	"traceability",
	"scenarioCoverage",
	"unsupportedClaims",
	"provenanceAccuracy",
	"duplicateLowValue",
	"assertionQuality",
	"executionReadiness",
	"evidenceCorrectness",
] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** The closed set of gate codes. A Candidate with any of these is `FAIL`. */
export const HARD_FAIL_CODES = [
	"HF-INVALID-GRAPH",
	"HF-UNSUPPORTED-RATE",
	"HF-CONTRADICTS-TRUTH",
	"HF-LEAKAGE",
	"HF-ANNOTATION-INTEGRITY",
] as const;
export const hardFailCodeSchema = z.enum(HARD_FAIL_CODES);
export type HardFailCode = (typeof HARD_FAIL_CODES)[number];
