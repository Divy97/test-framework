---
type: feature-plan
status: draft
source_type: free_text
source_ref: "Workstream #6 (QA Engine) — docs/v1-checkpoint.md; architecture spec 2026-06-14"
created_at: "2026-06-19"
updated_at: "2026-06-19"
---

# QA Engine (Workstream #6)

The deep module that turns feature context into a valid, persisted, traceable
`test-graph/v1` plan through one coarse call — `createPlan` — plus a trivial
`loadPlan`. Callers never orchestrate internal stages.

## Source Snapshot

- **Checkpoint:** `docs/v1-checkpoint.md` — Workstream #6 is `pending`; the
  product "currently cannot generate a real QA plan." Everything upstream is done:
  test graph (#3), eval harness (#4), BYOK provider seam (#5).
- **Spec:** `docs/superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md`
  defines the `QaEngine` interface and the 8 internal stages (ingest →
  contextualize → model-requirements → plan-cases → semantic-review →
  deterministic-validation → bounded-repair → persist).
- **Domain:** `CONTEXT.md` (QA Engine, Test Graph, Provenance, Structured
  Generation), ADR-0003 (stages stay internal), ADR-0004 (planning-first,
  execution-ready), ADR-0006 (reject validator-only), ADR-0010 (BYOK seam).
- **Reuse already on `main`:** `packages/qa-engine/src/providers/*` (seam,
  `createProvider`, `ModelProvider`, scripted fake), `packages/qa-engine/src/test-graph/*`
  (`testGraphV1Schema`, `validateTestGraph`, `createStableId`, `canonicalizeTestGraph`,
  `renderMarkdown`, `validatePlanRevisionTransition`), `packages/repo-scan` (`scanRepository`).

## Assumption Log

- `test-graph/common.ts` provenance schema maps to three kinds — `explicit`,
  `inferred`, `assumption` (confirmed `explicit`/`inferred` in `validate.ts`; third
  inferred from CONTEXT). Exact shape **must be read at implementation** before
  writing the strength→provenance mapping.
- The scripted fake (`providers/fake/fake-provider.ts`) can return a **different
  structured payload per sequential call** (one per stage). Verify at the start of
  Slice 4; if it only scripts one response, extend it (test-only seam).
- Eval fixtures are brief-only (no repo). Therefore repo context is **optional**
  for `createPlan` — confirmed by `packages/evals` corpus shape.
- No new runtime dependency. Engine = existing seam + test-graph + repo-scan +
  `zod` + Node stdlib.

## Goal and Success Criteria

**Goal:** A single `createPlan(input, deps)` call produces a `test-graph/v1`
graph that passes `validateTestGraph`, persists it atomically as
`plan.json` + derived `plan.md` + `generation.json`, and returns the graph with
typed warnings/usage — without the caller touching any internal stage.

**Success criteria:**

1. `createPlan` over a feature-request brief (deterministic fake provider, fixed
   clock) yields `validateTestGraph(result.graph).valid === true`.
2. Output is **byte-stable**: same input + fixed clock + scripted fake → identical
   `plan.json` bytes (canonical JSON; IDs never derive from time/order/prose).
3. Plan persists to `.test-framework/plans/<plan-id>/` and round-trips: a fresh
   `loadPlan` re-reads and re-validates it.
4. Every failure path returns a **typed** `EngineError`; no stage writes a partial
   or plausible-but-incomplete plan as complete.
5. `pnpm test`, `check-types`, `biome`, `build` green; CI runs on the fake alone.

## Scope and Non-Goals

**In scope:** `createPlan` (all 8 stages, 6+ model calls), `loadPlan` (read +
validate), engine error taxonomy, slug-keyed per-stage draft schemas,
deterministic assembly (draft → graph via `createStableId`), minimal atomic
persistence (temp+rename, read-back validate, root confinement), versioned
prompt/methodology assets, aggregated usage + warnings.

**Non-goals (explicitly deferred):**

- `refinePlan`, optimistic version conflict, `ARTIFACT_CONFLICT`, concurrent-refine
  safety → **Workstream #7**.
- Deleting/rewiring `core`/`planner`/`artifacts` and the MCP tool rewrite →
  **Workstream #8** (those packages stay untouched and green here).
- Prompt-quality tuning, recorded baselines, release thresholds → **Workstream #9**.
- Any test execution, codegen, or cloud → V2/V3.

## Resolved Decisions

- **Persistence scope:** Minimal atomic writer in #6 (temp+rename, read-back
  `validateTestGraph`, `plan.json` + `plan.md` + `generation.json`); defer
  optimistic version-conflict + concurrent-refine to #7.
  Why: meets the "persisted" exit criterion end-to-end without building #7 twice.
  Source: grilled.
