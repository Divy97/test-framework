# test-framework

Local-first verification intelligence product. Current code is foundation work;
the accepted V1 is a BYOK verification planning engine.

Current focus:
- `apps/mcp` is the first adapter
- the QA engine will own model reasoning, test graph, validation, and artifacts
- V1 produces execution-ready plans; execution starts in V2

## Workspace

The workspace is scoped to the V1 surface. Inactive cloud/UI scaffolds
(`apps/web`, `apps/api`, `packages/{api,db,ui}`) were removed; they will return
with V3 managed execution. Git history preserves them.

```text
apps/
  mcp/   local MCP entrypoint for V1 (create/refine/get tools over the QA engine)

packages/
  config/     shared TypeScript config
  evals/      comparative eval harness, calibrated corpus, and baseline
  qa-engine/  QA engine: schemas, test graph, validation, persistence, and BYOK provider seam
  repo-scan   repo scan contracts
```

## Commands

```bash
pnpm install
pnpm check-types
pnpm check
pnpm dev:mcp
pnpm eval          # score the committed corpus and compare to the baseline
pnpm eval:update   # re-record the accepted baseline (review the diff)
```

## Evaluation

`packages/evals` is the comparative eval harness. `pnpm eval` scores every
committed candidate (`raw-model`, `host-only`, `qa-engine`) over a small
calibrated corpus against a hand-authored ground truth, using deterministic
reference-based scoring — no live model calls. It emits a byte-stable
`results.json` plus a Markdown report and fails on regression against the accepted
baseline. See [ADR-0009](docs/adr/0009-reference-based-deterministic-eval.md) and
the [plan](docs/superpowers/plans/2026-06-15-eval-harness-and-baseline.md).

## BYOK Providers

The QA Engine reaches a user-selected model through a provider-neutral seam in
`packages/qa-engine/src/providers/`. You bring your own key by reference — set the
env var named in `keySource` (e.g. `ANTHROPIC_API_KEY`); the key is never stored in
config, logs, or artifacts. The seam owns retry, timeout, cancellation, and
structured-output validation; adapters are loaded by dynamic import so the vendor
SDK stays off the common path. Two providers ship: `anthropic` (`@anthropic-ai/sdk`)
and `openrouter` (OpenAI-compatible, via the `openai` SDK). A deterministic fake
implements the same contract and CI runs on it alone — it is a DI-only test seam,
never a configurable provider value. See
[docs/byok-setup.md](docs/byok-setup.md) and
[ADR-0010](docs/adr/0010-byok-provider-seam.md).

## MCP Adapter

`apps/mcp` is a local stdio MCP server that exposes the QA engine through three
coarse product operations. It is a thin protocol adapter (ADR-0003): it
negotiates MCP, validates transport inputs, resolves the project root, reports
progress, maps domain failures to typed errors, and constructs the provider from
local BYOK config — all QA reasoning stays in the engine.

Tools:

- `create_test_plan` — generate a validated, persisted test plan from a product
  brief (and optional repository context). Calls your configured model.
- `refine_test_plan` — revise an existing plan from scoped feedback into a new
  versioned revision (optimistic `expectedVersion` conflict check). Calls your model.
- `get_test_plan` — read a plan's metadata, a bounded summary, and its artifact
  paths. Read-only; writes nothing and calls no model.

Build the server:

```bash
pnpm install
pnpm --filter mcp build
```

Register it with a local MCP client, replacing the path with your checked-out
repo path and setting your BYOK provider in the environment:

