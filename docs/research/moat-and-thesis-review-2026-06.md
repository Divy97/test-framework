---
type: decision-input
status: deliberation
created_at: "2026-06-20"
source: "Workstream #9 recorded-baseline eval — first real-model measurement of the moat"
---

# Moat & thesis review — the engine does not out-plan a raw frontier prompt

## TL;DR

The first honest measurement with a real frontier model (Claude Opus 4.8) shows
the multi-stage QA engine **loses to a single raw prompt on every recorded fixture**.
The premise of ADR-0001/0002/0006 — "owning the QA reasoning produces measurably
better plans than the same model with a raw prompt" — **is not supported as
measured**. But single-shot quality scoring is blind to the things the engine
actually does differently (reliability, structure, provenance, refinement,
determinism). The decision is not "kill it / keep it" — it is **reposition the
moat onto what the engine uniquely guarantees, make the engine leaner, and measure
the right thing.** Recommendation in §6.

## 1. The measurement

Recorded under Claude Opus 4.8 (same model for both arms; honest, even-handed
annotation applying one standard to both):

| Fixture | qa-engine | raw single prompt | winner |
| --- | --- | --- | --- |
| `ui-form-validation` (trivial) | 73.4 | **82.3** | raw |
| `unsupported-assumptions` (adversarial) | 72.6 — **HARD-FAIL** | **82.6** — HARD-FAIL | raw |
| `authz-api` (complex) | 84.3 | **93.0** | raw |

Three for three, raw wins. The prior synthetic baseline (qa 96 vs raw 25) was
**optimistic**: it hand-authored the raw arm as weak/invalid. Real frontier raw
output is neither.

## 2. Why the engine loses (mechanism, from the dimension scores)

- **It over-builds.** The workflow generates more cases, more edge cases, more
  open questions. On `unsupported-assumptions` it **invented unsupported behavior
  itself** (an anonymous-export case, a volume guarantee) and tripped the very
  unsupported-claim gate its evidence-discipline was supposed to prevent. The
  "evidence-grounded, won't hallucinate" claim is **not currently true**.
- **Its honesty is scored as a defect.** Surfacing open questions ⇒ cases marked
  blocked/partial ⇒ `readiness` collapses to 0. Raw Opus asserts confidently and
  scores `ready`.
- **Breadth dilutes quality.** The extra speculative cases carry generic targets
  and weaker assertions (`assert` 0–0.6), and a provenance stage mislabels
  `explicit` vs the expected `inferred` (`prov` 0.33–0.5).
- **Raw frontier output is just strong.** One-shot Opus produces tight, specific
  (403/404/401), execution-ready plans for these briefs.

**Uncomfortable conclusion:** the deep multi-stage workflow is, on this rubric,
*actively reducing* plan quality versus a single good prompt to the same model.

## 3. What this measurement CANNOT see (and why it matters)

Single-shot quality scoring of one lucky recording is blind to the engine's actual
differentiators:

- **Reliability / validity.** Raw Opus produced an **invalid** graph on the first
  `ui-form` attempt (`GENERATION_STATUS_MISMATCH`); we re-recorded until it was
  valid. The engine reliably produces a *valid* `test-graph/v1` every time
  (validation + bounded repair). A score of one valid raw recording hides that raw
  prompting is hit-or-miss. **A reliability metric (valid-rate over N runs) would
  likely favor the engine.**
- **Refinement.** `refinePlan` produces an identity-preserving, version-incremented
  revision (ADR-0007). A raw prompt cannot coherently refine a prior plan — re-prompt
  and the IDs, provenance, and structure churn. The eval never exercises refinement.
- **Provenance & auditability.** The engine emits evidence links and provenance per
  entity; a raw blob is unauditable. The rubric weights provenance, but lightly.
- **Determinism & a durable contract.** Byte-stable canonical JSON, a versioned
  schema, persistence, migrations — the plan is an *artifact a system can build on*,
  not a chat answer.
- **Floor-raising across models.** The workflow may lift a *weak* model's output
  more than it lifts Opus's. We only measured the strongest model, where the model
  needs the least help — the worst case for the engine.

None of these are quality-vs-prompt. They are **reliability, auditability,
refinability, and integration** — properties of a *product*, not of a single
generation.

## 4. The honest scorecard for the original thesis

