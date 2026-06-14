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
- **Provider Adapter**: local BYOK integration normalizing model requests, usage,
  cancellation, and errors.
- **Execution Bundle**: future V2 record containing a test run's request/response,
  logs, traces, screenshots, timings, assertions, and findings.

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
