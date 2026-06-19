---
type: feature-plan
status: draft
source_type: free_text
source_ref: "Workstream #8 (MCP Product Adapter) — docs/v1-checkpoint.md §8; architecture spec 2026-06-14 (MCP Adapter + Error Model); ADR-0003; superseded tool-stub plan 2026-06-13"
created_at: "2026-06-19"
updated_at: "2026-06-19"
---

# MCP Product Adapter (Workstream #8)

Workstreams #2–#7 built and proved the QA engine: `createPlan` / `refinePlan` /
`loadPlan` are implemented, validated, persisted, and CI-green on the deterministic
fake (`packages/qa-engine`). The MCP server (`apps/mcp`) is still the *superseded*
five-stage stub adapter (`analyze_feature` … `export_test_cases`) wired to the now
soon-to-retire `packages/{core,planner,artifacts}`. This workstream replaces that
adapter surface with the three coarse product operations, wires it to the real
engine over local BYOK, adds progress/cancellation and a typed domain→MCP error
map, establishes the roots / project-root policy, proves it end-to-end through
stdio on the fake, and retires `core`/`planner`/`artifacts` leaving the workspace
green at every step.

`apps/mcp` stays a thin protocol adapter (ADR-0003): it negotiates MCP, validates
transport inputs, translates domain failures, reports progress, and constructs the
provider from local config — and contains **no** prompts, QA rules, provider logic,
or artifact rendering. All reasoning stays in the engine.

**Exit criterion (checkpoint §8):** *a supported MCP host can install the server
and create/refine a real plan using local BYOK configuration.*

## Source Snapshot

- **Checkpoint:** `docs/v1-checkpoint.md` §8 "MCP Product Adapter" (`pending`):
  replace the five stage tools with create/refine/get operations; progress and
  cancellation; typed domain→MCP errors; MCP roots/project-root policy; end-to-end
  tests through stdio. Exit: supported host installs the server and create/refines
  a real plan using local BYOK. The §"Architecture Delta" and §"Migration" lines
  require deepening `core`/`planner`/`artifacts` into the QA engine and replacing
  the stub-chain tests with engine-operation + adapter contract tests.
- **Spec:** `docs/superpowers/specs/2026-06-14-...architecture-design.md`
  — "MCP Adapter" (lines 198–216) names the **exact V1 public operations**:
  `create_test_plan`, `refine_test_plan`, `get_test_plan`; "The former five tools
  become internal workflow stages." Error Model (lines 398–413) lists the ten typed
  failures. "Current Repository Migration" (491–504): keep `apps/mcp` as adapter,
  replace five public stage tools "after engine tests exist"; deepen
  core/planner/artifacts into qa-engine; keep repo-scan; "replace stub-chain tests
  with engine operation tests and MCP adapter contract tests."
- **ADR-0003** (`docs/adr/0003-keep-workflow-stages-internal.md`): public adapters
  expose coarse operations (`create_test_plan`, `refine_test_plan`); the eight
  internal stages stay private; "Internal stages may evolve without breaking MCP
  clients." This is the normative source for the coarse tool surface.
- **ADR-0010** (`0010-byok-provider-seam.md`) + `docs/byok-setup.md`: the engine
  receives its provider by DI from `createProvider(config, deps)`; the deterministic
  fake is **not** a configurable provider value — it is injected via
  `createProvider(config, { fakeProvider })`, so production constructs a real
  adapter from config while tests inject the fake.
- **Superseded:** `docs/superpowers/plans/2026-06-13-mcp-tool-stubs.md` — the
  five-tool stub plan this workstream retires. Its protocol-test scaffolding
  (in-memory `InMemoryTransport.createLinkedPair`, built-stdio `StdioClientTransport`
  handshake) is reused; its tool surface and stub handlers are deleted.
- **Domain (`CONTEXT.md`):** "Public adapters expose coarse operations; workflow
  stages remain internal." "Provider credentials never enter prompts, artifacts, or
  telemetry." Plan Revision, Provenance, Test Plan terms used below.

### Reuse already on `main` (exact symbols)

Engine surface (no engine changes in this workstream — it is already complete):

- `packages/qa-engine/src/index.ts` re-exports everything below from
  `./engine/index.js` and `./providers/index.js`.
- `engine/engine.ts` — `createPlan(input, deps)`, `refinePlan(input, deps)`,
  `loadPlan(input, { workspaceRoot })`. Refine already does the optimistic
  `expectedVersion` check, decompose→re-plan→validate-transition, and atomic
  `persistRevision`.
- `engine/types.ts` — `CreatePlanInput` (`{ project:{name}, title, sources:
  CreatePlanSource[], repo?:{path} }`), `CreatePlanSource` (`{ kind, title,
  content, locator? }`), `CreatePlanResult` (`{ graph, planDir, usage, warnings,
  status }`), `RefinePlanInput` (`{ planId, feedback, expectedVersion?, sources? }`),
  `RefinePlanResult` (`+ previousVersion`), `LoadPlanInput` (`{ planId }`),
  `EngineDeps` (`{ provider, now, workspaceRoot, scan?, signal?, methodologyVersion?,
  workflowVersion?, repairBudget?, maxOutputTokens?, timeoutMs? }`), `RepoContext`
  (`{ revision?, signals: string[], truncated }`).
- `engine/errors.ts` — `EngineError { code: EngineErrorCode; message; findings? }`;
  the **full `EngineErrorCode` union** (the table in §Resolved Decisions maps every
  member); `asEngineError`, `fromProviderError`.
- `providers/factory.ts` — `createProvider(config, deps?)`; `ProviderDeps`
  (`{ now?, getEnv?, fakeProvider?, invocation?, … }`). `deps.signal` is **not** a
  `ProviderDeps` field — cancellation reaches the provider through
  `EngineDeps.signal`, which the engine composes into every `generate` call.
- `providers/config.ts` — `providerConfigSchema` (`.strict()`, no `apiKey`;
  `{ provider:"anthropic"|"openrouter", model, keySource:{kind:"env",var}, baseUrl?,
  defaults? }`), `ProviderConfig`.
