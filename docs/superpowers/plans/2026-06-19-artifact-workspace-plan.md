---
type: feature-plan
status: draft
source_type: free_text
source_ref: "Workstream #7 (Artifact Workspace) — docs/v1-checkpoint.md §7; qa-engine plan 2026-06-19; architecture spec 2026-06-14"
created_at: "2026-06-19"
updated_at: "2026-06-19"
---

# Artifact Workspace (Workstream #7)

Workstream #6 shipped `createPlan` + `loadPlan` with a *minimal* atomic
persistence writer (`packages/qa-engine/src/engine/persist.ts`) and deliberately
deferred refinement and overwrite safety to #7. This plan delivers the third
coarse engine operation — `refinePlan` — and the persistence hardening that lets
it run safely: optimistic version-conflict detection (`ARTIFACT_CONFLICT`),
concurrent-refine mutual exclusion, and per-file atomic overwrite of an existing
plan directory. Public surface stays coarse (`createPlan`/`refinePlan`/`loadPlan`);
the eight internal stages stay private (ADR-0003). No source outside
`packages/qa-engine` is touched.

**Exit criterion (checkpoint §7):** *interruption or concurrent refinement
cannot silently corrupt or overwrite a plan.*

## Source Snapshot

- **Checkpoint:** `docs/v1-checkpoint.md` §7 "Artifact Workspace" (`pending`):
  root-confined plan paths, atomic JSON writes + read-back validation, generated
  Markdown, **optimistic version conflict handling**, non-secret generation
  metadata. Exit: interruption/concurrent refine cannot silently corrupt or
  overwrite a plan.
- **#6 plan:** `docs/superpowers/plans/2026-06-19-qa-engine-plan.md` — Non-Goals
  list explicitly punts to #7: "`refinePlan`, optimistic version conflict,
  `ARTIFACT_CONFLICT`, concurrent-refine safety → Workstream #7." Resolved
  Decisions there: "defer `refinePlan` to #7 … building it now means an unsafe
  overwrite or rework"; forward-compat note: keep `projectId`/`planId` derivation
  and `generation` metadata compatible with `validatePlanRevisionTransition`.
- **Spec:** `docs/superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md`
  — `QaEngine.refinePlan(input): Promise<RefinePlanResult>` (line 224); Artifact
  Model "Existing plans use optimistic version checks to prevent silent
  overwrite" (line 392); Error Model "`ARTIFACT_CONFLICT`: plan changed since
  caller loaded it" (line 409); stage 8 "Persist: atomically write canonical
  JSON, then render Markdown" (line 246).
- **ADR-0007** (`docs/adr/0007-versioned-test-graph-contract.md`): each immutable
  `Plan` revision keeps its `planId` and **advances `planVersion` by exactly one
  per revision**; IDs are scoped deterministic hashes, never recomputed from
  prose; "Refinement preserves identity and provenance."
- **Domain (`CONTEXT.md`):** Plan Revision = "immutable version of one Test Plan;
  retains its `planId` and advances `planVersion` when plan content changes."
  Provenance, Evidence, Requirement, Test Case, Deterministic Validation terms
  used verbatim below.

### Reuse already on `main` (exact symbols)

- `packages/qa-engine/src/engine/persist.ts` — `persistPlan(graph, manifest,
  workspaceRoot)`, `readPlan(workspaceRoot, planId)`, `GenerationManifest`,
  `planDirFor` (root confinement), `atomicWrite` (temp+rename), `serializeManifest`,
  `PLANS_DIR = .test-framework/plans`. #7 **extends this file**.
- `packages/qa-engine/src/engine/engine.ts` — `createPlan(input, deps)`,
  `loadPlan(input, deps)`, `buildValidGraph(...)`, `computeStatus(...)`,
  `addUsage`/`sumOptional`/`ZERO_USAGE`. `refinePlan` mirrors `createPlan` shape.
- `packages/qa-engine/src/engine/errors.ts` — `EngineError`, `EngineErrorCode`,
  `asEngineError`, `fromProviderError`. `ARTIFACT_CONFLICT` is added to the union.
- `packages/qa-engine/src/engine/assemble.ts` — `assemble(ingested, draft, meta)`,
  `AssembleMeta`. Currently hardcodes `planVersion: 1`, the generation id key
  `"initial"`, and reads `createdAt`/`updatedAt` from `meta`. #7 parameterizes
  version + generation key.
