# Execution-Ready Test Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the versioned, deterministic V1 Test Graph contract that preserves planning identity and provenance and can be consumed by V2 execution without a domain rewrite.

**Architecture:** Add `packages/qa-engine` as canonical graph owner now. Keep `core`, `planner`, and `artifacts` as temporary compatibility packages; do not delete or broadly refactor them in this checkpoint. Model `Project` separately and persist each immutable `Plan` revision as one plan-scoped graph. Validate unknown input into typed deterministic findings, serialize canonical JSON, and derive Markdown from the validated graph.

**Tech Stack:** TypeScript 6, Zod 4, Node `crypto`, Node test runner through `tsx`, pnpm, Turborepo, Biome.

---

## Scope

Included:

- `Project`, `Plan`, `Source`, `Evidence`, `Requirement`, `Feature`, `TestCase`, `Step`, `Assertion`, `DataRequirement`, `OpenQuestion`, `GenerationMetadata`.
- Typed deterministic IDs and explicit graph links.
- Stable `planId`; monotonic immutable `planVersion` revisions.
- Entity provenance: `explicit`, `inferred`, `assumption`.
- Structured UI/API/integration/generic targets and actions.
- Typed assertion matcher union.
- Data production, consumption, setup dependency, and cleanup intent.
- `test-graph/v1` schema version and forward migration registry.
- Deterministic invariant findings.
- Canonical JSON and derived Markdown.
- Valid, invalid, canonical, migration, and Markdown fixtures.
- Compatibility checks proving scanner and current MCP stubs remain unchanged.

Excluded:

- Model/provider integration, prompts, repair, or semantic review.
- Test generation, Playwright, API execution, run bundles, findings from runs, or healing.
- Artifact workspace, filesystem writes, atomic persistence, or optimistic locking implementation.
- New or renamed MCP tools.
- Scanner behavior/schema changes.
- Deleting `packages/core`, `packages/planner`, or `packages/artifacts`.
- Converting legacy stub payloads into canonical plans. They were never durable Test Graph versions.
- Package-wide unrelated refactors.

## Accepted Grill Decisions

All recommendations below accepted by user.

| # | Question | Accepted answer |
| --- | --- | --- |
| 1 | Aggregate boundary? | `Project` separate. `Plan` root owns all plan-scoped graph nodes and references `projectId`. |
| 2 | ID generation? | Typed prefix plus first 20 lowercase hex chars of SHA-256 over `kind`, scope ID, and caller-supplied stable semantic key. IDs never recomputed from editable prose. |
| 3 | Version semantics? | `planId` stable across refinement. `planVersion` starts at `1`, increments by exactly one for each persisted revision. Revision objects immutable. |
| 4 | Editable entities? | Content changes only by constructing next revision. IDs survive when semantic identity survives; replacement entity gets new ID. |
| 5 | Reference deletion? | No cascade in schema library. New revision must remove/repoint links atomically; dangling links are deterministic errors. |
| 6 | Graph direction? | Top-level normalized node arrays. Ownership/link fields point by typed ID. No duplicated bidirectional adjacency arrays. |
| 7 | Dependency cycles? | Setup and producer-to-consumer case graph must be a DAG. Self edges invalid. Cleanup ordering is teardown metadata and cannot reference self. |
| 8 | Data producer rules? | `existing`, `generated`, and `external` data need no case producer. `case-produced` data requires exactly one producer. |
| 9 | Assertion type system? | Closed discriminated matcher union. No arbitrary matcher strings in V1. Matcher-specific expected values enforced by schema. |
| 10 | Provenance coverage? | Requirement, Feature, TestCase, Step, Assertion, DataRequirement, and OpenQuestion all carry one provenance object. |
| 11 | Provenance rules? | Explicit requires supplied evidence. Inferred requires evidence or rationale. Assumption requires rationale and stays visibly labeled. |
| 12 | Source/evidence boundary? | Source identifies input origin. Evidence is a precise claim/excerpt/locator from one source. Semantic entities link evidence IDs. |
| 13 | Plan states? | `draft`, `complete`, `incomplete`. Unknown values rejected. `complete` cannot retain blocking open questions or case blockers. |
| 14 | Canonical ordering? | Object keys lexical. Set-like arrays sort by stable ID/value. Ordered steps sort by `order`; action order is step order. |
| 15 | JSON behavior? | Parse validates; canonical serialization never mutates input; output ends with one newline. JSON -> schema -> JSON is byte-stable after first canonicalization. |
| 16 | Migration guarantees? | Pure adjacent upgrade functions, no downgrade, no skipped versions, validate every hop, preserve IDs/links, reject unknown future versions. |
| 17 | Initial migration? | V1 is first durable graph. Registry ships with current-version identity path and test-only fake chains; no invented production V0 conversion. |
| 18 | Validator API? | `validateTestGraph(input: unknown)` returns sorted typed findings. `parseTestGraph` throws one typed error containing same findings. |
| 19 | Finding order? | Severity, code, entity kind, entity ID, JSON path, message. Never depend on insertion/hash-map order. |
| 20 | Markdown status? | Derived view only. Fixed headings; every entity ID and provenance visible; dependencies, blockers, postconditions, and cleanup explicit. |
| 21 | Package consolidation? | Create `qa-engine` and make it canonical owner now. Defer package deletion and MCP contract replacement to later engine milestone. |
| 22 | ADR? | Add one ADR because aggregate/version/identity/migration rules are durable, costly to reverse, and involve real tradeoffs. |

## Contract Shape

Canonical plan root:

