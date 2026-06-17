# Domain Context

Canonical architecture:
[`docs/superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md`](docs/superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md)

## Product

**Verification Intelligence** understands intended software behavior, creates a
traceable verification plan, and eventually produces evidence-backed verdicts.
MCP, CLI, CI, web, and cloud are adapters or deployment surfaces, not the product.

## Terms

- **QA Engine**: deep module owning ingestion, context packaging, BYOK model
  workflow, semantic review, deterministic validation, repair, and persistence.
- **Test Graph**: durable versioned model connecting sources, evidence,
  requirements, features, test cases, assertions, future executable tests, runs,
  artifacts, and findings.
- **Test Plan**: V1 projection of the Test Graph through test cases and data
  requirements. It excludes executable tests and runs.
- **Evidence**: source-backed fact from user input, repository, or future runtime.
- **Requirement**: intended behavior labeled explicit, inferred, or assumption and
  linked to evidence.
- **Test Case**: behavioral verification scenario with structured target, actor,
  data, actions, assertions, cleanup intent, and requirement coverage.
- **Assertion**: machine-checkable description of an observable expected state;
  not generated test code.
- **Semantic Review**: owned model pass judging missing, duplicated, unsupported,
  or weak scenarios.
- **Deterministic Validation**: code-enforced schema, identity, linkage,
  provenance, coverage-declaration, and persistence invariants.
- **Provider Adapter**: single-vendor integration behind the provider seam that
  translates one provider into the neutral `ModelProvider` contract; loaded only by
  dynamic import so its SDK stays off the common import path. The seam (not the
  adapter) owns retry, timeout, cancellation, and structured-output validation.
- **Provider Capability**: a model's declared abilities the seam reads to drive a
  request — structured-output channel (`native`/`tool`/`prompted`/`none`), system
  prompt support, cancellation support, and max output tokens.
- **Usage Metadata**: normalized, non-secret token counts returned with a
  generation (`input`/`output`/`total`, optional `cached`/`reasoning`); cost is
  deferred.
- **Secret Reference**: a named environment variable (`keySource: { kind: "env", var }`)
  resolved into a `Secret` wrapper at call time. The key is never stored in config,
  logs, prompts, artifacts, or reports.
- **Structured Generation**: a generation whose caller supplies a Zod schema; the
  seam converts it to JSON Schema for the provider and validates the response
  against the same schema, throwing `MODEL_OUTPUT_INVALID` on any mismatch — never
  partial success.
- **Execution Bundle**: future V2 record containing a test run's request/response,
  logs, traces, screenshots, timings, assertions, and findings.
- **Plan Revision**: immutable version of one Test Plan; retains its `planId` and
  advances `planVersion` when plan content changes.
- **Provenance**: visible classification of a graph claim as explicit, inferred,
  or assumption, with evidence or rationale required by that classification.
- **Data Requirement**: named state or resource a Test Case consumes or produces,
  including provisioning and cleanup expectations.

## Evaluation Terms

- **Candidate**: one recorded `test-graph/v1` graph under evaluation. Held to the
  same output contract regardless of which arm produced it.
- **Generation Arm**: the workflow that produced a Candidate — raw-model (single
  prompt), host-only (host agent reasoning), or QA Engine. Arms differ only in
  workflow, never in output schema.
- **Ground Truth**: the hand-authored, source-backed set of expected requirements
  and scenarios for one fixture, each carrying a stable Truth Key. The reference a
  Candidate is scored against.
- **Truth Key**: stable identifier for one expected requirement or scenario in a
  fixture's Ground Truth (e.g. `req:reject-expired-token`).
- **Annotation**: the committed, reviewed mapping from a Candidate's entities to
  Truth Keys (or to `extra`). It is the only human judgment in scoring and lets the
  harness score deterministically without a model.
- **Rubric**: the weighted set of quality dimensions used to score a Candidate into
  a [0,100] quality number.
- **Hard-Fail**: a gating condition that fails a Candidate outright, reported
  separately from and overriding the weighted Rubric score.
- **Baseline**: an accepted, committed scored result for the corpus that later
  Eval Runs are compared against.
- **Regression**: a material change versus the accepted Baseline — a quality drop
  beyond tolerance, a new Hard-Fail, or an unsupported-claim increase.

## Invariants

- JSON Test Graph is canonical; Markdown is derived.
- Public adapters expose coarse operations; workflow stages remain internal.
- Semantic judgment uses owned model reasoning; deterministic code never pretends
  to prove semantic completeness.
- Every explicit/inferred requirement and test case has traceable evidence.
- Assumptions remain visibly labeled.
- V1 cases are execution-ready but are not executable tests.
- Provider credentials never enter prompts, artifacts, or telemetry.
- Cloud infrastructure is deferred until managed execution or collaboration needs
  it.
- Comparative evaluation is deterministic and reference-based; a model judge never
  gates CI and never enters the aggregate score.
- Every Candidate is scored on the same `test-graph/v1` contract; its Generation
  Arm is metadata, not a separate scoring path.
