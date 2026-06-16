import { z } from "zod";
import {
	DIMENSION_KEYS,
	type DimensionKey,
	evalSchemaVersionSchema,
} from "./common.js";

const positive = z.number().positive();

const dimensionWeightsShape = Object.fromEntries(
	DIMENSION_KEYS.map((key) => [key, z.number().min(0)]),
) as Record<DimensionKey, z.ZodNumber>;

export const dimensionWeightsSchema = z.object(dimensionWeightsShape).strict();
export type DimensionWeights = z.infer<typeof dimensionWeightsSchema>;

/** Rubric: risk/priority weighting and the per-dimension weights. */
export const rubricSchema = z
	.object({
		evalSchemaVersion: evalSchemaVersionSchema,
		riskWeight: z
			.object({ low: positive, medium: positive, high: positive })
			.strict(),
		priorityWeight: z
			.object({ p0: positive, p1: positive, p2: positive, p3: positive })
			.strict(),
		dimensionWeights: dimensionWeightsSchema,
	})
	.strict()
	.superRefine((rubric, ctx) => {
		const sum = DIMENSION_KEYS.reduce(
			(total, key) => total + rubric.dimensionWeights[key],
			0,
		);
		// Tolerate float noise but reject a genuinely unnormalized rubric.
		if (Math.abs(sum - 1) > 1e-9) {
			ctx.addIssue({
				code: "custom",
				path: ["dimensionWeights"],
				message: `dimension weights must sum to 1; got ${sum}.`,
			});
		}
	});
export type Rubric = z.infer<typeof rubricSchema>;

/** Gate thresholds and the regression tolerance. Real values set at calibration. */
export const thresholdsSchema = z
	.object({
		evalSchemaVersion: evalSchemaVersionSchema,
		maxUnsupportedRate: z.number().min(0).max(1),
		minOverall: z.number().min(0).max(100),
		maxRegressionDelta: z.number().min(0),
		maxUnsupportedRegressionDelta: z.number().min(0).max(1),
	})
	.strict();
export type Thresholds = z.infer<typeof thresholdsSchema>;
