import {
	type CandidateContext,
	type DimensionResult,
	requirementCoverage,
} from "../join.js";
import { itemWeight } from "../weight.js";

/**
 * Risk-weighted requirement recall. Counts coverage of Ground Truth, never case
 * count: an extra case on an already-covered requirement adds nothing here.
 */
export function scoreRecall(ctx: CandidateContext): DimensionResult {
	const coverage = requirementCoverage(ctx);
	const explain: string[] = [];
	let weighted = 0;
	let total = 0;

	for (const requirement of ctx.fixture.expectedRequirements) {
		const weight = itemWeight(
			ctx.rubric,
			requirement.risk,
			requirement.priority,
		);
		total += weight;
		const cover = coverage.get(requirement.truthKey) ?? "missed";
		const credit = cover === "covered" ? 1 : cover === "partial" ? 0.5 : 0;
		weighted += weight * credit;
		if (cover !== "covered") {
			explain.push(`recall: ${requirement.truthKey} ${cover} (w=${weight})`);
		}
	}

	return { score: total === 0 ? 1 : weighted / total, explain };
}
