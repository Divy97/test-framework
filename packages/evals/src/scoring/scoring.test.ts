import assert from "node:assert/strict";
import test from "node:test";
import type { AnnoSpec, GraphDraft } from "../corpus/builders.js";
import {
	baseAnno,
	baseDraft,
	baseFixture,
	makeContext,
	scoreOne,
} from "../test-helpers.js";
import { scoreAssertionQuality } from "./assertions.js";
import { scoreScenarioCoverage } from "./coverage.js";
import { scoreDuplicateLowValue } from "./duplicates.js";
import { scoreEvidenceCorrectness } from "./evidence.js";
import { detectLeakage } from "./leakage.js";
import { scoreProvenanceAccuracy } from "./provenance.js";
import { scoreRecall } from "./recall.js";
import { scoreTraceability } from "./traceability.js";
import { unsupportedStats } from "./unsupported.js";

const anon = {
	role: "user",
	authentication: "anonymous" as const,
	permissions: [] as string[],
};

function shallowExtraCase(ref: string): GraphDraft["cases"][number] {
	return {
		ref,
		title: `extra ${ref}`,
		objective: "extra",
		type: "positive",
		priority: "p3",
		risk: "low",
		riskRationale: "extra",
		strength: "explicit",
		evidenceRefs: ["e1"],
		requirementRefs: ["a"],
		qualityTags: [],
		actor: anon,
		target: { kind: "api", method: "GET", path: "/a" },
		steps: [
			{
				description: "call",
				action: { kind: "request", method: "GET", path: "/a" },
				strength: "explicit",
				evidenceRefs: ["e1"],
			},
		],
		assertions: [
			{
				ref: `${ref}a`,
				subject: "status",
				observationPoint: { kind: "api", method: "GET", path: "/a" },
				matcher: "statusCode",
				expected: 200,
				strength: "explicit",
				evidenceRefs: ["e1"],
				stepRef: "1",
			},
		],
	};
}

// --- Recall: volume cannot inflate it ------------------------------------

test("recall is identical whether 1 case or many cover the same truth", () => {
	const lean = makeContext(baseFixture(), baseDraft(), baseAnno());
	const fat = makeContext(
		baseFixture(),
		baseDraft({
			cases: [
				...baseDraft().cases,
				shallowExtraCase("x1"),
				shallowExtraCase("x2"),
				shallowExtraCase("x3"),
			],
		}),
		baseAnno({
			cases: [
				{ ref: "c1", map: { keys: ["scn:a"], satisfaction: "full" } },
				{
					ref: "x1",
					extra: { classification: "supported-inferred", reason: "dup" },
				},
				{
					ref: "x2",
					extra: { classification: "supported-inferred", reason: "dup" },
				},
				{
					ref: "x3",
					extra: { classification: "supported-inferred", reason: "dup" },
				},
			],
		}),
	);
	assert.equal(scoreRecall(lean).score, 1);
	assert.equal(scoreRecall(fat).score, scoreRecall(lean).score);
});

test("recall gives half credit for partial coverage", () => {
	const ctx = makeContext(
		baseFixture(),
		baseDraft(),
		baseAnno({
			requirements: [
				{
					ref: "a",
					map: { keys: ["req:a"], satisfaction: "partial", reason: "weak" },
				},
			],
		}),
	);
	assert.equal(scoreRecall(ctx).score, 0.5);
});

// --- Unsupported: volume of invented claims is penalized, not hidden -----

test("unsupported rate rises with invented claims and exceeds the ceiling", () => {
	const draft = baseDraft({
		requirements: [
			...baseDraft().requirements,
			{
				ref: "inv1",
				statement: "Invented 1.",
				kind: "functional",
				strength: "inferred",
				evidenceRefs: ["e1"],
				rationale: "spec-free",
				priority: "p3",
				risk: "low",
			},
			{
				ref: "inv2",
				statement: "Invented 2.",
				kind: "functional",
				strength: "inferred",
				evidenceRefs: ["e1"],
				rationale: "spec-free",
				priority: "p3",
				risk: "low",
			},
		],
	});
	const anno: AnnoSpec = baseAnno({
		requirements: [
			{ ref: "a", map: { keys: ["req:a"], satisfaction: "full" } },
			{
				ref: "inv1",
				extra: {
					classification: "unsupported-invented",
					reason: "not in spec",
				},
			},
			{
				ref: "inv2",
				extra: {
					classification: "unsupported-invented",
					reason: "not in spec",
				},
			},
		],
	});
	const stats = unsupportedStats(makeContext(baseFixture(), draft, anno));
	assert.equal(stats.invented, 2);
	assert.equal(stats.claims, 4); // 3 requirements + 1 case
	assert.equal(stats.rate, 0.5);
	assert.ok(stats.rate > 0.15);
});

