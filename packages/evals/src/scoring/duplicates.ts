import type { Assertion, TestCase } from "@test-framework/qa-engine";
import {
	assertionsByCase,
	type CandidateContext,
	type DimensionResult,
} from "../join.js";
import { targetKey } from "../target.js";
import { isPresenceMatcher } from "./matcher.js";

function sorted(values: readonly string[]): string[] {
	return [...values].sort();
}

function assertionSignature(assertion: Assertion): string {
	return `${assertion.subject}${assertion.matcher}${targetKey(assertion.observationPoint)}`;
}

/**
 * Structural signature of a case. Folding the consumed data requirements in keeps
 * legitimately parameterized variants (same shape, different data) from colliding
 * as duplicates — the accepted-false-positive mitigation.
 */
function caseSignature(
	testCase: TestCase,
	assertions: readonly Assertion[],
): string {
	const actorKey = `${testCase.actor.role}|${testCase.actor.authentication}|${sorted(testCase.actor.permissions).join(",")}`;
	const assertionKey = assertions.map(assertionSignature).sort().join(";");
	return [
		testCase.type,
		targetKey(testCase.target),
		actorKey,
		sorted(testCase.requirementIds).join(","),
		sorted(testCase.consumesDataRequirementIds).join(","),
		assertionKey,
	].join("");
}

function isLowValue(assertions: readonly Assertion[]): boolean {
	return assertions.length === 0 || assertions.every(isPresenceMatcher);
}

/**
 * Penalizes duplicate and low-value cases. A case is "bad" if it is a non-first
 * duplicate OR low-value; counting distinct bad cases keeps the score in [0,1] even
 * when a case is both.
 */
export function scoreDuplicateLowValue(ctx: CandidateContext): DimensionResult {
	const cases = ctx.graph.testCases;
	if (cases.length === 0) return { score: 1, explain: [] };

	const byCase = assertionsByCase(ctx.graph);
	const seenSignatures = new Set<string>();
	const bad = new Set<string>();
	const explain: string[] = [];

	for (const testCase of cases) {
		const assertions = byCase.get(testCase.id) ?? [];
		const signature = caseSignature(testCase, assertions);
		if (seenSignatures.has(signature)) {
			bad.add(testCase.id);
			explain.push(`duplicate: ${testCase.id} repeats an earlier case`);
		}
		seenSignatures.add(signature);
		if (isLowValue(assertions)) {
			if (!bad.has(testCase.id)) {
				explain.push(
					`low-value: ${testCase.id} has only presence/no assertions`,
				);
			}
			bad.add(testCase.id);
		}
	}

	return { score: 1 - bad.size / cases.length, explain };
}