```ts
type TestGraphV1 = {
	schemaVersion: "test-graph/v1";
	projectId: ProjectId;
	planId: PlanId;
	planVersion: number;
	title: string;
	status: "draft" | "complete" | "incomplete";
	createdAt: string;
	updatedAt: string;
	generation: GenerationMetadata;
	sources: Source[];
	evidence: Evidence[];
	requirements: Requirement[];
	features: Feature[];
	testCases: TestCase[];
	steps: Step[];
	assertions: Assertion[];
	dataRequirements: DataRequirement[];
	openQuestions: OpenQuestion[];
};
```

Core link direction:

```text
Evidence.sourceId -> Source.id
Requirement.provenance.evidenceIds -> Evidence.id
Requirement.openQuestionIds -> OpenQuestion.id
Feature.parentFeatureId -> Feature.id
Feature.requirementIds -> Requirement.id
TestCase.requirementIds -> Requirement.id
TestCase.featureIds -> Feature.id
TestCase.dependsOnCaseIds -> TestCase.id
TestCase consumes/produces -> DataRequirement.id
Step.testCaseId -> TestCase.id
Assertion.testCaseId -> TestCase.id
Assertion.stepId -> Step.id (optional)
OpenQuestion.blockedEntityRefs -> typed graph entity ref
Cleanup.afterCaseIds -> TestCase.id
Cleanup.dataRequirementIds -> DataRequirement.id
```

## File Map

Create:

- `packages/qa-engine/package.json`: package metadata and test/typecheck scripts.
- `packages/qa-engine/tsconfig.json`: shared strict TS config.
- `packages/qa-engine/src/index.ts`: public graph API only.
- `packages/qa-engine/src/test-graph/version.ts`: schema version constants and version detection.
- `packages/qa-engine/src/test-graph/ids.ts`: typed ID schemas and deterministic ID factory.
- `packages/qa-engine/src/test-graph/common.ts`: JSON value, provenance, priority, risk, status, references.
- `packages/qa-engine/src/test-graph/targets.ts`: UI/API/integration/generic target schemas.
- `packages/qa-engine/src/test-graph/actions.ts`: structured action union.
- `packages/qa-engine/src/test-graph/assertions.ts`: assertion matcher union.
- `packages/qa-engine/src/test-graph/schema.ts`: Project and full Test Graph entity/aggregate schemas.
- `packages/qa-engine/src/test-graph/findings.ts`: finding codes, severity, sorting, validation error.
- `packages/qa-engine/src/test-graph/validate.ts`: schema and invariant validator.
- `packages/qa-engine/src/test-graph/canonical-json.ts`: schema-aware canonicalization and JSON output.
- `packages/qa-engine/src/test-graph/migrations.ts`: adjacent migration registry and current migration entrypoint.
- `packages/qa-engine/src/test-graph/markdown.ts`: deterministic Markdown renderer.
- `packages/qa-engine/src/test-graph/test-helpers.ts`: fixture loader and valid graph builder for tests only.
- `packages/qa-engine/src/test-graph/ids.test.ts`.
- `packages/qa-engine/src/test-graph/schema.test.ts`.
- `packages/qa-engine/src/test-graph/validate.test.ts`.
- `packages/qa-engine/src/test-graph/canonical-json.test.ts`.
- `packages/qa-engine/src/test-graph/migrations.test.ts`.
- `packages/qa-engine/src/test-graph/markdown.test.ts`.
- `packages/qa-engine/test/fixtures/valid/ui-api-integration.json`.
- `packages/qa-engine/test/fixtures/valid/assumption-blocked.json`.
- `packages/qa-engine/test/fixtures/invalid/dangling-links.json`.
- `packages/qa-engine/test/fixtures/invalid/duplicate-ids.json`.
- `packages/qa-engine/test/fixtures/invalid/dependency-cycle.json`.
- `packages/qa-engine/test/fixtures/invalid/malformed-assertions.json`.
- `packages/qa-engine/test/fixtures/invalid/unsupported-state.json`.
- `packages/qa-engine/test/fixtures/expected/ui-api-integration.canonical.json`.
- `packages/qa-engine/test/fixtures/expected/ui-api-integration.md`.
- `docs/adr/0007-versioned-test-graph-contract.md`.

Modify:

- `docs/adr/README.md`: list ADR 0007.
- `CONTEXT.md`: add concise terms for Plan Revision, Provenance, and Data Requirement only.
- `pnpm-lock.yaml`: register workspace package dependencies.

Explicitly unchanged:

- `packages/repo-scan/src/**` and scanner fixtures.
- `packages/core/src/index.ts`.
- `packages/planner/src/index.ts`.
- `packages/artifacts/src/index.ts`.
- `apps/mcp/src/tools.ts`, handlers, stubs, and tests.

## Task 1: Package Skeleton and Public Boundary

**Files:**

