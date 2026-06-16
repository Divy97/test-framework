import {
	type CandidateContext,
	type DimensionResult,
	scenarioSatisfaction,
} from "../join.js";
import { itemWeight } from "../weight.js";

/** Risk-weighted scenario coverage with a {0, 0.5, 1} satisfaction ladder. */
export function scoreScenarioCoverage(ctx: CandidateContext): DimensionResult {
	const satisfaction = scenarioSatisfaction(ctx);
	const explain: string[] = [];
	let weighted = 0;
	let total = 0;

	for (const scenario of ctx.fixture.expectedScenarios) {
		const weight = itemWeight(ctx.rubric, scenario.risk, scenario.priority);
		total += weight;
		const credit = satisfaction.get(scenario.truthKey) ?? 0;
		weighted += weight * credit;
		if (credit < 1) {
			explain.push(
				`coverage: ${scenario.truthKey} sat=${credit} (w=${weight})`,
			);
		}
	}

	return { score: total === 0 ? 1 : weighted / total, explain };
}