test("supported-inferred extras are not penalized", () => {
	const draft = baseDraft({
		requirements: [
			...baseDraft().requirements,
			{
				ref: "ok",
				statement: "Reasonable inference.",
				kind: "functional",
				strength: "inferred",
				evidenceRefs: ["e1"],
				rationale: "grounded",
				priority: "p2",
				risk: "low",
			},
		],
	});
	const anno = baseAnno({
		requirements: [
			{ ref: "a", map: { keys: ["req:a"], satisfaction: "full" } },
			{
				ref: "ok",
				extra: { classification: "supported-inferred", reason: "grounded" },
			},
		],
	});
	assert.equal(
		unsupportedStats(makeContext(baseFixture(), draft, anno)).rate,
		0,
	);
});

// --- Duplicates and low value --------------------------------------------

test("identical cases are flagged as duplicates", () => {
	const dup = shallowExtraCase("d1");
	const dup2 = {
		...shallowExtraCase("d2"),
		assertions: dup.assertions.map((a) => ({ ...a, ref: "d2a" })),
	};
	const ctx = makeContext(
		baseFixture(),
		baseDraft({ cases: [dup, dup2] }),
		baseAnno({
			cases: [
				{ ref: "d1", map: { keys: ["scn:a"], satisfaction: "full" } },
				{
					ref: "d2",
					extra: { classification: "supported-inferred", reason: "dup" },
				},
			],
		}),
	);
	assert.ok(scoreDuplicateLowValue(ctx).score < 1);
});

test("a presence-only case is low value", () => {
	const presence: GraphDraft["cases"][number] = {
		ref: "p1",
		title: "presence",
		objective: "x",
		type: "positive",
		priority: "p2",
		risk: "low",
		riskRationale: "x",
		strength: "explicit",
		evidenceRefs: ["e1"],
		requirementRefs: ["a"],
		qualityTags: [],
		actor: anon,
		target: { kind: "ui", route: "/a" },
		steps: [
			{
				description: "open",
				action: { kind: "navigate", route: "/a" },
				strength: "explicit",
				evidenceRefs: ["e1"],
			},
		],
		assertions: [
			{
				ref: "p1a",
				subject: "page",
				observationPoint: { kind: "ui", route: "/a" },
				matcher: "visible",
				strength: "explicit",
				evidenceRefs: ["e1"],
				stepRef: "1",
			},
		],
	};
	const ctx = makeContext(
		baseFixture(),
		baseDraft({ cases: [presence] }),
		baseAnno({
			cases: [{ ref: "p1", map: { keys: ["scn:a"], satisfaction: "full" } }],
		}),
	);
	assert.equal(scoreDuplicateLowValue(ctx).score, 0);
	assert.equal(scoreAssertionQuality(ctx).score, 0);
});

// --- Provenance accuracy --------------------------------------------------

test("provenance accuracy penalizes a wrong strength", () => {
	// req:a expects explicit; mark the candidate requirement as an assumption.
	const draft = baseDraft({
		requirements: [
			{
				ref: "a",
				statement: "Requirement A.",
				kind: "functional",
				strength: "assumption",
				evidenceRefs: ["e1"],
				rationale: "guess",
				priority: "p1",
				risk: "medium",
			},
		],
	});
	assert.equal(
		scoreProvenanceAccuracy(makeContext(baseFixture(), draft, baseAnno()))
			.score,
		0,
	);
});

// --- Traceability ---------------------------------------------------------

test("a covered-but-untested requirement lowers traceability", () => {
	// req:a is covered via a requirement annotation, but the only case tests an
	// unrelated extra requirement, so req:a is stated yet never exercised.
	const draft = baseDraft({
		requirements: [
			{
				ref: "a",
				statement: "Requirement A.",
				kind: "functional",
				strength: "explicit",
				evidenceRefs: ["e1"],
				priority: "p1",
				risk: "medium",
			},
			{
				ref: "b",
				statement: "Other behavior.",
				kind: "functional",
				strength: "inferred",
				evidenceRefs: ["e1"],
				rationale: "extra",
				priority: "p2",
				risk: "low",
			},
		],
		cases: [
			{
				ref: "c1",
				title: "Tests B only",
				objective: "x",
				type: "positive",
				priority: "p1",
				risk: "medium",
				riskRationale: "x",
				strength: "explicit",
				evidenceRefs: ["e1"],
				requirementRefs: ["b"],
				qualityTags: [],
				actor: anon,
				target: { kind: "api", method: "GET", path: "/b" },
				steps: [
					{
						description: "call",
						action: { kind: "request", method: "GET", path: "/b" },
						strength: "explicit",
						evidenceRefs: ["e1"],
					},
				],
				assertions: [
					{
						ref: "c1a",
						subject: "s",
						observationPoint: { kind: "api", method: "GET", path: "/b" },
						matcher: "statusCode",
						expected: 200,
						strength: "explicit",
						evidenceRefs: ["e1"],
						stepRef: "1",
					},
				],
			},
		],
	});
	const anno = baseAnno({
		requirements: [
			{ ref: "a", map: { keys: ["req:a"], satisfaction: "full" } },
			{
				ref: "b",
				extra: { classification: "supported-inferred", reason: "extra" },
			},
		],
		cases: [
			{
				ref: "c1",
				extra: { classification: "supported-inferred", reason: "tests B" },
			},
		],
	});
	assert.equal(
		scoreTraceability(makeContext(baseFixture(), draft, anno)).score,
		0,
	);
});

