import {
	assertionsByCase,
	type CandidateContext,
	type DimensionResult,
	stepsByCase,
} from "../join.js";

function stepsAreContiguous(orders: readonly number[]): boolean {
	const sorted = [...orders].sort((a, b) => a - b);
	return sorted.every((order, index) => order === index + 1);
}

/**
 * Fraction of cases that are structurally V2-compilable: ready automation, at
 * least one assertion, a non-generic target, and contiguous steps. (Most of these
 * are already guaranteed for a valid graph; computed here as an explicit ratio.)
 */
export function scoreExecutionReadiness(
	ctx: CandidateContext,
): DimensionResult {
	const cases = ctx.graph.testCases;
	if (cases.length === 0) return { score: 1, explain: [] };

	const assertionMap = assertionsByCase(ctx.graph);
	const stepMap = stepsByCase(ctx.graph);
	const explain: string[] = [];
	let ready = 0;

	for (const testCase of cases) {
		const assertions = assertionMap.get(testCase.id) ?? [];
		const steps = stepMap.get(testCase.id) ?? [];
		const isReady =
			testCase.automation.readiness === "ready" &&
			testCase.automation.blockers.length === 0 &&
			assertions.length >= 1 &&
			testCase.target.kind !== "generic" &&
			stepsAreContiguous(steps.map((step) => step.order));
		if (isReady) {
			ready += 1;
		} else {
			explain.push(`readiness: ${testCase.id} is not execution-ready`);
		}
	}

	return { score: ready / cases.length, explain };
}