- **Operation scope:** Build `createPlan` (deep) + `loadPlan` (trivial). Defer
  `refinePlan` to #7.
  Why: `refinePlan` safety depends on the version-conflict machinery that lands in
  #7; building it now means an unsafe overwrite or rework.
  Source: grilled.
- **Old packages:** Leave `core`/`planner`/`artifacts` and `apps/mcp` untouched;
  #8 retires them.
  Why: tightest diff, no MCP breakage; #8 owns the rewrite that frees them.
  Source: grilled.
- **Model-call flow:** Deeply staged, 6+ model calls — requirements, features,
  cases, assertions/steps/data, independent semantic review, bounded repair.
  Why: max quality ceiling; honors the spec's mandated independent review pass and
  the eval-as-moat philosophy.
  Source: grilled.
- **Evidence stage:** Dedicated evidence-extraction call feeding requirements
  (model commits to what sources say before deriving requirements).
  Why: "evidence before verdict" invariant (CONTEXT.md) + the max-quality choice.
  Source: docs + grilled.
- **ID assignment:** The model emits content + stable semantic **keys** (slugs);
  the engine derives all IDs via `createStableId(kind, planId, key)` and resolves
  cross-references by key. The model never emits IDs.
  Why: `createStableId` requires canonical semantic keys and forbids IDs derived
  from prose/order/timestamps, so refinement preserves identity.
  Source: codebase (`test-graph/ids.ts`).
- **Provider injection:** Engine functions take an injected `ModelProvider` +
  `now: () => number` + `workspaceRoot` (DI), mirroring the seam's existing
  pattern; tests pass the scripted fake + fixed clock + temp dir.
  Why: matches `createProvider(config, deps)`; keeps CI on the fake.
  Source: codebase (`providers/factory.ts`).
- **Determinism:** A clock is injected; timestamps and `inputFingerprint` come
  from inputs + injected clock so output is byte-stable.
  Why: eval/determinism principle; byte-stable artifacts are diffable.
  Source: docs + codebase.
- **Failure model:** Provider auth/quota/transient/timeout and `MODEL_OUTPUT_INVALID`
  → typed errors (mapped from `ProviderError`); repair-budget-exhausted invariant
  failures → `PLAN_INVARIANT_FAILED`; non-blocking residue (e.g. unresolved
  non-blocking open questions) → `status: "incomplete"` + warnings, still persisted.
  Why: spec Error Model; "no plausible partial plan as complete."
  Source: docs (spec §Error Model).

## Libraries & Verified APIs