- `packages/qa-engine/src/engine/identity.ts` — `ingest(input)`, `Ingested`,
  `canonicalKey`. Reused unchanged; refine derives the same `planId`.
- `packages/qa-engine/src/engine/stages.ts` — `runEvidenceStage` … `runReviewStage`,
  `runRepairStage`, `METHODOLOGY_VERSION`, `WORKFLOW_VERSION`. Reused for refine
  re-planning; a new `runRefineStage` (or reuse of the repair contract) emits a
  revised `PlanDraft`.
- `packages/qa-engine/src/engine/drafts.ts` — `PlanDraft`, `planDraftSchema`, all
  per-stage schemas. Refine emits a `PlanDraft`.
- `packages/qa-engine/src/test-graph/validate.ts` — `validateTestGraph`,
  `parseTestGraph`, **`validatePlanRevisionTransition(previous, next)`** (line 1016;
  the central refine guard). `findings.ts` → `TestGraphFinding`,
  `TestGraphValidationError`.
- `packages/qa-engine/src/test-graph/ids.ts` — `createStableId(kind, scopeId,
  semanticKey)`, `planIdSchema`.
- `packages/qa-engine/src/test-graph/canonical-json.ts` — `serializeTestGraph`;
  `markdown.ts` — `renderTestGraphMarkdown`.
- `packages/qa-engine/src/test-graph/test-helpers.ts` — `buildValidTestGraph(overrides)`
  (test-only; used to construct revision pairs in persist tests).
- `packages/qa-engine/src/providers/fake/fake-provider.ts` — `createFakeProvider`,
  `fakeOk`, `fakeError`, `FakeOutcome`. CI provider.

## Assumption Log

- **`validatePlanRevisionTransition` is the authoritative revision guard.** Read
  (`validate.ts:1016`): both graphs must be valid, then `projectId`/`planId`
  stable, `planVersion === before+1`, `createdAt` unchanged, `updatedAt` strictly
  advances. It allows entity additions/removals. Refine **must** call it and
  surface any finding as a typed error before persisting. Confirmed by reading.
- **`rename(dir, dir)` is NOT an overwriting swap.** Verified empirically (Node
  v25.2.1): `rename(tmpDir, finalDir)` throws `ENOTEMPTY` when `finalDir` is a
  non-empty directory — this is exactly what `persist.test.ts` "cleans its temp
  dir when the final plan path is blocked" relies on. Therefore refine **cannot**
  reuse the create-path directory-rename to overwrite. It must write per-file
  inside the existing `<plan-id>/` dir.
- **File-level `rename(tmp, plan.json)` DOES atomically overwrite** an existing
  file (verified empirically). So the in-place swap primitive is per-file
  temp+rename — already implemented as `atomicWrite` in `persist.ts`.
- **`writeFile(lock, …, { flag: "wx" })` throws `EEXIST`** when the file exists
  (verified empirically). This is the no-dependency mutual-exclusion primitive
  for concurrent-refine safety (`O_EXCL` create).
- **`planVersion` is the only on-disk version signal.** The schema
  (`schema.ts:320`) has `planVersion: z.number().int().min(1)`; there is no
  separate parent/revisionOf field. The expected version compared on refine is
  the persisted graph's `planVersion`. Confirmed by reading.
- **`assemble` hardcodes `planVersion: 1` and generation key `"initial"`**
  (`assemble.ts:298,315`). #7 must thread a version and a per-revision generation
  key through `AssembleMeta` (or a sibling assembler) without changing the v1
  create path's bytes. Confirmed by reading.
- **The fake provider scripts sequential per-call payloads** (`FakeOutcome[]`),
  proven by the #6 `engine.test.ts` happy/repair scripts. Refine's stage script
  composes the same way. Confirmed by reading.
- No new runtime dependency: refine = existing stages + test-graph + `zod` + Node
  stdlib (`node:fs/promises`, `node:crypto`).

## Goal and Success Criteria

**Goal:** A single `refinePlan(input, deps)` call loads an existing persisted
plan, re-plans it from scoped feedback, produces a `planVersion + 1` revision
that passes both `validateTestGraph` and `validatePlanRevisionTransition`, and
atomically replaces the on-disk plan — refusing with `ARTIFACT_CONFLICT` when the
plan changed under it, and never corrupting or partially overwriting the previous
revision on interruption or concurrent refine.

**Success criteria (numbered, testable):**

