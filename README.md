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

## Notes

- V1 scope is in [docs/v1-mvp.md](/Users/divy/Developer/personal/test-framework/docs/v1-mvp.md)
- product baseline is in [docs/product-baseline.md](/Users/divy/Developer/personal/test-framework/docs/product-baseline.md)
