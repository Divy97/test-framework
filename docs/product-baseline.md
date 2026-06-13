# AI Test Automation Product Baseline

Researched: 2026-06-06

## Goal

Build a TestSprite-like product: an AI testing agent/platform that turns product specs, live app behavior, and API docs into reviewable, executable, maintainable tests.

Product direction: developer-only, local-first, mostly MCP-driven. V1 focuses only on normalized PRDs, feature maps, acceptance criteria, and shareable test cases. Later versions can add Playwright generation, cloud runs, reporting, and optional IDE patching.

Long-term baseline target: not just "generate Playwright tests". The product should own the full QA loop:

1. Understand intended behavior from PRD/spec/docs.
2. Discover actual behavior from live UI/API/code.
3. Draft a test plan users can review/edit.
4. Generate runnable tests.
5. Execute tests with artifacts.
6. Classify failures and suggest fixes.
7. Maintain tests via healing/regeneration.
8. Schedule/trigger runs in CI and production monitoring.

## TestSprite Summary

TestSprite positions itself as a no-code autonomous AI testing agent. Its web portal takes a project from app/spec input to generated tests, cloud execution, reports, test lists, schedules, API keys, and GitHub integration. Its docs say the core loop is: upload PRD, configure URL/credentials/API docs, explore/discover app, review plan, generate/run tests, report, refine in natural language, then schedule.

Sources:

