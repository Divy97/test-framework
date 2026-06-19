import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEvalResult } from "../report/json.js";
import type { CandidateResult, EvalResult } from "../schema/result.js";
import { compareToBaseline } from "./regression.js";

/**
 * Calibration / moat regression tests. These pin the structural release
 * properties of the committed baseline that must hold across the calibration
 * commit — they make no assumption about `recordKind`, so they keep holding once
 * the raw-model and qa-engine arms become `recorded` (workstream #9 Slice 3/4).
 *
 * The threshold-calibration assertions (`minOverall > 0`, a recorded qa-engine
 * arm strictly beating a recorded raw-model arm) are added in the calibration
 * commit (Slice 4), after the live recording exists; this file deliberately does
 * not assert them yet so the baseline stays byte-stable.
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

function mean(values: number[]): number {
	assert.ok(values.length > 0, "cannot average an empty arm");
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

test("the moat holds: qa-engine beats host-only and raw-model on average", async () => {
	const baseline = await loadBaseline();

	const qaEngine = mean(
		armCandidates(baseline, "qa-engine").map((c) => c.overall),
	);
	const hostOnly = mean(
		armCandidates(baseline, "host-only").map((c) => c.overall),
	);
	const rawModel = mean(
		armCandidates(baseline, "raw-model").map((c) => c.overall),
	);

	assert.ok(
		qaEngine > hostOnly,
		`qa-engine avg ${qaEngine} not above host-only avg ${hostOnly}`,
	);
	assert.ok(
		qaEngine > rawModel,
		`qa-engine avg ${qaEngine} not above raw-model avg ${rawModel}`,
	);
});

test("every qa-engine candidate passes with no hard-fail", async () => {
	const baseline = await loadBaseline();
	const qaEngine = armCandidates(baseline, "qa-engine");

	assert.ok(qaEngine.length > 0, "expected at least one qa-engine candidate");
	for (const candidate of qaEngine) {
		const fixture = baseline.fixtures.find((f) =>
			f.candidates.includes(candidate),
		);
		const label = `${fixture?.fixtureId ?? "?"}/qa-engine`;
		assert.equal(candidate.verdict, "PASS", `${label} did not PASS`);
		assert.equal(candidate.hardFail, false, `${label} hard-failed`);
		assert.deepEqual(
			candidate.hardFailReasons,
			[],
			`${label} carries hard-fail reasons`,
		);
	}
});

test("failure-rate is gated: a new hard-fail vs baseline is a regression", async () => {
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
