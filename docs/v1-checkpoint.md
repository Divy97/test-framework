# V1 Checkpoint

Date: 2026-06-14
Baseline: `main` at `bd36f90`
Architecture: [Verification Intelligence Architecture](superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md)

## Headline

The engineering foundation and safe repository scanner are complete. The V1
verification planning engine is not implemented. Current MCP tools prove protocol
and schema mechanics but still represent the superseded public five-stage design.

## Current Reality

| Area | Status | Reality |
| --- | --- | --- |
| Engineering gate | Done | Biome, typecheck, build, tests, commitlint, Dependabot |
| MCP stdio adapter | Done | Coarse `create_test_plan` / `refine_test_plan` / `get_test_plan` over the QA engine; progress, cancellation, typed secret-free errors, roots policy, lazy BYOK provider; CI on the fake |
| Safe repo scanner | Done foundation | Strong confinement, exclusions, limits, evidence index |
| Existing QA schemas | Partial | Useful concepts; not yet execution-ready test graph |
| QA engine | Pending | No provider calls, workflow, semantic review, or repair |
| BYOK providers | Done foundation | Provider-neutral seam, Anthropic + OpenRouter adapters, DI fake; CI runs on the fake. No engine workflow yet |
| Artifact persistence | Done | Atomic per-file writer, read-back validation, optimistic `expectedVersion` conflict, O_EXCL refine lock |
| Comparative evals | Pending | No generation-quality corpus or release threshold |
| Released execution | Later | V2, intentionally outside V1 |

The product currently cannot generate a real QA plan.

## Verified Foundation

- pnpm/Turborepo TypeScript monorepo.
- MCP SDK stdio server with injected handlers and protocol tests.
- Zod validation at tool boundaries.
- Safe scanner with symlink avoidance, hard secret exclusions, `.gitignore`, byte
  and traversal limits, truncation metadata, and deterministic evidence paths.
- 127 tests passed at the architecture review checkpoint: 107 scanner tests and
  20 MCP tests.
- CI build, typecheck, lint, tests, and commit message checks passed.

## Architecture Delta

The accepted architecture changes the implementation direction:

- Product core: verification intelligence and durable test graph.
- V1 reasoning: owned model workflow through local BYOK.
- Public API: coarse create/refine/get plan operations.
- Internal flow: ingest, contextualize, model requirements, plan, semantic review,
  deterministic validation, repair, persist.
- Package strategy: deepen `core`, `planner`, and `artifacts` into one QA engine;
  retain the scanner as a substantial independent module.
- V1 release: planning only, but execution-ready schema.
- V1 moat/release gate: comparative generation evals.
- Learning step: disposable local API execution spike before planning polish.

## Workstreams

### 1. Architecture and Canonical Docs

Status: done when this checkpoint is committed.

- Final architecture specification.
- ADRs for accepted and rejected directions.
- V1 scope aligned to planning-first BYOK engine.
- Old architecture review marked as deliberation history.

### 2. Execution Risk Spike

Status: pending.

Timebox: one day. Use a local fixture API and one hand-written failing test.

Exit criteria:

- allowlisted local target only;
- request/response/assertion/timing/process output captured;
- coherent failure bundle produced;
- non-allowlisted target rejected;
- findings documented; spike may be deleted.

### 3. Execution-Ready Test Graph

Status: pending.

Deepen existing domain contracts into a versioned graph:

- project, plan, source, evidence, requirement, feature, case, step, assertion,
  data requirement, open question, and generation metadata;
- stable IDs and explicit coverage links;
- structured targets, actions, assertions, data, and cleanup intent;
- canonical JSON, Markdown rendering, and migrations.

Exit criteria: fixtures round-trip through schema and Markdown without losing
identity, provenance, or execution-relevant information.

### 4. Eval Harness and Baseline

Status: harness complete; release thresholds pending calibration.

Implemented in `packages/evals` as a reference-based, deterministic harness
([ADR-0009](adr/0009-reference-based-deterministic-eval.md),
[plan](superpowers/plans/2026-06-15-eval-harness-and-baseline.md)):

- 8 calibrated fixtures (UI form, authz API, stateful/idempotent, integration
  failure, contradictory spec, evidence conflict, adversarial shallow, unsupported
  assumptions), each with raw-model / host-only / qa-engine arms.
