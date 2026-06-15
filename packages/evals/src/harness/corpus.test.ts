import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { serializeEvalResult } from "../report/json.js";
import { rubricSchema, thresholdsSchema } from "../schema/rubric.js";
import { discoverCorpus } from "./discover.js";
import { scoreCorpus } from "./run.js";

const root = new URL("../../", import.meta.url);
const corpusDir = fileURLToPath(new URL("test/fixtures/corpus", root));

async function readJson(relative: string): Promise<unknown> {
	return JSON.parse(
		await readFile(fileURLToPath(new URL(relative, root)), "utf8"),
	);
}

async function loadConfig() {
	return {
		rubric: rubricSchema.parse(
			await readJson("test/fixtures/eval-config/rubric.json"),
		),
		thresholds: thresholdsSchema.parse(
			await readJson("test/fixtures/eval-config/thresholds.json"),
		),
	};
}

test("scoring the committed corpus reproduces the accepted baseline byte-for-byte", async () => {
	const { rubric, thresholds } = await loadConfig();
	const fixtures = await discoverCorpus(corpusDir);
	const text = serializeEvalResult(scoreCorpus(fixtures, rubric, thresholds));
	const baseline = await readFile(
		fileURLToPath(new URL("test/fixtures/baseline/results.json", root)),
		"utf8",
	);
	assert.equal(text, baseline);
});

test("repeated runs are byte-identical", async () => {
	const { rubric, thresholds } = await loadConfig();
	const fixtures = await discoverCorpus(corpusDir);
	const first = serializeEvalResult(scoreCorpus(fixtures, rubric, thresholds));
	const second = serializeEvalResult(scoreCorpus(fixtures, rubric, thresholds));
	assert.equal(first, second);
});

test("all eight required fixtures are present", async () => {
	const fixtures = await discoverCorpus(corpusDir);
	assert.equal(fixtures.length, 8);
});

test("weak arms score materially below the strong arm in every fixture", async () => {
	const { rubric, thresholds } = await loadConfig();
	const result = scoreCorpus(
		await discoverCorpus(corpusDir),
		rubric,
		thresholds,
	);
	for (const fixture of result.fixtures) {
		const byArm = new Map(fixture.candidates.map((c) => [c.arm, c]));
		const strong = byArm.get("qa-engine");
		const weak = byArm.get("raw-model");
		if (strong === undefined || weak === undefined)
			throw new Error(fixture.fixtureId);
		// The strong arm passes; the weak arm either hard-fails or scores well below it.
		assert.equal(strong.verdict, "PASS", fixture.fixtureId);
		const weakIsWorse = weak.hardFail || weak.overall <= strong.overall - 20;
		assert.ok(weakIsWorse, `${fixture.fixtureId}: weak not materially worse`);
	}
});

test("unsupported claims cannot be hidden by a high-looking aggregate", async () => {
	const { rubric, thresholds } = await loadConfig();
	const result = scoreCorpus(
		await discoverCorpus(corpusDir),
		rubric,
		thresholds,
	);
	const fixture = result.fixtures.find(
		(f) => f.fixtureId === "unsupported-assumptions",
	);
	const weak = fixture?.candidates.find((c) => c.arm === "raw-model");
	if (weak === undefined) throw new Error("missing arm");
	// Aggregate looks high, but the gate fails it on the unsupported ceiling.
	assert.ok(weak.overall > 80);
	assert.equal(weak.verdict, "FAIL");
	assert.ok(weak.hardFailReasons.includes("HF-UNSUPPORTED-RATE"));
});

test("invalid graphs fail with typed findings", async () => {
	const { rubric, thresholds } = await loadConfig();
	const result = scoreCorpus(
		await discoverCorpus(corpusDir),
		rubric,
		thresholds,
	);
	const invalid = result.fixtures
		.flatMap((f) => f.candidates)
		.filter((c) => !c.valid);
	assert.ok(invalid.length > 0);
	for (const candidate of invalid) {
		assert.ok(candidate.hardFailReasons.includes("HF-INVALID-GRAPH"));
		assert.ok(candidate.validationFindings.length > 0);
	}
});

test("a contradicts-truth claim hard-fails the evidence-conflict weak arm", async () => {
	const { rubric, thresholds } = await loadConfig();
	const result = scoreCorpus(
		await discoverCorpus(corpusDir),
		rubric,
		thresholds,
	);
	const weak = result.fixtures
		.find((f) => f.fixtureId === "evidence-conflict")
		?.candidates.find((c) => c.arm === "raw-model");
	assert.ok(weak?.hardFailReasons.includes("HF-CONTRADICTS-TRUTH"));
});
