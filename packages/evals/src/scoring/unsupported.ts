import type { CandidateContext, DimensionResult } from "../join.js";

export type UnsupportedStats = {
	invented: number;
	contradicts: number;
	claims: number;
	rate: number;
};

/**
 * Counts penalized extra claims over the denominator of all Candidate claims
 * (requirements + cases). Adding shallow cases grows the denominator AND the risk
 * of inventions, so volume cannot hide unsupported claims behind it.
 * `supported-inferred` extras are legitimate QA value and are not penalized.
 */
export function unsupportedStats(ctx: CandidateContext): UnsupportedStats {
	const entries = [
		...ctx.annotation.requirementAnnotations,
		...ctx.annotation.caseAnnotations,
	];
	let invented = 0;
	let contradicts = 0;
	for (const entry of entries) {
		if (entry.verdict !== "extra") continue;
		if (entry.classification === "unsupported-invented") invented += 1;
		if (entry.classification === "contradicts-truth") contradicts += 1;
	}
	const claims = entries.length;
	const rate = claims === 0 ? 0 : (invented + contradicts) / claims;
	return { invented, contradicts, claims, rate };
}

export function scoreUnsupported(ctx: CandidateContext): DimensionResult {
	const stats = unsupportedStats(ctx);
	const explain: string[] = [];
	if (stats.invented > 0) {
		explain.push(`unsupported: ${stats.invented} invented claim(s)`);
	}
	if (stats.contradicts > 0) {
		explain.push(
			`unsupported: ${stats.contradicts} contradicts-truth claim(s)`,
		);
	}
	return { score: 1 - stats.rate, explain };
}
