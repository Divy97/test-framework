# Limitations and Security Model

Published as part of the V1 release gate (workstream #9). It states honestly what
V1 is and is not, the known limitations, the security model, and how the
latency / cost / failure-rate thresholds the checkpoint names are dispositioned.
The decisions behind it live in the ADRs
([0001](adr/0001-verification-intelligence-is-the-product.md),
[0002](adr/0002-own-qa-reasoning-through-byok.md),
[0006](adr/0006-reject-validator-only-product.md),
[0009](adr/0009-reference-based-deterministic-eval.md),
[0010](adr/0010-byok-provider-seam.md)); this document publishes them for users.

## What V1 is, and is not

V1 is a **local, BYOK verification planning engine**, used first through MCP. It
turns feature intent and repository evidence into a traceable, execution-ready test
plan ([docs/v1-mvp.md](v1-mvp.md#position)).

It is **not**:

- a hosted QA platform — it runs locally with your key;
- a test executor — it plans tests, it does not run them;
- a thin host-model or Skill wrapper — we own the model workflow, methodology,
  schema, semantic review, deterministic validation, artifacts, and the evaluation
  corpus (ADR-0002, ADR-0006).

## Capability boundary

- Plans are **execution-ready but not executable**: the Test Graph is structured so
  an executor or coding agent could run it, but V1 ships no runner.
- No browser/API probing, no source patching, no network calls against the system
  under test.
- No cloud, dashboard, team, or billing surface (deferred to V2,
  [ADR-0005](adr/0005-defer-cloud-use-modular-monolith.md)).
- Repository context is **read-only and bounded** (see Security model below).

## Known limitations

- **Eval arms — recorded vs synthetic.** The comparative eval harness scores three
  arms per fixture (`raw-model`, `host-only`, `qa-engine`). The intended V1
  calibration records **real model output** for the `raw-model` control and the
  `qa-engine` arm (`recordKind: "recorded"`), and keeps **`host-only` synthetic**:
  a host-only arm needs a driving host agent and has no in-repo harness, so it
  remains a hand-authored calibration tier. **Recording has not happened yet** —
  every committed candidate is currently `recordKind: "synthetic"` (hand-authored
  calibration tiers). The recording is a one-time, gated, key-bearing step
  (`pnpm -F @test-framework/evals record:arms`, guarded by `RUN_LIVE_PROVIDER` +
  key); its output is committed JSON, and CI continues to score only committed
  bytes. See ADR-0009 and the recording tool at
  `packages/evals/src/corpus/record-arms.ts`.
- **Corpus size.** The corpus is **8 calibrated fixtures** across representative
  product shapes (UI form, authz API, stateful workflow, integration failure,
  contradictory spec, evidence conflict, adversarial shallow, unsupported
  assumptions). It is calibrated, not exhaustive.
- **Latency and cost are observed, not gated.** Token usage is observable per
  generation (`NormalizedUsage`), but there is **no latency or cost gate** in V1:
  cost is deferred (`NormalizedUsage` carries token counts only — "Cost is deferred
  (decision #9)"), and latency is not measured anywhere on the eval path. See the
  threshold disposition below.
- **Scanner parent-component TOCTOU residual.** The repository scanner never follows
  symlinks (files open with `O_NOFOLLOW`; each directory's canonical path is
  re-confined under the root before it is read), but a directory swapped for an
  external symlink in the narrow window between that revalidation and the read could
  still be followed, because Node exposes no fd-relative `readdir` / directory
  `O_NOFOLLOW`. The window is narrowed, not eliminated (README §Repository context).
- **Deterministic validation cannot prove semantic completeness.** `validateTestGraph`
  proves structural and referential integrity; it never claims the plan is
  semantically complete or correct. Semantic judgment is the model's job under
  internal review, and the only human judgment that enters scoring is the reviewed
  Annotation (CONTEXT.md invariant; ADR-0009).
- **Plan quality depends on the chosen model.** Output is only as good as the BYOK
  model you point it at; a weaker model produces a weaker plan.

## Security model

### BYOK key handling

- Keys are referenced **by name only** (`keySource: { kind: "env", var }`). There is
  deliberately **no `apiKey` field** in provider config — a raw key in config is a
  schema rejection (`providerConfigSchema` is `.strict()`).
- The key is resolved at call time and is **never** written to config, logs,
  prompts, artifacts, or telemetry (CONTEXT.md invariant; ADR-0010).
- Logging is allowlist-based and secret-safe; redaction masks anything
  key-shaped.

### Leakage gate

- The eval harness **Hard-Fails** (`HF-LEAKAGE`) any candidate whose graph or
  annotation text matches a credential shape — PEM private keys, AWS access keys,
  Slack tokens, JWTs, `sk-…` / `sk-ant-…` keys, and `ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY` / `AWS_SECRET_ACCESS_KEY` names (`detectLeakage`,
  `packages/evals/src/scoring/leakage.ts`). A real key leaking into a recorded
  artifact would fail the eval, which is the desired safety property.

### Error hygiene

- The MCP error envelope is curated and secret-free. Provider/IO error classes never
  echo the raw engine message; a non-engine error collapses to `INTERNAL` with the
  fixed message `"Unexpected server error."` (`apps/mcp/src/errors.test.ts`). No
  message leaks a path, SDK detail, env value, or key.

### Filesystem confinement

- Plan writes are confined to the resolved workspace root; an optional `repo.path`
  is hard-confined inside it (an escaping path is rejected as `REPO_ACCESS_DENIED`).
- The scanner avoids symlinks, applies hard secret exclusions (`.env*`, private keys,
  credentials — never re-includable by `.gitignore` or options), and is bounded by
  depth, entry, file, per-file byte, total-read-byte, and per-category caps. It
  returns paths and reasons only — no file contents (README §Repository context).

### Supply-chain isolation

- Vendor SDKs are loaded by **dynamic `import()` only**, inside the provider factory,
  off the common import path. The provider seam never re-exports an adapter, so
  importing `qa-engine` (as the eval harness does) never pulls in a vendor SDK
  (ADR-0010).

### CI integrity

- CI is **keyless and deterministic**: `pnpm eval` and `pnpm test` import no provider
  on the CI path and score only committed bytes. No model call gates anything
  (ADR-0009). The recording tool and the live MCP E2E are `RUN_LIVE_PROVIDER`-gated
  and `skip`-ped without a key.

## Threshold disposition (latency, cost, failure rate)

The checkpoint §9 names "quality, unsupported-claim, latency, cost, and failure
thresholds." The deterministic harness measures quality and unsupported claims
directly; the rest are dispositioned as follows:

- **Failure rate — gated.** Enforced as the existing **new-Hard-Fail regression
  rule** in `compareToBaseline`: any new Hard-Fail the baseline lacked
  (`HF-INVALID-GRAPH`, `HF-UNSUPPORTED-RATE`, `HF-CONTRADICTS-TRUTH`, `HF-LEAKAGE`,
  `HF-ANNOTATION-INTEGRITY`) is a regression. This satisfies the DoD's "no material
  regression in failure rate."
- **Latency — non-gating observation.** Not measured anywhere on the eval path;
  recorded here as a V1-out-of-scope observation. Latency gating becomes meaningful
  only once execution and a hosted runtime exist (V2).
- **Cost — non-gating observation.** The engine produces token usage only
  (`NormalizedUsage`); cost is deferred (decision #9). No `maxTotalTokens` /
  `maxLatencyMs` field is added to `thresholds.json` — inventing a number the
  deterministic, byte-stable eval path cannot reproduce would break byte-stability
  and honesty.