- Create: `packages/qa-engine/package.json`
- Create: `packages/qa-engine/tsconfig.json`
- Create: `packages/qa-engine/src/index.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add package with test and typecheck scripts**

```json
{
	"name": "@test-framework/qa-engine",
	"private": true,
	"type": "module",
	"exports": { ".": { "default": "./src/index.ts" } },
	"dependencies": { "zod": "catalog:" },
	"devDependencies": {
		"@test-framework/config": "workspace:*",
		"@types/node": "^25.9.3",
		"tsx": "^4.19.2",
		"typescript": "catalog:"
	},
	"scripts": {
		"check-types": "tsc --noEmit",
		"test": "tsx --test src/**/*.test.ts"
	}
}
```

- [ ] **Step 2: Add strict package TS config**

```json
{
	"extends": "@test-framework/config/tsconfig.base.json",
	"include": ["src/**/*"]
}
```

- [ ] **Step 3: Add empty public barrel and install**

```ts
export const qaEngineManifest = {
	name: "qa-engine",
	version: "0.1.0",
} as const;
```

Run: `pnpm install`

Expected: lockfile adds `packages/qa-engine`; no external package version drift.

- [ ] **Step 4: Verify foundation**

Run: `pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/qa-engine pnpm-lock.yaml
git commit -m ":construction_worker: build(qa-engine): add package"
```

## Task 2: Version and Deterministic Identity Contract

**Files:**

- Create: `packages/qa-engine/src/test-graph/version.ts`
- Create: `packages/qa-engine/src/test-graph/ids.ts`
- Create: `packages/qa-engine/src/test-graph/ids.test.ts`
- Modify: `packages/qa-engine/src/index.ts`

- [ ] **Step 1: Write failing ID tests**

Cover exact output stability, prefix separation, scope separation, semantic-key normalization refusal, and invalid ID rejection.

```ts
test("creates stable scoped ids", () => {
	assert.equal(
		createStableId("requirement", "plan_a", "password reset"),
		"req_067f66f43a5064b4a7b0",
	);
	assert.equal(
		createStableId("testCase", "plan_a", "password reset"),
		"case_447efda3dcc43b284e11",
	);
});

