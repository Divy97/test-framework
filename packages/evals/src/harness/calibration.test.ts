import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEvalResult, serializeEvalResult } from "../report/json.js";
import type { CandidateResult, EvalResult } from "../schema/result.js";
import { compareToBaseline } from "./regression.js";

/**
 * Baseline regression-gate tests.
 *
 * Per ADR-0012 (reposition the moat: reliability/auditability over raw plan
 * quality), quality-superiority is intentionally NO LONGER asserted here. The
 * first real-model recording showed the qa-engine arm loses to a raw prompt on
 * every recorded fixture (e.g. `unsupported-assumptions/qa-engine` hard-fails;
 * raw-model out-scores qa-engine on `authz-api`, `ui-form-validation`, and
 * `unsupported-assumptions`). The earlier assertions that qa-engine beats
 * host-only/raw-model on average, and that every qa-engine candidate passes with
 * no hard-fail, are disproven by the recorded corpus and have been removed —
 * keeping them would be both failing and dishonest.
 *
 * The reliability/refinement/provenance gate that ADR-0012 makes the real moat is
 * a FUTURE workstream and is not asserted here. What this file pins is the
 * still-valid behavioral contract of the regression gate: scoring is
 * deterministic/byte-stable, the recorded arms are present and parse, and a NEW
 * hard-fail versus the accepted baseline is reported as a regression by
 * `compareToBaseline`.
 */

const baselineUrl = new URL(
	"../../test/fixtures/baseline/results.json",
	import.meta.url,
);

async function loadBaseline(): Promise<EvalResult> {
	return parseEvalResult(
		JSON.parse(await readFile(fileURLToPath(baselineUrl), "utf8")),
	);
}

function armCandidates(result: EvalResult, arm: string): CandidateResult[] {
	return result.fixtures.flatMap((fixture) =>
		fixture.candidates.filter((candidate) => candidate.arm === arm),
	);
}

test("the accepted baseline parses and carries every arm", async () => {
	const baseline = await loadBaseline();

	// No quality-superiority claim (ADR-0012). Only that each arm we record is
	// present and parses, so the regression gate has something to compare against.
	for (const arm of ["raw-model", "host-only", "qa-engine"]) {
		assert.ok(
			armCandidates(baseline, arm).length > 0,
			`expected at least one ${arm} candidate in the baseline`,
		);
	}
});

test("serializing the accepted baseline is byte-stable", async () => {
	const baseline = await loadBaseline();

	// Determinism is part of the repositioned moat (ADR-0012): the artifact is a
	// byte-stable canonical record, not a chat reply. Re-serializing the parsed
	// baseline must reproduce the committed bytes exactly.
	const committed = await readFile(fileURLToPath(baselineUrl), "utf8");
	assert.equal(serializeEvalResult(baseline), committed);
});

test("a new hard-fail vs baseline is reported as a regression", async () => {
	const baseline = await loadBaseline();

	// Synthesize an Eval Run identical to the baseline except that a previously
	// passing qa-engine candidate now carries a Hard-Fail the baseline lacked.
	const current = structuredClone(baseline);
	const fixture = current.fixtures.find((f) =>
		f.candidates.some((c) => c.arm === "qa-engine" && !c.hardFail),
	);
	const candidate = fixture?.candidates.find(
		(c) => c.arm === "qa-engine" && !c.hardFail,
	);
	if (fixture === undefined || candidate === undefined) {
		throw new Error("no passing qa-engine candidate to regress");
	}
	candidate.hardFail = true;
	candidate.verdict = "FAIL";
	candidate.hardFailReasons = ["HF-UNSUPPORTED-RATE"];

	const report = compareToBaseline(current, baseline, 0, 0);
	assert.ok(
		report.regressions.some(
			(line) =>
				line.includes(`${fixture.fixtureId}/qa-engine`) &&
				line.includes("HF-UNSUPPORTED-RATE"),
		),
		`expected a new-hard-fail regression, got: ${JSON.stringify(report.regressions)}`,
	);
});
