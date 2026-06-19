---
type: feature-plan
status: draft
source_type: free_text
source_ref: "Workstream #9 (Quality Gate and Release) — docs/v1-checkpoint.md §9 + §4 remaining work; docs/v1-mvp.md#definition-of-done; ADR-0009 (reference-based deterministic eval); ADR-0001/0002/0006 (moat); docs/byok-setup.md"
created_at: "2026-06-19"
updated_at: "2026-06-19"
---

# Quality Gate and Release (Workstream #9)

Workstreams #1–#8 built and shipped the V1 stack: the deepened QA engine
(`createPlan`/`refinePlan`/`loadPlan`, semantic review, deterministic validation,
bounded repair, atomic persistence), the BYOK provider seam, the MCP product
adapter, and a **deterministic, reference-based eval harness** (`packages/evals`)
that scores a committed corpus and gates on regression against a committed
baseline. #9 is the final V1 checkpoint: it **measures and documents** — it does
not re-tune. Concretely it (a) replaces the hand-authored synthetic calibration
tiers in the corpus with **real recorded** raw-model / host-only / qa-engine
output and records the **real release thresholds** (the calibration commit), (b)
confirms the quality / unsupported-claim / regression gate holds and dispositions
the latency/cost/failure thresholds §9 names (which the deterministic harness does
not measure), (c) tests the install / config / error flows of the MCP product
surface, (d) publishes a limitations + security-model document, and (e) ticks off
every item in `docs/v1-mvp.md#definition-of-done`.

