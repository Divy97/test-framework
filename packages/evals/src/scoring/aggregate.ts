import { round1 } from "../number.js";
import { DIMENSION_KEYS } from "../schema/common.js";
import type { DimensionScores } from "../schema/result.js";
import type { Rubric } from "../schema/rubric.js";

/** Weighted aggregate of the dimension scores, scaled to [0,100], one decimal. */
export function aggregateOverall(
	dimensions: DimensionScores,
	rubric: Rubric,
): number {
	let sum = 0;
	for (const key of DIMENSION_KEYS) {
		sum += rubric.dimensionWeights[key] * dimensions[key];
	}
	return round1(sum * 100);
}
