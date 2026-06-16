import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEvalResult } from "../report/json.js";
import type { EvalResult } from "../schema/result.js";
import { compareToBaseline } from "./regression.js";

const baselineUrl = new URL(
	"../../test/fixtures/baseline/results.json",
	import.meta.url,
);

async function loadBaseline(): Promise<EvalResult> {
	return parseEvalResult(
		JSON.parse(await readFile(fileURLToPath(baselineUrl), "utf8")),
	);
}

test("a candidate identical to baseline reports no regression", async () => {
	const baseline = await loadBaseline();
	const report = compareToBaseline(baseline, baseline, 0, 0);
	assert.deepEqual(report.regressions, []);
});

test("an aggregate drop beyond tolerance is a regression", async () => {
	const baseline = await loadBaseline();
	const current = structuredClone(baseline);
	const candidate = current.fixtures[0]?.candidates[0];
	if (candidate === undefined) throw new Error("no candidate");
	candidate.overall = Math.max(0, candidate.overall - 10);
	const report = compareToBaseline(current, baseline, 0, 0);
	assert.ok(
		report.regressions.some((line) => line.includes("overall")) ||
			candidate.overall === 0,
	);
});

test("a new hard-fail is a regression", async () => {
	const baseline = await loadBaseline();
	const current = structuredClone(baseline);
	const candidate = current.fixtures[0]?.candidates.find((c) => !c.hardFail);
	if (candidate === undefined) throw new Error("no passing candidate");
	candidate.hardFail = true;
	candidate.hardFailReasons = ["HF-LEAKAGE"];
	const report = compareToBaseline(current, baseline, 0, 0);
	assert.ok(report.regressions.some((line) => line.includes("HF-LEAKAGE")));
});

test("removed coverage is a regression", async () => {
	const baseline = await loadBaseline();
	const current = structuredClone(baseline);
	current.fixtures = current.fixtures.slice(1);
	const report = compareToBaseline(current, baseline, 0, 0);
	assert.ok(
		report.regressions.some((line) => line.includes("coverage removed")),
	);
});

test("unsupported regression uses its own fractional tolerance", async () => {
	const baseline = await loadBaseline();
	const current = structuredClone(baseline);
	const candidate = current.fixtures[0]?.candidates[0];
	if (candidate === undefined) throw new Error("no candidate");
	candidate.dimensions.unsupportedClaims -= 0.01;

	const report = compareToBaseline(current, baseline, 2, 0);
	assert.ok(
		report.regressions.some((line) => line.includes("unsupported claims rose")),
	);
});
