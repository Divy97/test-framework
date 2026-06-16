import type { CandidateContext, DimensionResult } from "../join.js";

/**
 * Explicit/inferred/assumption classification accuracy over mapped Candidate
 * requirements: does the graph provenance kind match the Ground Truth's expected
 * strength for any requirement key it maps to?
 */
export function scoreProvenanceAccuracy(
	ctx: CandidateContext,
): DimensionResult {
	const expectedStrengthByKey = new Map<string, string>();
	for (const requirement of ctx.fixture.expectedRequirements) {
		expectedStrengthByKey.set(
			requirement.truthKey,
			requirement.expectedStrength,
		);
	}
	const requirementById = new Map(
		ctx.graph.requirements.map((requirement) => [requirement.id, requirement]),
	);

	const explain: string[] = [];
	let total = 0;
	let correct = 0;

	for (const item of ctx.annotation.requirementAnnotations) {
		if (item.verdict !== "maps") continue;
		const requirement = requirementById.get(item.requirementId);
		if (requirement === undefined) continue;
		total += 1;
		const expected = item.truthKeys
			.map((key) => expectedStrengthByKey.get(key))
			.filter((value): value is string => value !== undefined);
		if (expected.includes(requirement.provenance.kind)) {
			correct += 1;
		} else {
			explain.push(
				`provenance: ${item.requirementId} is ${requirement.provenance.kind}, expected ${expected.join("|")}`,
			);
		}
	}

	return { score: total === 0 ? 1 : correct / total, explain };
}
