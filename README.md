# test-framework

Local-first QA testcase agent.

Current focus:
- `apps/mcp` will become the V1 product entry
- `apps/api` stays available for later hosted flows
- `apps/web` is optional review UI groundwork

## Workspace

```text
apps/
  api/   hosted api shell for later product surfaces
  mcp/   local MCP entrypoint for V1
  web/   optional review UI

packages/
  api/        shared tRPC router
  artifacts/  local artifact paths and persistence helpers
  core/       product schemas and domain types
  db/         postgres + drizzle
  env/        runtime env validation
  planner/    planning contracts over core + repo scan
  repo-scan   repo scan contracts
  ui/         shared UI primitives
```

## Commands

```bash
pnpm install
pnpm check-types
pnpm check
pnpm dev:web
pnpm dev:api
pnpm dev:mcp
pnpm db:start
```

## MCP Server

`apps/mcp` runs a local stdio MCP server exposing the V1 planner tools.

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

Tools:

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
- Symlinks are never followed (for files or directories), so a scan cannot escape the root or loop.
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
- product baseline is in [docs/product-baseline.md](/Users/divy/Developer/personal/test-framework/docs/product-baseline.md)