- `providers/fake/fake-provider.ts` — `createFakeProvider(script, opts?)`,
  `fakeOk`, `fakeError`, `fakeHang`, `FakeOutcome`. The E2E test provider.
- `test-graph/schema.ts` — `TestGraphV1` (top-level `{ schemaVersion, projectId,
  planId, planVersion, title, status, createdAt, updatedAt, generation, sources,
  evidence, requirements, features, testCases, steps, assertions, dataRequirements,
  openQuestions }`); `generationMetadataSchema` (provider/model id, versions,
  fingerprint, status, warnings — **no secrets**). `TestGraphV1` is what `loadPlan`
  returns and what `get_test_plan` projects a summary from.
- `test-graph/ids.ts` — `planIdSchema`, `projectIdSchema` (used to validate the
  `planId` tool input deterministically and to surface `INVALID_INPUT`).
- `packages/repo-scan/src/index.ts` — `scanRepository(request)` →
  `RepoScanSummary` (`{ framework, packageManager, frameworks[], components[], …,
  truncated, stopReason, warnings, stats }`); `RepoScanError`, `RepoScanErrorCode`;
  `repoScanOptionsSchema`. The MCP adapter bridges this to the engine's `RepoContext`.

MCP plumbing to reuse from the current `apps/mcp` (kept, rewritten in place):

- `apps/mcp/src/server.ts` — `createMcpServer(handlers?)` factory + `mcpServerManifest`.
  Rewritten to inject `EngineDeps` instead of `ToolHandlers`.
- `apps/mcp/src/index.ts` — stdio bootstrap (`StdioServerTransport`, `server.connect`,
  stderr-only error logging). Rewritten to build real `EngineDeps` from config.
- `apps/mcp/src/result.ts` — `successResult(structuredContent)`,
  `errorResult(error)`. Extended with a typed-error variant.
- `apps/mcp/src/server.test.ts` — the in-memory + built-stdio test harness
  (`InMemoryTransport.createLinkedPair`, `StdioClientTransport` handshake). Rewritten
  for the three tools.

MCP SDK API (verified against the installed `@modelcontextprotocol/sdk@1.29.0` in
`node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_zod@4.4.3`):

- `server.registerTool(name, { title, description, inputSchema, outputSchema,
  annotations, _meta? }, cb)` — `inputSchema`/`outputSchema` accept full Zod object
  schemas; a successful result with `outputSchema` **must** include matching
  `structuredContent` (SDK validates it).
- `cb(args, extra)` where `extra: RequestHandlerExtra` carries:
  - `extra.signal: AbortSignal` — fires when the client cancels the request
    (`notifications/cancelled`). **This is the cancellation source.**
  - `extra.sendNotification(notification)` — send a request-scoped notification.
  - `extra._meta?.progressToken` — present iff the client requested progress; only
    then may we emit `{ method: "notifications/progress", params: { progressToken,
    progress, total?, message? } }`.
- `McpServer.server` (the underlying `Server`) exposes:
  - `server.getClientCapabilities(): ClientCapabilities | undefined` — read
    `.roots` to know if the host supports roots.
  - `server.listRoots(): Promise<{ roots: { uri: string; name? }[] }>` — server→client
    `roots/list` request. Used for the project-root policy.

## Assumption Log

- **The exact public tool names are `create_test_plan`, `refine_test_plan`,
  `get_test_plan`.** *Confirmed by reading* the spec (lines 208–212) and ADR-0003.
  These are the canonical V1 operations; this plan does not invent alternatives.
- **The engine is complete and unchanged by this workstream.** *Confirmed by
  reading* `engine.ts`: all three operations, the `expectedVersion` conflict guard,
  `decomposePlan`, `validatePlanRevisionTransition` gating, and `persistRevision`
  are implemented and tested. Workstream #8 touches **only** `apps/mcp` plus the
  three deletions and their package.json/workspace wiring.
- **Only `apps/mcp` consumes `core`/`planner`/`artifacts` in source.** *Confirmed
  by grepping the whole workspace*: source importers are exclusively
  `apps/mcp/src/{tools,tool-handlers,handlers,stub-handlers}.ts` and
  `server.test.ts`. No other app/package imports them.
- **`repo-scan` and `artifacts` declare `@test-framework/core` in package.json but
  their `src/` never imports it — stale declarations.** *Confirmed by reading*:
  `grep 'test-framework/core' packages/repo-scan/src` and `packages/artifacts/src`
  both return nothing. `repo-scan` is KEPT, so its stale `core` dependency line must
  be removed when `core` is deleted, or the workspace install/build will dangle.
- **No tsconfig `references` arrays anywhere; resolution is bundler-mode via
  package.json deps.** *Confirmed by reading* `tsconfig.base.json`
  (`moduleResolution: "bundler"`) and grepping all `tsconfig*.json` for
  `references` (none). So deletion rewiring is package.json + source imports only —
  no project-reference graph to update.
- **`tsdown` bundles every `@test-framework/*` workspace package into the stdio
  binary** (`apps/mcp/tsdown.config.ts` `deps.alwaysBundle: [/^@test-framework\//]`).
  So the built `dist/index.js` must still resolve/import whatever the adapter
  imports; after the rewrite it imports `@test-framework/qa-engine` (and keeps
  `@test-framework/repo-scan`), and stops importing the three retired packages.
- **`apps/mcp` does NOT yet depend on `@test-framework/qa-engine`.** *Confirmed by
  reading* `apps/mcp/package.json`. The rewrite must add it.
- **Cancellation must compose into model calls via `EngineDeps.signal`.**
  *Confirmed by reading* `engine.ts` + `factory.ts`: the engine threads
  `deps.signal` into the provider's `GenerationCallOptions.signal`, and the seam's
  `withResilience` aborts the in-flight `generate`. The adapter passes
  `extra.signal` straight into `EngineDeps.signal` per call. *Must verify at
  implementation* that the engine actually forwards `deps.signal` to every
  `runStage`/`generate` (read `stages.ts` `runStage`); if a stage drops it, that is
  an engine bug to fix in this workstream's cancellation slice.