```json
{
	"mcpServers": {
		"test-framework": {
			"command": "node",
			"args": [
				"/absolute/path/to/test-framework/apps/mcp/dist/index.js"
			],
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

BYOK config:

- `TEST_FRAMEWORK_PROVIDER` (`anthropic` | `openrouter`), `TEST_FRAMEWORK_MODEL`,
  and `TEST_FRAMEWORK_KEY_ENV` select the provider and name the env var that holds
  your key. The key is read by reference at call time and is never stored in
  config, logs, or artifacts.
- The provider is constructed lazily on the first `create_test_plan` /
  `refine_test_plan` call, so the server starts and answers the handshake,
  `tools/list`, `get_test_plan`, and input validation without a key.

Project root and writes:

- The workspace root is resolved per call from MCP roots (the host's project),
  falling back to `TEST_FRAMEWORK_ROOT`, then the process working directory. Plans
  are persisted under that root; an optional `repo.path` is confined inside it.

Notes:

- `create_test_plan` / `refine_test_plan` call your model with your key; CI never
  has a key and runs entirely on a deterministic in-process fake injected over an
  in-memory transport.
- Invalid tool input is rejected before the engine runs; the call returns an
  `isError` result. Every engine failure maps to a typed `{ code, message,
  retryable }` error that never leaks paths, SDK detail, env values, or key material.
- Long calls emit coarse progress only when the client supplies a `progressToken`,
  and abort the in-flight model call when the client cancels.

### Repository context (optional)

When `create_test_plan` is given a `repo.path`, the adapter runs a deterministic,
secret-safe repository scan and projects it into engine evidence signals. The
scan reads the repository at `repo.path` and surfaces a summary:

- Detects framework(s) and package manager, and classifies routes/pages, components, API handlers, DB schemas/models, existing tests, auth/middleware, validation schemas, feature flags, and external integrations. Every item carries a repo-relative path and a reason.
- Detection is layout-agnostic: conventional directory names (`app/`, `routes/`, `components/`, …) are signals, not requirements. Content and package signals — exported HTTP verbs, ORM declarations, JSX, auth-library imports, imported test runners — classify evidence from arbitrary nested directories.
- Symlinks are never followed (for files or directories): symlink entries are skipped, files open with `O_NOFOLLOW`, and each directory's canonical path is re-confined under the root before it is read. This makes a scan safe against ordinary symlinks and loops. Note a residual limitation: a directory swapped for an external symlink in the narrow window between that revalidation and the read could still be followed (a parent-component TOCTOU), because Node exposes no fd-relative `readdir`/directory `O_NOFOLLOW`. The window is narrowed, not eliminated.
- `.env*` files, private keys, credentials, dependency directories (`node_modules`, etc.), build output (`dist`, `.next`, …), generated files, binary/media files, and lockfile contents are never read. Lockfiles are used by filename only, for package-manager detection. Hard exclusions cannot be re-included by `.gitignore` or by any option.
- `.gitignore` (including nested files) is honored; `additionalIgnorePatterns` can only add exclusions.
- Traversal is bounded by depth, entry, file, per-file byte, total-read-byte, and per-category evidence caps. When a soft limit is reached the scan returns a partial summary with `truncated: true`, a `stopReason`, and `warnings`.

Scan defaults and hard caps (override per call via `scanOptions`, never above the cap):

| Option | Default | Hard cap |
| --- | --- | --- |
| `maxDepth` | 20 | 50 |
| `maxEntries` | 50,000 | 200,000 |
| `maxFiles` | 10,000 | 50,000 |
| `maxFileBytes` | 262,144 | 1,048,576 |
| `maxTotalReadBytes` | 8,388,608 | 33,554,432 |
| `maxEvidencePerCategory` | 100 | 500 |
| `honorGitignore` | `true` | — |
| `additionalIgnorePatterns` | `[]` | 100 patterns |

The scan returns paths and reasons only — no file contents or excerpts. The deterministic registry covers the frameworks/libraries listed above; it is intentionally not exhaustive.

## Notes

- V1 scope is in [docs/v1-mvp.md](/Users/divy/Developer/personal/test-framework/docs/v1-mvp.md)
- V1 progress and next milestones are in [docs/v1-checkpoint.md](/Users/divy/Developer/personal/test-framework/docs/v1-checkpoint.md)
- accepted architecture is in [docs/superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md](/Users/divy/Developer/personal/test-framework/docs/superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md)
- durable decisions and rejected paths are in [docs/adr](/Users/divy/Developer/personal/test-framework/docs/adr)
- product baseline is in [docs/product-baseline.md](/Users/divy/Developer/personal/test-framework/docs/product-baseline.md)
