import { testGraphFindingSchema } from "@test-framework/qa-engine";
import { z } from "zod";
import {
	armSchema,
	DIMENSION_KEYS,
	type DimensionKey,
	evalSchemaVersionSchema,
	fixtureCategorySchema,
	hardFailCodeSchema,
	recordKindSchema,
} from "./common.js";

const dimensionScoresShape = Object.fromEntries(
	DIMENSION_KEYS.map((key) => [key, z.number()]),
) as Record<DimensionKey, z.ZodNumber>;

export const dimensionScoresSchema = z.object(dimensionScoresShape).strict();
export type DimensionScores = z.infer<typeof dimensionScoresSchema>;

export const verdictSchema = z.enum(["PASS", "FAIL"]);
export type Verdict = z.infer<typeof verdictSchema>;

export const candidateResultSchema = z
	.object({
		arm: armSchema,
		recordKind: recordKindSchema,
		valid: z.boolean(),
		validationFindings: z.array(testGraphFindingSchema),
		hardFail: z.boolean(),
		hardFailReasons: z.array(hardFailCodeSchema),
		dimensions: dimensionScoresSchema,
		overall: z.number(),
		verdict: verdictSchema,
		explain: z.array(z.string()),
	})
	.strict();
export type CandidateResult = z.infer<typeof candidateResultSchema>;

export const fixtureResultSchema = z
	.object({
		fixtureId: z.string().min(1),
		category: fixtureCategorySchema,
		candidates: z.array(candidateResultSchema),
	})
	.strict();
export type FixtureResult = z.infer<typeof fixtureResultSchema>;

/**
 * The byte-stable machine result of one Eval Run. It carries fingerprints of the
 * inputs, never a wall-clock timestamp, so repeated runs are identical.
 */
export const evalResultSchema = z
	.object({
		evalSchemaVersion: evalSchemaVersionSchema,
		rubricFingerprint: z.string().min(1),
		corpusFingerprint: z.string().min(1),
		fixtures: z.array(fixtureResultSchema),
	})
	.strict();
export type EvalResult = z.infer<typeof evalResultSchema>;
