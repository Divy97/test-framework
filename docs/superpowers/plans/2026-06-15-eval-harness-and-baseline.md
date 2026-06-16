# Plan: V1 Eval Harness + Baseline

Date: 2026-06-15
Status: ready to implement
Workstream: [V1 Checkpoint #4 — Eval Harness and Baseline](../../v1-checkpoint.md)
Decision: [ADR-0009 reference-based deterministic evaluation](../../adr/0009-reference-based-deterministic-eval.md)
Depends on: completed [Execution-Ready Test Graph](2026-06-14-execution-ready-test-graph.md) (`@test-framework/qa-engine`)

## Goal

A versioned, reproducible evaluation harness that measures Test Graph quality
**before** BYOK and prompt tuning begin, so later work optimizes against a fixed,
measurable target. One command scores every committed Candidate over a small
calibrated corpus, emits byte-stable machine + human reports, and fails on
regression against an accepted Baseline. No live provider calls; no provider
adapter; no prompt tuning.

## Locked decisions (from grilling)

1. A **Candidate** is exactly a `test-graph/v1` graph. All three **Generation
   Arms** (raw-model, host-only, qa-engine) emit that contract; only the workflow
   differs. Deterministic validation = `validateTestGraph`, reused unchanged.
2. Each fixture ships a **Ground Truth** (expected requirements + scenarios, each
   with a stable **Truth Key**). Each Candidate ships an **Annotation** sidecar
   mapping its entities to Truth Keys. Scoring is a pure deterministic join. No
   model judgment in CI.
3. New Candidates (incl. real recorded qa-engine output) plug in as **data only**
   (`graph.json` + `annotations.json` under a new arm directory); the harness is
   data-driven and does not change.
4. **Recall counts coverage of truth, never case count.** Volume cannot inflate
   any dimension and costs points on unsupported + duplicate.
5. Partial credit uses a fixed `{0, 0.5, 1.0}` ladder; `0.5` requires a reason.
6. **Unsupported claims** split into `supported-inferred` (allowed),
   `unsupported-invented` (penalized), `contradicts-truth` (Hard-Fail).
7. Risk weight `w = riskWeight[risk] × priorityWeight[priority]`, sourced from
   committed config.
8. Duplicate = identical structural signature; low-value = presence-only
   assertions. Residual false positives are reported, never Hard-Fail.
9. Structural dimensions (assertion specificity, execution readiness, evidence
   locator resolution) are deterministic; evidence "supports the claim" is the one
   annotation-backed judgment.
10. **Hard-Fail** is separate from and overrides the weighted score.
11. Aggregate = `100 × Σ(dimensionWeight × dimensionScore)`; Hard-Fail forces
    `FAIL` while still reporting the number for diagnostics.
12. Deterministic-in-CI vs human-calibrated-offline split is explicit; a model
    judge is offline + advisory only.
13. Thresholds + weights are committed JSON; **real numbers set from the first
    calibrated run** (placeholders ship now), changed only by PR with rationale.
14. Baseline = committed scored result keyed per `(fixture, arm)`; regression =
    quality drop beyond tolerance, new Hard-Fail, or unsupported increase.
15. This checkpoint ships **hand-authored calibration tiers** (`synthetic`); real
    recorded baselines drop into the same structure later. Proves the harness, not
    the win.
16. New `packages/evals` depending on `@test-framework/qa-engine`; one command
    `pnpm eval`; deterministic scoring runs in CI, live capture is a later manual
    script.
17. Result JSON uses the qa-engine canonical-JSON discipline (sorted keys, tabs,
    trailing newline, **no timestamp**); `report.md` is derived; a golden test
    asserts byte stability.

## Package layout

```text
packages/evals/
  package.json                 @test-framework/evals; deps: qa-engine, zod; bin: eval
  tsconfig.json                extends config/tsconfig.base.json
  src/
    index.ts                   public exports (schemas, scoreCorpus, scoreCandidate)
    schema/
      common.ts                evalSchemaVersion, arm enum, reason types
      fixture.ts               Ground Truth schema (expected reqs/scenarios, sources)
      annotation.ts            Annotation sidecar schema
      rubric.ts                rubric weights + thresholds schema
      result.ts                EvalResult schema (versioned, canonical)
    weight.ts                  riskWeight × priorityWeight
    join.ts                    deterministic graph+annotation index/join
    scoring/
      recall.ts                requirement recall
      traceability.ts          requirement-to-case traceability
      coverage.ts              risk-weighted scenario coverage
      unsupported.ts           unsupported-claim classification + rate
      provenance.ts            explicit/inferred/assumption accuracy
      duplicates.ts            duplicate + low-value detection
      assertions.ts            assertion specificity & observability
      readiness.ts             execution-readiness ratio
      evidence.ts              evidence-locator resolution + supports-claim
      leakage.ts               secret/PII detector
      hard-fail.ts             gate evaluation
      aggregate.ts             weighted aggregate + FAIL override
    harness/
      discover.ts              corpus discovery by directory
      score-candidate.ts       one Candidate -> CandidateResult
      run.ts                   whole corpus -> EvalResult
      regression.ts            compare current vs accepted Baseline
    report/
      json.ts                  canonical EvalResult serializer (reuses discipline)
      markdown.ts              derived report.md
    cli/
      eval.ts                  bin: run, write results.json + report.md, gate
    test-helpers.ts            builders for fixtures/annotations/graphs
    *.test.ts                  colocated unit tests
  test/fixtures/               biome-ignored (matches qa-engine convention)
    eval-config/
      rubric.json              dimension weights + risk/priority weights
      thresholds.json          ceilings, min-overall, maxRegressionDelta
    corpus/
      <fixture-id>/
        fixture.json           Ground Truth + supplied sources
        candidates/
          raw-model/{graph.json, annotations.json}
          host-only/{graph.json, annotations.json}
          qa-engine/{graph.json, annotations.json}
    baseline/
      results.json             accepted golden (byte-stable)
      report.md                accepted golden human report
```

`test/fixtures/**` is already biome-ignored repo-wide, which protects the corpus,
config, and golden bytes from formatter drift. Config lives under
`eval-config/` (data, validated by Zod at load), not in `src`, so the calibration
commit edits values without touching code.

## Files to modify

- `biome.json` — no change needed (`!**/test/fixtures` already covers the corpus).
- `turbo.json` — add an `eval` task (`cache: false`) for the human command; the
  CI-gating golden check rides the existing `test` task.
- root `package.json` — add `"eval": "turbo -F @test-framework/evals eval"` and
  `"eval:update": "turbo -F @test-framework/evals eval -- --update-baseline"`.
- `README.md` — add `packages/evals` to the workspace map and an `Evaluation`
  command note.
- `docs/v1-checkpoint.md` — mark workstream #4 in progress with this plan link.
- `CONTEXT.md`, `docs/adr/README.md`, ADR-0009 — already updated.

## Schemas

### Fixture (Ground Truth) — `fixture.json`

```jsonc
{
  "evalSchemaVersion": "eval/v1",
  "fixtureId": "authz-api",
  "title": "Authorization-sensitive task API",
  "category": "authz-api",          // one of the 8 categories
  "brief": "Plain-text feature request / spec the arms were given (no secrets).",
  "suppliedSources": [
    {
      "sourceKey": "spec",          // stable; Annotations/evidence resolve to it
      "kind": "feature-request",
      "title": "Task API spec",
      "supplied": true,
      "locators": [                 // optional; lets evidence-locator checks resolve
        { "kind": "text", "start": 120, "end": 142 }
      ]
    }
  ],
  "expectedRequirements": [
    {
      "truthKey": "req:owner-only-delete",
      "statement": "Only a task owner may delete a task.",
      "kind": "security",
      "expectedStrength": "explicit",
      "priority": "p0",
      "risk": "high",
      "mustCover": true
    }
  ],
  "expectedScenarios": [
    {
      "truthKey": "scn:non-owner-delete-403",
      "title": "Non-owner delete is forbidden",
      "requirementKeys": ["req:owner-only-delete"],
      "type": "security",
      "priority": "p0",
      "risk": "high",
      "expectedAssertionHint": "DELETE returns 403 and the task still exists"
    }
  ],
  "forbiddenClaims": [
    {
      "claimKey": "claim:admins-bypass-ownership",
      "statement": "Admins can delete any task — spec says no admin override."
    }
  ],
  "notes": "Optional authoring notes."
}
```

### Annotation sidecar — `annotations.json`

Coverage (covered/partial/missed) is **derived** from these mappings, never
declared, so there is nothing to keep consistent.

```jsonc
{
  "evalSchemaVersion": "eval/v1",
  "fixtureId": "authz-api",
  "arm": "qa-engine",
  "recordKind": "synthetic",        // or "recorded" once a real model produces it
  "expectValidationFailure": false, // true only for intentionally-broken arms
  "sourceAnnotations": [
    { "sourceId": "src_…", "sourceKey": "spec" }
  ],
  "requirementAnnotations": [
    {
      "requirementId": "req_…",      // id present in graph.json
      "verdict": "maps",
      "truthKeys": ["req:owner-only-delete"],
      "satisfaction": "full"         // full | partial; partial needs reason
    },
    {
      "requirementId": "req_…",
      "verdict": "extra",
      "classification": "supported-inferred",  // | unsupported-invented | contradicts-truth
      "reason": "Reasonable rate-limit inference backed by ev_… ; not in truth."
    }
  ],
  "caseAnnotations": [
    {
      "caseId": "case_…",
      "verdict": "maps",
      "truthKeys": ["scn:non-owner-delete-403"],
      "satisfaction": "full"
    }
  ],
  "assertionAnnotations": [          // only where evidence "supports claim" needs a verdict
    { "assertionId": "assert_…", "supportsCitedEvidence": true }
  ]
}
```

### Rubric + thresholds — `eval-config/{rubric.json,thresholds.json}`

```jsonc
// rubric.json — placeholders; calibrated later
{
  "evalSchemaVersion": "eval/v1",
  "riskWeight":     { "low": 1, "medium": 2, "high": 3 },
  "priorityWeight": { "p0": 4, "p1": 3, "p2": 2, "p3": 1 },
  "dimensionWeights": {
    "requirementRecall":        0.18,
    "scenarioCoverage":         0.18,
    "unsupportedClaims":        0.15,
    "traceability":             0.12,
    "assertionQuality":         0.12,
    "executionReadiness":       0.10,
    "evidenceCorrectness":      0.08,
    "duplicateLowValue":        0.04,
    "provenanceAccuracy":       0.03
  }                               // sums to 1.00; loader asserts the sum
}
```

```jsonc
// thresholds.json — placeholders; real values set in the calibration commit
{
  "evalSchemaVersion": "eval/v1",
  "maxUnsupportedRate": 0.15,     // > this => HF-UNSUPPORTED-RATE
  "minOverall": 0,                // 0 now; raised after calibration
  "maxRegressionDelta": 0.0,      // aggregate points, [0,100]
  "maxUnsupportedRegressionDelta": 0.0 // unsupported fraction, [0,1]
}
```

### EvalResult — `result.ts` (canonical, no timestamp)

```jsonc
{
  "evalSchemaVersion": "eval/v1",
  "rubricFingerprint": "sha256:…",   // hash of rubric+thresholds, not a clock
  "corpusFingerprint": "sha256:…",   // hash of all fixture+candidate bytes
  "fixtures": [
    {
      "fixtureId": "authz-api",
      "candidates": [
        {
          "arm": "qa-engine",
          "recordKind": "synthetic",
          "valid": true,
          "validationFindings": [],          // TestGraphFinding[] from qa-engine
          "hardFail": false,
          "hardFailReasons": [],             // HF-* codes
          "dimensions": {
            "requirementRecall": 0.95,
            "scenarioCoverage": 0.90,
            "unsupportedClaims": 1.0,
            "traceability": 1.0,
            "assertionQuality": 0.82,
            "executionReadiness": 0.88,
            "evidenceCorrectness": 1.0,
            "duplicateLowValue": 1.0,
            "provenanceAccuracy": 0.93
          },
          "overall": 91.4,
          "verdict": "PASS",                 // PASS | FAIL (FAIL if hardFail)
          "explain": [ /* per-dimension finding lines, sorted */ ]
        }
      ]
    }
  ]
}
```

## Scoring formulas

Let `w(item) = riskWeight[item.risk] × priorityWeight[item.priority]` (range 1..12).
All sums are over the fixture's Ground Truth. Every dimension is in `[0,1]`.
Derived from the join (all deterministic):

- `coveredReqKeys` = expectedRequirement keys with ≥1 candidate requirement
  `maps`; `satisfaction` of the best mapping gives `1.0` (full) or `0.5` (partial).
- `testedReqKeys` = covered keys where ≥1 candidate **case** lists (via graph
  `requirementIds`) a candidate requirement mapping to that key.
- scenario `sat(scnKey)` = `1.0` if a mapped case is `full`, `0.5` if only
  `partial`, else `0.0`.

1. **requirementRecall** = `Σ_k w(k)·satReq(k) / Σ_k w(k)` over expectedRequirements.
2. **traceability** = `Σ_k w(k) over testedReqKeys / Σ_k w(k) over coveredReqKeys`
   (1.0 when no covered keys, to avoid 0/0 punishing an empty-but-honest plan; that
   case already scores 0 on recall).
3. **scenarioCoverage** = `Σ_s w(s)·sat(s) / Σ_s w(s)` over expectedScenarios.
4. **unsupportedClaims** = `1 − (nInvented + nContradicts) / max(1, nClaims)`,
   where `nClaims` = candidate requirements + candidate cases, and counts come from
   `extra` classifications. `supported-inferred` is **not** penalized.
5. **provenanceAccuracy** = fraction of *mapped* candidate requirements whose
   `provenance.kind` equals the expectedRequirement `expectedStrength` (1.0 when no
   mapped requirements).
6. **duplicateLowValue** = `1 − (nDuplicateCases + nLowValueCases) / max(1, nCases)`.
   Signature = hash of `(type, normalizedTarget, actor, sortedRequirementIds,
   sortedAssertionSignatures, sortedConsumedDataReqIds)`; assertionSignature =
   `subject|matcher|targetSummary(observationPoint)`. Low-value = a case whose
   assertions are all presence matchers (`exists/notExists/visible/hidden/
   enabled/disabled`) or that has zero assertions.
7. **assertionQuality** = mean over cases of `specific / total` assertions; a
   specific assertion is a non-presence matcher with a concrete `expected`/pattern/
   schemaRef **and** a non-`generic` `observationPoint`. Zero-assertion cases score
   0 (and are low-value in #6).
8. **executionReadiness** = fraction of candidate cases that are structurally
   V2-compilable: `automation.readiness === "ready"`, ≥1 assertion, contiguous
   steps `1..n`, non-`generic` target, and every consumed dataRequirement has a
   producer or non-`case-produced` provisioning. (All re-checked from the graph;
   `validateTestGraph` already guarantees most invariants.)
9. **evidenceCorrectness** = fraction of `explicit`/`inferred` claims (requirements,
   cases, assertions) whose cited evidence (a) resolves to a `suppliedSources`
   entry via `sourceKey`/locator (deterministic) **and** (b) is not flagged
   `supportsCitedEvidence: false` in the Annotation (1.0 when no such claims).

**Aggregate** = `100 × Σ_d (dimensionWeights[d] × dimensions[d])`, rounded to one
decimal via a fixed half-up rule (no locale, no float drift in serialized output —
store the rounded string). `verdict = hardFail ? "FAIL" : (overall ≥ minOverall ?
"PASS" : "FAIL")`.

## Hard-fail rules (separate, override score)

| Code | Trigger |
| --- | --- |
| `HF-INVALID-GRAPH` | `validateTestGraph` returns findings while `expectValidationFailure` is false |
| `HF-UNSUPPORTED-RATE` | `(nInvented + nContradicts) / max(1,nClaims)` > `maxUnsupportedRate` |
| `HF-CONTRADICTS-TRUTH` | ≥1 `extra` claim classified `contradicts-truth` |
| `HF-LEAKAGE` | secret/PII detector matches the serialized graph or Annotation |
| `HF-ANNOTATION-INTEGRITY` | Annotation references an unknown Truth Key, a missing entity id, or arm/fixtureId mismatch |

`expectValidationFailure: true` (raw-model arms) makes an invalid graph the
**recorded expected outcome**: the Candidate is still `hardFail: true` (it does not
pass the gate) but contributes a 0 quality without being a harness error. The
regression gate (below) treats a *new, unexpected* Hard-Fail as failure.

**Leakage detector**: a fixed regex set over serialized bytes — PEM blocks
(`-----BEGIN`), AWS-style `AKIA[0-9A-Z]{16}`, `xox[baprs]-` Slack tokens, bearer/JWT
shapes, `password|secret|api[_-]?key\s*[:=]`, and the literal provider env-var names.
Deterministic; false positives are surfaced in `explain` and can be tuned in config.

## Threshold + baseline policy

- **Thresholds + rubric** are committed JSON validated by Zod. This checkpoint
  ships placeholders (`minOverall: 0`, exact-match baseline). The **calibration
  commit** — a separate, later change made after the first real run — records the
  real `minOverall`, `maxUnsupportedRate`, `maxRegressionDelta`, and
  `maxUnsupportedRegressionDelta`, with a rationale line in the PR. Per the
  architecture, thresholds are derived from the first calibrated fixture set, not
  invented after seeing release results.
- **Baseline** = committed `test/fixtures/baseline/results.json` (+ `report.md`),
  keyed per `(fixtureId, arm)`. `pnpm eval` recomputes and diffs against it.
- **Regression** (fails CI / non-zero exit) = for any `(fixture, arm)`: overall
  drops by more than `maxRegressionDelta`, **or** a new Hard-Fail appears that the
  baseline did not record, **or** the unsupported score drops by more than
  `maxUnsupportedRegressionDelta`. Baseline updates only via `pnpm eval:update` in
  a PR that shows the diff and states why.

## The one command + determinism

- `pnpm eval` → discover corpus → score → write `results.json` + `report.md` →
  compare to baseline → exit 0 (match/within policy) or non-zero (regression).
- `pnpm eval:update` adds `--update-baseline`, rewriting the golden (review gate).
- Determinism guarantees: pure functions; **no `Date.now`/`Math.random`/`new
  Date()`** anywhere; result JSON has no timestamp; all collections sorted with the
  qa-engine `compareCodeUnits` discipline; canonical serializer (sorted keys, tabs,
  trailing newline). A CI test runs the scorer twice and asserts identical bytes,
  then asserts equality with the committed golden. Runtime target: well under a
  second for ~8 fixtures × 3 arms; no network, no filesystem writes during the
  golden test (scorer is pure; CLI does the writing).

## Corpus — the 8 required fixtures

Each is one `fixture/` with Ground Truth + three arms. Arms are hand-authored
calibration tiers (`synthetic`): qa-engine = strong, host-only = mediocre,
raw-model = weak/often invalid. Annotations are authored and reviewed.

| fixtureId | category | What it stresses |
| --- | --- | --- |
| `ui-form-validation` | ui-form | field validation + state behavior; observability of inline errors |
| `authz-api` | authz-api | owner-only/role checks, 403 paths, info leakage |
| `stateful-workflow` | stateful-workflow | idempotency, duplicate submit, retries, data producer/consumer DAG |
| `integration-failure` | integration-failure | third-party timeout/partial-rollback handling |
| `contradictory-spec` | contradictory-spec | incomplete/contradictory requirements → open questions, assumptions |
| `evidence-conflict` | evidence-conflict | repo evidence contradicts supplied intent |
| `adversarial-shallow` | adversarial-shallow | many low-value/duplicate cases — must score low |
| `unsupported-assumptions` | unsupported-assumptions | invented behavior — must trip unsupported metric, not hide behind volume |

The last two are the calibration anchors for the exit criteria "known weak plans
score materially below strong plans" and "unsupported claims cannot be hidden by
high case volume". The qa-engine arm reuses/extends existing valid fixtures from
`packages/qa-engine/test/fixtures/valid` where shapes align, so the corpus stays
consistent with the real contract.

## TDD commit sequence (red → green per step)

1. `chore(evals): scaffold package` — package.json, tsconfig, empty `index.ts`,
   turbo `eval` task, root scripts. Build + typecheck pass; no logic.
2. `feat(evals): eval schemas` — `schema/*` with Zod; tests first asserting accept
   valid / reject malformed config, fixture, annotation, result.
3. `feat(evals): risk weighting + join` — `weight.ts`, `join.ts`; tests for the
   graph+annotation index, dangling-annotation detection, derived coverage sets.
4. `feat(evals): coverage dimensions` — recall, traceability, scenarioCoverage;
   tests including the volume-cannot-inflate cases.
5. `feat(evals): claim dimensions` — unsupported, provenanceAccuracy; tests for the
   three `extra` classifications.
6. `feat(evals): structural dimensions` — duplicates/low-value, assertionQuality,
   readiness, evidence; tests incl. acceptable-false-positive duplicate case.
7. `feat(evals): leakage + hard-fail + aggregate` — gate codes, FAIL override,
   rounding stability tests.
8. `feat(evals): canonical result + markdown report` — serializer + derived report;
   byte-stability test (serialize→parse→serialize identical).
9. `feat(evals): score-candidate + corpus run + regression` — orchestration;
   regression compare tests (drop, new hard-fail, unsupported rise).
10. `feat(evals): eval CLI` — `cli/eval.ts`, exit codes, `--update-baseline`.
11. `test(evals): calibrated corpus — core 4` — ui-form, authz-api,
    stateful-workflow, integration-failure with arms + annotations.
12. `test(evals): calibrated corpus — adversarial 4` — contradictory-spec,
    evidence-conflict, adversarial-shallow, unsupported-assumptions.
13. `feat(evals): accept baseline` — generated `baseline/results.json` + `report.md`
    via `eval:update`; determinism + golden CI test; assert weak ≪ strong and
    volume-hidden-unsupported still trips the metric.
14. `docs(evals): wire docs` — README workspace map + command, v1-checkpoint #4
    status. (ADR-0009 + CONTEXT.md already landed with this plan.)

Follow-up (not in this checkpoint): `chore(evals): calibration commit` recording
real thresholds after reviewing the first baseline run.

## Test matrix

| Test file | Asserts |
| --- | --- |
| `schema/*.test.ts` | each schema accepts canonical examples, rejects malformed; dimensionWeights sum guard |
| `weight.test.ts` | risk×priority matrix values and bounds |
| `join.test.ts` | index build, dangling annotation → integrity finding, derived covered/tested/partial sets |
| `scoring/recall.test.ts` | weighting; partial ladder; **two plans, same truth, different case counts → equal recall** |
| `scoring/traceability.test.ts` | covered-but-untested requirement lowers score; 0-covered → 1.0 |
| `scoring/coverage.test.ts` | full/partial/missed sat; risk weighting |
| `scoring/unsupported.test.ts` | invented penalized, inferred not; **100 extra cases → rate rises, not hidden** |
| `scoring/provenance.test.ts` | strength mismatch detection |
| `scoring/duplicates.test.ts` | exact-signature dup; low-value detection; data-variant avoids false dup |
| `scoring/assertions.test.ts` | presence-only ⇒ low; concrete matcher + non-generic target ⇒ high |
| `scoring/readiness.test.ts` | blocked/zero-assertion/generic-target excluded |
| `scoring/evidence.test.ts` | locator resolves; `supportsCitedEvidence:false` lowers score |
| `scoring/leakage.test.ts` | each secret shape matches; clean graph passes |
| `scoring/hard-fail.test.ts` | each HF code; `expectValidationFailure` path |
| `scoring/aggregate.test.ts` | weighted sum; FAIL override; rounding byte-stability |
| `report/*.test.ts` | canonical JSON byte-stability; derived markdown matches golden |
| `harness/regression.test.ts` | drop / new hard-fail / unsupported-rise all flagged |
| `harness/run.test.ts` (corpus) | **weak arm ≪ strong arm per fixture**; full corpus determinism vs golden |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Hand-authored baselines flatter the engine | Author weak/raw arms adversarially; gate real *release* on real recorded baselines in workstream #9; this checkpoint proves the harness, not the win |
| Annotation bias / drift | Annotations reviewed in PR; periodic expert re-score; offline advisory model judge (never CI) |
| Biome reformatting golden bytes | Corpus + config + baseline under `test/fixtures/**` (already biome-ignored) |
| Non-determinism (clock/float/map order) | No `Date.now`/random; fingerprints not timestamps; sorted-everything; rounded strings; double-run byte test |
| Duplicate false positives | Fold consumed data id into signature; report, never Hard-Fail |
| Schema coupling to Test Graph evolution | Candidate uses `migrateTestGraph`; eval `evalSchemaVersion` is independent and versioned |
| Corpus maintenance cost | Keep to 8 representative fixtures; reuse existing valid fixtures; data-driven harness so growth needs no code |
| Scope creep (model judge / live calls) | Both explicitly non-goals here; live capture is a later manual script |

## Non-goals (explicit)

- No live provider/API calls in deterministic CI.
- No provider adapter implementation (workstream #5).
- No prompt or QA-workflow tuning (this is the pre-tuning measurement).
- No model-as-judge in CI or in the aggregate (offline advisory only).
- No V2 test execution; no latency/token/cost runtime metrics this checkpoint
  (recorded candidates have no runtime).
- No MCP API redesign; no changes to `qa-engine` or `repo-scan` behavior.
- No large corpus; 8 calibrated fixtures only.
- Real release thresholds and real recorded baselines are deferred to the
  calibration commit and workstream #9.

## Exit criteria mapping

| Required exit criterion | Met by |
| --- | --- |
| One command evaluates all committed candidates | `pnpm eval` + `harness/run.ts` |
| Repeated runs byte-stable | no-timestamp canonical JSON + double-run golden test |
| Invalid graphs fail with typed findings | reused `validateTestGraph`; `HF-INVALID-GRAPH` |
| Weak ≪ strong | adversarial arms + corpus assertion test |
| Unsupported not hidden by volume | unsupported rate over claim denominator + test |
| Per-dimension + aggregate explainable | `dimensions{}` + `explain[]` + derived report |
| Raw-model & host-only baseline workflow documented | this plan + later live-capture script |
| Thresholds + baseline rules explicit | committed config + regression policy |
| Full lint/typecheck/build/test gates pass | TDD steps + CI golden test |
```