test("rejects blank or non-normalized identity keys", () => {
	assert.throws(() => createStableId("requirement", "plan_a", ""));
	assert.throws(() => createStableId("requirement", "plan_a", " password reset "));
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @test-framework/qa-engine test`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement versions and ID schemas**

```ts
export const TEST_GRAPH_SCHEMA_VERSION = "test-graph/v1" as const;
export const PROJECT_SCHEMA_VERSION = "project/v1" as const;

export const idPrefixes = {
	project: "prj",
	plan: "plan",
	source: "src",
	evidence: "ev",
	requirement: "req",
	feature: "feat",
	testCase: "case",
	step: "step",
	assertion: "assert",
	dataRequirement: "data",
	openQuestion: "question",
	generation: "gen",
} as const;
```

`createStableId` algorithm:

```ts
const payload = ["test-framework", kind, scopeId, semanticKey].join("\u001f");
const digest = createHash("sha256").update(payload, "utf8").digest("hex");
return `${idPrefixes[kind]}_${digest.slice(0, 20)}`;
```

Rules:

- Reject empty `scopeId`/`semanticKey`.
- Reject values not equal to `.trim().normalize("NFC")`; caller must choose canonical key deliberately.
- Export one Zod regex schema and inferred branded type per ID kind.
- Do not derive IDs from title, statement, array order, timestamp, or plan version.

- [ ] **Step 4: Export and run green tests**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/qa-engine/src
git commit -m ":sparkles: feat(qa-engine): add graph ids"
```

## Task 3: Common, Target, Action, and Assertion Schemas

**Files:**

- Create: `packages/qa-engine/src/test-graph/common.ts`
- Create: `packages/qa-engine/src/test-graph/targets.ts`
- Create: `packages/qa-engine/src/test-graph/actions.ts`
- Create: `packages/qa-engine/src/test-graph/assertions.ts`
- Create: `packages/qa-engine/src/test-graph/schema.test.ts`

- [ ] **Step 1: Write failing leaf-schema tests**

Test:

- JSON values allow null/scalars/arrays/objects and reject `undefined`, functions, `NaN`, and infinity.
- Explicit/inferred/assumption provenance parses structurally.
- UI/API/integration/generic targets require target-specific fields.
- Action union rejects mismatched fields.
- Each assertion matcher accepts only its expected shape.
- `exists`, `notExists`, `visible`, `hidden`, `enabled`, `disabled` reject `expected`.
- Numeric matchers reject string expected values.
- `statusCode` accepts only integers 100-599.
- Regex flags accept only `d`, `g`, `i`, `m`, `s`, `u`, `v`, `y`, without duplicates.

```ts
test("exists assertion forbids expected", () => {
	assert.equal(
		assertionSchema.safeParse({
			...baseAssertion,
			matcher: "exists",
			expected: true,
		}).success,
		false,
	);
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @test-framework/qa-engine test`

Expected: FAIL on missing schemas.

- [ ] **Step 3: Implement shared schemas**

Use `.strict()` for every durable object. Define:

```ts
export const provenanceSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("explicit"), evidenceIds: z.array(evidenceIdSchema), rationale: z.string().min(1).optional() }).strict(),
	z.object({ kind: z.literal("inferred"), evidenceIds: z.array(evidenceIdSchema), rationale: z.string().min(1).optional() }).strict(),
	z.object({ kind: z.literal("assumption"), evidenceIds: z.array(evidenceIdSchema), rationale: z.string().min(1) }).strict(),
]);
```

Target union:

```ts
type Target =
	| { kind: "ui"; route?: string; component?: string; selector?: string }
	| { kind: "api"; method: HttpMethod; path: string }
	| { kind: "integration"; system: string; operation: string }
	| { kind: "generic"; description: string };
```

Require UI target to provide at least one of route/component/selector through `.superRefine()`.

Action union:

```ts
type Action =
	| { kind: "navigate"; route: string }
	| { kind: "interact"; operation: "click" | "fill" | "select" | "upload" | "submit" | "keypress"; selector: string; value?: JsonValue }
	| { kind: "request"; method: HttpMethod; path: string; headers?: Record<string, string>; body?: JsonValue }
	| { kind: "invoke"; system: string; operation: string; input?: JsonValue }
	| { kind: "wait"; condition: string; timeoutMs?: number }
	| { kind: "observe"; subject: string };
```

Assertion common fields:

```ts
{
	id: AssertionId;
	testCaseId: TestCaseId;
	stepId?: StepId;
	provenance: Provenance;
	subject: string;
	observationPoint: Target;
	note?: string;
}
```

Matcher union:

```text
equals, notEquals, contains, notContains -> expected JSON value
greaterThan, greaterThanOrEqual, lessThan, lessThanOrEqual -> expected finite number
matches -> pattern + flags
exists, notExists, visible, hidden, enabled, disabled -> no expected
statusCode -> expected integer 100..599
count -> expected nonnegative integer
conformsToSchema -> schemaRef string
```

- [ ] **Step 4: Run green tests**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/qa-engine/src/test-graph
git commit -m ":sparkles: feat(qa-engine): add graph primitives"
```

## Task 4: Full Project and Plan Graph Schema

**Files:**

- Create: `packages/qa-engine/src/test-graph/schema.ts`
- Create: `packages/qa-engine/src/test-graph/test-helpers.ts`
- Create: `packages/qa-engine/test/fixtures/valid/ui-api-integration.json`
- Create: `packages/qa-engine/test/fixtures/valid/assumption-blocked.json`
- Modify: `packages/qa-engine/src/test-graph/schema.test.ts`
- Modify: `packages/qa-engine/src/index.ts`

- [ ] **Step 1: Write failing aggregate schema tests**

Test both fixtures parse, unknown fields fail, every ID prefix is enforced, `planVersion >= 1`, timestamps are RFC3339 with offset/Z, steps require positive integer `order`, and duplicate checks are not incorrectly performed by leaf schemas.

```ts
test("valid representative graph parses", async () => {
	const input = await loadJsonFixture("valid/ui-api-integration.json");
	const graph = testGraphV1Schema.parse(input);
	assert.equal(graph.schemaVersion, TEST_GRAPH_SCHEMA_VERSION);
	assert.equal(graph.testCases.length, 3);
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @test-framework/qa-engine test`

Expected: FAIL because aggregate schema is missing.

- [ ] **Step 3: Implement Project and entities**

Project:

```ts
{
	schemaVersion: "project/v1";
	projectId: ProjectId;
	name: string;
	createdAt: RFC3339;
	updatedAt: RFC3339;
}
```

Source:

```ts
{
	id: SourceId;
	kind: "feature-request" | "document" | "repository" | "diff" | "user-hint" | "api-spec" | "other";
	title: string;
	locator?: string;
	digest?: string;
	supplied: boolean;
}
```

Evidence:

```ts
{
	id: EvidenceId;
	sourceId: SourceId;
	kind: "statement" | "quote" | "code" | "api-contract" | "diff" | "repository-signal";
	claim: string;
	locator?: { kind: "text"; start: number; end: number } | { kind: "file"; path: string; startLine?: number; endLine?: number } | { kind: "url"; url: string } | { kind: "symbol"; path: string; symbol: string };
	excerpt?: string;
	digest?: string;
}
```

Requirement fields: `id`, `statement`, `kind`, `provenance`, `priority`, `risk`, `openQuestionIds`.

Feature fields: `id`, `name`, `description`, `parentFeatureId?`, `requirementIds`, `targets`, `provenance`, `risk`.

TestCase fields:

```ts
{
	id: TestCaseId;
	title: string;
	objective: string;
	type: "positive" | "negative" | "edge" | "security" | "regression" | "integration";
	priority: Priority;
	risk: Risk;
	riskRationale: string;
	provenance: Provenance;
	requirementIds: RequirementId[];
	featureIds: FeatureId[];
	qualityTags: QualityTag[];
	actor: { role: string; authentication: "anonymous" | "authenticated" | "expired" | "not-applicable"; permissions: string[] };
	target: Target;
	preconditions: Array<{ description: string; requiredState?: JsonValue }>;
	dependsOnCaseIds: TestCaseId[];
	consumesDataRequirementIds: DataRequirementId[];
	producesDataRequirementIds: DataRequirementId[];
	postconditions: Array<{ description: string; expectedState?: JsonValue }>;
	cleanup: {
		intent: "none" | "restore" | "delete" | "reset" | "external";
		dataRequirementIds: DataRequirementId[];
		afterCaseIds: TestCaseId[];
		instructions?: string;
	};
	automation: { readiness: "ready" | "partial" | "blocked"; blockers: string[] };
}
```

Step fields: `id`, `testCaseId`, `order`, `description`, `action`, `provenance`.

DataRequirement fields: `id`, `name`, `description`, `kind`, `provisioning`, `sensitivity`, `provenance`, `requiredState?`.

Producer ownership exists only through `TestCase.producesDataRequirementIds`; do not duplicate it as `DataRequirement.producerCaseId`.

OpenQuestion fields: `id`, `question`, `status: "open" | "answered"`, `blocking`, `answer?`, `provenance`, `blockedEntityRefs`.

GenerationMetadata fields:

```ts
{
	id: GenerationId;
	generatedAt: RFC3339;
	methodologyVersion: string;
	workflowVersion: string;
	inputFingerprint: string;
	repositoryRevision?: string;
	generator: { kind: "manual" } | { kind: "model"; provider: string; model: string };
	status: "complete" | "incomplete";
	warnings: string[];
}
```

- [ ] **Step 4: Build representative fixtures**

`ui-api-integration.json` must include:

- supplied feature request and repository sources;
- explicit, inferred, and assumption provenance;
- UI, API, and integration targets/actions;
- one producer case and one consumer case;
- setup dependency and cleanup after consumer;
- matcher examples from every matcher family;
- answered non-blocking question;
- complete status and no blockers.

`assumption-blocked.json` must include:

- assumption requirement with rationale;
- open blocking question;
- blocked automation readiness;
- incomplete plan status;
- external cleanup intent.

- [ ] **Step 5: Export API and run green tests**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/qa-engine
git commit -m ":sparkles: feat(qa-engine): add test graph schema"
```

## Task 5: Typed Deterministic Validator

**Files:**

- Create: `packages/qa-engine/src/test-graph/findings.ts`
- Create: `packages/qa-engine/src/test-graph/validate.ts`
- Create: `packages/qa-engine/src/test-graph/validate.test.ts`
- Create: `packages/qa-engine/test/fixtures/invalid/dangling-links.json`
- Create: `packages/qa-engine/test/fixtures/invalid/duplicate-ids.json`
- Create: `packages/qa-engine/test/fixtures/invalid/dependency-cycle.json`
- Create: `packages/qa-engine/test/fixtures/invalid/malformed-assertions.json`
- Create: `packages/qa-engine/test/fixtures/invalid/unsupported-state.json`
- Modify: `packages/qa-engine/src/index.ts`

- [ ] **Step 1: Write failing finding tests**

Assert exact arrays, not only counts. Required codes:

```ts
type TestGraphFindingCode =
	| "SCHEMA_INVALID"
	| "MALFORMED_ASSERTION"
	| "UNSUPPORTED_STATE"
	| "UNSUPPORTED_SCHEMA_VERSION"
	| "DUPLICATE_ID"
	| "DUPLICATE_REFERENCE"
	| "DANGLING_REFERENCE"
	| "REFERENCE_KIND_MISMATCH"
	| "PROVENANCE_EVIDENCE_REQUIRED"
	| "PROVENANCE_RATIONALE_REQUIRED"
	| "EXPLICIT_SOURCE_REQUIRED"
	| "CASE_REQUIREMENT_REQUIRED"
	| "DUPLICATE_STEP_ORDER"
	| "NONCONTIGUOUS_STEP_ORDER"
	| "ASSERTION_STEP_CASE_MISMATCH"
	| "DEPENDENCY_SELF_REFERENCE"
	| "DEPENDENCY_CYCLE"
	| "FEATURE_CYCLE"
	| "MULTIPLE_DATA_PRODUCERS"
	| "MISSING_DATA_PRODUCER"
	| "CLEANUP_SELF_REFERENCE"
	| "CLEANUP_DATA_NOT_USED"
	| "QUESTION_ANSWER_STATE_INVALID"
	| "COMPLETE_PLAN_BLOCKED"
	| "GENERATION_STATUS_MISMATCH"
	| "PROJECT_ID_CHANGED"
	| "PLAN_ID_CHANGED"
	| "PLAN_VERSION_NOT_INCREMENTED"
	| "PLAN_CREATED_AT_CHANGED"
	| "PLAN_UPDATED_AT_NOT_ADVANCED";
```

Finding shape:

```ts
{
	code: TestGraphFindingCode;
	severity: "error" | "warning";
	message: string;
	path: string;
	entity?: { kind: GraphEntityKind; id: string };
	relatedIds: string[];
}
```

Test malformed assertion fixture yields stable `MALFORMED_ASSERTION` paths under `/assertions/...`; unknown enum state yields `UNSUPPORTED_STATE`; unknown schema version yields only `UNSUPPORTED_SCHEMA_VERSION`, not cascaded noise.

Add revision-transition cases for changed project ID, changed plan ID, skipped/reused version, changed creation timestamp, non-advancing update timestamp, and a valid `n -> n + 1` revision.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @test-framework/qa-engine test`

Expected: FAIL on missing validator.

- [ ] **Step 3: Implement two-phase validation**

```ts
export type TestGraphValidationResult =
	| { valid: true; graph: TestGraphV1; findings: [] }
	| { valid: false; findings: TestGraphFinding[] };

export function validateTestGraph(input: unknown): TestGraphValidationResult;
export function parseTestGraph(input: unknown): TestGraphV1;
export function validatePlanRevisionTransition(
	previous: unknown,
	next: unknown,
): readonly TestGraphFinding[];
```

Phase 1:

1. Detect `schemaVersion` without mutation.
2. Return unsupported-version finding for absent/unknown version.
3. `safeParse` V1.
4. Map assertion subtree issues to `MALFORMED_ASSERTION`, known enum-state issues to `UNSUPPORTED_STATE`, and remaining Zod issues to `SCHEMA_INVALID`.
5. Stop if structural parsing fails.

Phase 2 indexes and invariants:

1. Detect duplicate entity IDs and duplicate values in set-like reference arrays.
2. Resolve every typed reference.
3. Enforce provenance evidence/rationale rules.
4. For explicit provenance, linked evidence source must have `supplied: true`.
5. Require each case to cover at least one requirement.
6. Require step orders per case to be unique and contiguous from `1`.
7. Require assertion `stepId`, when present, to belong to same case.
8. Detect cycles in Feature parent links.
9. Build case dependency graph from `dependsOnCaseIds` plus producer-to-consumer edges.
10. Detect self edges and cycles with deterministic DFS over sorted IDs.
11. Require exactly one producer case for `case-produced`; forbid producers for other provisioning modes.
12. Require cleanup data to be consumed/produced by owning case.
13. Require answered questions to have an answer and open questions not to have one.
14. Require `complete` plans to have no blocking open question and no blocked case.
15. Require plan and generation statuses to agree: complete/complete or noncomplete/incomplete.

Revision transition validation parses both graphs, then requires:

1. same `projectId`;
2. same `planId`;
3. `next.planVersion === previous.planVersion + 1`;
4. same `createdAt`;
5. `next.updatedAt` strictly after `previous.updatedAt`.

Entity removals/additions are allowed. An entity retaining semantic identity retains its ID; automated semantic matching remains later refine-plan scope.

Sort findings using one exported comparator. Do not throw during invariant collection.

- [ ] **Step 4: Add typed parse error**

```ts
export class TestGraphValidationError extends Error {
	readonly code = "PLAN_INVARIANT_FAILED" as const;
	constructor(readonly findings: readonly TestGraphFinding[]) {
		super("Test Graph validation failed.");
	}
}
```

`parseTestGraph` throws only this error for invalid input and includes the same sorted findings returned by `validateTestGraph`.

- [ ] **Step 5: Run green tests twice**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine test`

Expected: both PASS with byte-identical assertion output.

- [ ] **Step 6: Commit**

```bash
git add packages/qa-engine
git commit -m ":sparkles: feat(qa-engine): validate graph invariants"
```

## Task 6: Canonical JSON Serialization

**Files:**

- Create: `packages/qa-engine/src/test-graph/canonical-json.ts`
- Create: `packages/qa-engine/src/test-graph/canonical-json.test.ts`
- Create: `packages/qa-engine/test/fixtures/expected/ui-api-integration.canonical.json`
- Modify: `packages/qa-engine/src/index.ts`

- [ ] **Step 1: Write failing canonicalization tests**

Test:

- shuffled object keys and top-level node arrays produce expected fixture;
- set-like ID/value arrays sort and deduplicate is **not** performed;
- duplicate set references remain invalid rather than silently repaired;
- steps sort by case ID then order then ID;
- assertion order sorts by case ID, optional step order, then ID;
- ordered semantic arrays such as preconditions/postconditions remain authored order;
- input deep equality unchanged after serialization;
- parse(serialized) then serialize is byte-identical;
- output has tabs or two spaces consistently and exactly one trailing newline. Use tabs to match repo JSON formatting.

```ts
test("canonical output is idempotent", async () => {
	const input = await loadJsonFixture("valid/ui-api-integration.json");
	const first = serializeTestGraph(input);
	const second = serializeTestGraph(JSON.parse(first));
	assert.equal(second, first);
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @test-framework/qa-engine test`

Expected: FAIL on missing serializer.

- [ ] **Step 3: Implement schema-aware canonicalizer**

Public API:

```ts
export function canonicalizeTestGraph(input: unknown): TestGraphV1;
export function serializeTestGraph(input: unknown): string;
```

Rules:

- Always call `parseTestGraph` first.
- Rebuild a new graph; never sort original arrays in place.
- Sort object keys recursively before `JSON.stringify`.
- Sort top-level entity arrays by ID except steps/assertions grouping rules above.
- Sort ID-set arrays and enum tag sets lexically.
- Preserve authored order for preconditions, postconditions, warnings, and blocker prose.
- Use `JSON.stringify(value, null, "\t") + "\n"`.

- [ ] **Step 4: Freeze golden canonical fixture and run green tests**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/qa-engine
git commit -m ":sparkles: feat(qa-engine): serialize graph json"
```

## Task 7: Explicit Migration Framework

**Files:**

- Create: `packages/qa-engine/src/test-graph/migrations.ts`
- Create: `packages/qa-engine/src/test-graph/migrations.test.ts`
- Modify: `packages/qa-engine/src/index.ts`

- [ ] **Step 1: Write failing migration tests**

Test:

- current V1 input validates and canonicalizes without mutation;
- unknown future version returns `UNSUPPORTED_SCHEMA_VERSION` migration error;
- missing version is rejected;
- injected test registry migrates `test/v0 -> test/v1 -> test/v2` in order;
- skipped edge `v0 -> v2` registration is rejected;
- migration output is validated at each hop;
- thrown migration error identifies `from`, `to`, and failing hop;
- test migration preserving `id` and link fields proves framework does not rewrite them itself;
- downgrade request rejected.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @test-framework/qa-engine test`

Expected: FAIL on missing registry.

- [ ] **Step 3: Implement generic adjacent registry**

```ts
export type Migration<TFrom = unknown, TTo = unknown> = {
	from: string;
	to: string;
	migrate(input: TFrom): TTo;
	validate(input: unknown): TTo;
};

export function createMigrationRegistry(
	versions: readonly string[],
	migrations: readonly Migration[],
): MigrationRegistry;
```

Guarantees:

- `versions` order defines adjacency.
- Exactly one migration per non-current adjacent pair.
- Migration receives deep-cloned input and must return new value.
- Validate after each hop.
- No downgrade API.
- No automatic ID, link, timestamp, or enum rewriting.
- Production Test Graph registry has only `test-graph/v1`; no fake V0 production migration.

Public entrypoint:

```ts
export function migrateTestGraph(input: unknown): TestGraphV1 {
	const version = detectSchemaVersion(input);
	if (version === TEST_GRAPH_SCHEMA_VERSION) return parseTestGraph(input);
	throw new TestGraphMigrationError("UNSUPPORTED_SCHEMA_VERSION", version);
}
```

- [ ] **Step 4: Run green tests**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/qa-engine
git commit -m ":sparkles: feat(qa-engine): add graph migrations"
```

## Task 8: Deterministic Markdown Renderer

**Files:**

- Create: `packages/qa-engine/src/test-graph/markdown.ts`
- Create: `packages/qa-engine/src/test-graph/markdown.test.ts`
- Create: `packages/qa-engine/test/fixtures/expected/ui-api-integration.md`
- Modify: `packages/qa-engine/src/index.ts`

- [ ] **Step 1: Write failing renderer tests**

Assert full golden Markdown plus focused visibility checks:

```ts
test("markdown retains execution-critical graph data", async () => {
	const graph = await loadJsonFixture("valid/ui-api-integration.json");
	const markdown = renderTestGraphMarkdown(graph);
	for (const token of [
		"plan_",
		"req_",
		"case_",
		"Provenance: explicit",
		"Consumes",
		"Produces",
		"Depends on",
		"Postconditions",
		"Cleanup",
		"Blockers",
	]) assert.match(markdown, new RegExp(token));
});
```

Also test special Markdown characters are escaped in tables and inline fields, multiline prose remains readable, and renderer does not mutate graph.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @test-framework/qa-engine test`

Expected: FAIL on missing renderer.

- [ ] **Step 3: Implement fixed renderer structure**

```text
# <title>
Plan metadata
Generation metadata/warnings
Sources
Evidence
Requirements
Features
Data Requirements
Test Cases
  case identity/provenance/coverage/dependencies/data/actor/target
  Preconditions
  Steps (ordered, IDs visible)
  Assertions (IDs, matcher, expected, observation point)
  Postconditions
  Cleanup
  Automation/blockers
Open Questions
```

Public API:

```ts
export function renderTestGraphMarkdown(input: unknown): string;
```

Rules:

- Parse and canonicalize first.
- Fixed section order.
- Render empty sections as `None` rather than omit them.
- Show IDs in backticks.
- Show provenance kind, evidence IDs, and rationale.
- Show question blocking state and entity refs.
- Show dependency/data links by ID, never title only.
- One trailing newline.

- [ ] **Step 4: Freeze golden Markdown and run green tests**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/qa-engine
git commit -m ":sparkles: feat(qa-engine): render graph markdown"
```

## Task 9: Round-Trip, Fixture Matrix, and Public API Tests

**Files:**

- Modify: `packages/qa-engine/src/test-graph/schema.test.ts`
- Modify: `packages/qa-engine/src/test-graph/validate.test.ts`
- Modify: `packages/qa-engine/src/test-graph/canonical-json.test.ts`
- Modify: `packages/qa-engine/src/test-graph/markdown.test.ts`
- Modify: `packages/qa-engine/src/index.ts`

- [ ] **Step 1: Add round-trip identity/link inventory test**

Build helper that extracts:

- every entity ID;
- every typed reference edge as `fromKind/fromId/field/toKind/toId`;
- provenance kind/evidence IDs/rationale;
- dependency/data/cleanup edges.

```ts
const before = graphInventory(testGraphV1Schema.parse(raw));
const after = graphInventory(testGraphV1Schema.parse(JSON.parse(serializeTestGraph(raw))));
assert.deepEqual(after, before);
```

- [ ] **Step 2: Add all-fixture table test**

Expected matrix:

| Fixture | Valid | Required finding |
| --- | --- | --- |
| `valid/ui-api-integration.json` | yes | none |
| `valid/assumption-blocked.json` | yes | none |
| `invalid/dangling-links.json` | no | `DANGLING_REFERENCE` |
| `invalid/duplicate-ids.json` | no | `DUPLICATE_ID` |
| `invalid/dependency-cycle.json` | no | `DEPENDENCY_CYCLE` |
| `invalid/malformed-assertions.json` | no | `MALFORMED_ASSERTION` |
| `invalid/unsupported-state.json` | no | `UNSUPPORTED_STATE` |

- [ ] **Step 3: Lock public exports**

`src/index.ts` exports only:

```text
version constants
all durable schemas and inferred types
ID schemas/types/factory
finding schemas/types/comparator/error
validateTestGraph, parseTestGraph, validatePlanRevisionTransition
canonicalizeTestGraph, serializeTestGraph
migrateTestGraph and migration framework types
renderTestGraphMarkdown
qaEngineManifest
```

Do not export test helpers or internal graph traversal helpers.

- [ ] **Step 4: Run package gate**

Run: `pnpm --filter @test-framework/qa-engine test && pnpm --filter @test-framework/qa-engine check-types`

Expected: PASS; all valid/invalid fixtures exercised.

- [ ] **Step 5: Commit**

```bash
git add packages/qa-engine
git commit -m ":white_check_mark: test(qa-engine): lock graph contracts"
```

## Task 10: Compatibility and Scanner Non-Regression

**Files:** none. Existing scanner and MCP suites are the compatibility contracts.

- [ ] **Step 1: Run scanner and MCP baseline**

Run:

```bash
pnpm --filter @test-framework/repo-scan test
pnpm --filter mcp test
```

Expected: current scanner and MCP suites PASS unchanged.

- [ ] **Step 2: Run full gate and inspect git diff**

Run:

```bash
pnpm check:ci
pnpm check-types:ci
pnpm build:ci
pnpm test:ci
git diff -- packages/repo-scan apps/mcp packages/core packages/planner packages/artifacts
```

Expected:

- all commands PASS;
- diff command prints nothing;
- scanner behavior and MCP tool list unchanged.

- [ ] **Step 3: Leave worktree unchanged**

Expected: no files changed by this task. Any required compatibility edit means an earlier package-boundary assumption was wrong; fix the smallest earlier task and rerun this gate.

## Task 11: Canonical Documentation and ADR

**Files:**

- Create: `docs/adr/0007-versioned-test-graph-contract.md`
- Modify: `docs/adr/README.md`
- Modify: `CONTEXT.md`

- [ ] **Step 1: Add glossary terms only**

Add concise domain definitions, no implementation paths or TypeScript details:

```markdown
- **Plan Revision**: immutable version of one Test Plan; retains its `planId` and advances `planVersion` when plan content changes.
- **Provenance**: visible classification of a graph claim as explicit, inferred, or assumption, with evidence or rationale required by that classification.
- **Data Requirement**: named state or resource a Test Case consumes or produces, including provisioning and cleanup expectations.
```

- [ ] **Step 2: Add ADR 0007**

ADR decision:

- Project is separate aggregate.
- Plan revision is immutable graph root.
- IDs are scoped deterministic and not content-recomputed.
- V1 normalized links are typed IDs.
- setup/data dependencies are acyclic.
- JSON is canonical; Markdown derived.
- migration is explicit adjacent upgrade only.
- `qa-engine` owns graph; compatibility packages remain temporarily.

Rejected alternatives:

- embedded mutable project snapshot;
- random-only IDs;
- IDs derived from editable prose;
- cascade deletion;
- arbitrary assertion matcher strings;
- implicit best-effort migration;
- implementing graph in `core` then moving it later;
- deleting all old packages in this checkpoint.

- [ ] **Step 3: Link ADR and validate docs**

Run: `pnpm check:ci`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md docs/adr
git commit -m ":memo: docs(docs): record graph contract"
```

## Task 12: Final Verification

**Files:** none unless verification exposes defects.

- [ ] **Step 1: Run focused contract tests**

Run:

```bash
pnpm --filter @test-framework/qa-engine test
pnpm --filter @test-framework/qa-engine check-types
```

Expected: PASS.

- [ ] **Step 2: Run required repository gate**

Run:

```bash
pnpm check:ci
pnpm check-types:ci
pnpm build:ci
pnpm test:ci
```

Expected: PASS.

- [ ] **Step 3: Verify deterministic artifacts across repeated runs**

Run the focused suite twice and compare captured TAP output after removing duration lines if Node emits them. More importantly, tests must compare exact finding arrays and golden files internally.

Expected: same findings and golden bytes both runs.

- [ ] **Step 4: Verify scope**

Run:

```bash
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- packages/repo-scan apps/mcp packages/core packages/planner packages/artifacts
```

Expected:

- only planned `qa-engine`, docs, and lockfile changes;
- final diff command empty;
- no provider, execution, workspace writer, prompt, or new MCP code.

- [ ] **Step 5: Final commit only if verification required fixes**

```bash
git add <verified-fix-files>
git commit -m ":bug: fix(qa-engine): close graph contract gaps"
```

## Acceptance Criteria

- `Project` validates independently; `TestGraphV1` references `projectId`.
- Same ID inputs always produce same typed ID; editable prose/order never drives ID generation.
- `planId` remains stable and transition validation enforces exact `planVersion + 1` semantics.
- All required entities exist with explicit typed links.
- Explicit, inferred, and assumption provenance rules are deterministic.
- UI/API/integration/generic targets and actions parse via discriminated unions.
- Assertion matcher shape is closed and matcher-specific.
- Case dependency graph rejects self references and cycles.
- Case-produced data has exactly one agreeing producer.
- Cleanup intent, cleanup data, and teardown ordering remain visible.
- Validator returns typed sorted findings for malformed schema, unsupported version/state, duplicate IDs/references, dangling links, malformed assertions, feature/case cycles, provenance failures, producer failures, invalid question state, invalid revision transitions, and invalid complete state.
- Canonical JSON round-trip preserves complete ID/link/provenance/dependency inventory.
- Canonical JSON serialization is idempotent and non-mutating.
- Markdown golden fixture visibly retains IDs, provenance, dependencies, blockers, postconditions, and cleanup.
- Migration registry is deterministic, adjacent-only, validates each hop, and rejects downgrade/future versions.
- Existing scanner and MCP tests pass with no source changes.
- Full lint, typecheck, build, and tests pass.

## Risks and Controls

| Risk | Control |
| --- | --- |
| Schema overfits future runner | Behavioral targets/actions/assertions; no Playwright locators or generated-code AST. |
| IDs churn during refinement | Caller-supplied semantic key; IDs stored and immutable; never recompute from prose. |
| Deterministic serializer changes semantics | Schema-aware set ordering; preserve authored order fields; inventory round-trip test. |
| Zod parse hides typed findings | One unknown-input validator maps Zod issues before invariant pass. |
| Data dependency model too permissive | Single producer rule and explicit provisioning mode. |
| Dependency model too strict for loops/retries | Graph models case setup order, not runtime control flow; retries stay future execution detail. |
| Cleanup ordering creates false setup cycles | Cleanup metadata validated separately from setup DAG. |
| Migration framework invents legacy history | No production V0. Generic framework tested with injected fake versions only. |
| Package consolidation expands scope | Add canonical owner only; preserve all compatibility packages and adapters unchanged. |
| Golden fixtures become unreadable | One comprehensive fixture plus one blocked/assumption fixture; focused invalid fixtures stay minimal. |
| Markdown mistaken as editable source | Renderer-only API; JSON remains canonical in docs and ADR. |

## Explicit Non-Goals

- No model calls, provider contracts, secrets, usage tracking, prompt assets, or semantic critic.
- No plan creation/refinement service.
- No artifact directories or filesystem persistence.
- No optimistic concurrency implementation beyond `planVersion` contract.
- No executable test, runner, evidence bundle, test result, run artifact, or healing entity.
- No browser/API runtime-specific selector strategy.
- No MCP public API migration.
- No scanner enrichment or registry work.
- No conversion of current `NormalizedPrd`, `AcceptanceCriterion`, or legacy `TestCase` stubs.
- No package deletion or import rewrite outside `qa-engine`.
- No quality eval corpus or prompt tuning.

## Implementation Notes

- Use `apply_patch` for manual edits.
- Keep durable objects `.strict()`; unknown fields must not silently disappear.
- Use exhaustive switches with `never` checks for target/action/assertion unions.
- Do not use locale-dependent sorting; compare code units with `<`/`>`.
- Do not expose mutable singleton registries. Construct and freeze registries.
- Do not auto-repair invalid graph input in validator, serializer, migration, or renderer.
- Treat warnings as explicit graph content; never synthesize nondeterministic timestamps or IDs.
- Keep every commit independently green after its task.
