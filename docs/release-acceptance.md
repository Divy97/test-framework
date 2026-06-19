# Release Acceptance

The manual release check for V1. It takes a fresh checkout to a working MCP server,
walks the first-contact error flows, and re-confirms each already-done
definition-of-done item against the concrete test or live path that proves it. This
is a release checklist, not an automated suite: the automated proofs it names are
the gate; this document is the human walk-through that ties them to the
[V1 definition of done](v1-mvp.md#definition-of-done).

## 1. Install and configure (DoD #7 — installation/configuration)

A fresh checkout to a server that answers `tools/list` with the three tools,
keyless:

```sh
pnpm install
pnpm --filter mcp build
```

Register the built server with a local MCP client, pointing at your checkout and
your BYOK provider (the key is referenced by name, never inlined):

```json
{
	"mcpServers": {
		"test-framework": {
			"command": "node",
			"args": ["/absolute/path/to/test-framework/apps/mcp/dist/index.js"],
			"env": {
				"TEST_FRAMEWORK_PROVIDER": "anthropic",
				"TEST_FRAMEWORK_MODEL": "claude-haiku-4-5",
				"TEST_FRAMEWORK_KEY_ENV": "ANTHROPIC_API_KEY",
				"ANTHROPIC_API_KEY": "sk-ant-...",
				"TEST_FRAMEWORK_ROOT": "/absolute/path/to/your/project"
			}
		}
	}
}
```

Expected observations:

- The server starts and completes the MCP handshake.
- `tools/list` returns exactly `create_test_plan`, `refine_test_plan`, and
  `get_test_plan`, each with a JSON schema.
- The handshake, `tools/list`, `get_test_plan`, and input validation all work
  **without a key** — the provider is constructed lazily on the first
  `create_test_plan` / `refine_test_plan` call.

Automated proof (no key, runs in CI):

- `apps/mcp/src/server.test.ts` — `"built stdio server completes the MCP handshake
  and lists the three tools"` exercises the real built `dist/index.js` over stdio.
- `apps/mcp/src/server.test.ts` — `"server lists exactly the three engine tools
  with JSON schemas"`.

Run it: `pnpm --filter mcp build && pnpm --filter mcp test`.

## 2. Error-flow matrix (DoD #7 — errors)

Every first-contact failure maps to a typed `{ code, message, retryable }` envelope
(`apps/mcp/src/result.ts`, `ToolError`). No message leaks a path, SDK detail, env
value, or key — the README error policy and `apps/mcp/src/errors.test.ts` enforce
this. Codes whose mapping curates the message (provider/IO classes) never echo the
raw engine message; `INVALID_INPUT` passes through the engine-authored (already
safe) text.

| First-contact failure | Code | Retryable | Host action | Proof |
| --- | --- | --- | --- | --- |
| Empty / invalid tool input (e.g. no sources) | `INVALID_INPUT` | no | Fix the arguments and re-call | `server.test.ts`: "invalid create_test_plan input is rejected before the engine runs"; `errors.test.ts`: "INVALID_INPUT surfaces the engine-authored (already safe) message verbatim" |
| No / invalid provider config, missing key env var | `PROVIDER_CONFIG_INVALID` | no | Fix BYOK config / set the key env var | `errors.test.ts`: "every EngineErrorCode maps to a secret-free tool error with the documented code" + "curated provider/IO messages never leak paths, keys, or SDK detail" |
| Provider rejects the key | `PROVIDER_AUTH` | no | Replace the key | `errors.test.ts` (curated, secret-free) |
| Provider quota / rate limit | `PROVIDER_QUOTA` | yes | Back off and retry | `errors.test.ts` (curated, secret-free) |
| Transient provider / network error | `PROVIDER_TRANSIENT` | yes | Retry | `errors.test.ts` (curated, secret-free) |
| Per-call timeout | `PROVIDER_TIMEOUT` | yes | Retry, or raise the budget | `errors.test.ts` (curated, secret-free) |
| Client cancels the call | `PROVIDER_CANCELLED` | no | None; the in-flight model call is aborted | `server.test.ts`: "create_test_plan aborts the in-flight model call when the client cancels" |
| Unknown `planId` (`get`/`refine`) | `ARTIFACT_NOT_FOUND` | no | Re-create or correct the id | engine `engine.test.ts`: "refinePlan throws ARTIFACT_NOT_FOUND for an unknown plan" |
| Stale `expectedVersion` on refine | `ARTIFACT_CONFLICT` | no | Reload, re-apply feedback | `errors.test.ts`: "a stale refine_test_plan surfaces the ARTIFACT_CONFLICT code" |
| Repo path escaping the root | `REPO_ACCESS_DENIED` | no | Use a path inside the root | `server.test.ts`: "create_test_plan rejects a repo path escaping the root before any engine call" |
| Unexpected (non-engine) error | `INTERNAL` | no | None; message is `"Unexpected server error."` | `errors.test.ts`: "a non-EngineError maps to INTERNAL with no leaked message" |

The two keyless first-contact cases are reproducible over the built binary today:

- `INVALID_INPUT`: `server.test.ts` — `"built stdio server answers a no-provider
  INVALID_INPUT deterministically"` drives the real `dist/index.js` with no key and
  asserts the typed envelope.
- `PROVIDER_CONFIG_INVALID` / missing key: surfaced on the first generative call when
  config is absent or malformed (`errors.test.ts` covers the mapping); the secret-free
  guarantee is asserted for every code by `errors.test.ts`.

## 3. DoD #1–#5 verification table (re-confirmation)

Each already-done item, with the concrete test(s) / live path that proves it.

| DoD item | Proof |
| --- | --- |
| #1 Configure a supported BYOK provider locally | `packages/qa-engine/src/providers/config.ts` (`keySource: { kind: "env", var }`, no `apiKey` field); `providers/adapters/live.test.ts` (gated) constructs `anthropic` and `openrouter` providers from config and returns normalized usage + validated structured data. Docs: [docs/byok-setup.md](byok-setup.md). |
| #2 One MCP operation creates a persisted plan from real spec/repo context | `apps/mcp/src/server.test.ts`: "create_test_plan returns the engine result projected to the tool schema"; engine `engine.test.ts`: "createPlan produces a valid persisted test-graph/v1 from a brief" (writes `plan.json`, `plan.md`, `generation.json`); persistence in `persist.test.ts`: "persistPlan writes canonical artifacts and read-back validates". Live: `server.test.ts` (gated) "live create_test_plan over a real provider persists a valid plan". |
| #3 Internal semantic review and deterministic validation | engine `engine.test.ts`: "createPlan repairs an invalid draft within budget" and "createPlan throws PLAN_INVARIANT_FAILED and writes nothing when repair budget is spent" (bounded repair + deterministic validation); `validateTestGraph` is the deterministic validator reused across the engine, the eval harness, and the recording tool. |
| #4 Output is traceable, editable, execution-ready, and safe to commit | engine `decompose.test.ts`: "decompose then assemble at the same version reproduces the graph" and "decompose preserves provenance kind and evidence linkage" (traceability/provenance); `engine.test.ts`: "createPlan is byte-stable under a fixed clock and scripted fake" (safe-to-commit determinism); persisted artifacts validate on read-back (`persist.test.ts`). Execution-readiness is scored by the eval harness (`executionReadiness` dimension). |
| #5 Refinement updates a plan without losing stable identities or provenance | engine `engine.test.ts`: "refinePlan preserves planId/projectId/createdAt and advances updatedAt", "refinePlan produces a v2 revision that passes both validators", "two concurrent refines: exactly one wins, the loser gets ARTIFACT_CONFLICT, plan stays coherent", and "a refine race leaves no .lock behind"; `decompose.test.ts`: "create-path assemble hashes id-shaped keys; refine preserves them". |

Run them: `pnpm test` (CI, keyless). The gated live paths run only with
`RUN_LIVE_PROVIDER` + a key and are `skip`-ped otherwise.

## 4. Gated live MCP end-to-end

The full user journey over the built binary with a real model is proven by the
gated test `apps/mcp/src/server.test.ts` — `"live create_test_plan over a real
provider persists a valid plan"` (`skip: !RUN_LIVE_PROVIDER || !ANTHROPIC_API_KEY`).
Run it once during release acceptance:

```sh
RUN_LIVE_PROVIDER=1 ANTHROPIC_API_KEY=sk-ant-... pnpm --filter mcp test
```

Expected: a real `create_test_plan` call persists a plan whose graph validates. CI
never has a key, so this test is always skipped on the CI path.
