import type { Provenance } from "@test-framework/qa-engine";
import type { CandidateContext, DimensionResult } from "../join.js";

/** A claim is evidence-bearing when it is explicit/inferred and cites evidence. */
function citesEvidence(provenance: Provenance): boolean {
	return (
		(provenance.kind === "explicit" || provenance.kind === "inferred") &&
		provenance.evidenceIds.length >= 1
	);
}

function citesSuppliedGroundTruth(
	ctx: CandidateContext,
	provenance: Provenance,
): boolean {
	const evidenceById = new Map(
		ctx.graph.evidence.map((evidence) => [evidence.id, evidence]),
	);
	const suppliedByKey = new Map(
		ctx.fixture.suppliedSources.map((source) => [source.sourceKey, source]),
	);
	const sameLocator = (left: unknown, right: unknown): boolean =>
		JSON.stringify(left) === JSON.stringify(right);

	return provenance.evidenceIds.every((evidenceId) => {
		const evidence = evidenceById.get(evidenceId);
		if (evidence === undefined) return false;
		const sourceAnnotation = ctx.sourceAnnoById.get(evidence.sourceId);
		if (sourceAnnotation === undefined) return false;
		const suppliedSource = suppliedByKey.get(sourceAnnotation.sourceKey);
		if (suppliedSource?.supplied !== true) return false;
		if (suppliedSource.locators === undefined) return true;
		return suppliedSource.locators.some((locator) =>
			sameLocator(locator, evidence.locator),
		);
	});
}

/**
 * Evidence correctness: of all evidence-bearing claims (requirements, cases,
 * assertions), the fraction whose citation actually supports the claim. The
 * structural "explicit cites a supplied source" rule is already enforced by
 * `validateTestGraph`; the Annotation supplies the one semantic judgment of whether
 * the cited evidence supports the claim.
 */
export function scoreEvidenceCorrectness(
	ctx: CandidateContext,
): DimensionResult {
	const explain: string[] = [];
	let total = 0;
	let correct = 0;

	const consider = (
		id: string,
		provenance: Provenance,
		flag: boolean | undefined,
	): void => {
		if (!citesEvidence(provenance)) return;
		total += 1;
		if (!citesSuppliedGroundTruth(ctx, provenance)) {
			explain.push(`evidence: ${id} citation is not in supplied ground truth`);
		} else if (flag === false) {
			explain.push(`evidence: ${id} citation does not support the claim`);
		} else {
			correct += 1;
		}
	};

	for (const requirement of ctx.graph.requirements) {
		consider(
			requirement.id,
			requirement.provenance,
			ctx.requirementAnnoById.get(requirement.id)?.supportsCitedEvidence,
		);
	}
	for (const testCase of ctx.graph.testCases) {
		consider(
			testCase.id,
			testCase.provenance,
			ctx.caseAnnoById.get(testCase.id)?.supportsCitedEvidence,
		);
	}
	for (const assertion of ctx.graph.assertions) {
		consider(
			assertion.id,
			assertion.provenance,
			ctx.assertionAnnoById.get(assertion.id)?.supportsCitedEvidence,
		);
	}

	return { score: total === 0 ? 1 : correct / total, explain };
}