- **CI runs on the fake alone; live path is gated.** *Confirmed by reading*
  `live.test.ts` (`RUN_LIVE_PROVIDER` + key, `{ skip: !live }`) and `byok-setup.md`.
  The E2E stdio tests inject the fake; the one live smoke test auto-skips in CI.
- **`get_test_plan` returns metadata/summary + artifact paths, not the whole
  graph.** *Confirmed by reading* the spec ("return plan metadata, summary, and
  artifact paths"). It is read-only and loads via `loadPlan`.
- **The fake injected through stdio needs a transport for the script.** *Must
  verify at implementation*: a child-process stdio test cannot pass a JS closure to
  the spawned process. The E2E "real create/refine through stdio on the fake" runs
  through `InMemoryTransport` (in-process, fake injected directly); the built-stdio
  test asserts handshake + `tools/list` + a deterministic `INVALID_INPUT` rejection
  that needs no provider. (See Resolved Decisions.)
- No new runtime dependency: adapter = MCP SDK + zod + `@test-framework/qa-engine`
  + `@test-framework/repo-scan` + Node stdlib. All already in the catalog/workspace.

## Goal and Success Criteria

**Goal:** `apps/mcp` exposes exactly `create_test_plan`, `refine_test_plan`,
`get_test_plan`; each call runs the real QA engine over a provider built from local
BYOK config (or an injected fake in tests); long calls report progress and abort
in-flight model work on cancellation; every `EngineError` maps to a deterministic,
secret-free MCP error; the project root is resolved from MCP roots with a confined
fallback; and `core`/`planner`/`artifacts` are deleted with the workspace green at
every commit.

**Success criteria (numbered, testable):**

1. `tools/list` returns exactly `["create_test_plan", "get_test_plan",
   "refine_test_plan"]` (sorted), each advertising an `inputSchema.type === "object"`
   and `outputSchema.type === "object"`; the five old names are absent.
2. Over `InMemoryTransport` with an **injected scripted fake**, `create_test_plan`
   with a real brief returns `isError !== true`, schema-valid `structuredContent`
   whose `planId`/`status`/`planVersion`/`planDir`/`artifacts` match the engine
   result, and `jsonText(result)` deep-equals `structuredContent`.
3. `refine_test_plan` with the created `planId`, `expectedVersion` from the prior
   result, and feedback returns a `planVersion === 2` revision; a stale
   `expectedVersion` returns an MCP error mapped from `ARTIFACT_CONFLICT`.
4. `get_test_plan` for the created `planId` returns metadata + a bounded summary +
   the three artifact paths (`plan.json`/`plan.md`/`generation.json`) and writes
   nothing; an unknown `planId` maps to the `ARTIFACT_NOT_FOUND` error.
5. **Every** `EngineErrorCode` maps to a tool error whose `structuredContent.error`
   carries `{ code, message }` with the documented code; no `message` contains a
   stack trace, file system path outside the workspace, env var value, or key
   material. A table-driven test asserts the full mapping (criterion ↔ the §Resolved
   Decisions table).
6. **Cancellation aborts model work:** a `create_test_plan` whose provider is
   scripted to hang, invoked with a client `AbortSignal` that fires mid-call,
   rejects/returns a `PROVIDER_CANCELLED`-mapped error promptly (within the test
   timeout), and the engine's in-flight `generate` was aborted (the fake's hang
   resolves via abort, not via the script).
7. **Progress is emitted only when requested:** with a `progressToken` in the call
   `_meta`, a `create_test_plan` produces ≥1 `notifications/progress` with
   monotonic `progress` and a stable `total`; with no token, zero progress
   notifications are sent.
8. **Roots/project-root policy:** when the host advertises roots and `listRoots`
   returns a root, the engine's `workspaceRoot` is that root (file URI → path); when
   roots are unavailable, it falls back to the configured/default root; a path that
   would escape the resolved root is rejected before any engine call. Asserted with
   a fake client capability + a stub `listRoots`.
9. **Built stdio handshake:** the built `dist/index.js`, spawned via
   `StdioClientTransport`, completes MCP init, lists the three tools, and answers a
   no-provider-needed `INVALID_INPUT` call deterministically.
10. **Live BYOK path exists and is gated:** one `create_test_plan` smoke test
    through a real `createProvider` config runs only under `RUN_LIVE_PROVIDER` + a
    key and is `skip`-ped otherwise (green in CI).
11. `core`, `planner`, `artifacts` are deleted; `repo-scan`'s stale `core`
    dependency is removed; no workspace file imports the retired packages.
12. `pnpm check-types`, `pnpm test`, `pnpm check:ci` (biome), `pnpm build` green
    after **each** slice; CI runs on the fake alone (no network/keys).

## Scope and Non-Goals

**In scope (only `apps/mcp` + deletions/rewiring):**

- Replace the five stage tools with `create_test_plan`/`refine_test_plan`/
  `get_test_plan`; define their MCP input/output Zod schemas in the adapter.
- An engine-backed handler layer that calls `createPlan`/`refinePlan`/`loadPlan`,
  building per-call `EngineDeps` from an injected `EngineRuntime` (provider +
  workspaceRoot + scan + clock) and the request's `extra` (signal, progress).
- A typed `EngineError → MCP error` translator (the mapping table is normative).
- Progress reporting (gated on `progressToken`) and cancellation (compose
  `extra.signal` into `EngineDeps.signal`).
- MCP roots / project-root resolution policy with confined fallback.
- A `RepoScanSummary → RepoContext` adapter so `create_test_plan` can pass repo
  context to the engine's `scan` dep using the kept `repo-scan` module.
- BYOK wiring: production builds a real provider via `createProvider(config)` from
  local config/env; tests inject `createFakeProvider(script)`.
- Rewritten in-memory + built-stdio tests; one gated live smoke test.
- Delete `packages/{core,planner,artifacts}`; remove their workspace deps; drop
  `repo-scan`'s stale `@test-framework/core` dep.
- Update `README.md` MCP section (tool names, BYOK config, roots note); flip
  checkpoint §8 to `done`.

