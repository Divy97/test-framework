# V1 MVP: Developer QA Testcase Agent

Date: 2026-06-08

## Position

Developer-only local product, mostly used through MCP.

The product is not a QA management platform in V1. It is a local QA reasoning agent that turns feature context into high-quality, shareable test cases for humans and coding agents.

Primary job: reduce QA time after agent-built features by catching obvious missed behavior before or after implementation.

## Core Loop

1. Developer or IDE agent finishes a feature.
2. Developer asks MCP: generate QA cases for this feature.
3. Product reads provided PRD/spec/free-form doc.
4. Product scans project structure and relevant implementation.
5. Product normalizes requirements and acceptance criteria.
6. Product generates comprehensive editable test cases.
7. Developer shares cases with team or gives them back to coding agent.
8. Coding agent fixes misses or implements against generated cases.

Execution, Playwright generation, cloud test runs, reports, and auto-patching are later versions.

## Long-Term Product Capabilities

1. Understand product requirements and goals.
2. Scan project structure, features, and implementation.
3. Create normalized PRD.
4. Generate comprehensive test cases from PRD and code.
5. Create executable Playwright scripts.
6. Run tests in secure cloud environments.
7. Deliver detailed reports with actionable insights.
8. Let IDE use analysis to patch issues automatically.

## V1 Scope

### Included

- Create project/session from PRD, spec, free-form notes, target URL, and API docs.
- Scan local repo structure and relevant files.
- Extract feature map.
- Extract acceptance criteria.
- Normalize unclear feature docs into a clean PRD.
- Generate editable test cases.
- Export/share test cases as Markdown and JSON.
- Optimize output for both QA teams and coding agents.

### Excluded

- No Playwright generation.
- No test execution.
- No cloud environment.
- No bug report artifacts.
- No auto-patching.
- No hosted dashboard required.
- No model hosting.

## BYOK Model

Users provide their own model keys.

We manage:

- Local MCP tools.
- Repo scanning.
- Context packaging.
- Prompt/task orchestration.
- Testcase schema.
- Optional later cloud browser/runtime infra.

We do not manage:

- User model billing.
- Proprietary hosted model stack.
- Model fine-tuning in V1.

Provider config should be local and explicit:

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
- Per-project model selection.
- No key upload unless later cloud execution requires it and user explicitly opts in.

## V1 Inputs

- Free-form feature request.
- PRD/spec/markdown/document text.
- Target URL, optional.
- API docs/OpenAPI/Postman/free-form endpoint notes, optional.
- Branch/diff/repo path.
- Relevant files selected by IDE/MCP.
- Existing test files, optional.
- User hints: roles, flows, areas to ignore, risk level.

## V1 Outputs

### Normalized PRD

Structure:

- Feature summary.
- User roles.
- Goals.
- In-scope behavior.
- Out-of-scope behavior.
- Business rules.
- UI states.
- Data rules.
- API/contracts.
- Auth/permission rules.
- Edge cases.
- Open questions.

### Feature Map

Structure:

- Feature.
- Sub-feature.
- User flow.
- Screens/routes.
- Components/files.
- APIs/data stores.
- Dependencies.
- Risk level.

### Acceptance Criteria

Each criterion should be:

- Specific.
- Testable.
- Mapped to source requirement or code evidence.
- Labeled as explicit, inferred, or assumption.

### Test Cases

Use the Asana reference pattern:

- Test ID.
- Title.
- Type: positive, negative, edge, security, regression, integration.
- Priority.
- Objective.
- Preconditions.
- Test data/accounts.
- Steps.
- Expected results.
- Postconditions.
- Related files/routes/APIs.
- Evidence source: PRD, code, inferred.
- Automation readiness: manual, Playwright-ready, API-ready, blocked.

## Testcase Generation Quality Bar

Generated cases must cover:

- Happy path.
- Required validation.
- Missing/invalid inputs.
- Boundary values.
- Permission/auth states.
- State transitions.
- Refresh/session timeout behavior.
- Duplicate submits/idempotency.
- Existing data vs new data.
- Backend/UI consistency.
- Error messages.
- Empty/loading/error UI states.
- Security leakage: unauthorized access, hidden fields, API response leakage.
- Integration state variations.
- Post-action navigation.
- Rollback/partial failure.

Asana reference pattern observed:

- Parent groups by domain flow.
- Subtasks split admin flow, user claiming flow, trial/billing flow.
- Individual cases use preconditions, steps, expected results.
- Strong edge cases include expired trial, zero credits, duplicate claim code, unauthorized reveal, stale/deleted records.
- Test accounts are modeled as reusable states, not created ad hoc in each case.

## MCP Tools

V1 MCP should expose:

- `analyze_feature`: input docs + repo context, output normalized PRD.
- `map_feature`: output feature map and source links.
- `generate_test_cases`: output Markdown/JSON cases.
- `review_test_cases`: find gaps, duplicates, weak assertions.
- `export_test_cases`: save/share generated cases.

Later:

- `generate_playwright_tests`.
- `run_tests_cloud`.
- `analyze_failures`.
- `suggest_patch`.

## Local Repo Scan

Scan should collect:

- Framework and package manager.
- Routes/pages.
- Components.
- API handlers.
- DB/schema/models.
- Existing tests.
- Auth/middleware.
- Validation schemas.
- Feature flags.
- External integrations.

Do not scan secrets, build output, node_modules, or large generated files.

## V1 Data Files

Suggested local artifacts:

- `.test-framework/project.json`
- `.test-framework/normalized-prd.md`
- `.test-framework/feature-map.json`
- `.test-framework/test-cases.md`
- `.test-framework/test-cases.json`

## MVP Success Criteria

Given a feature spec and local repo, V1 should produce testcase output that:

- QA can use directly.
- Agent can implement against.
- Covers obvious misses beyond the user's written PRD.
- Links cases back to source docs/code.
- Separates explicit requirements from inferred assumptions.
- Produces fewer duplicate/low-value cases than raw LLM output.

## Product Principle

V1 should be boring and useful:

- No execution.
- No dashboard first.
- No platform complexity.
- Strong local MCP workflow.
- Strong testcase schema.
- Strong repo-aware QA reasoning.

