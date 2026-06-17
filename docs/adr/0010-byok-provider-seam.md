---
status: accepted
---

# BYOK provider seam inside qa-engine

The QA Engine reaches a user-selected model through one provider-neutral seam
that lives in `packages/qa-engine/src/providers/`. The engine depends only on the
neutral `ModelProvider` interface, the typed error taxonomy, and the config
types; it never imports a vendor SDK. A single coarse `generate()` call (no
streaming in V1) carries a typed `GenerationRequest`; when the caller passes a
Zod schema the seam — not the adapter — converts it to JSON Schema, drives the
provider's structured-output channel, and validates the response against the same
schema. Invalid output is a non-retryable `MODEL_OUTPUT_INVALID`; semantic repair
stays in the engine, not the seam.

Keys are referenced, never stored: config carries `keySource: { kind: "env", var }`
and the key resolves at call time into a `Secret` wrapper whose every coercion
path yields `"[redacted]"`. A raw `apiKey` in config is a schema rejection. Errors
are one discriminated `ProviderError` class, thrown (not a result union), carrying
neither key nor request body. Resilience is owned by the seam: per-attempt timeout
and caller cancellation are composed via `AbortSignal.any`, disambiguated into
`PROVIDER_TIMEOUT` (retryable) versus `PROVIDER_CANCELLED` (immediate); only
`PROVIDER_TRANSIENT`/`PROVIDER_TIMEOUT` retry, with bounded exponential backoff,
full jitter, a wall-clock cap, and `Retry-After` honored — all over injected
clock/sleep/jitter so tests are deterministic. Logging is allowlist-first
(only `{provider, model, code?, attempt, durationMs, usage?, providerRequestId?}`)
with value masking as defense in depth.

Anthropic (`@anthropic-ai/sdk`) is the first adapter; structured output uses a
forced "emit" tool call in V1. Adapters are loaded by **dynamic `import()`** in
the factory and are never re-exported from the package surface, so the vendor SDK
stays off the common import path (the evals package imports qa-engine). The engine
receives its provider from `createProvider(config, deps?)` by dependency
injection; a deterministic scripted fake implements the same contract, and CI runs
on the fake alone — the live test is auto-skipped unless `RUN_LIVE_PROVIDER` and a
key are present.

We reject: a streaming surface in V1; token cost calculation (usage token counts
only); a result-union error channel; persisting keys anywhere (artifacts, prompts,
fixtures, snapshots, logs, reports); re-exporting adapters from the package index;
and putting structured-output validation or semantic repair in the adapter.

## Consequences

- The engine depends on the interface, not adapters; adding a provider is a new
  adapter plus a capability declaration, with no engine change.
- The seam is fully testable without network or keys: timeout, cancellation,
  retry, redaction, and structured-output validation all run against injected
  dependencies and the fake.
- The project-config-file source (`.test-framework/project.json`, Artifact
  Workspace #7) is deferred; precedence is defined (`invocation > project > env`)
  and this checkpoint implements `invocation` + the env-resolved key.
- OpenRouter (OpenAI-compatible, via the `openai` SDK) is the realized second
  adapter, sharing one provider-agnostic HTTP error mapper with Anthropic; adding
  it touched no seam logic.
- The deterministic fake is a **DI-only** test seam (`createProvider(config, { fakeProvider })`),
  not a value in the config `provider` enum — so a config file can never silently
  select a no-op model in production.