| Library / Package | Version | API / Pattern Used | Verified Via |
|-------------------|---------|--------------------|--------------|
| zod | ^4.1.13 | `z.toJSONSchema(schema)` for structured generation; per-stage draft schemas; `.strict()` | codebase `providers/structured-output.ts:13`; `pnpm-workspace.yaml` |
| @test-framework/qa-engine (seam) | workspace | `createProvider`, `ModelProvider.generate({schema,...}, {timeoutMs, signal, retry})` | codebase `providers/factory.ts`, `providers/types.ts` |
| @test-framework/qa-engine (graph) | workspace | `validateTestGraph`, `parseTestGraph`, `createStableId`, `canonicalizeTestGraph`, `renderMarkdown` | codebase `test-graph/{validate,ids,canonical-json,markdown}.ts` |
| @test-framework/repo-scan | workspace | `scanRepository(request)` → `RepoScanSummary` (bounded, confined) | codebase `repo-scan/scanner.ts`, `contracts.ts` |
| node:fs/promises | Node 25.2.1 | atomic write: `writeFile(tmp)` → `rename(tmp, final)`; `mkdir({recursive})` | Node stdlib |
| node:crypto | Node 25.2.1 | `createHash('sha256')` for input fingerprint (same pattern as evals/ids) | codebase `test-graph/ids.ts`, `evals/harness/run.ts` |

No `Verified Via: training-data` rows. The vendor SDKs (`@anthropic-ai/sdk`,
`openai`) stay behind the seam; the engine never imports them.

## Feature Surfaces

| Surface | Applies? | Guardrail skill | Why |
| --- | --- | --- | --- |
| Forms / inputs / validation | yes | form-validation | `CreatePlanInput`/`LoadPlanInput` validated by zod at the engine boundary; reject empty/contradictory input with `INVALID_INPUT` |
| Cross-flow behavior | yes | cross-flow-consistency | Engine output must be the same `test-graph/v1` contract evals + test-graph fixtures + markdown renderer consume |
| Data mapping / labels / DTOs | yes | data-mapping | Model slug-keyed drafts → graph entities; strength→provenance; key→ID resolution; alignment with eval `truthKey` concept |
| Navigation / CTAs / redirects | no | navigation-actions | No UI surface |
| Auth / permissions / roles | no | backend | Engine has no auth; credential **secret-safety** handled by the seam (config has no key) |
| Async / network / concurrency | yes | backend | 6+ model calls with per-call timeout, `AbortSignal` cancellation, bounded retry; ordered stage pipeline |
| Billing / trial / state gates | no | backend/database | Out of V1 |

## Product Invariants

- JSON `plan.json` is canonical (`canonicalizeTestGraph`); `plan.md` is derived and
  regenerable.
- Public surface is coarse (`createPlan`/`loadPlan`); the 8 stages stay internal
  (ADR-0003).
- Every `explicit`/`inferred` requirement and every test case carries traceable
  evidence; every assertion belongs to a case and states what it observes.
- Assumptions are visibly labeled (`provenance.kind: "assumption"`) and never
  masquerade as fact.
- Deterministic validation never claims semantic completeness; semantic judgment is
  the model's review pass only (ADR-0006).
- Provider credentials never enter prompts, repo context, `generation.json`, or
  logs.
- V1 cases are execution-ready but not executable.
- Output passes `validateTestGraph` before any write; nothing partial is written
  as complete.

## Cross-Flow Checks