**Non-goals (explicitly out):**

- Any change to `packages/qa-engine` behavior or public surface (it is complete).
  *Exception:* if the cancellation slice proves a stage drops `deps.signal`, fix
  that single forwarding bug — no surface change.
- Re-tuning prompts, recorded baselines, release thresholds, the install/config/
  error-flow acceptance run → **Workstream #9** (Quality Gate and Release).
- A project-config **file** source for provider config (`invocation > project-config
  > env`; #5 shipped env + invocation; the file source is deferred there). #8 reads
  env + a minimal documented config object; it does not add a config-file parser.
- HTTP/SSE transport, auth, sampling/elicitation, prompts, resources, a
  `roots/list_changed` re-resolve subscription (resolve roots once per call).
- Exposing any internal stage as a tool (ADR-0003), or a diagnostic/scan tool
  ("can be added later only if users need it").
- A `project.json` aggregate writer; test execution, codegen, diagnosis → V2/V3.

## Resolved Decisions

Each is a recommendation tagged for orchestrator ratification.

- **[RATIFY] Tool names = `create_test_plan`, `refine_test_plan`, `get_test_plan`
  (snake_case, verbatim from the spec/ADR-0003).** *Why:* these are the named V1
  operations; deviating breaks the documented public contract and the success
  definition. This is the load-bearing public-contract decision — call it out to the
  orchestrator before implementation.

- **[RATIFY] Tool I/O schemas (defined in the adapter, mirroring engine types).**
  The adapter owns the *transport* schema; the engine owns the *domain* schema. The
  adapter schema is a thin projection so the host sees stable JSON:

  `create_test_plan` **input**:
  ```ts
  { project: { name: string.min(1) },
    title: string.min(1),
    sources: Array<{ kind: SourceKind, title: string.min(1),
                     content: string.min(1), locator?: string.min(1) }>.min(1),
    repo?: { path?: string.min(1), scanOptions?: repoScanOptionsSchema } }
  ```
  `create_test_plan` / `refine_test_plan` **output** (shared `planResult` shape):
  ```ts
  { planId, projectId, planVersion: int, status: "complete"|"incomplete",
    title, planDir, artifacts: { planJson, planMd, generationJson },
    usage: { inputTokens, outputTokens, totalTokens, … },
    warnings: string[],
    previousVersion?: int /* refine only */ }
  ```
  `refine_test_plan` **input**:
  ```ts
  { planId, feedback: string.min(1), expectedVersion?: int,
    sources?: Array<source> }
  ```
  `get_test_plan` **input**: `{ planId }`.
  `get_test_plan` **output**:
  ```ts
  { planId, projectId, planVersion, title, status, createdAt, updatedAt,
    generation: { generatedAt, methodologyVersion, workflowVersion,
                  inputFingerprint, generator, status, warnings },
    summary: { requirements: int, features: int, testCases: int,
               openQuestions: int, assertions: int },
    artifacts: { planJson, planMd, generationJson } }
  ```
  All output schemas stay **non-strict** (forward-compatible fields allowed), as the
  current adapter already does. *Why:* the host needs identity, status, version, and
  where the artifacts live; it does not need the full graph back (it can read
  `plan.json`). `get_test_plan` deliberately omits raw evidence/source bodies and
  never returns `generation` secrets (the schema has none). Counts give a useful
  summary without shipping the graph.

- **[RATIFY] Every tool error returns `{ isError: true, structuredContent: { error:
  { code, message, retryable } } }` plus a text block; the engine error never leaks
  raw internals.** The translator is `engineErrorToToolResult(err)`:
  - `EngineError` → use its `code`; `message` = a curated, code-specific sentence
    (NOT `err.message` verbatim when the code is a provider/IO class that may embed
    paths/SDK detail — see table); `retryable` from the code.
  - Zod input validation rejection (thrown by the SDK before the handler) → SDK's
    default `isError` text; we additionally normalize our own pre-engine
    `INVALID_INPUT`.
  - Any non-`EngineError` throwable → `{ code: "INTERNAL", message: "Unexpected
    server error." }` (no stack, no `err.message`).

  **`EngineErrorCode → MCP error` table (normative):**

  | EngineErrorCode | tool `error.code` | `retryable` | curated `message` (no secrets) | host action |
  | --- | --- | --- | --- | --- |
  | `INVALID_INPUT` | `INVALID_INPUT` | false | echo the validation reason (engine-authored, path-free) | fix the request |
  | `REPO_ACCESS_DENIED` | `REPO_ACCESS_DENIED` | false | "Repository path is outside the project root or unreadable." | choose a path under the root |
  | `CONTEXT_LIMIT_REACHED` | `CONTEXT_LIMIT_REACHED` | false | "Context budget reached; plan may be partial (see warnings)." | reduce inputs / accept partial |
  | `PROVIDER_AUTH` | `PROVIDER_AUTH` | false | "Model provider rejected the credentials." | check the key env var |
  | `PROVIDER_QUOTA` | `PROVIDER_QUOTA` | false | "Model provider quota/billing exhausted." | top up billing |
  | `PROVIDER_TRANSIENT` | `PROVIDER_TRANSIENT` | true | "Transient provider error after retries." | retry later |
  | `PROVIDER_TIMEOUT` | `PROVIDER_TIMEOUT` | true | "Model call timed out after retries." | raise `timeoutMs` / retry |
  | `PROVIDER_CANCELLED` | `PROVIDER_CANCELLED` | false | "Request was cancelled." | expected on cancel |
  | `PROVIDER_UNSUPPORTED_CAPABILITY` | `PROVIDER_UNSUPPORTED_CAPABILITY` | false | "Selected model cannot produce structured output." | pick a capable model |
  | `PROVIDER_CONFIG_INVALID` | `PROVIDER_CONFIG_INVALID` | false | "Provider configuration is invalid or the key env var is unset." | fix config / set env var |
  | `MODEL_OUTPUT_INVALID` | `MODEL_OUTPUT_INVALID` | false | "Model output failed validation and could not be repaired." | retry / refine |
  | `PLAN_INVARIANT_FAILED` | `PLAN_INVARIANT_FAILED` | false | "Generated plan violated graph invariants." (+ a count of findings, never paths) | retry / refine |
  | `ARTIFACT_NOT_FOUND` | `ARTIFACT_NOT_FOUND` | false | "No plan exists for the given planId." | check the planId |
  | `ARTIFACT_WRITE_FAILED` | `ARTIFACT_WRITE_FAILED` | false | "Atomic plan write failed; previous revision is intact." | retry |
  | `ARTIFACT_CONFLICT` | `ARTIFACT_CONFLICT` | false | "Plan changed since it was loaded; reload and refine again." | reload + refine |
  | *(non-EngineError)* | `INTERNAL` | false | "Unexpected server error." | report a bug |

  *Why:* one deterministic envelope; `code` is machine-branchable; curated messages
  for provider/IO classes prevent path/SDK/secret leakage while engine-authored
  `INVALID_INPUT`/`PLAN_INVARIANT_FAILED` messages are already safe to surface
  (they reference graph keys, not filesystem or secrets). `retryable` mirrors the
  seam's retry semantics from `byok-setup.md`.

- **[RATIFY] Cancellation = pass `extra.signal` straight into `EngineDeps.signal`
  per call; map `AbortError`/`PROVIDER_CANCELLED` to the cancelled error.** No
  custom AbortController in the adapter — the SDK already fires `extra.signal` on
  `notifications/cancelled`. The engine composes `deps.signal` into every
  `generate` (verified in `factory.ts`/`withResilience`). *Why:* a single signal
  source, real in-flight abort (criterion 6), no double-bookkeeping. **Verify at
  implementation** that `stages.ts` forwards `deps.signal` to every stage; if not,
  fix that forwarding (the only permitted engine change).

- **[RATIFY] Progress = opt-in via `extra._meta.progressToken`; emit a fixed-count
  staged progress for create/refine, none for get.** The adapter cannot see the
  engine's internal stage boundaries (ADR-0003 keeps them private), so it reports
  *coarse* progress around the single engine call: `progress 0/total` at start,
  `total/total` at completion, with `total` a small constant (e.g. `2`) and a
  human `message` ("Generating plan…" / "Done"). No per-stage progress (would leak
  orchestration). `get_test_plan` is fast and emits none. *Why:* honest, useful,
  and stage-private; richer progress would require an engine progress callback,
  which is out of scope and would couple the adapter to internal stages.
  *Alternative considered & rejected:* adding an `onProgress` callback to
  `EngineDeps` — rejected as engine-surface churn for marginal host value in V1.

- **[RATIFY] Project-root policy: resolve `workspaceRoot` per call as
  `firstRoot ?? configuredRoot ?? process.cwd()`, then hard-confine every path.**
  Resolution order, evaluated once per tool call:
  1. If `getClientCapabilities()?.roots` is set, call `server.listRoots()`; take the
     first root, convert its `file://` URI to a path (`fileURLToPath`); use as
     `workspaceRoot`.
  2. Else use a configured root from the server config/env (`TEST_FRAMEWORK_ROOT`),
  3. Else `process.cwd()`.
  Any `input.repo.path` (and the engine's confined writes) must resolve **inside**
  `workspaceRoot`; a path that escapes is rejected as `REPO_ACCESS_DENIED` before
  any engine call. `loadPlan`/`persist*` already confine writes under
  `workspaceRoot` (engine `planDirFor`), so the adapter only needs to (a) pick the
  root and (b) confine the optional `repo.path`. *Why:* MCP roots is the standard
  host mechanism for "which project am I operating on"; a confined fallback keeps
  the server usable for hosts without roots. Resolve once per call (no
  `roots/list_changed` subscription in V1) for determinism. *Non-secret:* root paths
  may appear in `planDir`/`artifacts` outputs — those are intentionally returned and
  are within the host's own project, never credentials.

- **[RATIFY] BYOK wiring via an injected `EngineRuntime`; production builds it from
  config, tests inject a fake.** Define:
  ```ts
  interface EngineRuntime {
    provider: ModelProvider;
    workspaceRoot: string;            // resolved per call by the roots policy
    scan?: (req) => Promise<RepoContext>;
    now: () => number;
    methodologyVersion?: string; workflowVersion?: string;
    repairBudget?: number; maxOutputTokens?: number; timeoutMs?: number;
  }
  ```
  `createMcpServer(runtimeFactory)` takes a `(rootForCall) => Promise<EngineRuntime>`
  (so `provider`/`scan` are built once and reused, `workspaceRoot` is per-call).
  Production `index.ts` builds the factory from `loadServerConfig()` (env-resolved
  `ProviderConfig` → `createProvider(config)`), plus a `repo-scan`-backed `scan`.
  Tests pass a factory returning `{ provider: createFakeProvider(script), … }`.
  *Why:* mirrors the engine's DI seam (ADR-0010); the fake is injected, never a
  config value; production never imports the fake on its path. The per-call
  `EngineDeps` is `{ ...runtime, workspaceRoot: resolvedRoot, signal: extra.signal }`.

- **[RATIFY] `RepoScanSummary → RepoContext` adapter lives in the MCP app, not the
  engine.** `repoContextFromSummary(summary): RepoContext` maps `framework`,
  `packageManagers`, and the file-reference arrays into `signals: string[]` (one
  synthesized claim per signal), passes `truncated`, and omits `revision` (no VCS
  read in V1). *Why:* the engine's `scan` dep is `(req) => Promise<RepoContext>`;
  `repo-scan` returns a richer `RepoScanSummary`; the projection is adapter
  responsibility (keeps the engine provider-/scanner-agnostic). The scanner's own
  errors (`RepoScanError`) map to `REPO_ACCESS_DENIED` (engine `createPlan` already
  wraps a thrown `scan` as `REPO_ACCESS_DENIED`).

- **[RATIFY] E2E "real create/refine on the fake" runs over `InMemoryTransport`;
  the built-stdio test asserts only handshake + `tools/list` + a no-provider
  `INVALID_INPUT`.** A spawned stdio child cannot receive a JS closure (the scripted
  fake), so a *real-create-through-the-built-binary* test would require a live key.
  The in-memory transport injects the fake directly in-process while still exercising
  the full registration/validation/translation path; the stdio test proves the
  binary is runnable and negotiates protocol. *Why:* keeps CI keyless and
  deterministic while still proving both the protocol entrypoint and the real engine
  call path. The single keyed `create_test_plan` over the built binary is the gated
  live test (criterion 10), `skip`-ped without `RUN_LIVE_PROVIDER`.

- **[RATIFY] Capture the MCP surface + roots/error policy in the checkpoint, not a
  new ADR.** ADR-0003 already ratifies the coarse surface; ADR-0010 the BYOK seam.
  Add a short "MCP Adapter" subsection to the checkpoint's #8 done-note rather than
  minting ADR-0011, unless the orchestrator wants the roots policy as a standalone
  decision record. *Why:* avoid ADR sprawl; the normative decisions already exist.
  (Flag for ratification: open ADR-0011 if the roots/error policy warrants it.)

## Slices

Vertical, test-first, independently shippable. Each lands green
(`"$PN/pnpm" check-types`, `test`, `check:ci`, `build`, where
`PN="$HOME/.nvm/versions/node/v25.2.1/bin"`). The **package-retirement slices are
sequenced last and ordered so the build is green after each** — the rewrite to
qa-engine removes all real importers *before* anything is deleted. MCP tests use
`node:test` + `node:assert/strict`, `InMemoryTransport.createLinkedPair`, the
scripted fake, a fixed clock, and a `mkdtemp` workspace — mirroring the current
`server.test.ts` and `engine.test.ts`.

> Reuse the engine's `happyScript()` shape from `engine.test.ts` (six `fakeOk`
> stage payloads: evidence, requirements, features, cases, details, review) to
> script `create_test_plan`; reuse the refine script (`[refineDraft, review]`) for
> `refine_test_plan`.

### Slice 1 — Engine-backed handler layer + tool schemas (in-memory, fake), tools renamed

**Change:** Replace the tool surface and handlers.
- New `apps/mcp/src/engine-runtime.ts`: `EngineRuntime` interface +
  `engineDepsFor(runtime, root, signal): EngineDeps`.
- New `apps/mcp/src/tool-schemas.ts`: the three Zod input/output schemas from the
  Resolved Decisions (import `repoScanOptionsSchema` from `@test-framework/repo-scan`;
  derive `SourceKind` literals to match `CreatePlanSource["kind"]`).
- Rewrite `apps/mcp/src/handlers.ts`: `EngineHandlers` interface with
  `createTestPlan/refineTestPlan/getTestPlan`, each `(input, ctx) => Promise<output>`
  where `ctx = { runtime, root, signal, progress? }`. Implement against
  `createPlan`/`refinePlan`/`loadPlan`, projecting engine results to the tool output
  shapes (artifact paths derived from `planDir` + `plan.json`/`plan.md`/
  `generation.json`).
- Rewrite `apps/mcp/src/tools.ts`: `toolNames = ["create_test_plan",
  "refine_test_plan", "get_test_plan"]`; `registerEngineTools(server,
  makeContext)`; annotations: create/refine `readOnlyHint:false,
  destructiveHint:false (writes new/rev, not destructive), idempotentHint:false,
  openWorldHint:true` (calls a model); get `readOnlyHint:true, idempotentHint:true,
  openWorldHint:false`.
- Rewrite `apps/mcp/src/server.ts`: `createMcpServer(runtimeFactory)`.
- **Delete** `apps/mcp/src/{stub-handlers.ts, tool-handlers.ts}` (their importers
  vanish here; the package deletions follow in later slices).

**Files touched:** `engine-runtime.ts` (new), `tool-schemas.ts` (new), `handlers.ts`,
`tools.ts`, `server.ts`, `result.ts` (add typed-error variant); delete
`stub-handlers.ts`, `tool-handlers.ts`. `apps/mcp/package.json` (add
`@test-framework/qa-engine`). Rewrite `apps/mcp/src/server.test.ts`.

**Tests (`server.test.ts`):**
- "lists exactly the three engine tools with JSON schemas" → criterion 1.
- "create_test_plan returns the engine result projected to the tool schema" — inject
  a fake-runtime factory with `happyScript()`, fixed clock, `mkdtemp` root; assert
  `planId` present, `status==="complete"`, `planVersion===1`, `artifacts.planJson`
  ends with `plan.json`, `jsonText===structuredContent` → criterion 2.
- "get_test_plan returns metadata + summary + paths and writes nothing" — create
  then get; assert counts match the graph arrays, no extra fs writes → criterion 4
  (happy half).
- "invalid create_test_plan input is rejected before the engine runs" — empty
  `sources`; assert error and the fake script is untouched (no `generate` call).

**Verify:** `"$PN/pnpm" -F mcp test && "$PN/pnpm" -F mcp check-types`.

### Slice 2 — Typed `EngineError → MCP error` translator

**Change:** New `apps/mcp/src/errors.ts`: `engineErrorToToolResult(err): CallToolResult`
implementing the normative table (curated messages for provider/IO classes; safe
passthrough for engine-authored `INVALID_INPUT`/`PLAN_INVARIANT_FAILED` reasons; a
findings *count* for `PLAN_INVARIANT_FAILED`; `INTERNAL` fallback). Wire it into the
`runTool` wrapper in `tools.ts` (replace the bare `errorResult`).

**Files touched:** `errors.ts` (new), `tools.ts`, `result.ts`.

**Tests (`errors.test.ts`):**
- Table-driven: for each of the 16 codes, `engineErrorToToolResult(new
  EngineError(code, "<raw with /etc/secret and sk-ant-xyz>"))` returns
  `structuredContent.error.code === code`, the curated message, and asserts the
  message does **not** contain `/etc/secret`, `sk-ant`, or `Error:` for the
  provider/IO classes → criterion 5.
- "a non-EngineError maps to INTERNAL with no leaked message" — pass `new
  Error("boom at /Users/...")`; assert `code==="INTERNAL"` and message is the
  generic sentence.
- "ARTIFACT_CONFLICT from a stale refine surfaces the conflict code" — drive a real
  `refinePlan` with a wrong `expectedVersion` through the in-memory tool; assert the
  mapped code → criterion 3 (conflict half).

**Verify:** `"$PN/pnpm" -F mcp test`.

### Slice 3 — Cancellation composes into model calls

**Change:** Thread `extra.signal` into `engineDepsFor(...).signal` in the tool
callback. (If the implementation reveals `stages.ts` does not forward `deps.signal`
to `runStage`/`generate`, fix that forwarding in `qa-engine` — the single permitted
engine change — and add an engine-level regression test there.)

**Files touched:** `tools.ts` (pass `extra.signal`); possibly
`packages/qa-engine/src/engine/stages.ts` (+ its test) only if a gap is found.

**Tests (`server.test.ts`):**
- "create_test_plan aborts the in-flight model call when the client cancels" —
  runtime with a provider whose first stage is `fakeHang()`; call the tool with a
  client-side `AbortController` that aborts after a tick; assert the call settles
  with a `PROVIDER_CANCELLED`-mapped error quickly (the `fakeHang` resolves via
  abort, not via a later script entry) → criterion 6.

**Verify:** `"$PN/pnpm" -F mcp test`.

### Slice 4 — Progress reporting (opt-in)

**Change:** In the create/refine callbacks, if `extra._meta?.progressToken` is set,
emit `extra.sendNotification({ method:"notifications/progress", params:{
progressToken, progress:0, total:2, message:"Generating plan…" }})` before the
engine call and `{ progress:2, total:2, message:"Done" }` after. `get_test_plan`
emits none.

**Files touched:** `tools.ts` (a small `reportProgress(extra)` helper).

**Tests (`server.test.ts`):**
- "create_test_plan emits monotonic progress when a token is supplied" — pass
  `_meta.progressToken` via `client.callTool(..., { onprogress })` (or capture
  server notifications); assert ≥1 progress with non-decreasing `progress` and
  `total===2` → criterion 7 (with-token).
- "no progress notifications without a token" — call without a token; assert zero
  progress notifications observed → criterion 7 (without-token).

**Verify:** `"$PN/pnpm" -F mcp test`.

### Slice 5 — Roots / project-root resolution + confinement

**Change:** New `apps/mcp/src/roots.ts`: `resolveWorkspaceRoot(server,
configuredRoot): Promise<string>` (capabilities → `listRoots` → first
`fileURLToPath` → fallback chain) and `confineRepoPath(root, repoPath): string`
(reject escape with an `EngineError("REPO_ACCESS_DENIED", …)`). Call
`resolveWorkspaceRoot` once per tool call to build the per-call `EngineDeps.workspaceRoot`;
confine `input.repo.path` before constructing the `scan` request.

**Files touched:** `roots.ts` (new), `tools.ts`, `server.ts` (pass the underlying
`server` into the context maker).

**Tests (`roots.test.ts` + `server.test.ts`):**
- "resolveWorkspaceRoot uses the first MCP root when available" — fake a `server`
  with `getClientCapabilities → { roots:{} }` and `listRoots → { roots:[{ uri:
  "file:///tmp/projX" }] }`; assert `/tmp/projX`.
- "falls back to the configured root, then cwd, when roots are absent."
- "confineRepoPath rejects a path escaping the root" → `REPO_ACCESS_DENIED`
  mapped error; assert no engine call → criterion 8.

**Verify:** `"$PN/pnpm" -F mcp test`.

### Slice 6 — Stdio bootstrap from BYOK config + built-stdio + gated live test

**Change:** Rewrite `apps/mcp/src/index.ts`: `loadServerConfig()` reads the
provider config (env-resolved `ProviderConfig`; documented object) and
`TEST_FRAMEWORK_ROOT`; builds `runtimeFactory` = `createProvider(config)` once +
`repo-scan`-backed `scan` (`scanRepository` → `repoContextFromSummary`) + a real
clock; `createMcpServer(runtimeFactory)`; connect `StdioServerTransport`; all
diagnostics to **stderr**. New `apps/mcp/src/scan-adapter.ts`:
`repoContextFromSummary`.

**Files touched:** `index.ts`, `scan-adapter.ts` (new), `server.test.ts`.

**Tests (`server.test.ts`):**
- "built stdio server completes the handshake and lists the three tools"
  (reuse the existing `StdioClientTransport` test; the built binary needs no key to
  start because the provider is constructed lazily / only on a tool call) →
  criterion 9 (handshake).
- "built stdio server answers a no-provider INVALID_INPUT deterministically" — call
  `create_test_plan` with empty `sources` over the built binary; assert
  `INVALID_INPUT` mapped error, no provider needed → criterion 9.
- "live create_test_plan over a real provider" with `{ skip: !RUN_LIVE_PROVIDER ||
  !key }` — build a real `createProvider` config, run one create, assert a valid
  persisted plan → criterion 10.

> **Lazy provider note:** construct `createProvider` on first tool call (or guard
> startup so a missing key does not crash the handshake) so the built-stdio
> handshake/`INVALID_INPUT` tests pass keyless. Verify at implementation which is
> cleaner; lazy construction is recommended.

**Verify:** `"$PN/pnpm" -F mcp test && "$PN/pnpm" -F mcp build && "$PN/pnpm" check:ci`.

### Slice 7 — Retire `artifacts` (green after)

**Change:** No source imports `@test-framework/artifacts` after Slice 1 (the only
importer, `stub-handlers.ts`, was deleted). Now remove the package.
1. `rm -rf packages/artifacts`.
2. Remove `"@test-framework/artifacts": "workspace:*"` from `apps/mcp/package.json`.
3. `"$PN/pnpm" install` (relock).

**Files touched:** delete `packages/artifacts/**`; `apps/mcp/package.json`;
`pnpm-lock.yaml`.

**Tests:** existing MCP + workspace suites (no artifacts references remain).

**Verify:** `"$PN/pnpm" install && "$PN/pnpm" check-types && "$PN/pnpm" build && "$PN/pnpm" test`.

### Slice 8 — Retire `planner` (green after)

**Change:** After Slice 1, the only importer (`apps/mcp`) no longer imports planner.
`planner` depends on `core`+`repo-scan` but nothing depends on `planner`.
1. `rm -rf packages/planner`.
2. Remove `"@test-framework/planner": "workspace:*"` from `apps/mcp/package.json`.
3. `"$PN/pnpm" install`.

**Files touched:** delete `packages/planner/**`; `apps/mcp/package.json`;
`pnpm-lock.yaml`.

**Verify:** `"$PN/pnpm" install && "$PN/pnpm" check-types && "$PN/pnpm" build && "$PN/pnpm" test`.

### Slice 9 — Retire `core` + drop `repo-scan`'s stale `core` dep (green after)

**Change:** After Slices 7–8, the remaining declarers of `@test-framework/core` are
`apps/mcp` (declaration only; no source import after Slice 1) and `repo-scan`
(**stale, unused** declaration — its `src/` never imports core, verified). Delete
core last.
1. Remove `"@test-framework/core": "workspace:*"` from `apps/mcp/package.json`,
   `packages/repo-scan/package.json` (the stale line), and confirm no other
   `package.json` declares it.
2. `rm -rf packages/core`.
3. `"$PN/pnpm" install`.
4. Final guard: `rg -n "@test-framework/(core|planner|artifacts)"` over the repo
   returns nothing.

**Files touched:** delete `packages/core/**`; `apps/mcp/package.json`;
`packages/repo-scan/package.json`; `pnpm-lock.yaml`.

**Tests:** full workspace suite; `repo-scan` builds/tests unchanged (its stale dep
was never used).

**Verify:** `"$PN/pnpm" install && "$PN/pnpm" check-types && "$PN/pnpm" build && "$PN/pnpm" test && "$PN/pnpm" check:ci`.

> **Deletion order rationale:** the *real* import rewire happens entirely in Slice 1
> (the adapter switches to `qa-engine` and the stub/tool-handler files are deleted),
> so by Slices 7–9 the only remaining references are package.json declarations.
> Deleting `artifacts` (leaf, mcp-only) → `planner` (mcp-only, depends on
> core/repo-scan) → `core` (depended on by the now-deleted planner and the stale
> repo-scan/mcp declarations) never leaves a dangling source import or a missing
> workspace dependency, so the build is green after each `install`.

### Slice 10 — Docs + checkpoint flip

**Change:** Rewrite the `README.md` MCP section: three tool names, BYOK config block
(provider/model/`keySource`), `TEST_FRAMEWORK_ROOT` / roots note, "create/refine
call your model with your key; CI uses the fake". Flip `docs/v1-checkpoint.md` §8 to
`done` (status line + the "MCP stdio adapter" reality row). Optionally open ADR-0011
for the roots/error policy if the orchestrator ratifies that (otherwise fold into
the checkpoint done-note).

**Files touched:** `README.md`, `docs/v1-checkpoint.md` (+ optional
`docs/adr/0011-*.md`, `docs/adr/README.md`).

**Verify:** `"$PN/pnpm" check:ci` (markdown/biome), `"$PN/pnpm" build`.

## Risks

| Risk | Likelihood | Impact | Control |
| --- | --- | --- | --- |
| Engine drops `deps.signal` in a stage, so cancellation does not abort in-flight model calls | Medium | High | Slice 3 verifies forwarding in `stages.ts`; if missing, fix that single forwarding bug + add an engine regression test. Criterion 6 (`fakeHang` + abort) fails loudly if it doesn't abort. |
| A built-stdio child process can't receive the JS fake, tempting a keyed E2E in CI | Medium | High | E2E "real create/refine on the fake" runs over `InMemoryTransport` (in-process injection); built-stdio test asserts only handshake + `tools/list` + no-provider `INVALID_INPUT`. Live create is `skip`-ped without `RUN_LIVE_PROVIDER`. |
| Provider config / missing key crashes the stdio handshake (binary unusable without a key) | Medium | High | Construct `createProvider` lazily on first tool call (Slice 6); handshake + `INVALID_INPUT` need no provider, so the server starts keyless and only a real create requires the key. |
| Error messages leak filesystem paths, SDK detail, or key material | Medium | High | Curated, code-specific messages for all provider/IO classes (table); `INTERNAL` fallback drops `err.message`; Slice 2 table test asserts no `/path`, `sk-ant`, or `Error:` leak (criterion 5). |
| Deleting `core` breaks `repo-scan` (a kept package that *declares* core) | Low | High | Verified `repo-scan/src` never imports core — the dep is stale; Slice 9 removes the declaration with the delete. `pnpm install` + build after the slice proves repo-scan is unaffected. |
| `tsdown` binary fails to bundle after the dep swap (workspace bundling) | Low | Medium | `alwaysBundle: [/^@test-framework\//]` now bundles `qa-engine`+`repo-scan` instead of the retired three; Slice 6 runs `build` and the built-stdio handshake to prove the binary resolves. |
| Roots `file://` URI → path conversion mishandles non-file roots or trailing slashes | Low | Medium | `fileURLToPath` for `file:` only; non-`file:` roots fall through to the configured/cwd fallback; `roots.test.ts` covers present/absent/escape (criterion 8). |
| Progress notifications sent without a token (protocol noise / spec violation) | Low | Low | Gate strictly on `extra._meta?.progressToken`; Slice 4 "without-token" test asserts zero notifications (criterion 7). |
| `get_test_plan` over-shares graph internals or future secrets | Low | Medium | Output schema is a fixed metadata+counts projection; `generation` schema carries no secrets; never returns raw evidence/source bodies. |
| Workspace goes red mid-retirement | Low | High | All real import rewiring is in Slice 1; Slices 7–9 only delete packages whose sole remaining references are package.json declarations, in leaf-first order, each followed by `install`+`build`+`test`. |