| Claimed differentiator (ADR-0001/0002/0006) | Verdict from data |
| --- | --- |
| Better plans than a raw prompt (same model) | **Disproven** as measured (3/3 losses) |
| Evidence-discipline prevents hallucination | **Disproven** — engine still invented + hard-failed |
| Owned workflow is the value | **Weakened** — the workflow *hurt* single-shot quality |
| Reliable, valid, structured artifact every time | **Plausible but unmeasured** (strong candidate) |
| Coherent, identity-preserving refinement | **Plausible but unmeasured** |
| Provenance / auditability | **Real but under-weighted** |
| Determinism / durable contract | **Real, not a quality claim** |

## 5. Strategic options

**Option A — Reposition the moat onto guarantees, lean out the engine, re-measure.**
Concede that "out-plan a raw prompt" is not the moat with frontier models. The moat
is the **reliable, valid, auditable, refinable artifact** and its **integration**
into agent/CI workflows. Make the engine *leaner* (the over-build finding says the
deep workflow is counterproductive on quality) — fewer stages, stop manufacturing
speculative cases, keep validation/repair/provenance/persistence/refine. Replace the
single-shot quality rubric with metrics that test the real value: valid-rate over N
runs, refinement coherence, provenance density, downstream execution success,
cross-model floor-raising.

**Option B — Tune the deep engine to win the existing quality game.** Keep the
thesis; iterate prompts to stop inventing, tighten cases, fix readiness/provenance;
re-record; loop until qa-engine > raw. Risk: you may be tuning a workflow to
beat a single prompt at a game frontier models already win — diminishing returns,
and a moat that erodes as base models improve.

**Option C — Rethink the product altogether.** If neither quality nor the
guarantees justify a multi-stage BYOK engine over "the host agent prompts its own
model and we validate/persist the result," pivot to a thin **validator + artifact
layer** (closer to ADR-0006's rejected option, now reconsidered with frontier-model
evidence): let the host's model generate, and own only the schema, validation,
provenance, persistence, and refinement. This leans hard into the host-model
direction from ADR-0011.

## 6. Recommendation

**Option A, with a serious look at C's "thin layer" for the generation step.**

1. **Reposition the moat** from "better plans" to **"the only way to get a valid,
   auditable, refinable, durable test-plan artifact out of any model, reliably."**
   That is defensible and frontier-model-proof; raw-quality-vs-prompt is not.
2. **Lean the engine.** The data says the deep workflow over-builds and hurts.
   Collapse stages, stop generating speculative cases, and let the model's strength
   through — while keeping validation, repair, provenance, persistence, and refine.
   This is also cheaper per plan.
3. **Replace the eval.** Single-shot quality-vs-raw is the wrong gate. Measure:
   valid-rate over N runs (reliability), refinement coherence (identity/provenance
   preserved across a revise), provenance density, and — once V2 execution exists —
   downstream execution success. Keep a quality dimension, but it is not the moat.
4. **Be honest in positioning.** Drop "produces better plans than your model." Say
   "turns any model into a reliable, auditable, refinable QA-planning artifact,
   inside the agent you already use" (ties to ADR-0011's host-model on-ramp).

This keeps the genuinely valuable engineering (test-graph contract, validation,
artifacts, refine, BYOK + host-model seam) and discards the one claim the data
refuses to support.

## 7. Implications

- **ADR-0001/0002/0006** need an amendment or a superseding ADR: the moat is
  reliability/auditability/refinement/integration, not raw plan quality. Do not
  rewrite history — add the decision once chosen.
- **Workstream #9** cannot honestly close with the "beats the recorded raw baseline"
  DoD item green. Either redefine that item (reliability/refinement gate) or mark it
  explicitly **not met** and gate V1 release on the repositioned definition. The eval
  infra, recording tool, and recorded baselines are real, completed deliverables and
  should land regardless — the negative result is *the* finding, not a failure.
- **The recorded artifacts are evidence, keep them.** The four recorded fixtures and
  honest annotations are the first ground truth about real behavior; the next thesis
  is built on them.

## 8. Open questions for the founder

1. Is the product's promise *quality* ("better plans") or *guarantee* ("reliable,
   auditable, refinable artifact, any model")? The data pushes hard toward the latter.
2. If the workflow doesn't beat a raw prompt, is a *deep* engine justified — or is a
   thin validate-and-persist layer over the host's own model the real V1?
3. What should the release gate actually measure? (Proposed: reliability + refinement
   + provenance, not single-shot quality.)
4. Does the host-model direction (ADR-0011) become the *primary* architecture rather
   than an on-ramp?