- [TestSprite docs index](https://docs.testsprite.com/llms.txt)
- [Web Portal overview](https://docs.testsprite.com/web-portal/getting-started/overview)
- [Test lifecycle](https://docs.testsprite.com/mcp/concepts/test-type-lifecycle)
- [Pricing](https://www.testsprite.com/pricing)

## Product Model

### Inputs

- Project name.
- PRD/product spec, markdown/PDF/plain text.
- UI app URL.
- Test credentials.
- API base URL.
- API docs: OpenAPI, Swagger, Postman, or free-form docs.
- Natural-language focus/skip hints.
- Optional repo/code context through IDE/MCP or GitHub.

### Core Entities

- `Project`: product/app under test.
- `Feature Map`: features/use cases extracted from PRD/spec.
- `Discovery Run`: UI exploration or API endpoint discovery output.
- `Test Plan`: editable test cases before code generation.
- `Generated Test`: runnable Playwright/Python/API test artifact.
- `Run`: one execution of generated tests.
- `Artifact`: screenshots, video, traces, logs, request/response data.
- `Finding`: failed assertion, suspected product bug, flaky test, env issue.
- `Test List`: grouped tests across projects/features.
- `Schedule`: recurring execution config.
- `Integration`: GitHub/CI/API key/MCP.

### Lifecycle

1. `Create Project`: collect name and PRD.
2. `Extract Features`: normalize spec into feature/use-case graph.
3. `Configure Target`: collect URLs, auth, docs, env hints.
4. `Discover Reality`: crawl UI flows or probe API docs/base URL.
5. `Plan`: generate cases from intended + observed behavior.
6. `Review`: user selects, edits, adds, removes cases.
7. `Generate`: produce executable tests.
8. `Execute`: run in isolated cloud/local worker.
9. `Report`: pass/fail, severity, root cause, evidence.
10. `Refine`: natural-language edits or regeneration.
11. `Maintain`: rerun, heal selectors/auth, compare changes.
12. `Operate`: schedules, test lists, CI/PR gates.

## Test Types

### UI Tests

TestSprite covers Playwright-driven frontend flows:

- Navigation, routes, redirects, browser history.
- Forms, validation, dependent fields, persistence.
- Visual states, loading/empty/error states.
- Stateful components: modals, tabs, dropdowns, drag/drop.
- Auth: login/logout, protected routes, role visibility, token refresh.
- UI error handling: toasts, inline errors, graceful degradation.

Important feature: feature exploration walks the live app before plan generation. Plans should be grounded in both PRD intent and observed behavior.

### API Tests

TestSprite covers Python/API-driven backend tests:

- Functional endpoint behavior.
- Integration chains.
- Contract/schema validation.
- Auth/authorization.
- Boundary cases.
- Error handling/resilience.
- Data integrity.
- Security checks.

Important feature: dependency chains. Values produced by one endpoint, like `user_id`, feed later requests. Independent chains run parallel; blocked downstream tests are separated from actual failures. Source: [Dependency Chains](https://docs.testsprite.com/web-portal/core/api/dependency-chains).

### Cleanup

API test runs create real records. TestSprite auto-builds cleanup DELETE chains, children first then parents, and marks possible orphaned resources. This is essential for repeatable scheduled/CI runs. Source: [Auto Cleanup](https://docs.testsprite.com/web-portal/core/api/auto-cleanup).

## Differentiators To Copy Carefully

- Spec-driven: PRD is first-class, not optional text prompt.
- Reality-driven: live app/API discovery before final plan.
- Editable plan: human approves before code generation.
- Evidence-first report: screenshots, videos, traces, API request/response.
- Failure classification: product bug vs test fragility vs environment.
- Natural-language refinement: edit plan/test without writing code.
- Maintenance loop: auto-heal UI drift, auto-auth API token refresh.
- Operation layer: test lists, schedules, PR gate, API keys, IDE/MCP.
- Code export: generated Playwright/Python should be inspectable and portable.

## Competitor Notes

| Product | Position | Strong Ideas | Gap/Concern |
| --- | --- | --- | --- |
| [TestSprite](https://www.testsprite.com/) | Autonomous AI QA for UI/API from PRD + live discovery | Full lifecycle, MCP/IDE, feature map, API dependency chains, cleanup, schedules | Credit cost, trust in AI verdicts, cloud dependency |
| [Momentic](https://momentic.ai/docs) | AI E2E tests for web/iOS/Android | Natural-language tests stored as repo YAML, local/CI runs, auto-heal locators | More test-authoring oriented than PRD-to-QA-platform |
| [mabl](https://www.mabl.com/product) | Enterprise AI-native unified testing | Web/mobile/API/performance, low-code, broad integrations, mature dashboard | Heavy platform, enterprise complexity |
| [QA Wolf](https://www.qawolf.com/automation-ai) | Managed AI + human QA service | Test plans/code + maintenance, high coverage promise, service layer | Less self-serve/product-led; cost likely high |
| [Autify](https://autify.com/products/autify-genesis) | AI test design + agents | Generates features, viewpoints, test cases from specs/source/files | More suite of tools than one focused MVP |
| [testRigor](https://testrigor.com/features/) | Plain-English no-code test automation | Broad device/browser/API/email/SMS/files support, user-perspective tests | Proprietary DSL risk; portability concern |
| [BrowserStack/Percy](https://www.browserstack.com/pricing?cycle=annual&product=percy) | Testing infra + AI-assisted management | Device/browser cloud, visual testing, test case generation from PRDs | Infra-first, less autonomous app understanding |
| [Checkly](https://www.checklyhq.com/) | Playwright monitoring/reliability | Synthetic monitoring, Playwright-first, CI/ops-friendly | Monitoring-first, less spec/test generation depth |

## Pricing Signal

TestSprite uses credits:

- Free: 150 credits/month.
- Starter: $0 first month, then $19/month, 400 credits/month.
- Standard: $69/month, 1600 credits/month.
- Enterprise: custom.

Feature gates include test lists, schedules, model level, custom configs, backend integration chains, auto-healing rerun, file upload limits, IDE/MCP, GitHub/CI, and support.

Source: [TestSprite pricing](https://www.testsprite.com/pricing).

## MVP Baseline

Build in slices. Avoid starting with full cloud autonomy. Current V1 spec lives in [v1-mvp.md](/Users/divy/Developer/personal/test-framework/docs/v1-mvp.md).

### MVP 1: Local/Repo-First Test Planner

- Create project from PRD/spec and target URL/API docs.
- Scan local repo implementation through MCP/IDE context.
- Extract feature map and acceptance criteria.
- Normalize rough docs into a PRD.
- Generate editable test cases JSON/Markdown for QA and coding agents.
- No execution needed yet.

Success: given a PRD + URL/API docs, user gets a high-quality plan with grouped features, cases, assertions, data needs, and risk labels.

### MVP 2: UI Test Generation + Evidence Run

- Generate Playwright tests from approved UI plan.
- Run locally or in a worker.
- Capture screenshot/video/trace.
- Produce report with pass/fail and failure summary.

Success: user can review generated code and artifacts.

### MVP 3: API Discovery + Chains

- Import OpenAPI/Postman/free-form docs.
- Probe endpoints safely.
- Generate endpoint + integration plan.
- Detect producer/consumer variables.
- Run with dependency ordering.

Success: API tests can create entity, use returned ID, verify, cleanup.

### MVP 4: Refinement Loop

- Chat/edit test description.
- Regenerate one test.
- Rerun selected test.
- Preserve run history.

Success: user fixes bad tests without editing Playwright/Python by hand.

### MVP 5: Operations

- Test lists.
- Schedules.
- GitHub Action/PR comments.
- Basic flake/environment/product-bug classification.

Success: generated suite becomes a release gate.

## Suggested Differentiation

The strongest wedge is "reviewable AI QA for builders":

- Local-first MCP workflow for developers.
- BYOK: user supplies model keys; product manages orchestration and later test infra.
- Store all plans/tests in repo.
- Make generated tests normal Playwright/Python, not locked DSL.
- Every AI action has evidence: source spec lines, observed UI/API events, generated assertion reason.
- Bias toward user approval before high-risk actions.
- Make local-first execution possible; cloud optional.
- Treat reports as engineering artifacts, not only dashboard cards.

## Core Architecture Guess

Useful subsystems:

- `ingestion`: PRD/doc parser, OpenAPI/Postman parser, site metadata fetcher.
- `feature-map`: feature/use-case/acceptance extraction.
- `explorer-ui`: browser agent with Playwright, auth/session handling, crawl limits.
- `explorer-api`: endpoint discovery/probing, schema inference.
- `planner`: turns features + observations into test cases.
- `generator`: emits Playwright/Python tests.
- `runner`: runs tests, stores artifacts.
- `analyzer`: failure classification and fix suggestions.
- `state`: projects, plans, runs, artifacts, schedules.
- `integrations`: GitHub, CI, MCP/API keys.

## Hard Problems

- Prevent destructive API tests against production data.
- Auth setup across UI/API/2FA/session expiry.
- Test data seeding and cleanup.
- Distinguishing real bugs from flaky selectors/env failures.
- Avoiding shallow AI assertions like "page loaded".
- Keeping generated tests maintainable and portable.
- Making exploration bounded, explainable, and cheap.
- Handling apps with feature flags, unstable staging data, external sandbox limits.

## Product Principles

- Plan before code.
- Evidence before verdict.
- Human review before broad generation.
- Cleanup by default.
- Repo-portable artifacts.
- Small reruns for fast iteration.
- Schedules only after suite stability.

## Next Decisions

1. Target first user: solo AI app builder, dev team, or QA team?
2. First surface: CLI, web app, or IDE/MCP?
3. First test type: UI only, API only, or both but shallow?
4. Execution: local first or cloud worker first?
5. Artifact policy: generated code committed to repo or stored in platform?
6. Safety model: how do we sandbox writes, credentials, and destructive API calls?