This is the moat-proving checkpoint (ADR-0001/0002/0006): the differentiation
claim — "measurably better than the same model with a raw prompt" — becomes a
committed, recorded, reproducible number rather than a hand-authored fixture.
**Prompt tuning is explicitly gated behind this checkpoint**: we record the
baseline + thresholds *before* any prompt change, so later tuning has a fixed
target (checkpoint "Recommended Order": "Graph and eval work precedes prompt
tuning").

**Exit criterion (checkpoint §9):** every item in
[`docs/v1-mvp.md#definition-of-done`](../../v1-mvp.md#definition-of-done) passes.

## Source Snapshot

- **Checkpoint §9 "Quality Gate and Release"** (`docs/v1-checkpoint.md`, lines
  224–233, `pending`): run comparative evals against recorded baselines; confirm
  quality, unsupported-claim, latency, cost, and failure thresholds; test
  install/config/error flows; publish limitations and security model. *Exit: all
  `docs/v1-mvp.md#definition-of-done` items pass.*
- **Checkpoint §4 "Eval Harness and Baseline"** (lines 95–116, `harness complete;
  release thresholds pending calibration`): the harness is done and byte-stable;
  the **remaining work folded into #9** is verbatim "replace hand-authored
  synthetic tiers with real recorded raw-model/host-only baselines, and record real
  release thresholds (the calibration commit) before any prompt tuning."
- **`docs/v1-mvp.md`** — `## Definition of Done` (lines 186–196, the seven-item
  exit checklist, mapped item-by-item in §Goal below) and `## Evaluation and
  Release Gate` (lines 166–177): "a recorded threshold set before release
  evaluation; no material regression in unsupported claims, latency, or failure
  rate."
- **ADR-0009** (`docs/adr/0009-reference-based-deterministic-eval.md`): scoring is
  a pure deterministic join over committed data; **no network/model call in CI**; a
  model judge never gates CI and never enters the aggregate. Consequences §:
  "New Candidates, including **real recorded QA-engine output, plug in as data** —
  a graph plus its Annotation — with no harness code change. The one-time
  Annotation of a fresh graph is the human-calibration step and is reviewed in the
  PR." and "This checkpoint proves the harness with hand-authored calibration
  tiers. **The real raw-model and host-only Baselines and the real release
  thresholds are captured later, before prompt tuning, against recorded output
  dropped into the same structure.**" This ADR is the normative source for the
  whole #9 eval-side approach.
- **`packages/evals` (read in full):**
  - `src/cli/eval.ts` — the `pnpm eval` / `eval:update` CLI. Reads `rubric.json` +
    `thresholds.json` from `test/fixtures/eval-config/`, discovers the corpus,
    `scoreCorpus`, serializes a byte-stable `results.json` + `report.md` to
    `test/fixtures/baseline/`, and either writes the baseline (`--update-baseline`)
    or `compareToBaseline` and exits non-zero on regression. **No provider import,
    no model call.**
  - `src/harness/discover.ts` — reads each `corpus/<fixture>/candidates/<arm>/{graph.json,annotations.json}`
    as committed bytes; arms are pure data files. `ARM_ORDER = [raw-model,
    host-only, qa-engine]`.
  - `src/harness/run.ts` — `scoreCorpus` is a pure function; emits
    `corpusFingerprint` (sha256 of raw committed bytes) and `rubricFingerprint`;
    **no wall-clock timestamp** in the result.
  - `src/harness/score-candidate.ts` — per-candidate scoring: `validateTestGraph`
    (reused), leakage, annotation-integrity, nine weighted dimensions, Hard-Fails,
    `overall`, `verdict = hardFail ? FAIL : overall >= thresholds.minOverall ? PASS
    : FAIL`.
  - `src/harness/regression.ts` — `compareToBaseline`: a regression is an aggregate
    drop > `maxRegressionDelta`, an unsupported-claim drop > `maxUnsupportedRegressionDelta`,
    a **new** Hard-Fail the baseline lacked, or a baseline `(fixture, arm)` now
    missing. Rubric/threshold changes and new candidates are **notes, not
    regressions**.
  - `src/corpus/{data.ts,builders.ts,build-corpus.ts}` — the synthetic-tier
    generator. `pnpm corpus:build` compiles compact drafts in `data.ts` into real
    `test-graph/v1` graphs + matching Annotations and writes them to the corpus.
    `data.ts` header: "three arms authored as hand-authored calibration tiers
    (`synthetic`): qa-engine = strong, host-only = mediocre, raw-model = weak (often
    intentionally invalid)." **Every committed candidate today has
    `recordKind: "synthetic"`** (confirmed in `baseline/results.json`).
  - `src/schema/common.ts` — `recordKindSchema = enum(["synthetic","recorded"])`
    (the field that distinguishes calibration fixtures from real recorded output);
    `DIMENSION_KEYS` (nine); `HARD_FAIL_CODES` (five: `HF-INVALID-GRAPH`,
    `HF-UNSUPPORTED-RATE`, `HF-CONTRADICTS-TRUTH`, `HF-LEAKAGE`,
    `HF-ANNOTATION-INTEGRITY`).
  - `src/schema/rubric.ts` — `thresholdsSchema` carries exactly
    `{ evalSchemaVersion, maxUnsupportedRate, minOverall, maxRegressionDelta,
    maxUnsupportedRegressionDelta }`. **There is NO latency, cost, or failure-rate
    field.** Schema comment: "Real values set at calibration."
  - `test/fixtures/eval-config/thresholds.json` — current **placeholder** values:
    `{ maxUnsupportedRate: 0.15, minOverall: 0, maxRegressionDelta: 0,
    maxUnsupportedRegressionDelta: 0 }`. `minOverall: 0` means the quality gate is
    currently inert; the zero deltas already pin the baseline byte-for-byte.
  - `test/fixtures/baseline/{results.json,report.md}` — the committed accepted
    baseline (8 fixtures × 3 arms, all `synthetic`). qa-engine beats host-only beats
    raw-model on every fixture; raw-model Hard-Fails on most.
- **`docs/byok-setup.md` + `packages/qa-engine/src/providers/`** — the live path:
  `createProvider(config)` builds a real Anthropic/OpenRouter adapter; the
  deterministic fake is DI-only. `providers/adapters/live.test.ts` is the auto-skip
  pattern: `const live = Boolean(process.env.RUN_LIVE_PROVIDER &&
  process.env.ANTHROPIC_API_KEY); test(..., { skip: !live }, …)`. `NormalizedUsage`
  is **token counts only** — "Cost is deferred (decision #9)"; there is no latency
  field anywhere in the provider/engine surface.
- **`apps/mcp/` + `README.md` MCP section** (written in #8) — the product surface
  for install/config/error flows: stdio server, three tools, lazy provider
  construction (handshake/`tools/list`/`get_test_plan`/input-validation work
  keyless), `TEST_FRAMEWORK_PROVIDER`/`MODEL`/`KEY_ENV`/`ROOT` env config, and a
  typed secret-free error envelope. The built-stdio + in-memory tests already
  exist; #9 adds a documented manual acceptance script and one gated live E2E.
- **Moat ADRs** for the limitations/security doc: 0001 (verification intelligence
  is the product; MCP is the first adapter), 0002 (own QA reasoning through BYOK;
  keys stay local), 0006 (reject a validator-only product). **CONTEXT.md**
  Invariants: keys never enter prompts/artifacts/telemetry; deterministic code
  never claims semantic completeness; eval is deterministic and reference-based.
- **Reference plan** mirrored for structure:
  `docs/superpowers/plans/2026-06-19-mcp-product-adapter-plan.md`.

### Reuse already on `main` (exact symbols)

- `packages/evals/src/index.ts` re-exports: `discoverCorpus`, `scoreCorpus`,
  `compareToBaseline`, `scoreCandidate`, `serializeEvalResult`/`parseEvalResult`,
  `renderReportMarkdown`, `checkAnnotationIntegrity`, `detectLeakage`, and all
  schemas (`annotation`, `common`, `fixture`, `result`, `rubric`).
- `pnpm corpus:build` (`src/corpus/build-corpus.ts`) — the deterministic compiler
  from `data.ts` drafts → committed corpus JSON. The recorded-arm path reuses its
  validation discipline (valid arms must validate; `expectValidationFailure` arms
  must be invalid).
- `pnpm eval` / `pnpm eval:update` (root + `@test-framework/evals`).
- `@test-framework/qa-engine`: `createProvider`, `createPlan`, `validateTestGraph`,
  `serializeTestGraph`, `TestGraphV1`. The recording tool calls `createPlan` for the
  qa-engine arm.
- `providers/adapters/live.test.ts` — the `RUN_LIVE_PROVIDER`+key auto-skip pattern
  to copy for any live recording/E2E step.

## Assumption Log

**Confirmed by reading the code/docs:**

- **The eval gate (`pnpm eval`) is already deterministic, keyless, byte-stable, and
  regression-gating.** Confirmed: `cli/eval.ts` imports no provider; `run.ts` emits
  no timestamp; `discover.ts` reads committed bytes; zero regression deltas pin the
  baseline. §4 exit criterion is already **Met**; #9 does not re-architect the
  harness.
- **Real recorded arms plug in as committed data with NO harness code change.**
  Confirmed by ADR-0009 Consequences and by `discover.ts` reading any
  `graph.json`+`annotations.json` under `candidates/<arm>/`. The only flag that
  changes is `recordKind: "synthetic" → "recorded"` in each annotation.
- **The thresholds schema has only quality/unsupported/regression fields — no
  latency, cost, or failure-rate.** Confirmed in `schema/rubric.ts`. The engine
  produces token usage only (`NormalizedUsage`); cost is "deferred (decision #9)";
  latency is unmeasured. So §9's "latency, cost, failure thresholds" cannot be
  recorded as gated numbers in the deterministic harness — see `[RATIFY]` below.
- **Current thresholds are placeholders.** `minOverall: 0` (gate inert),
  `maxRegressionDelta: 0`/`maxUnsupportedRegressionDelta: 0` (baseline pinned).
  These are the values #9's calibration commit replaces.
- **"Failure rate" is already gated via Hard-Fails, not a numeric threshold.**
  Confirmed: `compareToBaseline` flags any **new** Hard-Fail (`HF-INVALID-GRAPH`,
  `HF-UNSUPPORTED-RATE`, `HF-CONTRADICTS-TRUTH`, `HF-LEAKAGE`,
  `HF-ANNOTATION-INTEGRITY`) versus baseline. The DoD "no material regression in
  failure rate" is satisfied by the new-Hard-Fail regression rule.
- **Security is already partly enforced in-harness.** `detectLeakage` Hard-Fails any
  candidate whose graph/annotation text contains a credential shape (`sk-ant-…`,
  AWS keys, JWTs, PEM keys, `ANTHROPIC_API_KEY`, …). The recorded qa-engine output
  must pass this same gate — a real key leaking into a recorded artifact would
  Hard-Fail the eval, which is the desired safety property.
- **Commit scopes are an enum**: `repo, docs, infra, mcp, stack` + every dir under
  `apps/` and `packages/` (so `evals`, `qa-engine`, `repo-scan`, `mcp` are valid).
  `subject-case` is strictly `lower-case` (acronyms must be lowercase). Confirmed in
  `commitlint.config.*` and `.cz-config.cjs`/`scopes.cjs`.

**Must verify at implementation:**

- **Whether a live recording run produces a *valid* qa-engine graph deterministic
  enough to annotate once.** The graph is real model output; its entity IDs are
  content-derived stable IDs (`createStableId`), so a re-run with the same
  spec/model may differ. The recording is a **one-time capture**: the captured
  `graph.json` is committed and frozen; its Annotation is authored against *that*
  captured graph. Re-running to "refresh" is a new capture + new annotation +
  baseline update (PR-reviewed), not a CI activity. Verify the captured graph
  validates (`validateTestGraph`) before committing — `build-corpus.ts` already
  enforces this for synthetic arms; the recorded arm needs the same check.
- **How many fixtures to record real qa-engine output for in V1.** Recording all 8
  via live model is the ideal; the minimum that satisfies the DoD is "the recorded
  raw-model baseline the qa-engine arm is compared against exists and qa-engine
  beats it." See `[RATIFY]` on recording scope.
- **Whether the host-only arm can be recorded without a separate host harness.**
  raw-model and qa-engine are recordable from this repo (single prompt vs full
  engine, same key). host-only ("host agent reasoning") needs a host to drive — it
  may stay synthetic in V1 or be captured manually from a host session. See
  `[RATIFY]`.
- No new runtime dependency anywhere. The recording tool is a `tsx` dev script in
  `packages/evals` using existing `@test-framework/qa-engine` + Node stdlib, gated
  exactly like `live.test.ts`.

## Goal and Success Criteria

**Goal:** Turn the eval harness's hand-authored calibration into a recorded,
reproducible release gate; confirm and **record the real thresholds** (the
calibration commit) with the quality/unsupported/regression gate green on the
recorded corpus; disposition the latency/cost/failure thresholds §9 names;
verify the MCP install/config/error flows with a documented acceptance run and one
gated live E2E; publish a limitations + security-model doc; and tick every
definition-of-done item. No source behavior in `qa-engine`/`apps/mcp`/`repo-scan`
changes — #9 measures and documents.

**Success criteria — each numbered item is testable and tied to a
`docs/v1-mvp.md#definition-of-done` (DoD) item:**

1. **(DoD #6, §4-remaining)** At least one fixture's **raw-model arm carries real
   recorded output** (`recordKind: "recorded"`), the **qa-engine arm is recorded
   real output** (`recordKind: "recorded"`), and the recorded qa-engine `overall`
   **strictly exceeds** the recorded raw-model `overall` for that fixture in
   `baseline/results.json`. *Verify:* `pnpm eval` green; grep the baseline for
   `"recordKind": "recorded"`; assert the two overalls in a regression test.
2. **(DoD #6, Eval/Release-Gate)** `thresholds.json` holds **recorded release
   values** (no longer `minOverall: 0`): `minOverall` set to the calibrated floor
   the recorded qa-engine arms clear and the recorded raw-model arms do not (where
   raw-model is a valid graph), `maxUnsupportedRate` confirmed, and the regression
   deltas set to the chosen post-release tolerance. The change is in **one
   calibration commit with a recorded rationale** (ADR-0009 requires PR review for
   threshold changes). *Verify:* `thresholds.json` diff + `pnpm eval` green; a
   schema test that `minOverall > 0`.
3. **(DoD #6)** `pnpm eval` exits 0 against the **re-recorded baseline** and is
   **byte-stable** across two consecutive runs (the calibration baseline is itself
   committed). *Verify:* run `pnpm eval` twice; diff stdout/`results.json` (empty);
   exit 0.
4. **(§9 "latency, cost, failure thresholds")** The latency/cost/failure-rate
   thresholds §9 names are **dispositioned in writing**: failure-rate is enforced as
   the existing new-Hard-Fail regression rule; latency and cost are recorded as
   **V1-out-of-scope, non-gating observations** in the limitations doc and the
   checkpoint, with the rationale that the engine measures token usage only and cost
   is deferred (CONTEXT.md / `NormalizedUsage`). *Verify:* the limitations doc and
   checkpoint §9 both state the disposition; no fabricated numeric threshold is added
   to `thresholds.json`.
5. **(DoD #7 — installation/configuration)** A documented **install/config
   acceptance script** (commands + expected observations) exists that takes a fresh
   checkout to a working MCP server: `pnpm install`, `pnpm --filter mcp build`,
   register `dist/index.js`, set BYOK env, and confirm `tools/list` returns the
   three tools keyless. *Verify:* the built-stdio handshake test (existing) + the
   documented script reproduced manually once and noted as run.
6. **(DoD #7 — errors)** A documented **error-flow matrix** maps each first-contact
   failure (no/invalid provider config, missing key env var, empty/invalid input,
   unknown `planId`, stale `expectedVersion`, repo path escaping the root) to the
   typed `{ code, message, retryable }` the host sees, with the assertion that no
   message leaks a path, SDK detail, env value, or key. *Verify:* the existing MCP
   `errors.test.ts` table covers the codes; the matrix cross-references it; the
   keyless `INVALID_INPUT` / `PROVIDER_CONFIG_INVALID` cases are reproduced over the
   built binary.
7. **(DoD #7 — limitations + §9 "publish limitations and security model")** A
   committed **`docs/limitations-and-security.md`** publishes: the V1 capability
   boundary (planning only, no execution), known limitations (synthetic vs recorded
   arms, single host-only tier, scanner TOCTOU residual, no latency/cost gate), and
   the security model (BYOK keys by reference never stored; secret-safe logging;
   leakage Hard-Fail; root confinement; dynamic-import SDK isolation). *Verify:* the
   doc exists, is linked from `README.md` and checkpoint §9, and `pnpm check:ci`
   passes on it.
8. **(DoD #1–#5 — re-verification)** Each already-`done` DoD item (configure BYOK;
   one MCP op persists a real plan; internal semantic review + deterministic
   validation; traceable/editable/execution-ready/safe-to-commit output; refine
   preserves identity/provenance) is **re-confirmed** by naming the existing test(s)
   / live path that proves it, in a per-item verification table in the checkpoint.
   *Verify:* the table cites concrete tests; `pnpm test` green.
9. **(Engineering gate)** `pnpm check-types`, `pnpm test`, `pnpm check:ci`,
   `pnpm build`, and `pnpm eval` are all green after **each** slice; CI remains
   keyless (no `RUN_LIVE_PROVIDER`, no key); the one live recording/E2E step is
   `skip`-ped without `RUN_LIVE_PROVIDER` + key.
10. **(§9 exit)** `docs/v1-checkpoint.md` §9 is flipped to `done` and the headline /
    current-reality rows updated, with every DoD item ticked and cross-referenced.

## Scope and Non-Goals

**In scope (primarily `packages/evals` + docs):**

- A **gated recording tool** (`packages/evals`, `tsx` dev script) that runs the real
  qa-engine (and the raw-model single-prompt control) against fixtures via
  `createProvider` + `RUN_LIVE_PROVIDER`, validates the captured graph, and writes
  it under `candidates/<arm>/graph.json` with `recordKind: "recorded"`. Plus a
  documented one-time annotation step for each captured graph.
- Re-recording the **accepted baseline** (`pnpm eval:update`) over the recorded
  corpus and committing it as the calibration baseline.
- Setting the **real release thresholds** in `thresholds.json` (one calibration
  commit, recorded rationale).
- A small **regression test** asserting the recorded qa-engine arm beats the
  recorded raw-model arm and that thresholds are calibrated (`minOverall > 0`).
- The **limitations + security-model doc** and the **install/config/error-flow
  acceptance script** (docs), plus the **per-item DoD verification table** in the
  checkpoint.
- Doc updates: `docs/v1-mvp.md` (tick DoD), `docs/v1-checkpoint.md` (§4 →
  calibrated, §9 → done, headline), `README.md` (link the limitations doc; note
  recorded vs synthetic arms), optionally `docs/byok-setup.md` (point to the
  recording command).

**Non-goals (explicitly out):**

- **Any prompt tuning or `qa-engine`/`apps/mcp`/`repo-scan` behavior change.** #9 is
  measure-and-document; tuning is the *next* workstream and is gated behind this
  recording (checkpoint "Recommended Order").
- **Any harness code change to scoring/discovery/regression** (ADR-0009: recorded
  output is data, not code). The only `packages/evals` *code* added is the gated
  recording dev script + a regression test; the scoring path is untouched.
- **Adding latency/cost/failure-rate fields to `thresholds.json`.** The engine does
  not measure latency and defers cost; inventing gated numbers would be a fabricated
  threshold. They are dispositioned in the docs instead (criterion 4).
- **Making CI depend on a key.** The recording run and the live E2E are gated
  (`RUN_LIVE_PROVIDER` + key) and `skip`-ped in CI. `pnpm eval` continues to score
  only committed bytes.
- **A model-as-judge in the gate** (ADR-0009 reject list). An offline advisory judge
  on annotation quality is permitted but is not part of #9's deliverable.
- **V2 work**: execution, diagnosis, cloud, dashboards, CI/PR gating of *target*
  repos.

## Resolved Decisions

Each is a recommendation tagged for orchestrator ratification.

- **[RATIFY] (the pivotal question) Recording real raw-model/host-only/qa-engine
  baselines REQUIRES a live model call (a BYOK key); calibrating the *gate* does
  not.** *Evidence:* `cli/eval.ts`/`run.ts`/`discover.ts` contain no provider import
  and read only committed `graph.json`/`annotations.json` — so `pnpm eval` and CI
  are deterministic and keyless **today and after #9**. But the *content* of a
  "recorded" arm is, by definition, real model output: the raw-model arm is a single
  prompt to the model, and the qa-engine arm is `createPlan(...)` driving the model
  through the workflow — both call `createProvider(config)` and therefore need a
  key. ADR-0009 says so explicitly: real baselines are "captured later … against
  recorded output dropped into the same structure." **Therefore:**
  - The orchestrator **must obtain a provider key** (e.g. `ANTHROPIC_API_KEY`, or
    `OPENROUTER_API_KEY`) to perform the one-time recording. This is the single
    place in V1 #9 that needs a key.
  - Recording is a **clearly-separated, gated, one-time step**: a documented
    `tsx` command in `packages/evals` guarded by `RUN_LIVE_PROVIDER` + key, exactly
    like `providers/adapters/live.test.ts`. It is **never** part of `pnpm
    test`/`pnpm eval`/CI. Its only output is committed JSON files + a re-recorded
    baseline.
  - The CI gate (`pnpm eval`) runs **only on the committed recorded bytes** and
    stays keyless. The "calibration" (setting `minOverall` etc.) is editing
    `thresholds.json` — pure data, no key.
  *Why this framing:* it satisfies §4/§9 ("recorded baselines") and the DoD ("beat
  the recorded raw-model baseline") while preserving the ADR-0009 invariant that CI
  never calls a model. **This is the load-bearing decision — flag it to the
  orchestrator before implementation so a key is provisioned.**

- **[RATIFY] Recording scope for V1: record the *raw-model control* and the
  *qa-engine* arm for the fixtures needed to prove the DoD; keep host-only synthetic
  unless a host capture is cheap.** *Why:* the DoD (#6) is "comparative evals beat
  the **recorded raw-model baseline**" — it names raw-model and qa-engine, not
  host-only. raw-model (single prompt) and qa-engine (`createPlan`) are both
  recordable from this repo with one key; host-only ("host agent reasoning") needs a
  driving host and has no in-repo harness. *Recommendation:* record **all 8
  fixtures' raw-model + qa-engine arms** if the key budget allows (strongest moat
  evidence); the **minimum to ship** is recording enough fixtures that the recorded
  qa-engine demonstrably beats the recorded raw-model and clears `minOverall`.
  host-only may remain `synthetic` in V1, documented as a known limitation
  (criterion 7). *Alternative considered & rejected:* fabricating a "recorded"
  host-only from a script — rejected: a `recorded` flag on hand-authored data is
  dishonest and defeats the calibration's purpose. Mixed `recordKind` per fixture is
  legal (the field is per-candidate).

- **[RATIFY] The recording tool lives in `packages/evals/src/corpus/` as a gated
  `tsx` script (`record-arms.ts`), not in `qa-engine`/`apps/mcp`.** It imports
  `createProvider` + `createPlan` + `validateTestGraph` + `serializeTestGraph` from
  `@test-framework/qa-engine`, reads a fixture's `brief`/`suppliedSources`, builds a
  `CreatePlanInput`, runs the live arm, **validates** the captured graph (throw if
  invalid, mirroring `build-corpus.ts`), and writes `graph.json` (canonical) to the
  arm dir. *Why:* keeps the live seam out of the deterministic harness; reuses the
  engine's public API; matches the existing `corpus:build`/`live.test.ts` patterns.
  Add `record:arms` to `packages/evals/package.json` scripts, guarded so it errors
  fast without `RUN_LIVE_PROVIDER`.

- **[RATIFY] Annotation of a recorded graph is a one-time, human, PR-reviewed step
  (ADR-0009's "human-calibration step"); it is authored against the *frozen
  captured graph*, by hand, mirroring `builders.ts`' annotation shape.** The
  recording tool writes the graph; it does **not** auto-generate the annotation
  (that would be a model-as-judge). The implementer authors `annotations.json`
  mapping the captured graph's entities to the fixture's Truth Keys, marks each
  extra as `supported-inferred` / `unsupported-invented` / `contradicts-truth`, and
  sets `recordKind: "recorded"`. `checkAnnotationIntegrity` enforces completeness at
  `pnpm eval` time. *Why:* preserves "the only human judgment in scoring is the
  reviewed Annotation" (CONTEXT.md / ADR-0009).

- **[RATIFY] Latency, cost, and failure-rate thresholds are dispositioned, not
  fabricated.** *Failure rate* = the existing new-Hard-Fail regression rule in
  `compareToBaseline` (satisfies DoD "no material regression in … failure rate").
  *Latency* and *cost* = **recorded as non-gating V1 observations** in the
  limitations doc, because `NormalizedUsage` carries token counts only and "cost is
  deferred (decision #9)" and no latency is measured anywhere. *Why:* §9 lists these
  thresholds, but the deterministic harness cannot measure them and adding numbers it
  cannot reproduce would break byte-stability and honesty. The doc states: token
  usage is observable per generation (non-gating); cost/latency gating is a V2
  concern once execution and a hosted runtime exist. *Alternative considered &
  rejected:* adding `maxTotalTokens`/`maxLatencyMs` to `thresholds.json` — rejected:
  not measured by the eval path; would couple the gate to non-deterministic live
  runs.

- **[RATIFY] `minOverall` is set so the recorded qa-engine arms PASS and weak/raw
  arms with a valid graph that fall below the bar FAIL; deltas set the post-release
  tolerance.** Recommended starting calibration after recording: `minOverall` = the
  calibrated quality floor (a round number below the lowest recorded qa-engine
  `overall`, above typical recorded raw-model where raw-model is valid);
  `maxUnsupportedRate` confirmed at `0.15`; `maxRegressionDelta` and
  `maxUnsupportedRegressionDelta` either kept at `0` (strictest — any drop is a
  regression) or set to a small documented tolerance. The exact numbers are derived
  from the recorded `results.json` at implementation, not guessed now. *Why:* the
  threshold's purpose is to gate future tuning against the recorded reality; it must
  be derived from recorded data. Record the chosen numbers + rationale in the
  calibration commit body and the checkpoint.

- **[RATIFY] Publish limitations + security as a new `docs/limitations-and-security.md`,
  linked from `README.md` and checkpoint §9 — not a new ADR.** *Why:* §9 says
  "publish limitations and security model"; this is user-facing release
  documentation, not an architecture decision. The ADRs (0001/0002/0006/0009/0010)
  already record the *decisions*; this doc *publishes* them for users. The DoD #7
  ("limitations are documented") points at exactly this file.

- **[RATIFY] Install/config/error-flow "testing" = a documented acceptance script +
  the existing MCP test suite, plus reproducing the keyless first-contact flows once
  over the built binary.** *Why:* the MCP adapter already has built-stdio handshake,
  in-memory create/refine, and the `errors.test.ts` table (#8). #9's job is to
  *prove the install/config/error journey end-to-end as a release check* and
  document it — not to re-test the adapter. The one live `create_test_plan` E2E is
  the gated step. *Alternative considered & rejected:* a new automated installer
  integration test in CI — rejected: it would need a key (real create) or only
  re-assert the existing keyless handshake test; the documented manual acceptance +
  gated live E2E is the honest release check.

## Slices

Vertical, independently shippable, test-first where code is involved. Each lands
green: with `PN="$HOME/.nvm/versions/node/v25.2.1/bin"`, run `"$PN/pnpm"
check-types && "$PN/pnpm" test && "$PN/pnpm" check:ci && "$PN/pnpm" build &&
"$PN/pnpm" eval` (the nvm wrapper is broken; call binaries by absolute path).
**Slices 1–2 are keyless (data + docs scaffolding).** The live recording (Slice 3)
needs the provisioned key and is the only network step; everything after it is
keyless again.

### Slice 1 — Disposition the gate: failure-rate rule + threshold calibration test (keyless, no recording yet)

**Change:** Lock down what the gate already enforces and prepare the calibration,
*before* any recording, so the recorded data drops into a ready gate.
- Add a regression test `packages/evals/src/harness/calibration.test.ts` that, given
  the **current** committed baseline, asserts the structural release properties that
  must hold after calibration: for every fixture, `qa-engine.overall >=
  host-only.overall >= raw-model.overall` is **not** required (raw-model may
  Hard-Fail), but `qa-engine.overall >` the other arms' overall on average, and
  every `qa-engine` candidate has `verdict === "PASS"` and no Hard-Fail. (This test
  is the executable form of the moat claim and will keep holding once arms become
  `recorded`.)
- Add a test asserting the **failure-rate disposition**: a synthesized candidate
  with a new Hard-Fail vs the baseline produces a `compareToBaseline` regression
  (proves "no material regression in failure rate" is enforced). Reuse
  `compareToBaseline` directly with two in-memory `EvalResult`s.
- Do **not** change `thresholds.json` yet (still `minOverall: 0`) — calibration
  happens in Slice 4 after recording, so the baseline stays byte-stable here.

**Files touched:** `packages/evals/src/harness/calibration.test.ts` (new).

**Tests / verification:** the two new tests; `"$PN/pnpm" -F @test-framework/evals
test && "$PN/pnpm" eval` green (baseline unchanged). → criteria 1 (skeleton), 4
(failure-rate half).

### Slice 2 — Recording tool (gated) + recorded-arm support, proven on the fake (keyless)

**Change:** Add the recording script and prove its *non-live* machinery
deterministically (the live call itself is exercised in Slice 3).
- New `packages/evals/src/corpus/record-arms.ts`: a `tsx` entrypoint that
  - hard-requires `RUN_LIVE_PROVIDER` + a key (errors fast otherwise, like
    `live.test.ts`);
  - reads a target fixture's `fixture.json`, builds a `CreatePlanInput` from its
    `brief` + `suppliedSources`;
  - for `--arm qa-engine`: `createPlan(input, { provider: await
    createProvider(config), now, workspaceRoot: <tmp> })` and takes the resulting
    graph; for `--arm raw-model`: a single structured `provider.generate` against the
    same brief producing a `test-graph/v1` candidate (the raw-prompt control);
  - **validates** the captured graph with `validateTestGraph` (throws on invalid,
    mirroring `build-corpus.ts`), then `serializeTestGraph` → writes
    `candidates/<arm>/graph.json`;
  - prints a reminder that the matching `annotations.json` must be hand-authored with
    `recordKind: "recorded"`.
- Factor the **pure** parts (fixture → `CreatePlanInput`, graph → canonical write
  path) into testable functions and unit-test them with the **fake provider**
  (`createFakeProvider`) so the tool's wiring is covered keylessly. The live guard
  is asserted to throw without `RUN_LIVE_PROVIDER`.
- Add `"record:arms": "tsx src/corpus/record-arms.ts"` to
  `packages/evals/package.json`.

**Files touched:** `packages/evals/src/corpus/record-arms.ts` (new),
`packages/evals/src/corpus/record-arms.test.ts` (new, fake-backed),
`packages/evals/package.json`.

**Tests / verification:** fake-backed unit tests (input building, canonical write,
live-guard throws); `"$PN/pnpm" -F @test-framework/evals test && check-types &&
check:ci`. CI stays keyless. → criterion 1 (tooling).

### Slice 3 — One-time live recording + hand-authored annotations (GATED, needs the key)

**Change:** The single network step. Performed by the orchestrator/implementer with
the provisioned key; its *output* (committed JSON) is what ships.
1. `RUN_LIVE_PROVIDER=1 ANTHROPIC_API_KEY=… "$PN/pnpm" -F @test-framework/evals
   record:arms --fixture <id> --arm qa-engine` and `--arm raw-model` for each
   in-scope fixture (per the ratified recording scope). This overwrites those arms'
   `graph.json` with **real recorded** output.
2. **Hand-author** each recorded arm's `annotations.json` against the captured graph
   (map entities → Truth Keys; classify extras; `recordKind: "recorded"`).
   `checkAnnotationIntegrity` will fail `pnpm eval` if any entity is unannotated, so
   completeness is enforced.
3. host-only arms left `synthetic` unless a host capture is done (documented as a
   limitation in Slice 6).

**Files touched:** the in-scope `candidates/<arm>/graph.json` (recorded) and
`candidates/<arm>/annotations.json` (`recordKind: "recorded"`) under
`packages/evals/test/fixtures/corpus/`.

**Tests / verification:** `"$PN/pnpm" eval` (still keyless — it reads the new
committed bytes) must run; expect it to **fail the regression check** here because
the baseline is stale — that is correct and is resolved in Slice 4. `validateTestGraph`
already passed inside the recording tool. → criterion 1 (recorded data exists).

> **Determinism note:** real model output is non-deterministic, so the recorded
> graph is *captured once and frozen as committed bytes*. From that point the
> harness is byte-stable again (it scores files, not the model). A future re-capture
> is a deliberate PR (new graph + new annotation + `eval:update`), never CI.

### Slice 4 — Calibration commit: set real thresholds + re-record the baseline (keyless)

**Change:** With recorded arms in place, derive and set the real release gate, then
accept the new baseline. **This is "the calibration commit."**
- Inspect the recorded `results.json` (run `pnpm eval` to see current scores) and set
  `test/fixtures/eval-config/thresholds.json`:
  `minOverall` = the calibrated floor (below the lowest recorded qa-engine
  `overall`, above recorded raw-model where it is a valid graph);
  `maxUnsupportedRate` confirmed; `maxRegressionDelta` / `maxUnsupportedRegressionDelta`
  set to the chosen tolerance. Record exact numbers + rationale in the commit body.
- `"$PN/pnpm" eval:update` to re-record `baseline/results.json` + `report.md` over
  the recorded corpus with the new thresholds; review the diff carefully (the
  `recordKind` flips and the score changes are the expected diff).
- Update Slice 1's `calibration.test.ts` to additionally assert `minOverall > 0` and
  that at least one fixture has a `recorded` raw-model and a `recorded` qa-engine
  whose `overall` strictly exceeds it.

**Files touched:** `packages/evals/test/fixtures/eval-config/thresholds.json`,
`packages/evals/test/fixtures/baseline/{results.json,report.md}`,
`packages/evals/src/harness/calibration.test.ts`.

**Tests / verification:** `"$PN/pnpm" eval` exits 0 and is byte-stable across two
runs; `calibration.test.ts` green; full gate green. → criteria 1, 2, 3.

### Slice 5 — Install/config/error-flow acceptance script + DoD #1–#5 verification table (keyless)

**Change:** Document the release acceptance journey and re-confirm the done items.
- New `docs/release-acceptance.md` (or a section appended to the limitations doc):
  - **Install/config:** the exact `pnpm install` → `pnpm --filter mcp build` →
    register `dist/index.js` → set `TEST_FRAMEWORK_PROVIDER`/`MODEL`/`KEY_ENV`/`ROOT`
    + the key → expected `tools/list` (three tools, keyless) sequence, with the
    built-stdio handshake test named as the automated proof.
  - **Error-flow matrix:** a table of first-contact failures → the typed
    `{ code, message, retryable }` the host sees → host action, cross-referencing
    `apps/mcp/src/errors.test.ts` and the README error policy; explicitly list the
    keyless cases (`INVALID_INPUT` empty sources, `PROVIDER_CONFIG_INVALID`/missing
    key on first generative call) reproduced over the built binary.
  - **DoD #1–#5 verification table:** each done item → the existing test(s)/live path
    that proves it (e.g. #2 → MCP in-memory `create_test_plan` test + persisted plan
    files; #3 → engine semantic-review/validation/repair tests; #5 → concurrent-refine
    + `validatePlanRevisionTransition` tests).
- One gated **live MCP E2E**: a `{ skip: !RUN_LIVE_PROVIDER || !key }` test (or a
  documented manual run) that does a real `create_test_plan` over the built binary
  and asserts a persisted, valid plan — the user-journey proof for DoD #1/#2/#7.

**Files touched:** `docs/release-acceptance.md` (new) or merged into the limitations
doc; optionally `apps/mcp/src/*.test.ts` for the gated live E2E (no behavior change).

**Tests / verification:** existing MCP suite green; the gated live test `skip`-ped in
CI; the acceptance script reproduced once manually and noted. → criteria 5, 6, 8.

### Slice 6 — Limitations + security-model doc (keyless)

**Change:** Publish `docs/limitations-and-security.md`.

**Outline (concrete):**
- **What V1 is / is not** (from `v1-mvp.md` Position): a local BYOK *planning*
  engine; not a hosted platform; does not execute tests; not a thin host-model
  wrapper (ADR-0002/0006).
- **Capability boundary:** plans are execution-ready but not executable; no
  browser/API probing; no source patching; no cloud/dashboard/teams/billing.
- **Known limitations:** host-only eval arm is synthetic (raw-model + qa-engine are
  recorded); 8-fixture corpus is calibrated, not exhaustive; latency and cost are
  observed (token usage) but **not gated** in V1 (cost deferred per CONTEXT.md;
  latency unmeasured); the scanner's residual parent-component TOCTOU window
  (README §Repository context); deterministic validation cannot prove semantic
  completeness (CONTEXT.md invariant); plan quality depends on the user's chosen
  model.
- **Security model:**
  - *BYOK key handling:* keys by reference only (`keySource: { kind: "env", var }`),
    no `apiKey` in config (schema rejection), never stored in config/logs/prompts/
    artifacts/telemetry (CONTEXT.md invariant; ADR-0010); secret-safe allowlist
    logging + masking.
  - *Leakage gate:* the eval harness Hard-Fails any candidate whose graph/annotation
    text matches a credential shape (`detectLeakage`: PEM, AWS, Slack, JWT, `sk-…`,
    `*_API_KEY`).
  - *Error hygiene:* the MCP error envelope is curated/secret-free; non-engine errors
    collapse to `INTERNAL` with no `err.message` (#8 table + test).
  - *Filesystem confinement:* root-confined plan writes; optional `repo.path`
    hard-confined; scanner symlink avoidance, hard secret exclusions, byte/traversal
    caps (README §Repository context).
  - *Supply-chain isolation:* vendor SDKs loaded by dynamic import only, off the
    common path.
  - *CI integrity:* CI is keyless and deterministic; no model call gates anything
    (ADR-0009).
- **Threshold disposition** (criterion 4): failure-rate enforced via new-Hard-Fail
  regression; latency/cost non-gating observations.

**Files touched:** `docs/limitations-and-security.md` (new); `README.md` (link it +
note recorded vs synthetic arms).

**Tests / verification:** `"$PN/pnpm" check:ci` (biome/markdown) green. → criterion 7,
4 (latency/cost half).

### Slice 7 — Tick the definition-of-done + flip checkpoint §9 to done (keyless)

**Change:** Close the checkpoint.
- `docs/v1-mvp.md`: annotate `## Definition of Done` — confirm each of the 7 items
  passes (link to its proof: tests, recorded baseline, the new docs).
- `docs/v1-checkpoint.md`: §4 status → "calibrated: real recorded raw-model +
  qa-engine baselines and release thresholds committed"; §9 status `pending → done`
  with a done-note summarizing the recorded baseline, the calibrated thresholds, the
  threshold disposition, the limitations/security doc, and the DoD verification
  table; update the Headline and the Current Reality "Comparative evals" row
  (`Pending → Done`).
- `README.md`: ensure the Evaluation section notes that arms are now **recorded**
  (raw-model + qa-engine) with host-only synthetic, and links the limitations doc.

**Files touched:** `docs/v1-mvp.md`, `docs/v1-checkpoint.md`, `README.md`.

**Tests / verification:** `"$PN/pnpm" check:ci && "$PN/pnpm" build && "$PN/pnpm"
test && "$PN/pnpm" eval` all green. → criteria 7, 10; DoD #6/#7 closed.

## Commit guidance (commitlint is strict)

gitmoji-conventional, scope from the enum (`evals`, `qa-engine`, `repo-scan`,
`mcp`, `docs`, `repo`, `infra`, `stack` — dirs under `apps/`/`packages/` plus the
fixed five). **Subjects MUST be entirely lowercase, including acronyms** —
`byok`/`mcp`/`api`, never `BYOK`/`MCP`/`API` (`subject-case` = `lower-case`, a hard
error). No trailing full stop. Header pattern is `:<emoji>: <type>(<scope>):
<subject>`. Examples for this workstream:

- `:white_check_mark: test(evals): add calibration regression for recorded arms`
- `:sparkles: feat(evals): add gated record-arms tool for real baselines`
- `:memo: docs(docs): publish limitations and security model`
- `:memo: docs(evals): record real release thresholds (calibration commit)`
- `:memo: docs(docs): flip checkpoint #9 to done with dod verification`

Per the project memory: no AI attribution in commit subjects/bodies; use the
ship-it skill + gitmoji-conventional format.

## Risks

| Risk | Likelihood | Impact | Control |
| --- | --- | --- | --- |
| Recording needs a key the orchestrator hasn't provisioned (whole slice 3 blocked) | High if unflagged | High | The pivotal `[RATIFY]` calls it out explicitly; obtain `ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY` before Slice 3. Slices 1–2 and the gate machinery proceed keyless. |
| Recorded qa-engine graph fails `validateTestGraph` (real model output is messy) | Medium | Medium | The recording tool validates before writing (mirrors `build-corpus.ts`); on failure, the engine's bounded-repair already ran inside `createPlan`, so an invalid result is a real engine signal — capture, document, and if needed re-run; do NOT hand-edit the graph to pass. |
| Recorded qa-engine does NOT beat recorded raw-model on some fixture (moat claim fails) | Low–Medium | High | This is the honest signal #9 exists to surface. If it happens, it gates V1 release (DoD #6) and routes to the *next* (prompt-tuning) workstream — exactly the order the checkpoint mandates. The recorded baseline + thresholds are still committed so tuning has a target. Do not weaken `minOverall` to mask it. |
| Non-determinism: a re-run of `record:arms` produces a different graph, diffing the corpus | Medium | Low | By design the recorded graph is frozen committed bytes; `pnpm eval` scores files, never the model. Re-capture is a deliberate PR (`eval:update`), documented in the determinism note. |
| Fabricating latency/cost thresholds to "satisfy" §9 wording | Medium | Medium | `[RATIFY]` dispositions them as non-gating doc observations; `thresholds.json` gains no latency/cost field; the engine measures tokens only (`NormalizedUsage`), cost deferred. |
| Annotation of a recorded graph is incomplete → `HF-ANNOTATION-INTEGRITY` Hard-Fail at eval time | Medium | Low | `checkAnnotationIntegrity` fails fast and names the unannotated entity; author every requirement/case/source/assertion annotation against the captured graph. |
| Threshold change accepted without recorded rationale (ADR-0009 requires review) | Low | Medium | The calibration commit (Slice 4) records exact numbers + rationale in the body; the baseline diff is reviewed in the PR. |
| A real key leaks into a committed recorded artifact | Low | High | `detectLeakage` Hard-Fails any credential shape in graph/annotation text; the engine never writes keys into the graph (provenance/usage carry no secrets); reviewer scans the diff. |
| CI accidentally made key-dependent | Low | High | The recording tool and live E2E are `RUN_LIVE_PROVIDER`-gated and `skip`-ped; `pnpm eval`/`pnpm test` import no provider on the CI path; criterion 9 re-asserts keyless green after each slice. |