1. `refinePlan` over a plan persisted by `createPlan` (deterministic fake, fixed
   clock) returns a graph with `planVersion === previous.planVersion + 1`,
   identical `projectId`/`planId`/`createdAt`, strictly advanced `updatedAt`, and
   `validateTestGraph(result.graph).valid === true`.
2. `validatePlanRevisionTransition(previous, result.graph)` returns `[]` (empty
   findings) for every successful refine.
3. **Optimistic conflict:** when the caller passes `expectedVersion` that does not
   equal the persisted `planVersion`, `refinePlan` throws
   `EngineError("ARTIFACT_CONFLICT")` **before any write** and the on-disk plan is
   byte-unchanged.
4. **Concurrent-refine safety:** two `refinePlan` calls on the same `planId`
   racing in one process never both succeed against the same base version; the
   loser throws `ARTIFACT_CONFLICT` (lock contention or version mismatch) and the
   persisted plan is exactly one of the two coherent revisions — never an
   interleaved/corrupt mix. (Criterion-mapped to checkpoint exit clause.)
5. **Interruption safety:** a write that fails mid-persist (e.g. read-back
   validation fails, or a file rename fails) throws `ARTIFACT_WRITE_FAILED`, leaves
   the previous revision intact and loadable by `loadPlan`, and leaves no lock or
   temp file behind.
6. **Byte-stability:** same previous plan + same feedback + fixed clock + scripted
   fake ⇒ identical `plan.json` bytes for the new revision across runs.
7. Every failure path returns a typed `EngineError`; no partial/plausible plan is
   ever written as the current revision.
8. `pnpm check-types`, `pnpm test`, `pnpm check:ci` (biome), `pnpm build` green;
   CI runs on the fake alone (no network/keys).

## Scope and Non-Goals

**In scope:**

- `refinePlan(input, deps): Promise<RefinePlanResult>` — the third coarse engine
  operation, wired in `engine.ts`, exported from `engine/index.ts` →
  `qa-engine/src/index.ts`.
- `RefinePlanInput` / `RefinePlanResult` types in `engine/types.ts`.
- `ARTIFACT_CONFLICT` added to `EngineErrorCode`.
- Version threading: parameterize `assemble` to accept `planVersion` and a
  per-revision generation key (default keeps the create path identical).
- Persistence hardening in `engine/persist.ts`: an `expectedVersion` optimistic
  read-compare, an `O_EXCL` lock guarding concurrent refines of one plan, an
  in-place per-file atomic overwrite of an existing plan directory, read-back
  validation, lock/temp cleanup on every exit path.
- Non-secret generation metadata for the new revision (provider/model id, usage,
  warnings, input fingerprint, versions, status — never credentials/raw payloads).

**Non-goals (explicitly out):**

- Re-tuning prompts, recorded baselines, release thresholds → **Workstream #9**.
- Deleting/rewiring `core`/`planner`/`artifacts` and the MCP tool rewrite (e.g.
  `refine_test_plan`) → **Workstream #8**. `apps/mcp` and those packages stay
  untouched and green here.
- Multi-process / cross-host file locking beyond a single-host `O_EXCL` advisory
  lock; distributed coordination is a cloud concern (deferred per checkpoint).
