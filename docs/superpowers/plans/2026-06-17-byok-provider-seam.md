# Plan: BYOK Provider Seam (V1 Checkpoint Workstream #5)

Date: 2026-06-17
Status: proposed
Architecture: [Verification Intelligence Architecture](../specs/2026-06-14-verification-intelligence-architecture-design.md)
Checkpoint: [V1 Checkpoint §5](../../v1-checkpoint.md)

## Goal

Implement the local BYOK provider seam so the future QA Engine can call a
user-selected model through one normalized, typed, provider-neutral contract.
This checkpoint delivers the seam and a real Anthropic adapter — **no QA Engine
workflow, no prompts, no MCP changes**.

## Locked decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Package ownership | Inside `packages/qa-engine/src/providers/`. Real adapters loaded by **dynamic `import()`**; package `index.ts` never re-exports an adapter, so the vendor SDK stays off the common import path (evals imports qa-engine). |
| 2 | First real provider | **Anthropic** (`@anthropic-ai/sdk`). Consistent with the eval corpus generator (`provider:"anthropic", model:"claude-opus-4-8"`) and `leakage.ts`. OpenAI is the planned second adapter. |
| 3 | Interface shape | Single coarse `generate()`; **no streaming** in V1. |
| 4 | Config precedence | `invocation > project-config > env`. This checkpoint implements **invocation + env**; the project-config-file source (`.test-framework/project.json`, Artifact Workspace #7) is a pluggable resolver added when #7 lands. |
| 5 | Secret reference | Config stores `keySource: { kind: "env"; var }` — a reference, never a key. Resolved at call time into a `Secret` wrapper. |
| 6 | Structured output | Capability-driven ladder (native → tool → prompted). Caller passes a **Zod schema**; seam converts to JSON Schema for the provider and validates the response with the same Zod schema. Invalid ⇒ `MODEL_OUTPUT_INVALID`, no partial success. |
| 7 | Retry | Retryable: `PROVIDER_TRANSIENT`, `PROVIDER_TIMEOUT`. Non-retryable: all others incl. `MODEL_OUTPUT_INVALID` (repair is the engine's job). Bounded attempts + exp backoff + full jitter + capped wall-clock; injected clock/sleep/jitter. |
| 8 | Timeout/cancel | Caller `AbortSignal` composed with an internal timeout via `AbortSignal.any`. Timeout ⇒ `PROVIDER_TIMEOUT` (retryable). Caller-abort ⇒ `PROVIDER_CANCELLED` (immediate). |
| 9 | Usage | Normalize token counts now (`input/output/total` + optional `cached/reasoning`). Cost deferred. |
| 10 | Capabilities | Minimal: `structuredOutput`, `maxOutputTokens?`, `supportsSystemPrompt`, `supportsCancellation`. |
| 11 | Errors | One discriminated `ProviderError` class, **thrown** (not result-union). Never carries key or raw request body. |
| 12 | Redaction | Allowlist logging (emit only safe fields) + value masking. New `providers/redaction.ts`; must **not** import `evals/leakage.ts` (would be a dependency cycle). |
| 13 | Fake | Deterministic fake implementing `ModelProvider`, driven by an ordered array of scripted outcomes. |
| 14 | Live test | In the test glob, auto-skipped unless `RUN_LIVE_PROVIDER` + key present. CI never has the key ⇒ always green. |
| 15 | Engine plug-in | Dependency injection: engine receives a `ModelProvider` from `createProvider(config)`; depends only on the neutral interface + errors + config types. |
| 16 | Docs | New `docs/byok-setup.md`; ADR-0010; CONTEXT.md glossary additions; README BYOK section; checkpoint #5 → done. |

## Non-goals (explicit)

- No QA Engine operations, stages, prompts, or methodology.
- No prompt tuning, no eval-score optimization, no change to eval behavior.
- No MCP product-API switch (legacy five-tool surface untouched).
- No test execution / V2 runner.
- No streaming, no token *cost* calculation, no telemetry.
- No project-config **file** source yet (precedence defined; env + invocation only).
- No second provider (OpenAI) in this checkpoint.
- No `AGENTS.md` (it does not exist today; out of scope to create).
- Provider keys never in artifacts, prompts, fixtures, snapshots, logs, or reports.

## File layout

All new code under `packages/qa-engine/src/providers/`. Tests co-located as
`*.test.ts`, run by the existing `tsx --test src/**/*.test.ts`.

```text
packages/qa-engine/src/providers/
  index.ts                 public surface: types, errors, config, createProvider, fake
                           (NEVER exports adapters/*)
  types.ts                 ModelProvider, GenerationRequest/Result, Message,
                           NormalizedUsage, ProviderCapabilities, FinishReason
  errors.ts                ProviderErrorCode, ProviderError, isRetryable()
  config.ts                providerConfigSchema (Zod), KeySource, ProviderConfig
  secret.ts                Secret wrapper (toString/toJSON ⇒ "[redacted]")
  resolve-config.ts        precedence (invocation > [project later] > env) + env key resolution
  redaction.ts             allowlist log fields + value masking
  retry.ts                 bounded retry over injected clock/sleep/jitter
  resilience.ts            wrap raw adapter: timeout + cancel + retry + redacted logging
  structured-output.ts     zodToJsonSchema + response validation + ladder selection
  factory.ts               createProvider(config, deps?): validate, resolve key,
                           dynamic-import adapter, wrap with resilience
  fake/
    fake-provider.ts       deterministic scripted fake + helpers (fakeOk/fakeError/fakeHang)
  adapters/
    anthropic.ts           real adapter; imports @anthropic-ai/sdk (dynamic-imported only)
    anthropic-errors.ts    pure mapAnthropicError(err) -> ProviderError (unit-testable, no SDK)
  live.test.ts             auto-skipped real smoke test

packages/qa-engine/src/index.ts        + export * from "./providers/index.js"
packages/qa-engine/package.json        + dependency "@anthropic-ai/sdk": "catalog:"
pnpm-workspace.yaml                     + catalog entry "@anthropic-ai/sdk"
```

Modify: `packages/qa-engine/src/index.ts`, `packages/qa-engine/package.json`,
`pnpm-workspace.yaml`. Docs: `docs/byok-setup.md` (new),
`docs/adr/0010-byok-provider-seam.md` (new), `docs/adr/README.md`, `CONTEXT.md`,
`README.md`, `docs/v1-checkpoint.md`.

## Interface & schema sketches

```ts
// types.ts
export type FinishReason = "stop" | "length" | "content_filter" | "tool_use" | "other";

export interface Message { role: "user" | "assistant"; content: string; }

export interface GenerationRequest<T = unknown> {
  system?: string;
  messages: Message[];            // a `prompt` convenience helper maps to one user message
  schema?: import("zod").ZodType<T>; // present ⇒ structured generation
  maxOutputTokens: number;        // explicit budget; no hidden default
  temperature?: number;
}

export interface GenerationCallOptions {
  signal: AbortSignal;            // caller cancellation
  timeoutMs: number;              // per-attempt wall-clock
  retry?: RetryPolicy;            // defaults applied by the seam
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface GenerationResult<T = unknown> {
  text?: string;                  // set when no schema
  data?: T;                       // set + validated when schema present
  usage: NormalizedUsage;
  model: string;
  finishReason: FinishReason;
  providerRequestId?: string;     // non-secret
}

export interface ProviderCapabilities {
  structuredOutput: "native" | "tool" | "prompted" | "none";
  maxOutputTokens?: number;
  supportsSystemPrompt: boolean;
  supportsCancellation: boolean;
}

export interface ModelProvider {
  readonly id: string;            // "anthropic" | "fake"
  capabilities(model: string): ProviderCapabilities;
  generate<T>(req: GenerationRequest<T>, opts: GenerationCallOptions): Promise<GenerationResult<T>>;
}
```

```ts
// config.ts
export const keySourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("env"), var: z.string().min(1) }).strict(),
  // future: { kind: "file" }, { kind: "command" } — not resolved in V1
]);

export const providerConfigSchema = z.object({
  provider: z.enum(["anthropic", "fake"]),
  model: z.string().min(1),
  keySource: keySourceSchema,
  baseUrl: z.string().url().optional(),
  defaults: z.object({
    maxOutputTokens: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
    temperature: z.number().min(0).optional(),
  }).strict().optional(),
}).strict();
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
// NOTE: no apiKey field exists. A raw key in config is a schema rejection.
```

```ts
// errors.ts
export type ProviderErrorCode =
  | "PROVIDER_AUTH" | "PROVIDER_QUOTA" | "PROVIDER_TRANSIENT" | "PROVIDER_TIMEOUT"
  | "PROVIDER_CANCELLED" | "MODEL_OUTPUT_INVALID"
  | "PROVIDER_UNSUPPORTED_CAPABILITY" | "PROVIDER_CONFIG_INVALID";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly providerRequestId?: string,
    options?: { cause?: unknown },   // cause is redacted before logging, never auto-serialized
  ) { super(message, options); this.name = "ProviderError"; }
}
export const RETRYABLE: ReadonlySet<ProviderErrorCode> =
  new Set(["PROVIDER_TRANSIENT", "PROVIDER_TIMEOUT"]);
```

```ts
// factory.ts
export interface ProviderDeps {            // all defaulted; tests inject fakes
  now?: () => number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number; getEnv?: (name: string) => string | undefined;
}
export async function createProvider(
  config: ProviderConfig, deps?: ProviderDeps,
): Promise<ModelProvider>;
// 1. providerConfigSchema.parse → PROVIDER_CONFIG_INVALID on failure
// 2. resolve key from env → PROVIDER_CONFIG_INVALID if missing (Secret)
// 3. provider === "fake" → return injected/standalone fake (no dynamic import)
//    else dynamic import("./adapters/anthropic.js") → construct raw adapter
// 4. wrap raw adapter with resilience(timeout+cancel+retry+redaction)
```

## Structured-output ladder

The caller always passes a Zod schema. The seam, not the adapter, owns validation.

1. **Selection** — `capabilities(model).structuredOutput` picks the channel:
   `native` (provider strict JSON schema) → `tool` (single "emit" tool whose
   `input_schema` is the JSON Schema) → `prompted` (JSON-only instruction).
   Anthropic is declared **`tool`** for V1 (re-verify whether native structured
   output is available at adapter-implementation time and prefer `native` if so).
2. **Conversion** — `z.toJSONSchema(schema)` (Zod 4) produces the provider JSON
   Schema. Caller schemas are restricted to the JSON-Schema-expressible subset.
3. **Extraction** — adapter returns normalized raw output:
   `{ kind: "json", value } | { kind: "text", value }`. `native`/`tool` ⇒ json;
   `prompted` ⇒ text that the seam strict-parses to JSON.
4. **Validation** — `schema.safeParse(value)`; failure ⇒ throw
   `MODEL_OUTPUT_INVALID`. The seam never returns a partial/unvalidated `data`.

## Retry / timeout / cancellation

- `resilience.ts` wraps the raw adapter. Per attempt: build a composed signal
  `AbortSignal.any([callerSignal, AbortSignal.timeout(timeoutMs)])` (verify Node
  ≥ 20.3 for `AbortSignal.any`; repo pins via `chore/add-node-version-file`).
- On abort, disambiguate by reason: caller signal aborted ⇒ `PROVIDER_CANCELLED`
  (no retry, thrown immediately); timeout fired ⇒ `PROVIDER_TIMEOUT` (retryable).
- Retry loop: `maxAttempts` (default 3), exponential backoff
  `base * 2^(n-1)` capped at `maxDelayMs`, **full jitter** via injected `random`,
  total elapsed capped at `maxElapsedMs`, honor `Retry-After`. Only
  `RETRYABLE` codes retry. Caller abort during backoff cancels the sleep.
- Determinism: `now`, `sleep`, `random` are injected; tests pass a fake clock and
  `random = () => 0`, so backoff is exact and no real time passes.

## Redaction & secret-safe logging

- **Primary defense — allowlist.** The seam's only log emitter accepts a fixed
  shape: `{ provider, model, code?, attempt, durationMs, usage?, providerRequestId? }`.
  Nothing else is logged. Request bodies, messages, and config are never passed in.
- **Defense in depth — masking.** `redact(text)` masks `sk-(ant-)?…`, `Bearer …`,
  and the resolved key's exact value. Applied to any `cause` before it is logged.
- `Secret` wrapper: `toString()`/`toJSON()`/`util.inspect` ⇒ `"[redacted]"`;
  value reachable only via `.use((v) => …)` for the single call. Never serialized.

## Error mapping table (Anthropic adapter)

| Source condition | Code | Retryable |
| --- | --- | --- |
| HTTP 401 / 403 | `PROVIDER_AUTH` | no |
| HTTP 429 rate-limit (Retry-After present) | `PROVIDER_TRANSIENT` | yes |
| 429 / 400 indicating credit/quota/billing exhausted | `PROVIDER_QUOTA` | no |
| HTTP 500 / 502 / 503 / 529 (overloaded) | `PROVIDER_TRANSIENT` | yes |
| Network reset / ECONNRESET / socket hang-up | `PROVIDER_TRANSIENT` | yes |
| Abort — internal timeout fired | `PROVIDER_TIMEOUT` | yes |
| Abort — caller signal | `PROVIDER_CANCELLED` | no |
| HTTP 400 unsupported feature (e.g. tool/schema rejected) | `PROVIDER_UNSUPPORTED_CAPABILITY` | no |
| Response fails caller Zod schema / unparseable JSON | `MODEL_OUTPUT_INVALID` | no |
| Missing key, bad model, malformed config | `PROVIDER_CONFIG_INVALID` | no |

429-quota-vs-rate and the exact SDK error types are heuristics to **confirm
against current Anthropic docs (claude-api skill / context7) before C9**.

## Fake provider

```ts
type FakeOutcome =
  | { kind: "ok"; data?: unknown; text?: string; usage?: Partial<NormalizedUsage>;
      finishReason?: FinishReason }
  | { kind: "error"; code: ProviderErrorCode }
  | { kind: "hang" };   // never resolves until aborted — drives timeout/cancel tests

createFakeProvider(script: FakeOutcome[], opts?: { capabilities?; recordCalls?: true })
// consumes outcomes in call order; records requests for assertions;
// validates `ok.data` against req.schema so the fake honors the same contract.
```
Helpers: `fakeOk(...)`, `fakeError(code)`, `fakeHang()`. No net, env, or SDK.

## Test matrix

| Requirement / exit criterion | Test file | What it proves |
| --- | --- | --- |
| Config validation; raw key rejected | `config.test.ts` | schema rejects `apiKey`; accepts `keySource:env`; `.strict()` |
| Precedence invocation > env | `resolve-config.test.ts` | invocation overrides env; env fallback; missing key ⇒ `PROVIDER_CONFIG_INVALID` |
| No raw key persistence | `secret.test.ts` | `JSON.stringify`/`toString`/`inspect` of config+Secret never reveal value |
| Redaction proves keys can't leak | `redaction.test.ts` | planted `sk-ant-…`/Bearer/key value masked; allowlist drops unknown fields |
| Bounded retry within budget | `retry.test.ts` | transient retries up to N then throws; non-retryable throws on attempt 1; backoff exact with fake clock/jitter; `Retry-After` honored |
| Timeout deterministic | `resilience.test.ts` | hang + fake timer ⇒ `PROVIDER_TIMEOUT`, retried within budget |
| Cancellation deterministic | `resilience.test.ts` | pre-aborted + mid-flight caller signal ⇒ `PROVIDER_CANCELLED`, not retried, aborts backoff |
| Structured output validated; no partial success | `structured-output.test.ts` | valid ⇒ typed `data`; schema-mismatch + non-JSON ⇒ `MODEL_OUTPUT_INVALID`, no `data` |
| Usage normalized + non-secret | `structured-output.test.ts` / fake | totals computed; no secret fields |
| Error mapping table | `anthropic-errors.test.ts` | each row maps to the right code + retryable, pure function over synthetic errors |
| Fake == real contract | `fake-provider.test.ts` | fake satisfies `ModelProvider`; ok/error/hang behaviors |
| Factory DI + lazy adapter | `factory.test.ts` | `fake` path needs no dynamic import; bad config ⇒ `PROVIDER_CONFIG_INVALID`; capability gating ⇒ `PROVIDER_UNSUPPORTED_CAPABILITY` |
| CI uses fake only / live opt-in | `live.test.ts` | auto-skipped without `RUN_LIVE_PROVIDER`+key; when present, real call returns normalized usage + validated data |

TDD per module: write the `.test.ts` (red) → implement → green → `pnpm check`
(biome) + `pnpm check-types` + `pnpm test`.

## Commit sequence (gitmoji-conventional, no AI attribution)

1. `:sparkles: feat(providers): provider-neutral contract and typed error taxonomy`
2. `:sparkles: feat(providers): provider config schema and env secret resolution`
3. `:lock: feat(providers): secret-safe redaction and allowlist logging`
4. `:sparkles: feat(providers): bounded retry over injected clock and jitter`
5. `:sparkles: feat(providers): timeout and cancellation resilience wrapper`
6. `:sparkles: feat(providers): structured-output validation via Zod/JSON Schema`
7. `:test_tube: feat(providers): deterministic fake provider with scripted outcomes`
8. `:sparkles: feat(providers): provider factory with lazy adapter loading`
9. `:sparkles: feat(providers): Anthropic adapter behind the seam` (+ catalog/dep, error-mapping tests, auto-skipped live test)
10. `:memo: docs(providers): BYOK setup, ADR-0010, CONTEXT and checkpoint updates`

Each commit is independently green (build/typecheck/lint/test). Only C9 adds the
SDK dependency; C1–C8 + CI run on the fake alone.

## Docs to apply (drafted; landed in C10)

**ADR-0010 — `docs/adr/0010-byok-provider-seam.md`** (status: accepted): adopt a
provider-neutral seam inside `qa-engine`; Anthropic first; structured-output
ladder; eight typed errors thrown (not returned); keys via env reference only,
never persisted. Consequences: engine depends on the interface, not adapters;
adding a provider is an adapter + capability declaration; semantic repair stays
in the engine, not the seam. Update `docs/adr/README.md` index (insert item 10).

**CONTEXT.md** glossary additions/sharpening (Terms): sharpen *Provider Adapter*;
add *Provider Capability*, *Usage Metadata* (normalized, non-secret token counts),
*Secret Reference* (named env var resolved at call time; never stored),
*Structured Generation*. No implementation detail — glossary only.

**`docs/byok-setup.md`** (new): how to set `ANTHROPIC_API_KEY`, select a model,
the precedence order, and a failure-mode table mapping each error code to a user
action (auth → check key; quota → billing; transient/timeout → retry/raise
timeout; cancelled → expected; model-output-invalid → engine repair later;
unsupported-capability → pick a capable model; config-invalid → fix config).

**README.md**: short BYOK section + env var + pointer to `docs/byok-setup.md`.

**`docs/v1-checkpoint.md`**: workstream #5 status pending → done; one line
recording the contract and that CI runs on the fake.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Vendor SDK transitive deps bloat the common import path / evals | `index.ts` never exports adapters; factory dynamic-imports; only C9 adds one SDK |
| 429 quota-vs-rate-limit ambiguity mis-classifies retryability | Heuristic on error body/type, default transient with capped retries; verify SDK error types before C9 |
| `AbortSignal.any` / `AbortSignal.timeout` Node availability | Require Node ≥ 20.3; confirm `.nvmrc`; fall back to manual composition if needed |
| Zod→JSON Schema fidelity for strict provider schemas | Restrict caller schemas to JSON-Schema-expressible subset; Zod remains the validation source of truth |
| Structured-output API drift vs assumptions | Verify Anthropic structured-output/tool API via claude-api/context7 before C9; capability flag isolates the choice |
| Redaction misses a secret shape | Allowlist logging as primary defense (unknown fields never emitted); masking is secondary; planted-secret tests |
| Seam scope creep into engine repair | `MODEL_OUTPUT_INVALID` is non-retryable and surfaced; repair explicitly deferred to workstream #6/#7 |

## Exit-criteria mapping

- Fake & real satisfy same contract → both implement `ModelProvider`; `fake-provider.test.ts` + `live.test.ts`.
- CI uses fake only → C1–C8 SDK-free; live test auto-skipped without creds.
- Missing/invalid key ⇒ typed safe error → `resolve-config.test.ts` (`PROVIDER_CONFIG_INVALID`).
- Transient errors retry only within budget → `retry.test.ts`.
- Timeout/cancel deterministic → `resilience.test.ts` with injected timer/signal.
- Invalid structured output typed, no partial success → `structured-output.test.ts`.
- Usage normalized and non-secret → result type + fake/live assertions.
- Redaction proves keys cannot leak → `secret.test.ts` + `redaction.test.ts`.
- Full lint/typecheck/build/test pass → each commit green; `pnpm check:ci check-types:ci build:ci test:ci`.
```
