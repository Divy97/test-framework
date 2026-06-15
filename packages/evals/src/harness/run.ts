import { createHash } from "node:crypto";
import { EVAL_SCHEMA_VERSION } from "../schema/common.js";
import type { EvalResult, FixtureResult } from "../schema/result.js";
import type { Rubric, Thresholds } from "../schema/rubric.js";
import type { DiscoveredFixture } from "./discover.js";
import { scoreCandidate } from "./score-candidate.js";

function sha256(text: string): string {
	return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/** Fingerprint of the rubric + thresholds so a config change shows in the result. */
function rubricFingerprint(rubric: Rubric, thresholds: Thresholds): string {
	return sha256(
		JSON.stringify(
			{ rubric, thresholds },
			Object.keys({ rubric, thresholds }).sort(),
		),
	);
}

/** Fingerprint of the raw committed corpus bytes, in deterministic order. */
function corpusFingerprint(fixtures: readonly DiscoveredFixture[]): string {
	const parts: string[] = [];
	for (const fixture of fixtures) {
		parts.push(fixture.fixture.fixtureId, fixture.rawFixtureText);
		for (const candidate of fixture.candidates) {
			parts.push(
				candidate.arm,
				candidate.rawGraphText,
				candidate.rawAnnotationText,
			);
		}
	}
	return sha256(parts.join(""));
}

/**
 * Pure scoring of a discovered corpus into a byte-stable EvalResult. Fixtures and
 * candidates are already in deterministic order from discovery.
 */
export function scoreCorpus(
	fixtures: readonly DiscoveredFixture[],
	rubric: Rubric,
	thresholds: Thresholds,
): EvalResult {
	const fixtureResults: FixtureResult[] = fixtures.map((discovered) => ({
		fixtureId: discovered.fixture.fixtureId,
		category: discovered.fixture.category,
		candidates: discovered.candidates.map((candidate) =>
			scoreCandidate({
				arm: candidate.arm,
				fixture: discovered.fixture,
				annotation: candidate.annotation,
				graphInput: candidate.graphInput,
				leakageText: candidate.leakageText,
				rubric,
				thresholds,
			}),
		),
	}));

	return {
		evalSchemaVersion: EVAL_SCHEMA_VERSION,
		rubricFingerprint: rubricFingerprint(rubric, thresholds),
		corpusFingerprint: corpusFingerprint(fixtures),
		fixtures: fixtureResults,
	};
}
