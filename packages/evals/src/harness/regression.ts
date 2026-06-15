import type { CandidateResult, EvalResult } from "../schema/result.js";

export type RegressionReport = { regressions: string[]; notes: string[] };

const SEP = "\u001f";

function key(fixtureId: string, arm: string): string {
	return `${fixtureId}${SEP}${arm}`;
}

function label(candidateKey: string): string {
	return candidateKey.replace(SEP, "/");
}

function indexCandidates(result: EvalResult): Map<string, CandidateResult> {
	const byKey = new Map<string, CandidateResult>();
	for (const fixture of result.fixtures) {
		for (const candidate of fixture.candidates) {
			byKey.set(key(fixture.fixtureId, candidate.arm), candidate);
		}
	}
	return byKey;
}

/**
 * Compares an Eval Run to the accepted Baseline. A regression is: an aggregate drop
 * beyond `maxRegressionDelta`, a drop in the unsupported-claims dimension beyond it
 * (unsupported claims rose), a new Hard-Fail the Baseline did not record, or a
 * Baseline `(fixture, arm)` that is now missing. New candidates and rubric changes
 * are reported as notes, not regressions.
 */
export function compareToBaseline(
	current: EvalResult,
	baseline: EvalResult,
	maxRegressionDelta: number,
): RegressionReport {
	const regressions: string[] = [];
	const notes: string[] = [];

	if (current.rubricFingerprint !== baseline.rubricFingerprint) {
		notes.push(
			"note: rubric/thresholds changed since the baseline was accepted",
		);
	}

	const currentByKey = indexCandidates(current);
	const baselineByKey = indexCandidates(baseline);

	for (const [candidateKey, base] of baselineByKey) {
		const now = currentByKey.get(candidateKey);
		const name = label(candidateKey);
		if (now === undefined) {
			regressions.push(`${name}: coverage removed since baseline`);
			continue;
		}
		if (now.overall < base.overall - maxRegressionDelta) {
			regressions.push(
				`${name}: overall ${now.overall} < baseline ${base.overall} (delta>${maxRegressionDelta})`,
			);
		}
		if (
			now.dimensions.unsupportedClaims <
			base.dimensions.unsupportedClaims - maxRegressionDelta
		) {
			regressions.push(
				`${name}: unsupported claims rose (${now.dimensions.unsupportedClaims} < ${base.dimensions.unsupportedClaims})`,
			);
		}
		const baseReasons = new Set(base.hardFailReasons);
		for (const reason of now.hardFailReasons) {
			if (!baseReasons.has(reason)) {
				regressions.push(`${name}: new hard-fail ${reason}`);
			}
		}
	}

	for (const candidateKey of currentByKey.keys()) {
		if (!baselineByKey.has(candidateKey)) {
			notes.push(`note: ${label(candidateKey)} is new since baseline`);
		}
	}

	return { regressions: regressions.sort(), notes: notes.sort() };
}
