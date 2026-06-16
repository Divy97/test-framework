import {
	assertionsByCase,
	type CandidateContext,
	type DimensionResult,
} from "../join.js";
import { isSpecificAssertion } from "./matcher.js";

/**
 * Assertion specificity and observability: mean over cases of the fraction of
 * assertions that are specific (non-presence matcher on a non-generic target). A
 * case with no assertions scores 0; it is also flagged low-value by the duplicate
 * dimension.
 */
export function scoreAssertionQuality(ctx: CandidateContext): DimensionResult {
	const cases = ctx.graph.testCases;
	if (cases.length === 0) return { score: 1, explain: [] };

	const byCase = assertionsByCase(ctx.graph);
	const explain: string[] = [];
	let totalCaseScore = 0;

	for (const testCase of cases) {
		const assertions = byCase.get(testCase.id) ?? [];
		if (assertions.length === 0) {
			explain.push(`assertions: ${testCase.id} has no assertions`);
			continue;
		}
		const specific = assertions.filter(isSpecificAssertion).length;
		const caseScore = specific / assertions.length;
		totalCaseScore += caseScore;
		if (caseScore < 1) {
			explain.push(
				`assertions: ${testCase.id} ${specific}/${assertions.length} specific`,
			);
		}
	}

	return { score: totalCaseScore / cases.length, explain };
}
