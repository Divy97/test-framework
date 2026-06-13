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

- Outputs are deterministic, input-derived stubs. No model, repository scan, network, or filesystem access.
- No model key, database, Docker service, API server, or auth is required to start the server.
- `export_test_cases` previews artifact paths (`status: "preview"`, `written: false`) and does not write files yet.
- Invalid tool input is rejected before the handler runs; the call returns an `isError` result with a validation message.

## Notes

- V1 scope is in [docs/v1-mvp.md](/Users/divy/Developer/personal/test-framework/docs/v1-mvp.md)
- product baseline is in [docs/product-baseline.md](/Users/divy/Developer/personal/test-framework/docs/product-baseline.md)