| Concept | Existing flows to compare | Required consistency |
| --- | --- | --- |
| `test-graph/v1` output contract | evals (scores committed graphs), test-graph round-trip tests, markdown renderer | Engine output passes `validateTestGraph` AND round-trips through `canonicalizeTestGraph`→`renderMarkdown` identically |
| Provider usage | provider seam DI + scripted fake; evals "qa-engine arm" | Engine consumes `ModelProvider` exactly as a future eval producer would; CI runs on the fake |
| Stable identity | `createStableId`, `validatePlanRevisionTransition` | `projectId`/`planId` derivation must keep a future `refinePlan` (#7) able to increment `planVersion` without changing identity |
| Artifact layout | `artifacts` stub paths, spec §Artifact Model | Use `.test-framework/plans/<plan-id>/{plan.json,plan.md,generation.json}` |

## QA Attack List

| Case | Expected result | Verification |
| --- | --- | --- |
| Model emits duplicate semantic key within a stage | `MODEL_OUTPUT_INVALID` (assembly rejects), or repair | unit test on assemble |
| Requirement cites unknown `evidenceKey` | dangling ref caught at assemble/validate → bounded repair | unit + validation test |
| Test case covers zero requirements | `CASE_REQUIREMENT_REQUIRED` → repair | validation test (existing finding) |
| Explicit requirement cites non-supplied source | `EXPLICIT_SOURCE_REQUIRED` → repair | validation test |
| `case-produced` data has 0 or >1 producers | `MISSING_/MULTIPLE_DATA_PRODUCERS` → repair | validation test |
| Non-contiguous step orders | `NONCONTIGUOUS_STEP_ORDER` → repair | validation test |
| Repair budget (≤2) exhausted, invariants still fail | throw `PLAN_INVARIANT_FAILED` with findings; nothing written | end-to-end test, fake scripted to stay invalid |
| Provider auth/quota/transient/timeout | mapped typed `EngineError`; no partial write | unit test with fake throwing `ProviderError` |
| `repoPath` outside root / unreadable | `REPO_ACCESS_DENIED` (repo-scan confinement) | unit test |
| Repo scan truncates (caps hit) | partial context + warning on result; not an error | unit test (scanner `truncated`) |
| Empty/contradictory input (no sources) | `INVALID_INPUT` before any model call | boundary test |
| Model output not valid JSON / schema mismatch | seam throws `MODEL_OUTPUT_INVALID`; engine repairs or surfaces | unit test |
| Write interrupted mid-persist | temp+rename leaves no corrupt `plan.json`; `ARTIFACT_WRITE_FAILED` | persist test simulating rename failure |
| Same input twice (fixed clock, scripted fake) | identical `plan.json` bytes | byte-stability test |
| Secret-like content in sources/repo | excluded from context (scanner); never in artifacts | leakage assertion on context + artifacts |

## TDD Plan

- **Public interface under test:** `createPlan(input, deps): Promise<CreatePlanResult>`
  and `loadPlan(input, deps): Promise<TestGraphV1>`.
- **Behaviors to prove first (ordered):**
  1. Deterministic assembly: a hand-built slug-keyed draft → a graph that passes
     `validateTestGraph` (no provider involved).
  2. `createPlan` with scripted fake over a brief → valid persisted graph.
  3. Byte-stability under fixed clock + scripted fake.
  4. Bounded repair: fake emits invalid-then-valid → succeeds within budget.
  5. Typed failure: fake stays invalid → `PLAN_INVARIANT_FAILED`, nothing written.
  6. `loadPlan` round-trips a persisted plan.
- **First failing test:** `createPlan produces a valid persisted test-graph/v1 from
  a feature-request brief (fake provider)` — fails because `engine/createPlan` does
  not yet exist.
- **Boundary/system mocks:** provider → scripted fake; clock → fixed `now`;
  filesystem → temp workspace dir. Repo scan runs for real on a small fixture dir
  or is injected. No mocking of internal stages.
- **Test-first skipped:** no.

## Implementation Plan

All new code under `packages/qa-engine/src/engine/`. Export `createPlan`,
`loadPlan`, and the public types from `qa-engine/src/index.ts`.

- **Slice 0 — Scaffolding + types + first failing test.**
  `engine/types.ts` (`CreatePlanInput`, `CreatePlanResult`, `LoadPlanInput`,
  `EngineDeps = { provider, now, workspaceRoot, scan?, log? }`),
  `engine/errors.ts` (`EngineError` taxonomy mapping the spec error model + a
  mapper from `ProviderError`). Write the failing end-to-end test (success
  criterion 1).
- **Slice 1 — Ingest + identity (deterministic).** Normalize inputs → `Source`
  records; derive `projectId` from project name and `planId` from project + title +
  input fingerprint via `createStableId`; compute `inputFingerprint` (sha256 over
  canonicalized inputs). Unit-tested, no model.
- **Slice 2 — Per-stage draft schemas (zod, slug-keyed, no IDs).**
  `EvidenceDraft`, `RequirementsDraft` (+ open questions), `FeaturesDraft`,
  `CasesDraft`, `DetailsDraft` (steps + assertions + data), `ReviewFindings`,
  `RepairPatch`. Unit-tested accept/reject.
- **Slice 3 — Assemble (deterministic core).** Map drafts → `TestGraphV1`:
  assign IDs via `createStableId`, resolve slug→ID cross-references, map
  strength→`provenance` (read `test-graph/common.ts` first), build `generation`
  metadata. A hand-built draft fixture assembles to a graph that passes
  `validateTestGraph`. Heavily unit-tested.
- **Slice 4 — Stage runners.** Each stage = one
  `provider.generate({ schema: stageSchema, system, messages, maxOutputTokens }, { timeoutMs, signal })`
  with a versioned prompt asset. Verify the fake supports sequential per-stage
  payloads; extend the test-only fake if needed. Wire ingest → contextualize
  (`scanRepository` when `repo` present) → evidence → requirements → features →
  cases → details.
- **Slice 5 — Review, validate, bounded repair.** Independent semantic-review call
  → `ReviewFindings` → one revise application; run `validateTestGraph`; on invariant
  findings, bounded repair (≤2, configurable) re-calling the model with the findings;
  re-validate. Tested with fake scripted invalid→valid and invalid→invalid.
- **Slice 6 — Persist (minimal, atomic).** `engine/persist.ts`: `mkdir -p` the
  plan dir under `workspaceRoot` (root-confined), write `plan.json`
  (`canonicalizeTestGraph` bytes) + `plan.md` (`renderMarkdown`) + `generation.json`
  via temp-file + `rename`, then read-back + `validateTestGraph`. `ARTIFACT_WRITE_FAILED`
  on failure. Tested with temp dir + simulated rename failure.
- **Slice 7 — `loadPlan`.** Read `plan.json` + `parseTestGraph`; map missing/invalid
  to typed errors. Tested round-trip against a `createPlan` output.
- **Slice 8 — End-to-end + byte-stability.** Brief-only fixture, scripted fake,
  fixed clock → valid persisted graph; assert identical bytes across two runs
  (success criteria 1–3).

## Verification Plan

- `pnpm --filter @test-framework/qa-engine test` (new engine tests + existing seam
  + test-graph stay green), `check-types`, root `biome` + `build`.
- End-to-end assertion: `validateTestGraph(result.graph).valid === true`; files
  exist; fresh `loadPlan` re-validates.
- Byte-stability: two runs, identical `plan.json` bytes.
- Dev-only smoke (manual, auto-skips in CI without `RUN_LIVE_PROVIDER` + key):
  `createPlan` against a real provider over one brief — proves the live path end to
  end. Mirrors the seam's existing live-test gating.
- Non-gating: record one engine output as a `qa-engine` eval arm candidate and run
  `pnpm eval` to confirm the output is scorable (full baseline/thresholds are #9).

## Risks and Open Questions

- **Risk — prompt quality is out of scope here.** #6 proves the pipeline produces a
  *valid, traceable, persisted* graph; *good* plans (recall, low unsupported claims)
  are gated by #9. Risk-accepted: thresholds + tuning are Workstream #9.
- **Risk — 6+ calls add latency/cost.** Mitigated by configurable per-call token
  budgets and repair cap (≤2); the deeply-staged choice was made deliberately for
  quality.
- **Risk — provenance schema shape.** `strength→provenance` mapping depends on
  `test-graph/common.ts`; read it before Slice 3. Low risk (validator already
  constrains `explicit`/`inferred`).
- **Risk — fake provider scripting.** Sequential per-stage payloads must be
  supported; extend the test-only fake if not. Low risk.
- **Forward-compat — `refinePlan` (#7).** Keep `projectId`/`planId` derivation and
  `generation` metadata compatible with `validatePlanRevisionTransition` so #7 adds
  refine without reshaping identity.
- No open questions remain; all four grill branches + the evidence sub-branch are
  resolved.
