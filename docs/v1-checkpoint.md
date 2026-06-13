# V1 Checkpoint

Date: 2026-06-13  
Baseline: `main` at `f860dd4`  
Last milestone: [PR #3 - MCP tool stubs](https://github.com/Divy97/test-framework/pull/3)

## Headline Status

**Phase:** foundation complete; functional V1 pipeline pending.

The repository now has the correct local MCP architecture, domain contracts, five registered tools, deterministic stubs, and protocol-level tests. It does **not** yet perform real repository analysis, AI reasoning, testcase review, or artifact export.

Current user-visible behavior proves the protocol and schema boundaries. It does not yet satisfy the V1 product success criteria in `docs/v1-mvp.md`.

## Status Definitions

- **Done:** implemented, tested, and usable for its intended V1 behavior.
- **Partial:** contract or scaffold exists, but production behavior is incomplete or stubbed.
- **Pending:** no meaningful implementation exists yet.
- **Later:** explicitly outside V1.

## Current Capability

A local MCP client can start `apps/mcp` over stdio and call:

- `analyze_feature`
- `map_feature`
- `generate_test_cases`
- `review_test_cases`
- `export_test_cases`

All five tools validate input and output with Zod and return structured MCP content. Their handlers are deterministic stubs:

- No LLM provider is called.
- No repository files are scanned.
- No target URL or API documentation is analyzed.
- No testcase quality reasoning occurs.
- No files are written.

## V1 Requirement Matrix

| V1 requirement | Status | Current evidence | Remaining work |
| --- | --- | --- | --- |
| Developer-only local product through MCP | Done | Stdio server in `apps/mcp`; no hosted dependency | Add install/config polish before release |
| Expose five V1 MCP tools | Done | All five tools registered with schemas and annotations | Replace stub handlers incrementally |
| Core QA domain schemas | Done | Normalized PRD, feature map, acceptance criteria, test cases, findings in `packages/core` | Evolve only from real fixtures/evals |
| Tool input/output contracts | Done | Operation schemas and types in `packages/planner` | Extend inputs for full V1 context bundle |
| Create project/session from feature context | Pending | Artifact path constant exists only | Define project manifest, session ID, lifecycle, load/save behavior |
| Accept PRD/spec/free-form document text | Partial | `featureRequest` string accepted | Add source documents, source type, metadata, and limits |
| Accept target URL and API docs | Pending | No contract or handler support | Add optional URL, OpenAPI/Postman/free-form API inputs |
| Accept branch/diff and existing tests | Pending | `repoPath` and `relevantFiles` only | Add git context and discovered existing-test references |
| Scan local repository safely | Done | `scanRepository` in `packages/repo-scan` does bounded, confined, secret-safe traversal, detection, and classification; wired into `map_feature` | Optionally add source excerpts and broaden the deterministic registry |
| Normalize requirements into PRD | Partial | Output schema and placeholder mapping exist | Add model-backed reasoning, source attribution, ambiguity handling |
| Extract feature map | Partial | Output schema and one placeholder item exist | Derive real features, flows, routes, files, APIs, dependencies, risks |
| Extract acceptance criteria | Partial | Output schema and one assumed criterion exist | Generate specific, testable, evidence-linked criteria |
| Generate comprehensive test cases | Partial | Output schema and one generic positive case exist | Generate coverage across quality-bar categories with useful assertions |
| Review gaps, duplicates, weak assertions | Partial | Only detects an empty testcase list | Implement coverage mapping, duplication checks, assertion quality, blockers |
| Export Markdown and JSON | Partial | Preview paths returned; no writes | Add deterministic renderers, atomic writes, confinement, overwrite policy |
| Local BYOK model configuration | Pending | No provider or model configuration | Add provider abstraction, env validation, model selection, safe errors |
| Context packaging and prompt orchestration | Pending | No orchestration layer | Build bounded context bundle, prompts, provider calls, response parsing |
| Editable testcase workflow | Pending | Structured output only | Define edit/regenerate flow through files and MCP inputs |
| QA/agent-ready quality | Pending | No quality fixtures or evaluations | Add golden fixtures, rubric, regression suite, measurable release threshold |
| End-to-end V1 workflow | Pending | Protocol chain tested only with stubs | Test spec + repo -> PRD -> map -> cases -> review -> exported files |

## Completed Foundation

### Repository and Tooling

- pnpm workspace and Turborepo structure established.
- Next.js, Hono/tRPC, Drizzle/Postgres scaffolds available for later surfaces.
- Biome, Husky, Commitizen, and commitlint configured.
- Root build, typecheck, and test commands exist.
- Product packages separated by responsibility.

### Domain and Contracts

- `packages/core` owns reusable QA entities.
- `packages/planner` owns operation input/output envelopes.
- `packages/repo-scan` owns the repository scan summary contract.
- `packages/artifacts` owns canonical local artifact paths.
- Explicit/inferred/assumption distinctions exist for acceptance criteria.
- Testcase types, priorities, evidence source, and automation readiness exist.

### MCP Runtime

- Stable `@modelcontextprotocol/sdk@1.29.0` pinned.
- Local stdio entrypoint implemented.
- Server construction is transport-independent and handler-injected.
- Five tools publish input/output schemas.
- Successful calls return JSON text and validated structured content.
- Tool errors use MCP `isError` results.
- Stdout is reserved for MCP protocol traffic.
- No auth, database, API server, or Docker dependency is required.

### Verification

- Unit tests cover schema and deterministic handler behavior.
- In-memory MCP tests cover registration and chained tool calls.
- Child-process test covers the built stdio handshake.
- PR #3 shipped with 15 passing MCP tests.
- Build, typecheck, and Biome checks passed during PR review.

## Partial Components

### `packages/repo-scan`

Current: complete safe scanner. `scanRepository` validates and canonicalizes the
root, traverses without following symlinks, enforces hard secret/dependency/
build/generated/binary exclusions before `.gitignore`, bounds depth/entries/
files/bytes/evidence, detects frameworks and package managers (with monorepo and
conflict handling), and classifies the nine evidence categories with repo-relative
paths and deterministic reasons. Returns partial results with truncation metadata
when soft limits are reached.

Remaining (optional, not required for this milestone):

- Source excerpts (intentionally excluded for now to limit secret/context risk).
- Broader framework/language registry coverage.

### `packages/planner`

Current: complete tool envelopes; no reasoning service.

Missing:

- Context bundle contract.
- Provider-independent planner interface.
- Prompt/version management.
- Structured model output parsing and retry policy.
- Source-reference preservation.
- Token/context budget controls.
- Quality rubric and evaluation fixtures.

### `packages/artifacts`

Current: canonical relative paths only.

Missing:

- Project manifest schema.
- JSON and Markdown serializers.
- Atomic write implementation.
- Repo-root confinement.
- Directory creation and overwrite policy.
- Read-back validation.
- Artifact versioning/migration policy.

### `apps/mcp`

Current: correct protocol adapter. Default handlers compose the real repository
scanner into `map_feature`; the other four tools remain deterministic stubs.

Missing:

- Composition with provider, planner reasoning, and artifact writer.
- Actionable error codes/messages for provider, scan, parse, and write failures.
- Progress reporting for longer calls.
- MCP roots integration or explicit root selection policy.
- End-to-end tests using real services with deterministic provider fixtures.

## Pending Workstreams

### 1. Engineering Gate

Goal: stop regressions before expanding behavior.

- Add GitHub Actions for install, test, typecheck, build, Biome, and commitlint.
- Pin supported Node.js version in tracked configuration.
- Remove generated/local build artifacts from normal repository searches.
- Define dependency update policy for MCP SDK and model providers.

Exit criteria:

- Every PR runs the same gates used locally.
- A failing test, typecheck, build, format, or commit message blocks merge.

### 2. Safe Repository Scanner — Done

Completed in `packages/repo-scan` and wired into `map_feature`:

- Scan options and immutable exclusion policy defined and bounded by Zod hard caps.
- Safe, confined, non-following traversal and file classification implemented.
- Framework, package manager, routes, components, APIs, DB, tests, auth, validation, flags, and integrations detected with paths and reasons (no excerpts in this milestone).
- Fixtures cover the Next.js/Hono monorepo and single-app repo; runtime tests cover empty repo, ignored secrets, large/binary files, symlinks, directory loops, conflicting lockfiles, and malformed manifests.

Exit criteria met:

- `map_feature` returns a real `RepoScanSummary` from the default handlers.
- Scanner never reads excluded secrets/build output and respects configured limits.

Verification: `packages/repo-scan` 101 tests and `apps/mcp` 20 tests pass; repository-wide `pnpm test`, `pnpm check-types`, `pnpm build`, and `pnpm check` (Biome) are green.

### 3. Project Context and Ingestion

Goal: represent all V1 inputs in one stable context bundle.

- Define project/session manifest.
- Add feature request, document text, target URL, API docs, repo path, branch/diff, relevant files, existing tests, and user hints.
- Add source IDs and metadata so outputs can cite evidence.
- Add size/type validation and clear unsupported-input errors.

Exit criteria:

- One validated input bundle contains every V1 input category.
- Source references survive through planner outputs.

### 4. BYOK Provider and Real Analysis

Goal: replace `analyze_feature` and `map_feature` stubs.

- Define provider-neutral structured generation interface.
- Support one provider first; keep a clean extension point for a second.
- Validate local API key and model selection.
- Build prompts for normalized PRD, feature map, and acceptance criteria.
- Parse model output with Zod; retry bounded validation failures.
- Preserve explicit, inferred, and assumption labels.

Exit criteria:

- Given real spec and repo evidence, tools return non-placeholder, source-linked outputs.
- Missing credentials and invalid model responses fail clearly without leaking secrets.

### 5. Testcase Generation and Review

Goal: meet the V1 testcase quality bar.

- Generate positive, negative, edge, security, regression, and integration cases.
- Cover validation, permissions, state changes, refresh/session behavior, duplicates, errors, empty/loading states, leakage, navigation, and partial failure.
- Map cases to acceptance criteria and evidence.
- Review for uncovered criteria, duplicates, weak assertions, missing preconditions/data, and blocked automation.
- Add stable IDs and deterministic ordering.

Exit criteria:

- Golden fixtures meet an agreed rubric.
- Review findings identify seeded gaps and duplicates.
- Output is directly usable by a QA engineer or coding agent.

### 6. Artifact Export and Editable Loop

Goal: make outputs durable, shareable, and revisable in the repository.

- Write `.test-framework/project.json`.
- Write normalized PRD, feature map, and testcase artifacts.
- Produce deterministic JSON and readable Markdown.
- Use atomic writes and repo-root confinement.
- Define overwrite/merge behavior.
- Support review/regeneration from edited testcase input.

Exit criteria:

- `export_test_cases` returns `status: "written"` only after validated writes.
- JSON round-trips through schemas.
- Markdown is readable without product tooling.

### 7. End-to-End Evaluation and Release

Goal: prove the complete V1 job, not only individual modules.

- Build representative feature fixtures with PRDs and local repositories.
- Run complete MCP workflow using deterministic mocked provider responses.
- Add optional live-provider smoke test outside required CI.
- Score source traceability, coverage, duplicates, assertion quality, and usability.
- Document installation, client configuration, BYOK setup, limits, and troubleshooting.

Exit criteria:

- Spec + repo produces valid PRD, feature map, criteria, reviewed test cases, and files.
- Outputs pass schemas and quality thresholds.
- A new developer can run the workflow from documentation alone.

## Recommended Execution Order

1. Engineering Gate.
2. Safe Repository Scanner.
3. Project Context and Ingestion.
4. BYOK Provider and Real Analysis.
5. Testcase Generation and Review.
6. Artifact Export and Editable Loop.
7. End-to-End Evaluation and Release.

Do not start web dashboard, database persistence, hosted API behavior, or test execution before this sequence delivers the local V1 loop.

## Immediate Next Milestone

**Milestone:** safe repository scanner.

Why next:

- It is deterministic and testable without provider decisions.
- Every reasoning tool needs trustworthy code context.
- It establishes security and context-budget boundaries early.
- It converts `packages/repo-scan` from a schema placeholder into a real service.

First implementation tasks:

1. Define scanner input/options, result errors, default ignore rules, and limits.
2. Build safe filesystem traversal with root confinement and symlink policy.
3. Add framework/package-manager detection.
4. Add category classifiers and evidence references.
5. Add fixture repositories and negative/security tests.
6. Wire scanner into `map_feature` behind the existing handler interface.

## V1 Definition of Done

V1 is complete only when all statements below are true:

- A developer can configure the local MCP server and one BYOK provider.
- A single workflow accepts feature text/spec, repo context, and optional target/API context.
- Repository scanning is bounded, excludes sensitive/generated content, and returns evidence.
- `analyze_feature` produces a useful normalized PRD with open questions and sources.
- `map_feature` produces real feature mapping and specific acceptance criteria.
- `generate_test_cases` covers the documented quality bar, not one generic case.
- `review_test_cases` detects meaningful gaps, duplicates, and weak assertions.
- `export_test_cases` safely writes valid JSON and readable Markdown.
- Explicit requirements, inferences, and assumptions remain distinguishable.
- Outputs link back to source docs/code.
- Golden evaluations demonstrate QA/agent usability and control duplicate/low-value output.
- Required CI gates pass on `main`.
- No Playwright generation, execution, cloud runtime, hosted dashboard, or auto-patching is required.

## Key Risks

| Risk | Current control | Required next control |
| --- | --- | --- |
| Secret or oversized file ingestion | Product requirement only | Scanner exclusions, limits, symlink/root policy, tests |
| Hallucinated requirements | Strength/evidence schemas | Source-grounded prompts, citation validation, quality evals |
| Shallow test cases | Rich testcase schema | Coverage rubric, prompt design, golden fixtures, review pass |
| Duplicate/low-value output | Review finding schema | Semantic duplicate detection and measurable thresholds |
| Provider lock-in | None | Provider-neutral interface and structured generation contract |
| Invalid model output | Zod output schemas | Bounded parse/retry logic and actionable errors |
| Unsafe artifact paths | Relative constants; no writes | Root confinement, atomic writes, overwrite policy |
| Protocol regressions | Local tests | Required GitHub Actions checks |
| Scope drift into platform features | V1 scope document | Enforce this checkpoint's execution order and definition of done |

## Explicitly Later

These are not V1 blockers:

- Playwright or executable test generation.
- Test execution.
- Cloud workers or hosted runtime.
- Screenshots, traces, videos, and run reports.
- Auto-healing.
- Automatic code patches.
- Hosted dashboard.
- Schedules, generated product-test execution in CI, and PR test-result comments.
- Authentication for a remote product.
- Database-backed project history.

## Evidence Index

- V1 scope and quality bar: `docs/v1-mvp.md`
- Product direction: `docs/product-baseline.md`
- MCP implementation plan: `docs/superpowers/plans/2026-06-13-mcp-tool-stubs.md`
- QA entities: `packages/core/src/index.ts`
- Planner contracts: `packages/planner/src/index.ts`
- Repo scan contract: `packages/repo-scan/src/index.ts`
- Artifact path contract: `packages/artifacts/src/index.ts`
- MCP registration: `apps/mcp/src/tools.ts`
- Current stub behavior: `apps/mcp/src/stub-handlers.ts`
- MCP protocol tests: `apps/mcp/src/server.test.ts`
- Local setup: `README.md`

## Checkpoint Update Rule

Update this document whenever a milestone merges. For each merged milestone:

1. Move requirements between Pending, Partial, and Done using code/test evidence.
2. Record the merged PR and new baseline commit.
3. Update immediate next milestone and risks.
4. Re-run V1 definition-of-done audit.
5. Do not mark V1 complete from tool presence alone; prove the full user workflow.
