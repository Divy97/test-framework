---
status: accepted
---

# Reposition the moat: reliability and auditability over raw plan quality

The first eval recorded against a real frontier model (Claude Opus 4.8, via the
local `claude-cli` host-model provider) measured the multi-stage QA engine against
a single raw prompt to the **same** model, with honest, even-handed annotation. The
engine **lost on all three recorded fixtures** (ui-form 73.4<82.3;
unsupported-assumptions 72.6<82.6, both hard-failing the unsupported-claim gate;
authz-api 84.3<93.0). The engine over-builds — it manufactures speculative cases,
invents unsupported behavior, and its honest open-questions depress execution
readiness — while one-shot Opus produces tighter, more execution-ready plans. Full
analysis: [moat & thesis review](../research/moat-and-thesis-review-2026-06.md).

This **disproves, as measured, the premise** of
[ADR-0001](0001-verification-intelligence-is-the-product.md) /
[ADR-0002](0002-own-qa-reasoning-through-byok.md) /
[ADR-0006](0006-reject-validator-only-product.md) that owning the QA reasoning
yields *better plans* than a raw prompt. Those ADRs are not rewritten (the
deliberation history stands); this decision supersedes their **moat claim**.

**Decision.** The product's moat is **not** "better plans than your model." It is
the **reliable, auditable, refinable, durable test-plan artifact** that the engine
produces from *any* model, inside the agent the user already runs. Single-shot
quality scoring is blind to these — they are guarantees, not generation quality:

- **Reliability**: a valid `test-graph/v1` every time (validation + bounded repair).
  Raw Opus produced an *invalid* graph on the first attempt; the engine does not.
- **Refinement**: identity-preserving, version-incremented revisions
  ([ADR-0007](0007-versioned-test-graph-contract.md)); a raw re-prompt churns ids,
  provenance, and structure.
- **Auditability**: evidence links and provenance per entity; a raw blob is opaque.
- **Determinism & a durable contract**: byte-stable canonical JSON, a versioned
  schema, persistence, migrations — an artifact a system builds on, not a chat reply.

Three consequent commitments:

1. **Lean the engine.** The data shows the deep multi-stage workflow *reduces*
   single-shot quality versus one good prompt. Collapse stages and stop manufacturing
   speculative cases — let the model's own strength through — while keeping the
   guarantees (validation, repair, provenance, persistence, refine). Leaner is also
   cheaper per plan.
2. **Replace the release gate.** "Beats the recorded raw-model baseline on quality"
   is retired as the V1 gate. The gate measures the moat: valid-rate over N runs
   (reliability), refinement coherence (identity/provenance preserved across a
   revision), and provenance density — plus, once V2 execution exists, downstream
   execution success. A quality dimension remains, but it is not the gate.
3. **Host-model is a first-class path, not just an on-ramp.** Given a strong model
   already plans well, "validate, structure, persist, and refine the host's own
   model output" ([ADR-0011](0011-provider-modes-byok-and-host-model.md)) is a
   primary architecture candidate. Whether V1 stays a *leaner deep* engine or
   becomes a *thin validate-and-persist* layer is decided by evidence from running
   both against a real repository (the pending Quizito comparison), not a priori.

We reject: faking the V1 quality gate green by lowering thresholds; continuing to
sell "better plans than your model" (a claim that erodes as base models improve and
that the data refuses to support); and rebuilding the engine before the deep-lean
vs thin-layer question is settled with real-repository evidence.

## Consequences

- Workstream #9 lands as completed **infrastructure plus an honest negative
  finding**: the eval harness, the gated recording tool, the `claude-cli` host-model
  provider, the engine fixes that let real providers run at all, and four recorded
  fixtures with reviewed annotations. The `v1-mvp` "beats the recorded raw baseline"
  done-item is marked **not met (quality)** and re-pointed at the reliability/
  refinement/provenance gate above; #9's DoD is repositioned, not faked.
- A new workstream owns the lean-engine redesign, the reliability/refinement eval
  metrics, and the deep-lean vs thin-layer decision — gated on the real-repository
  comparison.
- The recorded baselines and annotations are kept as the first ground truth about
  real behavior; the repositioned eval is built on them.
- Positioning copy changes from "better plans" to "a reliable, auditable, refinable
  QA-planning artifact from any model, in the agent you already use."
