---
status: accepted
---

# Reference-based, annotation-driven deterministic evaluation

The eval harness scores each Candidate (a `test-graph/v1` graph) against a
hand-authored, source-backed Ground Truth using a committed, reviewed Annotation
that maps Candidate entities to Truth Keys. Scoring is a pure deterministic join:
requirement recall, requirement-to-case traceability, risk-weighted scenario
coverage, unsupported-claim classification, provenance accuracy, duplicate and
low-value detection, assertion specificity, execution readiness, and evidence
correctness are all computed as code over committed data, with no network call and
no model call in CI. All Generation Arms (raw-model, host-only, QA engine) emit the
same contract and run the same scoring path; how a Candidate was produced is
metadata. Deterministic validation reuses `validateTestGraph` unchanged. Quality is
a weighted Rubric score in `[0,100]`; Hard-Fail conditions (invalid graph when
validity is expected, unsupported-claim rate over ceiling, a contradicts-truth
claim, secret/PII leakage, annotation integrity violations) are evaluated and
reported separately and override the score. Rubric weights, thresholds, and the
accepted Baseline are committed, schema-validated data; Baseline updates and
threshold changes require PR review with a recorded rationale. Eval result JSON
carries no wall-clock timestamp, so repeated runs are byte-stable.

We reject: a model-as-judge as the CI evaluator or sole scorer; inferring
Candidate-to-Ground-Truth matches heuristically at scoring time; live provider
calls in deterministic CI; any metric that rewards case volume; folding eval logic
into the `qa-engine` runtime; and a single number that blends gating with quality.
A model judge is permitted only offline as an advisory check on Annotation quality;
it never gates CI and never enters the aggregate.

## Consequences

- Scoring is byte-stable and explainable: every dimension score traces to a typed
  finding or an annotated Truth Key.
- New Candidates, including real recorded QA-engine output, plug in as data — a
  graph plus its Annotation — with no harness code change. The one-time Annotation
  of a fresh graph is the human-calibration step and is reviewed in the PR.
- The Annotation is a labor and bias surface; it is mitigated by review,
  adversarial fixtures, and periodic expert re-scoring.
- This checkpoint proves the harness with hand-authored calibration tiers. The real
  raw-model and host-only Baselines and the real release thresholds are captured
  later, before prompt tuning, against recorded output dropped into the same
  structure.
