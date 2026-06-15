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
  mcp/   local MCP entrypoint for V1

packages/
  artifacts/  local artifact paths and persistence helpers
  config/     shared TypeScript config
  core/       product schemas and domain types
  evals/      comparative eval harness, calibrated corpus, and baseline
  planner/    planning contracts over core + repo scan
  qa-engine/  canonical test graph: schema, validation, serialization
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

## Current MCP Implementation

`apps/mcp` currently runs a local stdio MCP server exposing the legacy five-stage
stub surface. This documents code that exists today, not the accepted target
surface. The migration target is coarse `create_test_plan`, `refine_test_plan`,
and `get_test_plan` operations backed by the QA engine.

Build the server:

```bash
pnpm install
pnpm --filter mcp build
```

Register it with a local MCP client, replacing the path with your checked-out repo path:

```json
{
	"mcpServers": {
		"test-framework": {
			"command": "node",
			"args": [
				"/absolute/path/to/test-framework/apps/mcp/dist/index.js"
			]
		}
	}
}
```

Current legacy tools:

- `analyze_feature`
- `map_feature`
- `generate_test_cases`
- `review_test_cases`
- `export_test_cases`

Notes:

- `map_feature` performs a real, read-only, bounded local repository scan. Its feature-map and acceptance-criteria reasoning are still deterministic input-derived stubs.
- The other four tools are deterministic, input-derived stubs: no model, network, or filesystem access.
- No model key, network, database, Docker service, API server, or auth is required to start the server or run a scan.
- `export_test_cases` previews artifact paths (`status: "preview"`, `written: false`) and does not write files yet.
- Invalid tool input is rejected before the handler runs; the call returns an `isError` result with a validation message.

### Repository scan (`map_feature`)

`map_feature` reads the repository at `repoPath` and returns a deterministic, secret-safe evidence summary under `repoScan`:

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