// --- Coverage and evidence ------------------------------------------------

test("scenario coverage reflects the satisfaction ladder", () => {
	const ctx = makeContext(
		baseFixture(),
		baseDraft(),
		baseAnno({
			cases: [
				{
					ref: "c1",
					map: { keys: ["scn:a"], satisfaction: "partial", reason: "weak" },
				},
			],
		}),
	);
	assert.equal(scoreScenarioCoverage(ctx).score, 0.5);
});

test("evidence correctness drops when a citation is flagged unsupported", () => {
	const ctx = makeContext(
		baseFixture(),
		baseDraft(),
		baseAnno({ assertions: [{ ref: "c1a", supportsCitedEvidence: false }] }),
	);
	assert.ok(scoreEvidenceCorrectness(ctx).score < 1);
});

test("evidence correctness rejects sources absent from ground truth", () => {
	const draft = baseDraft({
		sources: [
			{ ref: "other", kind: "document", title: "Other", supplied: true },
		],
		evidence: [
			{
				ref: "e1",
				sourceRef: "other",
				kind: "statement",
				claim: "Requirement A holds.",
			},
		],
	});
	const ctx = makeContext(baseFixture(), draft, baseAnno());

	assert.equal(scoreEvidenceCorrectness(ctx).score, 0);
});

test("evidence correctness rejects locators outside ground truth", () => {
	const fixture = baseFixture();
	const source = fixture.suppliedSources[0];
	if (source === undefined) throw new Error("missing source");
	fixture.suppliedSources[0] = {
		...source,
		locators: [{ kind: "text", start: 0, end: 10 }],
	};
	const draft = baseDraft();
	const evidence = draft.evidence[0];
	if (evidence === undefined) throw new Error("missing evidence");
	draft.evidence[0] = {
		...evidence,
		locator: { kind: "text", start: 20, end: 30 },
	};

	assert.equal(
		scoreEvidenceCorrectness(makeContext(fixture, draft, baseAnno())).score,
		0,
	);
});

// --- Leakage --------------------------------------------------------------

test("leakage detector matches real secret shapes and ignores clean text", () => {
	assert.deepEqual(
		detectLeakage("just a normal graph with password: hunter2"),
		[],
	);
	assert.ok(
		detectLeakage("key AKIAABCDEFGHIJKLMNOP here").includes(
			"aws-access-key-id",
		),
	);
	assert.ok(
		detectLeakage("token sk-ant-0123456789abcdef0123").includes(
			"provider-api-key",
		),
	);
});

// --- Hard-fail behavior ---------------------------------------------------

test("an invalid graph hard-fails with zeroed dimensions", () => {
	const draft = baseDraft({
		cases: [
			{
				...baseDraft().cases[0],
				requirementRefs: [],
			} as GraphDraft["cases"][number],
		],
	});
	const result = scoreOne(baseFixture(), draft, baseAnno());
	assert.equal(result.valid, false);
	assert.ok(result.hardFailReasons.includes("HF-INVALID-GRAPH"));
	assert.equal(result.verdict, "FAIL");
	assert.equal(result.overall, 0);
});

test("a contradicts-truth claim hard-fails but still scores other dimensions", () => {
	const draft = baseDraft({
		requirements: [
			...baseDraft().requirements,
			{
				ref: "bad",
				statement: "Forbidden behavior.",
				kind: "functional",
				strength: "inferred",
				evidenceRefs: ["e1"],
				rationale: "x",
				priority: "p3",
				risk: "low",
			},
		],
	});
	const result = scoreOne(
		baseFixture(),
		draft,
		baseAnno({
			requirements: [
				{ ref: "a", map: { keys: ["req:a"], satisfaction: "full" } },
				{
					ref: "bad",
					extra: { classification: "contradicts-truth", reason: "forbidden" },
				},
			],
		}),
	);
	assert.ok(result.hardFailReasons.includes("HF-CONTRADICTS-TRUTH"));
	assert.equal(result.verdict, "FAIL");
	assert.ok(result.overall > 0);
});

test("an annotation citing an unknown truth key hard-fails on integrity", () => {
	const result = scoreOne(
		baseFixture(),
		baseDraft(),
		baseAnno({
			requirements: [
				{ ref: "a", map: { keys: ["req:ghost"], satisfaction: "full" } },
			],
		}),
	);
	assert.ok(result.hardFailReasons.includes("HF-ANNOTATION-INTEGRITY"));
});