- A `project.json` aggregate writer (spec lists it; #7 only needs the plan dir).
- Any change to `createPlan`'s output bytes or to the test-graph/scanner/provider
  packages' behavior.
- Test execution, codegen, diagnosis loop → V2/V3.

## Resolved Decisions

Each decision below is a recommendation tagged for orchestrator ratification.

- **[RATIFY] Conflict token = `planVersion` integer, passed as
  `input.expectedVersion?: number`.** The caller (who previously did `loadPlan`)
  supplies the version it last saw. `refinePlan` reads the persisted graph,
  compares `persisted.planVersion === expectedVersion`; mismatch ⇒
  `ARTIFACT_CONFLICT`. When `expectedVersion` is omitted, refine uses the version
  it just read as the base (last-writer wins for non-collaborative single-caller
  use) but the lock + post-read re-check (below) still prevent silent in-process
  corruption.
  *Why:* `planVersion` is the only on-disk version field (schema.ts:320) and is
  exactly what `validatePlanRevisionTransition` increments by one. No new on-disk
  field, no new dependency. Matches spec "optimistic version checks."
- **[RATIFY] Concurrent-refine mechanism = `O_EXCL` lock file
  `.test-framework/plans/<plan-id>/.lock` + read-version-inside-lock +
  post-build version re-check.** Sequence: acquire lock (`writeFile(lock, …, {flag:
  "wx"})`; `EEXIST` ⇒ `ARTIFACT_CONFLICT` "another refinement is in progress");
  read base graph; run stages; before swap, re-read `plan.json`'s `planVersion`
  and assert it still equals the base (defense against a refine that finished and
  released between our read and swap — though the lock makes this the same
  value); per-file atomic overwrite; release lock in `finally`.
  *Why:* `rename(dir,dir)` cannot overwrite a non-empty dir (verified ENOTEMPTY),
  so the create-path directory swap is unusable for refine. `O_EXCL` is the
  standard, dependency-free mutual-exclusion primitive; serializing refines of one
  plan is sufficient for a single-host engine and makes criterion 4 deterministic.
- **[RATIFY] In-place swap = per-file temp+rename inside the existing
  `<plan-id>/` dir** (reusing `atomicWrite`), writing `plan.json` then `plan.md`
  then `generation.json`, each via its own temp+`rename`. Read-back + revalidate
  `plan.json` *before* writing `plan.md`/`generation.json` so a read-back failure
  never leaves the markdown/manifest ahead of the JSON source of truth.
  *Why:* file-level rename atomically overwrites (verified); `plan.json` is the
  canonical source of truth (CONTEXT invariant) so it must be the last thing whose
  validity is proven and the derived files follow it. Bounded blast radius: at
  worst `plan.md`/`generation.json` lag `plan.json` by one interrupted write, and
  both are regenerable from `plan.json` (Markdown is derived).
- **[RATIFY] Refine re-runs the deep pipeline seeded with the prior draft +
  feedback, not a blind regenerate.** Decompose the loaded graph back into a
  `PlanDraft`-shaped seed (or carry the prior draft) and run a `runRefineStage`
  that takes (prior plan summary, scoped feedback) → revised `PlanDraft`, then the
  existing review/validate/bounded-repair loop. Identity (`planId`, entity IDs for
  unchanged entities) is preserved because `assemble` re-derives IDs from the same
  `createStableId(kind, planId, key)` keys.
  *Why:* honors ADR-0007 "refinement preserves identity and provenance" and the
  #6 max-quality staged choice; avoids a shallow prompt-wrapper refine.
- **[RATIFY] `validatePlanRevisionTransition(previous, candidate)` is a hard gate
  inside the bounded-repair loop, not a post-hoc check.** After
  `validateTestGraph` passes, run the transition validator; any finding (e.g.
  `PLAN_VERSION_NOT_INCREMENTED`, `PLAN_ID_CHANGED`, `PLAN_UPDATED_AT_NOT_ADVANCED`)
  is treated like an invariant failure: feed into repair if budget remains, else
  throw `PLAN_INVARIANT_FAILED` with the findings.
  *Why:* the transition validator is the contract for a legal revision; reusing the
  repair budget keeps refine's failure model identical to create's.
- **[RATIFY] `updatedAt` strictly advances via injected clock; `createdAt` is
  copied from the previous revision.** `refinePlan` sets `createdAt =
  previous.createdAt`, `updatedAt = generatedAt = new Date(deps.now()).toISOString()`,
  and asserts (defensively) `now() > Date.parse(previous.updatedAt)`; if a fixed
  test clock is not strictly greater, that surfaces as
  `PLAN_UPDATED_AT_NOT_ADVANCED` from the transition validator (so tests use a
  clock after the previous timestamp).
  *Why:* `validatePlanRevisionTransition` requires `createdAt` unchanged and
  `updatedAt` strictly advanced; both are deterministic from inputs + clock so
  bytes stay stable for criterion 6.
- **[RATIFY] Per-revision generation id key = the revision number, not `"initial"`.**
  `assemble` currently uses `createStableId("generation", planId, "initial")`.
  Thread a `generationKey` (default `"initial"` for v1 create — keeps create bytes
  identical) and have refine pass `"revision-2"`, `"revision-3"`, … so each
  revision's generation node has a distinct stable id.
  *Why:* a generation record describes one generation event; reusing `"initial"`
  would collide IDs across revisions. Defaulting preserves create-path bytes.
- **[RATIFY] `refinePlan` throws `ARTIFACT_NOT_FOUND` when the plan does not
  exist** (reusing `readPlan`'s mapping), and `INVALID_INPUT` for a malformed
  `planId` or empty feedback, before acquiring the lock or calling the model.
  *Why:* fail fast and cheap; matches `loadPlan`'s boundary behavior.

## Slices

Vertical, test-first, independently shippable. Each slice lands green
(`pnpm --filter @test-framework/qa-engine test` + root `check-types`, `check:ci`,
`build`). Tests use `node:test` + `node:assert/strict`, the scripted fake, a fixed
clock, and a `mkdtemp` workspace — mirroring `engine.test.ts`/`persist.test.ts`.

### Slice 0 — `ARTIFACT_CONFLICT` error + refine types (no behavior yet)

**Change:** Add `"ARTIFACT_CONFLICT"` to `EngineErrorCode` in `engine/errors.ts`
(engine-specific group, alongside `ARTIFACT_NOT_FOUND`/`ARTIFACT_WRITE_FAILED`).
Add `RefinePlanInput { planId: string; feedback: string; expectedVersion?: number;
sources?: CreatePlanSource[] }` and `RefinePlanResult { graph; planDir; usage;
warnings; status; previousVersion: number }` to `engine/types.ts`. Export both
types from `engine/index.ts`.

**Files touched:** `engine/errors.ts`, `engine/types.ts`, `engine/index.ts`.

**Tests (`engine/errors.test.ts` — create if absent, else extend):**
- `asEngineError` passes an `EngineError("ARTIFACT_CONFLICT")` through unchanged —
  asserts code preserved (intent: the new code is a first-class member of the
  taxonomy, not a fallback).
- Type-level: a `RefinePlanInput` literal compiles (intent: surface shape locked
  before logic). Use a `// @ts-expect-error` on a missing `planId` to prove
  required fields.

**Verify:** `pnpm --filter @test-framework/qa-engine test && pnpm check-types`.

### Slice 1 — Parameterize `assemble` for version + generation key (create path byte-identical)

**Change:** Extend `AssembleMeta` with optional `planVersion?: number` (default
`1`) and `generationKey?: string` (default `"initial"`). In `assemble.ts`, replace
the hardcoded `planVersion: 1` with `meta.planVersion ?? 1` and
`createStableId("generation", planId, meta.generationKey ?? "initial")`. No call
site changes required for `createPlan` (defaults reproduce current output).

**Files touched:** `engine/assemble.ts`.

**Tests (`engine/assemble.test.ts` — extend):**
- "assemble defaults reproduce a v1 generation node" — build the existing
  hand-draft, assemble with no version/key in meta, assert `graph.planVersion === 1`
  and `graph.generation.id === createStableId("generation", planId, "initial")`
  (intent: create path is byte-unchanged).
- "assemble honors an explicit planVersion and generationKey" — pass
  `planVersion: 2, generationKey: "revision-2"`; assert the graph reports v2 and a
  *different* generation id than the v1 build (intent: revisions get distinct
  generation identity).

**Verify:** `pnpm --filter @test-framework/qa-engine test`. Also re-run
`engine.test.ts` byte-stability test to confirm create bytes did not move.

### Slice 2 — Refine stage runner (model produces a revised draft)

**Change:** Add `runRefineStage(deps, priorDraft, feedback): Promise<{ data:
PlanDraft; usage }>` to `engine/stages.ts`, reusing `runStage` + `planDraftSchema`
(the same full-draft contract `runRepairStage` uses). Prompt: "Revise this
existing plan draft to address the scoped feedback. Preserve the keys and content
of entities the feedback does not touch; add/modify/remove only what the feedback
requires. Keep provenance rules." Include `contextBlock("Current draft",
priorDraft)` and `contextBlock("Feedback", feedback)`.

**Files touched:** `engine/stages.ts`.

**Tests (`engine/stages.test.ts` — create if absent):**
- "runRefineStage returns a PlanDraft and tracks usage" with a scripted
  `fakeOk({ data: FULL_DRAFT, usage })` — asserts the returned draft parses against
  `planDraftSchema` and usage is propagated (intent: refine stage honors the same
  structured contract as every other stage).
- "runRefineStage maps a provider error to MODEL_OUTPUT_INVALID" with
  `fakeError("PROVIDER_TRANSIENT")` → asserts the seam error is mapped (intent:
  failure mapping parity with other stages).

**Verify:** `pnpm --filter @test-framework/qa-engine test`.

### Slice 3 — Decompose a persisted graph back to a seed `PlanDraft`

**Change:** Add `engine/decompose.ts` exporting `decomposePlan(graph: TestGraphV1):
{ ingested: Ingested; draft: PlanDraft }` (pure, deterministic). It rebuilds a
slug-keyed `PlanDraft` and an `Ingested` from a loaded graph so refine can re-run
`assemble` with stable keys. Keys are derived from each entity's stable
identity — recommended: a reverse map keyed by entity id, reusing each entity's
existing stable id as its slug key (since `createStableId(kind, planId, key)`
already keys off the slug, round-tripping the id as the key keeps every unchanged
entity's id constant across the revision). Source nodes feed `ingested.sources`;
`ingested.inputFingerprint`/`title`/ids come straight off the graph.

**Files touched:** new `engine/decompose.ts`.

**Tests (`engine/decompose.test.ts`):**
- "decompose then assemble at the same version reproduces the graph" — take
  `buildValidTestGraph()`, `decomposePlan` it, `assemble` with the graph's own
  version/createdAt/updatedAt/generation meta, assert `validateTestGraph(...).valid`
  and that `projectId`/`planId` and every entity id are unchanged (intent:
  decomposition preserves identity — the ADR-0007 invariant).
- "decompose preserves provenance kind and evidence linkage" — assert an explicit
  requirement's provenance round-trips with its evidence keys (intent: no
  provenance loss, a CONTEXT invariant).

**Verify:** `pnpm --filter @test-framework/qa-engine test`.

### Slice 4 — Optimistic version read + lock in persistence (the conflict guard)

**Change:** In `engine/persist.ts` add:
- `readPlanVersion(workspaceRoot, planId): Promise<number>` — read `plan.json`,
  parse, return `planVersion`; missing ⇒ `ARTIFACT_NOT_FOUND`.
- `persistRevision(graph, manifest, workspaceRoot, { expectedVersion?: number }):
  Promise<string>` — the hardened refine writer:
  1. `lockPath = join(planDirFor(root, planId), ".lock")`. Acquire via
     `writeFile(lockPath, String(process.pid), { flag: "wx" })`; `EEXIST` ⇒
     `EngineError("ARTIFACT_CONFLICT", "A refinement of <planId> is already in
     progress.")`.
  2. Inside the lock: read current `plan.json` → `current`. If `expectedVersion`
     is provided and `current.planVersion !== expectedVersion` ⇒
     `ARTIFACT_CONFLICT` ("plan changed since it was loaded: expected vN, found
     vM"). Also assert `graph.planVersion === current.planVersion + 1`
     (defensive; mismatch ⇒ `ARTIFACT_WRITE_FAILED`, a programmer error).
  3. Per-file atomic overwrite **in the existing dir** (reuse `atomicWrite`):
     write `plan.json` (canonical) first, read it back, `validateTestGraph`; only
     if valid, write `plan.md` then `generation.json`. Any failure ⇒
     `ARTIFACT_WRITE_FAILED` and the original `plan.json` is left intact (its temp
     never renamed) — the previous revision survives.
  4. `finally`: `rm(lockPath, { force: true })` and best-effort remove any stray
     temp files.

`planDirFor` (root confinement) is reused unchanged for both the lock and the
files, so the lock cannot escape the workspace root.

**Files touched:** `engine/persist.ts`, `engine/persist.test.ts`.

**Tests (`engine/persist.test.ts` — extend):**
- "persistRevision overwrites in place and read-back validates" — persist a v1 via
  `persistPlan`, then `persistRevision` a v2 (`buildValidTestGraph({ planVersion: 2,
  updatedAt: <later> })` with a distinct generation id), assert `readPlan` returns
  v2 and the dir still has exactly `plan.json`/`plan.md`/`generation.json` (+ no
  `.lock`) (intent: in-place atomic swap works and leaves no lock).
- "persistRevision throws ARTIFACT_CONFLICT on version mismatch and leaves v1
  untouched" — persist v1, call `persistRevision(v2, …, { expectedVersion: 99 })`,
  assert throw `ARTIFACT_CONFLICT` and `readPlan` still returns the byte-identical
  v1 (intent: criterion 3 — no write on conflict).
- "persistRevision throws ARTIFACT_CONFLICT when the lock is already held" —
  pre-create `<dir>/.lock`, call `persistRevision`, assert `ARTIFACT_CONFLICT`
  ("in progress") and v1 untouched (intent: criterion 4 mutual exclusion).
- "persistRevision releases the lock on success and on failure" — after a
  successful revision and after a forced read-back failure (point `plan.json` temp
  at an invalid graph via a stubbed serializer, or write a graph that fails
  read-back), assert no `.lock` remains (intent: criterion 5 — no leaked lock).
- "persistRevision read-back failure leaves the previous revision loadable" —
  simulate a read-back validation failure; assert `ARTIFACT_WRITE_FAILED` and
  `readPlan` returns the prior coherent revision (intent: interruption safety).

**Verify:** `pnpm --filter @test-framework/qa-engine test`.

### Slice 5 — `refinePlan` wired in `engine.ts`

**Change:** Add `refinePlan(input: RefinePlanInput, deps: EngineDeps):
Promise<RefinePlanResult>` to `engine.ts`:
1. Validate `planId` (`planIdSchema.safeParse`) and non-empty `feedback` →
   `INVALID_INPUT` on failure.
2. `const previous = await readPlan(deps.workspaceRoot, planId)` (→
   `ARTIFACT_NOT_FOUND` if missing).
3. If `input.expectedVersion !== undefined && input.expectedVersion !==
   previous.planVersion` ⇒ `ARTIFACT_CONFLICT` (early, before model spend).
4. `const { ingested, draft } = decomposePlan(previous)`; merge any
   `input.sources` into `ingested` (refine may add new sources; reuse `ingest`'s
   canonicalization for them).
5. `const revised = await runRefineStage(deps, draft, input.feedback)` (track
   usage); run `runReviewStage`; build `baseMeta` with `createdAt =
   previous.createdAt`, `updatedAt = generatedAt = new Date(deps.now())…`,
   `planVersion: previous.planVersion + 1`, `generationKey:
   "revision-" + (previous.planVersion + 1)`, generator = model + provider id,
   warnings.
6. Reuse a generalized `buildValidGraph` that, after `validateTestGraph` passes,
   also runs `validatePlanRevisionTransition(previous, candidate)` and routes its
   findings into the same bounded-repair loop (throw `PLAN_INVARIANT_FAILED` when
   the budget is spent).
7. `const planDir = await persistRevision(graph, manifest, deps.workspaceRoot,
   { expectedVersion: input.expectedVersion ?? previous.planVersion })`.
8. Return `{ graph, planDir, usage, warnings, status, previousVersion:
   previous.planVersion }`.

Generalize `buildValidGraph` by adding an optional `transitionBase?: TestGraphV1`
parameter; when present, append `validatePlanRevisionTransition` findings to the
validator findings before the repair/throw decision. `createPlan` passes no base
(unchanged behavior).

**Files touched:** `engine/engine.ts`, `engine/index.ts` (export `refinePlan`),
`packages/qa-engine/src/index.ts` (re-export `refinePlan`, `RefinePlanInput`,
`RefinePlanResult`).

**Tests (`engine/engine.test.ts` — extend; refine script = `[refineDraft, review]`
plus repair entries as needed):**
- "refinePlan produces a v2 revision that passes both validators" — `createPlan`
  then `refinePlan` with a later fixed clock; assert `result.graph.planVersion ===
  2`, `validateTestGraph(...).valid`, and `validatePlanRevisionTransition(prev,
  result.graph) === []` (criteria 1, 2).
- "refinePlan preserves planId/projectId/createdAt and advances updatedAt"
  (criterion 1 detail).
- "refinePlan is byte-stable" — two refines from the same v1 + same feedback +
  same later clock into two temp roots ⇒ identical `plan.json` bytes (criterion 6).
- "refinePlan throws ARTIFACT_CONFLICT on stale expectedVersion and writes
  nothing" — `expectedVersion: previous.planVersion - 1` (or a wrong number);
  assert throw and the on-disk plan still reports the original version (criterion
  3).
- "refinePlan throws ARTIFACT_NOT_FOUND for an unknown plan" (boundary).
- "refinePlan rejects empty feedback / malformed planId with INVALID_INPUT before
  any model call" — pass `provider: createFakeProvider([])`; asserts no stage runs
  (boundary, fail-fast).
- "refinePlan maps a provider error to a typed EngineError and leaves v1 intact" —
  `fakeError("PROVIDER_AUTH")`; assert throw and `loadPlan` still returns v1
  (criterion 7).
- "refinePlan throws PLAN_INVARIANT_FAILED when repair budget is spent and leaves
  v1 intact" — scripted to keep emitting an invalid/illegal-transition draft with
  `repairBudget: 0`; assert v1 unchanged (criteria 5, 7).

**Verify:** `pnpm --filter @test-framework/qa-engine test && pnpm check-types`.

### Slice 6 — Concurrent-refine race test (the exit-criterion proof)

**Change:** No new production code (the lock from Slice 4 is the mechanism); add
the end-to-end race test that proves the checkpoint exit criterion.

**Files touched:** `engine/engine.test.ts`.

**Tests:**
- "two concurrent refines of the same plan: exactly one wins, loser gets
  ARTIFACT_CONFLICT, plan stays coherent" — `createPlan` a v1, then
  `Promise.allSettled([refinePlan(A), refinePlan(B)])` against the same `planId`
  and the same `expectedVersion: 1` in one process; assert exactly one fulfilled
  and one rejected with `ARTIFACT_CONFLICT`; then `loadPlan` and assert
  `validateTestGraph(...).valid` and `planVersion === 2` (intent: directly
  encodes "concurrent refinement cannot silently corrupt or overwrite a plan").
- "a refine racing against itself never leaves a `.lock`" — after the race,
  assert no `.lock` in the plan dir (intent: criterion 5, lock cleanup under
  contention).

> Note: with the `O_EXCL` lock, the deterministic outcome is one winner via the
> lock and one loser via `EEXIST`; if scheduling lets the loser acquire the lock
> after the winner releases, it loses on the post-read version re-check
> (`current.planVersion === 2 !== expectedVersion 1`). Both paths yield
> `ARTIFACT_CONFLICT`, so the assertion is stable regardless of interleaving.

### Slice 7 — Docs + checkpoint flip

**Change:** Mark Workstream #7 `done` in `docs/v1-checkpoint.md` (status line and
the "Artifact persistence" reality row). Add a one-line ADR note only if the
orchestrator wants the lock/version mechanism captured as a decision (recommend a
short addendum to ADR-0007's consequences rather than a new ADR — the contract is
already there). No code.

**Files touched:** `docs/v1-checkpoint.md` (and optionally ADR-0007).

**Verify:** `pnpm check:ci` (markdown/biome), `pnpm build`.

## Risks

| Risk | Likelihood | Impact | Control |
| --- | --- | --- | --- |
| `O_EXCL` lock leaks after a hard crash (process killed mid-refine), blocking future refines | Low | Medium | Lock holds `process.pid`; document manual removal. A stale-lock TTL/PID-liveness reaper is out of #7 scope (single-host, planning-only); revisit if it bites. Tests prove the `finally` removes it on every *handled* exit. |
| `decomposePlan` ↔ `assemble` round-trip drifts (an entity field not carried back), silently dropping plan content on refine | Medium | High | Slice 3 round-trip test asserts `validateTestGraph` + identity + provenance equality; add a field-coverage assertion comparing `decompose→assemble` against the original graph for every entity array. |
| Refine prompt quality (does the model honor scoped feedback?) | Medium | Low (for #7) | Out of scope — #9 owns prompt quality/eval thresholds. #7 only proves a *valid, legal-transition, persisted* revision; the fake makes CI deterministic. |
| `validatePlanRevisionTransition`'s `updatedAt` strict-advance fails under a fixed test clock equal to `previous.updatedAt` | Medium | Low | Tests use a clock strictly after the previous timestamp; `refinePlan` derives `updatedAt` from `deps.now()`; documented in the clock decision. |
| Per-file (not whole-dir) swap can leave `plan.md`/`generation.json` lagging `plan.json` after an interrupted write | Low | Low | `plan.json` is written + validated first; the derived files follow and are regenerable from it (Markdown is derived — CONTEXT invariant). Acceptable: source of truth is never behind its derivations. |
| Touching `assemble`/`buildValidGraph` regresses the #6 create path bytes | Low | High | Defaults preserve create behavior (Slice 1); re-run `engine.test.ts` byte-stability test in Slices 1 and 5 as a guard. |
| `expectedVersion` omitted invites silent overwrite for collaborative callers | Low | Medium | Lock + post-read re-check still prevent in-process corruption; the MCP adapter (#8) should always pass `expectedVersion` from the loaded plan — note this as an #8 contract requirement. |
