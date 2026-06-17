# BYOK Provider Setup

The QA Engine calls a model you bring yourself, through one provider-neutral seam
(`packages/qa-engine/src/providers/`). You supply a key by **reference** — the
seam never stores the key, only the name of the environment variable that holds
it.

## Configure a provider

```ts
import { createProvider } from "@test-framework/qa-engine";

const provider = await createProvider({
  provider: "anthropic",
  model: "claude-opus-4-8",
  keySource: { kind: "env", var: "ANTHROPIC_API_KEY" },
  // optional:
  // baseUrl: "https://api.anthropic.com",
  // defaults: { maxOutputTokens: 4096, timeoutMs: 60000 },
});
```

There is **no `apiKey` field** — putting a raw key in the config is a schema
rejection. Set the key in the environment instead:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

### Providers

| `provider` | SDK | Key env (example) | Models |
|---|---|---|---|
| `anthropic` | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-opus-4-8`, `claude-haiku-4-5`, … |
| `openrouter` | `openai` (OpenAI-compatible) | `OPENROUTER_API_KEY` | namespaced, e.g. `anthropic/claude-opus-4-8`, `openai/gpt-4o` |

OpenRouter is OpenAI-compatible; the adapter drives it through the `openai` SDK
pointed at `https://openrouter.ai/api/v1` (override with `baseUrl` if needed):

```ts
const provider = await createProvider({
  provider: "openrouter",
  model: "anthropic/claude-opus-4-8",
  keySource: { kind: "env", var: "OPENROUTER_API_KEY" },
});
```

Both adapters use a forced "emit" tool for structured output and are loaded by
dynamic `import()` only, so neither vendor SDK sits on the common import path.

## Precedence

Configuration values resolve `invocation > project-config > env`. This checkpoint
implements **invocation overrides** and the **env-resolved key**; the
project-config file source lands with the Artifact Workspace. Pass per-call
overrides through `createProvider(config, { invocation: { model, maxOutputTokens, timeoutMs, temperature } })`.

## Generating

```ts
import { z } from "zod";

const schema = z.object({ verdict: z.enum(["pass", "fail"]), reason: z.string() });

const result = await provider.generate(
  { messages: [{ role: "user", content: "..." }], maxOutputTokens: 1024, schema },
  { timeoutMs: 60_000, signal: abortController.signal },
);
result.data; // typed + validated against `schema`; never partial
result.usage; // normalized token counts (no secrets, no cost)
```

Omit `schema` for free-text generation (`result.text`).

## Error codes → what to do

Every failure throws a `ProviderError` with a `code`:

| Code | What it means | Action |
|---|---|---|
| `PROVIDER_AUTH` | Bad or missing key (401/403) | Check the key in your env var |
| `PROVIDER_QUOTA` | Credit/billing/quota exhausted | Top up billing |
| `PROVIDER_TRANSIENT` | Rate limit or 5xx/overload | Retried automatically; raise limits if persistent |
| `PROVIDER_TIMEOUT` | Attempt exceeded `timeoutMs` | Retried automatically; raise `timeoutMs` |
| `PROVIDER_CANCELLED` | Your `AbortSignal` fired | Expected on cancel; not retried |
| `MODEL_OUTPUT_INVALID` | Output failed the Zod schema | Engine repair (later); not retried |
| `PROVIDER_UNSUPPORTED_CAPABILITY` | Model can't do structured output | Pick a capable model |
| `PROVIDER_CONFIG_INVALID` | Malformed config or missing key | Fix the config / set the env var |

Only `PROVIDER_TRANSIENT` and `PROVIDER_TIMEOUT` are retried (bounded backoff with
jitter and a wall-clock cap). Keys never appear in errors, logs, or reports.

## Testing without a key

A deterministic fake implements the same contract — use it in tests. It is **not**
a configurable provider value (a config file can only name a real provider);
construct it directly, or inject it through `createProvider(config, { fakeProvider })`:

```ts
import { createFakeProvider, fakeOk, fakeError } from "@test-framework/qa-engine";

const provider = createFakeProvider([fakeOk({ data: { verdict: "pass" } })]);
// or, to exercise the factory wiring without a key:
// await createProvider(config, { fakeProvider: provider });
```

CI runs on the fake alone. The real Anthropic smoke test is auto-skipped unless
`RUN_LIVE_PROVIDER` and `ANTHROPIC_API_KEY` are both set:

```sh
RUN_LIVE_PROVIDER=1 ANTHROPIC_API_KEY=sk-ant-... pnpm -F @test-framework/qa-engine test
```