- Weighted rubric over nine quality dimensions plus separate Hard-Fail gates.
- `validateTestGraph` reused for deterministic Test Graph validation in scoring.
- `pnpm eval` produces a byte-stable `results.json` + Markdown report and compares
  to an accepted baseline; baseline committed under `test/fixtures/baseline`.

Remaining before release (workstream #9): replace hand-authored synthetic tiers
with real recorded raw-model/host-only baselines, and record real release
thresholds (the calibration commit) before any prompt tuning.

Exit criteria: one command produces comparable, versioned eval results. **Met** —
`pnpm eval` is deterministic, byte-stable, and gates on regression.

### 5. BYOK Provider Seam

Status: done.

- Local provider/model configuration (env-referenced key; no raw key in config).
- Two real provider adapters — Anthropic and OpenRouter (OpenAI-compatible) —
  each loaded by dynamic import only.
- Structured generation (caller Zod schema → JSON Schema → seam-side validation),
  timeout/cancellation via composed `AbortSignal`, normalized usage metadata.
- Typed auth/quota/transient/timeout/cancelled/invalid-output/unsupported/config
  errors, thrown as one `ProviderError`.
- Secret-safe allowlist logging + value masking; bounded retry with jitter and a
  wall-clock cap over injected clock/sleep/jitter.

Delivered as the provider-neutral `ModelProvider` contract: a deterministic
scripted fake (DI-only test seam) and the real Anthropic and OpenRouter adapters
satisfy the same engine-facing interface, the engine receives its provider by DI
from `createProvider`, and CI runs on the fake alone (the live smoke tests
auto-skip without `RUN_LIVE_PROVIDER` + a key). See
[ADR-0010](adr/0010-byok-provider-seam.md) and
[docs/byok-setup.md](../byok-setup.md).

### 6. QA Engine

Status: pending.

- Coarse `createPlan`, `refinePlan`, and `loadPlan` operations.
- Versioned prompts and methodology.
- Safe context packaging from spec, diff, selected files, and scanner evidence.
- Internal requirement, planning, semantic-review, deterministic-validation,
  bounded-repair, and persistence stages.

Exit criteria: real input produces a valid persisted plan through one engine call;
callers never orchestrate internal stages.

### 7. Artifact Workspace

Status: done.

- Root-confined plan paths.
- Atomic JSON writes and read-back validation.
- Generated Markdown.
- Optimistic version conflict handling (`expectedVersion` → `ARTIFACT_CONFLICT`).
- Non-secret generation metadata.

Delivered as the third coarse engine operation, `refinePlan`, plus persistence
hardening in `engine/persist.ts`: `persistRevision` overwrites an existing plan
directory file-by-file (canonical `plan.json` first, read-back validated, then the
derived `plan.md`/`generation.json`), guarded by an optimistic `expectedVersion`
compare and a single-host `O_EXCL` advisory lock at `<plan-id>/.lock` that
serializes concurrent refines (the lock-held error names the `.lock` path for
manual recovery; no stale-lock reaper by design). A revision must pass both
`validateTestGraph` and `validatePlanRevisionTransition` inside the bounded-repair
loop before any write.

Exit criteria: interruption or concurrent refinement cannot silently corrupt or
overwrite a plan. **Met** — proven by the concurrent-refine race test (exactly one
winner, the loser gets `ARTIFACT_CONFLICT`, the plan stays a coherent v2) and the
failure-path tests (a failed write leaves the previous revision intact and loadable
with no lock or temp left behind).

### 8. MCP Product Adapter

Status: done.

- Replaced the five stage tools with `create_test_plan`, `refine_test_plan`,
  and `get_test_plan`, each backed by the QA engine (`createPlan` / `refinePlan` /
  `loadPlan`) over a provider built from local BYOK config (or an injected fake in
  tests).
- Opt-in coarse progress (gated on `progressToken`); cancellation passes the
  request's `extra.signal` into `EngineDeps.signal`, aborting the in-flight model
  call and mapping to `PROVIDER_CANCELLED`.
- Typed `EngineErrorCode -> MCP error` translator: every error returns
  `{ code, message, retryable }` with a curated, secret-free message (no paths,
  SDK detail, env values, or key material); a table-driven test asserts no leak.
- Retired `packages/{core,planner,artifacts}` (deepened into the engine) and
  dropped `repo-scan`'s stale `core` dependency; the workspace is green at every
  step.

Adapter surface and policy (capturing the ratified roots/error decisions here per
the plan, rather than a new ADR; ADR-0003 ratifies the coarse surface, ADR-0010
the BYOK seam):

- Tool names are `create_test_plan`, `refine_test_plan`, `get_test_plan`; the
  eight workflow stages stay internal.
- Project-root policy: `workspaceRoot` is resolved per call as
  `firstMcpRoot ?? TEST_FRAMEWORK_ROOT ?? process.cwd()` (file URI -> path);
  resolved once per call (no `roots/list_changed` subscription in V1). An optional
  `repo.path` is hard-confined inside the resolved root; an escaping path is
  rejected as `REPO_ACCESS_DENIED` before any engine call. Root paths may appear in
  returned `planDir`/`artifacts` (the host's own project), never credentials.
- Error policy: `EngineError` codes pass through with a code-specific curated
  message (engine-authored `INVALID_INPUT` / `PLAN_INVARIANT_FAILED` messages are
  already safe and pass through; `PLAN_INVARIANT_FAILED` appends a findings count,
  never paths); any non-`EngineError` becomes a generic `INTERNAL` with no
  `err.message`.
- The provider is constructed lazily on the first generative call, so the
  handshake, `tools/list`, `get_test_plan`, and input validation work keyless.
- CI is keyless: E2E tool tests inject `createFakeProvider` over `InMemoryTransport`;
  the built-stdio test asserts handshake + `tools/list` + a no-provider
  `INVALID_INPUT`; one live `create_test_plan` smoke test is `skip`-ped without
  `RUN_LIVE_PROVIDER` + a key.

Exit criteria (met): a supported host can install the MCP server and create/refine
a real plan using local BYOK configuration.

### 9. Quality Gate and Release

Status: infrastructure done; quality-moat disproven; release gate repositioned
([ADR-0012](adr/0012-reposition-moat-reliability-over-raw-quality.md)).

Delivered: the deterministic eval harness, the gated `record:arms` recording tool,
the keyless `claude-cli` host-model provider, the engine fixes that let *any* real
provider run for the first time (`toProviderSchema` transforms/custom-types;
OpenRouter content fallback), four fixtures recorded under Claude Opus 4.8 with
reviewed annotations, plus install/config/error-flow and limitations/security docs.

Finding (first real-model measurement): the qa-engine **lost to a raw prompt on all
three recorded fixtures**, so the "beats the recorded raw-model baseline" exit item
is **not met as quality** and is retired as the gate — see the
[moat & thesis review](research/moat-and-thesis-review-2026-06.md) and ADR-0012.
The gate is repositioned to measure reliability (valid-rate over N runs), refinement
coherence, and provenance. Implementing that gate, leaning the engine, and the
deep-lean vs thin-layer decision are the next workstream, gated on the
real-repository comparison.

Original scope (history): run comparative evals against recorded baselines; confirm
quality/unsupported-claim/latency/cost/failure thresholds; test install/config/error
flows; publish limitations and security model.

## Recommended Order

```mermaid
flowchart LR
    A["Docs"] --> S["Execution spike"]
    S --> G["Test graph"]
    G --> E["Eval harness + baseline"]
    E --> P["BYOK provider"]
    P --> Q["QA engine"]
    Q --> W["Artifact workspace"]
    W --> M["MCP adapter"]
    M --> R["Quality gate + release"]
```

Graph and eval work precedes prompt tuning. Otherwise we would optimize against an
unstable contract without a measurable target.

## Main Risks

| Risk | Control |
| --- | --- |
| V1 becomes a prompt wrapper | Own workflow, graph, validation, artifacts, evals |
| Plans look comprehensive but invent behavior | Evidence links, assumption labels, unsupported-claim metric |
| Execution-ready schema overfits future runner | Use behavioral targets/assertions, not Playwright implementation details |
| Provider differences leak through engine | Normalize provider capabilities/errors behind adapters |
| Scanner consumes effort without improving plans | Freeze breadth; require eval evidence for expansion |
| Planning V1 becomes destination | Keep V2 graph entities and execution spike; no V1 execution scope creep |
| Package count recreates shallow modules | One deep QA engine until multiple real consumers justify splits |

## Explicitly Later

- Playwright/API generation and local execution.
- Failure evidence and diagnosis loop.
- Cloud workers/control plane/database.
- Dashboard, schedules, teams, billing, and CI/PR gates.
- Automatic repair patches.
