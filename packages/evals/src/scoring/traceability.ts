import {
	type CandidateContext,
	type DimensionResult,
	requirementCoverage,
	testedRequirementKeys,
} from "../join.js";
import { itemWeight } from "../weight.js";

/**
 * Of the requirements a Candidate covered, the risk-weighted fraction that an
 * actual case exercises. A plan that lists a requirement but writes no case for it
 * scores its weight here as zero. Empty coverage scores 1 (recall already penalizes
 * it) to avoid a 0/0.
 */
export function scoreTraceability(ctx: CandidateContext): DimensionResult {
	const coverage = requirementCoverage(ctx);
	const tested = testedRequirementKeys(ctx);
	const explain: string[] = [];
	let coveredWeight = 0;
	let testedWeight = 0;

	for (const requirement of ctx.fixture.expectedRequirements) {
		const cover = coverage.get(requirement.truthKey) ?? "missed";
		if (cover === "missed") continue;
		const weight = itemWeight(
			ctx.rubric,
			requirement.risk,
			requirement.priority,
		);
		coveredWeight += weight;
		if (tested.has(requirement.truthKey)) {
			testedWeight += weight;
		} else {
			explain.push(
				`traceability: ${requirement.truthKey} covered but untested`,
			);
		}
	}

	return {
		score: coveredWeight === 0 ? 1 : testedWeight / coveredWeight,
		explain,
	};
}
