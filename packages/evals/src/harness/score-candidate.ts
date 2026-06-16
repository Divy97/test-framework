import { validateTestGraph } from "@test-framework/qa-engine";
import { checkAnnotationIntegrity } from "../integrity.js";
import { buildContext } from "../join.js";
import { round4 } from "../number.js";
import type { Annotation } from "../schema/annotation.js";
import {
	type Arm,
	DIMENSION_KEYS,
	type DimensionKey,
	type HardFailCode,
} from "../schema/common.js";
import type { Fixture } from "../schema/fixture.js";
import type { CandidateResult, DimensionScores } from "../schema/result.js";
import type { Rubric, Thresholds } from "../schema/rubric.js";
import { aggregateOverall } from "../scoring/aggregate.js";
import { scoreAssertionQuality } from "../scoring/assertions.js";
import { scoreScenarioCoverage } from "../scoring/coverage.js";
import { scoreDuplicateLowValue } from "../scoring/duplicates.js";
import { scoreEvidenceCorrectness } from "../scoring/evidence.js";
import { detectLeakage } from "../scoring/leakage.js";
import { scoreProvenanceAccuracy } from "../scoring/provenance.js";
import { scoreExecutionReadiness } from "../scoring/readiness.js";
import { scoreRecall } from "../scoring/recall.js";
import { scoreTraceability } from "../scoring/traceability.js";
import { scoreUnsupported, unsupportedStats } from "../scoring/unsupported.js";

export type ScoreCandidateInput = {
	arm: Arm;
	fixture: Fixture;
	annotation: Annotation;
	graphInput: unknown;
	leakageText: string;
	rubric: Rubric;
	thresholds: Thresholds;
};

function zeroDimensions(): DimensionScores {
	return Object.fromEntries(
		DIMENSION_KEYS.map((key) => [key, 0]),
	) as DimensionScores;
}

function compareCodeUnits(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/**
 * Scores one Candidate against its fixture. Blocking gate failures (invalid graph,
 * annotation-integrity, leakage) zero the dimensions because nothing reliable can
 * be measured. Scored gate failures (unsupported rate, contradicts-truth) keep the
 * computed dimensions for diagnostics but force `FAIL`.
 */
export function scoreCandidate(input: ScoreCandidateInput): CandidateResult {
	const { arm, fixture, annotation, rubric, thresholds } = input;

	const leakage = detectLeakage(input.leakageText);
	const validation = validateTestGraph(input.graphInput);
	const valid = validation.valid;
	const graph = validation.valid ? validation.graph : null;
	const validationFindings = validation.valid ? [] : validation.findings;
	const integrity = checkAnnotationIntegrity(fixture, annotation, arm, graph);

	const hardFailReasons: HardFailCode[] = [];
	if (!valid) hardFailReasons.push("HF-INVALID-GRAPH");
	if (integrity.length > 0) hardFailReasons.push("HF-ANNOTATION-INTEGRITY");
	if (leakage.length > 0) hardFailReasons.push("HF-LEAKAGE");

	const blocked = graph === null || integrity.length > 0 || leakage.length > 0;

	let dimensions = zeroDimensions();
	const explain: string[] = [];

	if (blocked) {
		for (const finding of validationFindings) {
			explain.push(`validation: ${finding.code} ${finding.path}`);
		}
		for (const issue of integrity) explain.push(`integrity: ${issue}`);
		for (const hit of leakage) explain.push(`leakage: ${hit}`);
	} else {
		const ctx = buildContext(fixture, graph, annotation, rubric);
		const dimensionResults: Record<
			DimensionKey,
			{ score: number; explain: string[] }
		> = {
			requirementRecall: scoreRecall(ctx),
			traceability: scoreTraceability(ctx),
			scenarioCoverage: scoreScenarioCoverage(ctx),
			unsupportedClaims: scoreUnsupported(ctx),
			provenanceAccuracy: scoreProvenanceAccuracy(ctx),
			duplicateLowValue: scoreDuplicateLowValue(ctx),
			assertionQuality: scoreAssertionQuality(ctx),
			executionReadiness: scoreExecutionReadiness(ctx),
			evidenceCorrectness: scoreEvidenceCorrectness(ctx),
		};

		dimensions = Object.fromEntries(
			DIMENSION_KEYS.map((key) => [key, round4(dimensionResults[key].score)]),
		) as DimensionScores;
		for (const key of DIMENSION_KEYS) {
			for (const line of dimensionResults[key].explain) explain.push(line);
		}

		const stats = unsupportedStats(ctx);
		if (stats.rate > thresholds.maxUnsupportedRate) {
			hardFailReasons.push("HF-UNSUPPORTED-RATE");
		}
		if (stats.contradicts > 0) hardFailReasons.push("HF-CONTRADICTS-TRUTH");
	}

	const overall = blocked ? 0 : aggregateOverall(dimensions, rubric);
	const hardFail = hardFailReasons.length > 0;
	const verdict = hardFail
		? "FAIL"
		: overall >= thresholds.minOverall
			? "PASS"
			: "FAIL";

	return {
		arm,
		recordKind: annotation.recordKind,
		valid,
		validationFindings,
		hardFail,
		hardFailReasons: [...hardFailReasons].sort(compareCodeUnits),
		dimensions,
		overall,
		verdict,
		explain: explain.sort(compareCodeUnits),
	};
}
