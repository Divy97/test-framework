# Safe Repository Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, bounded, secret-safe local repository scanner and feed its real output into `map_feature` without moving filesystem logic into the MCP protocol adapter.

**Architecture:** `packages/repo-scan` owns scan contracts, policy, traversal, detection, and Node filesystem access. `packages/planner` only exposes optional bounded scan options on `map_feature`. `apps/mcp` composes the scanner behind the existing `ToolHandlers` interface; feature-map and acceptance-criteria reasoning remain deterministic stubs until the later provider milestone.

**Tech Stack:** Node.js 25.2.1, TypeScript 6, Zod 4, Node `fs/promises`, `ignore` 7 for Git-compatible ignore matching, Node test runner through `tsx`, pnpm, Turborepo.

---

## Scope

Included:

- Canonical root validation and confinement.
- Non-following symlink policy.
- Hard secret/dependency/build/generated/binary exclusions.
- `.gitignore` support, with hard exclusions always winning.
- Bounded directory entries, files, depth, file bytes, total read bytes, and evidence counts.
- Framework and package-manager detection.
- Route/page, component, API, DB, test, auth/middleware, validation, feature-flag, and external-integration classification.
- Repo-relative evidence paths and deterministic reasons.
- Partial results plus truncation/warning metadata when soft limits are reached.
- Strong static fixtures and runtime security fixtures.
- Real scanner composition into `map_feature` through injected handlers.

Excluded:

- LLM calls, semantic feature mapping, acceptance-criteria generation, embeddings, AST parsing, git diff analysis, MCP roots negotiation, artifact writes, watch mode, caching, incremental scans, submodule traversal, archive extraction, network access, test execution, or source excerpts in MCP output.

## Grill-Me Decision Record

Each question is resolved from current code/docs or conservative security defaults.

| Decision question | Recommended answer | Reason |
| --- | --- | --- |
| Where does scanning live? | Entirely in `packages/repo-scan`. | Checkpoint assigns ownership there; MCP must remain thin. |
| Assume a repo layout like this project? | No. Traverse from the supplied root and detect every safely discovered manifest/file. Never require `apps/`, `packages/`, `src/`, a workspace file, or a monorepo. | User repositories may be flat, nested, polyrepo-style, or use arbitrary directory names. |
| Does `map_feature` call filesystem APIs directly? | No. Compose `scanRepository` in a production handler factory. | Preserves existing `ToolHandlers` boundary and test injection. |
| Replace all stubs now? | No. Only `repoScan` becomes real. | Scanner milestone only; model-backed mapping is later. |
| Follow symlinks? | Never, for files or directories. | Prevents root escape, cycles, duplicate scans, and surprise reads. |
| Permit a symlink as the requested root? | Yes, resolve once with `realpath`; canonical target becomes root. | Supports common workspace layouts while keeping one confinement boundary. |
| How is root confinement checked? | Canonical root plus `path.relative`; reject absolute or `..` escapes. Re-check every read candidate. | Prefix string checks are unsafe (`/repo` vs `/repo-other`). |
| How are read races reduced? | `lstat`, confinement check, `open` with `O_NOFOLLOW`, `FileHandle.stat`, bounded `FileHandle.read`, always close. | Avoids ordinary symlink following and full-file reads. |
| What happens on Windows where `O_NOFOLLOW` may differ? | Keep `lstat` + canonical confinement; treat unsupported flag as a documented platform limitation, not permission to follow known links. | Cross-platform behavior remains conservative. |
| Honor `.gitignore`? | Yes, including nested files. | Custom generated/build output is otherwise impossible to cover robustly. |
| Can `.gitignore` re-include secrets/build output? | No. Hard policy runs before Git-ignore evaluation and cannot be negated. | Repository-controlled patterns must not weaken product safety. |
| Allow user custom ignores? | Additive only, through `additionalIgnorePatterns`. | Useful focus control without opening exclusions. |
| Allow user to raise limits arbitrarily? | No. Zod hard caps bound every option. | MCP input is untrusted and must not disable safeguards. |
| Limit reached: fail or return partial? | Return deterministic partial summary with `truncated`, `stopReason`, stats, warnings. | Partial evidence is useful; caller can see incompleteness. |
| Permission/read failure on one path? | Warn and continue. Invalid/unreadable root remains fatal. | One unreadable file should not destroy a repo scan. |
| Include source excerpts? | No in this milestone. Detect using bounded reads, return paths/reasons only. | User scope asks paths/reasons; excerpts increase secret and context risk. |
| Parse code with ASTs? | No. Use path rules, package metadata, and bounded text signals. | Multi-language AST support is out of scope; deterministic registry is enough for V1. |
| Framework result singular or plural? | Add plural evidence while retaining singular primary fields. | Monorepos can contain Next.js and Hono; existing planner contract expects singular fields. |
| Package-manager conflicts? | Explicit root `packageManager` field wins. One lockfile is accepted. Multiple conflicting lockfiles yield all evidence, `packageManager: null`, warning. | Avoids false certainty. |
| Read lockfiles? | No. Detect by filename only. | They are large/generated; contents are unnecessary. |
| Scan `.env.example`? | No. All `.env*` files are hard-excluded. | Conservative secret policy beats integration hints. |
| Scan files named `token.ts` or auth code? | Yes. Do not blacklist generic words like token/auth. | These are important implementation evidence; secret policy targets secret storage formats/names. |
| Use `relevantFiles` to bypass policy? | Never. Use valid confined entries only as evidence ordering hints. | Explicit input must not bypass safety. |
| Traverse nested repositories/submodules? | Skip nested `.git` metadata and symlinked submodules; ordinary checked-out directories remain regular traversal. | No git subprocess or submodule fetching. |
| Classification ordering? | Relevant-file hints first, then POSIX repo-relative lexicographic path; dedupe by category/path before cap. | Stable snapshots and predictable context. |
| New MCP tool? | No. Keep five tools; enrich existing `map_feature`. | Product/MCP contract already established. |

## Public Contract

`packages/repo-scan/src/contracts.ts` must define these schemas and inferred types:

```ts
export const repoScanOptionsSchema = z.object({
	maxDepth: z.number().int().min(1).max(50).default(20),
	maxEntries: z.number().int().min(1).max(200_000).default(50_000),
	maxFiles: z.number().int().min(1).max(50_000).default(10_000),
	maxFileBytes: z.number().int().min(1).max(1_048_576).default(262_144),
	maxTotalReadBytes: z.number().int().min(1).max(33_554_432).default(8_388_608),
	maxEvidencePerCategory: z.number().int().min(1).max(500).default(100),
	honorGitignore: z.boolean().default(true),
	additionalIgnorePatterns: z
		.array(z.string().min(1).max(256))
		.max(100)
		.default([]),
});

export const repoScanRequestSchema = z.object({
	rootPath: z.string().min(1),
	relevantFiles: z.array(z.string().min(1)).default([]),
	options: repoScanOptionsSchema.partial().default({}),
});

export const repoFileReferenceSchema = z.object({
	path: z.string().min(1),
	reason: z.string().min(1),
});

export const repoTechnologyDetectionSchema = repoFileReferenceSchema.extend({
	name: z.string().min(1),
});

export const repoScanStatsSchema = z.object({
	entriesVisited: z.number().int().nonnegative(),
	filesConsidered: z.number().int().nonnegative(),
	filesRead: z.number().int().nonnegative(),
	bytesRead: z.number().int().nonnegative(),
	skippedByPolicy: z.number().int().nonnegative(),
	skippedByGitignore: z.number().int().nonnegative(),
	skippedSymlinks: z.number().int().nonnegative(),
	skippedLargeFiles: z.number().int().nonnegative(),
	skippedBinaryFiles: z.number().int().nonnegative(),
	unreadablePaths: z.number().int().nonnegative(),
});

export const repoScanSummarySchema = z.object({
	framework: z.string().min(1).nullable(),
	packageManager: z.string().min(1).nullable(),
	frameworks: z.array(repoTechnologyDetectionSchema),
	packageManagers: z.array(repoTechnologyDetectionSchema),
	routesPages: z.array(repoFileReferenceSchema),
	components: z.array(repoFileReferenceSchema),
	apiHandlers: z.array(repoFileReferenceSchema),
	dbSchemasModels: z.array(repoFileReferenceSchema),
	existingTests: z.array(repoFileReferenceSchema),
	authMiddleware: z.array(repoFileReferenceSchema),
	validationSchemas: z.array(repoFileReferenceSchema),
	featureFlags: z.array(repoFileReferenceSchema),
	externalIntegrations: z.array(repoFileReferenceSchema),
	truncated: z.boolean(),
	stopReason: z
		.enum(["max-depth", "max-entries", "max-files", "max-total-read-bytes"])
		.nullable(),
	warnings: z.array(z.string().min(1)),
	stats: repoScanStatsSchema,
});
```

Rules:

- Output paths are `/`-separated, repo-relative, never absolute, never `.` or `..` prefixed.
- Existing singular `framework` and `packageManager` remain compatibility summaries.
- Arrays are sorted and capped after deduplication.
- Discovery is layout-agnostic: no classifier may depend on this repository's `apps/`, `packages/`, or workspace structure.
- Conventional directory names are evidence signals, not required roots. Equivalent content/package signals must work from arbitrary nested locations.
- Schemas remain non-strict, matching current forward-compatible convention.
- `scanRepository(request): Promise<RepoScanSummary>` is the only production entry point.

## File Map

Create:

- `packages/repo-scan/src/contracts.ts` - public Zod schemas/types.
- `packages/repo-scan/src/errors.ts` - typed fatal scan errors and stable codes.
- `packages/repo-scan/src/path-safety.ts` - canonical root, relative-path normalization, confinement.
- `packages/repo-scan/src/policy.ts` - immutable hard exclusions, text extensions, limits.
- `packages/repo-scan/src/gitignore.ts` - nested `.gitignore` and additive ignore handling.
- `packages/repo-scan/src/filesystem.ts` - Node filesystem adapter and bounded no-follow reads.
- `packages/repo-scan/src/traverse.ts` - deterministic bounded traversal and stats.
- `packages/repo-scan/src/technology.ts` - package-manager/framework/integration registries.
- `packages/repo-scan/src/classify.ts` - category rules and evidence reasons.
- `packages/repo-scan/src/scanner.ts` - orchestration, dedupe, ordering, caps, summary parsing.
- `packages/repo-scan/src/contracts.test.ts` - schema/default/cap tests.
- `packages/repo-scan/src/path-safety.test.ts` - confinement tests.
- `packages/repo-scan/src/policy.test.ts` - hard-ignore tests.
- `packages/repo-scan/src/traverse.test.ts` - bounds, symlink, unreadable, no-read tests.
- `packages/repo-scan/src/scanner.test.ts` - fixture detection and deterministic output tests.
- `packages/repo-scan/test/fixtures/next-hono-monorepo/**` - representative pnpm monorepo.
- `packages/repo-scan/test/fixtures/express-app/**` - representative npm single app.
- `packages/repo-scan/test/fixtures/unconventional-layout/**` - no `src`, `apps`, `packages`, or workspace metadata; arbitrary nested feature directories.
- `apps/mcp/src/tool-handlers.ts` - production composition; scanner-backed `mapFeature`, delegated stubs elsewhere.

Modify:

- `packages/repo-scan/src/index.ts` - public exports only.
- `packages/repo-scan/package.json` - `ignore`, `tsx`, test script.
- `packages/planner/src/index.ts` - optional `scanOptions` on `mapFeatureInputSchema`.
- `apps/mcp/src/server.ts` - default to production-composed handlers.
- `apps/mcp/src/tools.ts` - accurate per-tool implementation notices.
- `apps/mcp/src/server.test.ts` - preserve injected-stub protocol tests; add real scanner MCP test.
- `README.md` - scanner behavior and safety limits.
- `docs/v1-checkpoint.md` - mark scanner capability done only after all gates pass.
- `pnpm-lock.yaml` - dependency resolution.

Do not modify:

- `packages/core/src/index.ts`; scanner evidence is not a reusable QA entity.
- `apps/mcp/src/handlers.ts`; existing interface already supports composition.
- `apps/mcp/src/stub-handlers.ts` except adding new required summary fields to its empty `repoScan` object.

## Classification Matrix

All content signals are case-sensitive where language syntax is case-sensitive; path/name checks are case-insensitive. Path evidence alone is allowed when conventional and unambiguous. Otherwise require path plus content/package signal.

The matrix describes signals, not a required folder tree. The scanner evaluates every eligible file relative to the supplied root. A route handler under `product/domains/accounts/http/users.ts`, a schema under `business/entities/user.ts`, or a component under `ui/widgets/UserCard.tsx` must still be discoverable from content/package signals even when no conventional directory name exists.

| Category | V1 path signals | V1 content/package signals | Example reason |
| --- | --- | --- | --- |
| Routes/pages | `app/**/page.*`, `pages/**/*`, `routes/**/*`, `src/routes/**/*` | framework route exports where needed | `Next.js App Router page convention` |
| Components | `components/**/*`, `*.tsx`, `*.jsx` with PascalCase basename | React/Solid/Vue/Svelte dependency or component export/JSX signal | `Component directory and TSX module` |
| API handlers | `app/**/route.*`, `pages/api/**/*`, `api/**/*`, `routes/**/*` | exported HTTP verbs; Hono/Express/Fastify route calls | `Next.js route handler convention` |
| DB schemas/models | `schema.*`, `models/**/*`, `*.model.*`, `prisma/schema.prisma` | Drizzle table, Prisma model, Mongoose/Sequelize/TypeORM declarations | `Drizzle table declaration` |
| Existing tests | `*.test.*`, `*.spec.*`, `__tests__/**/*`, `tests/**/*`, `e2e/**/*` | imported test runner plus `test`/`it`/`describe` calls, or framework-specific test declarations | `Test runner declaration` |
| Auth/middleware | `middleware.*`, `auth/**/*`, `guards/**/*` | Clerk/Auth0/NextAuth/Lucia imports; auth/guard/session middleware symbols | `Authentication middleware signal` |
| Validation schemas | `validation/**/*`, `validators/**/*`, `*schema.*` | Zod/Yup/Joi/Valibot/Ajv imports and schema construction | `Zod validation schema` |
| Feature flags | `flags.*`, `feature-flags/**/*` | LaunchDarkly/PostHog/Unleash/ConfigCat imports or flag lookup symbols | `Feature flag SDK usage` |
| External integrations | integration/client/provider directories | dependency/import registry for Stripe, Sentry, OpenAI, Anthropic, AWS, Firebase, Supabase, Twilio, SendGrid, PostHog, LaunchDarkly, Clerk, Auth0 | `Stripe SDK dependency` |

Framework registry, initial supported names:

- `next`, `remix`, `nuxt`, `sveltekit`, `astro`, `hono`, `express`, `fastify`, `nestjs`, `react`, `vite`.
- Detect from every safely-read `package.json` dependency set and distinctive config filenames.
- Primary framework priority: full-stack app frameworks, backend frameworks, UI library, build tool. Preserve all detections.

Package-manager registry:

- Explicit root `packageManager` values beginning `pnpm@`, `yarn@`, `npm@`, or `bun@`.
- Lockfile evidence: `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`/`npm-shrinkwrap.json`, `bun.lock`/`bun.lockb`.
- Never parse lockfile contents.

## Hard Safety Policy

Hard-excluded directory components:

```text
.git .hg .svn node_modules .pnpm-store .yarn .pnp
dist build out target coverage .nyc_output .next .nuxt .svelte-kit
.turbo .nx .cache tmp temp logs .vercel .serverless .terraform
generated __generated__ .generated .test-framework
.ssh .gnupg .aws
```

Hard-excluded files/patterns:

```text
.env .env.*
*.pem *.key *.p12 *.pfx *.crt *.cer *.der
id_rsa id_dsa id_ecdsa id_ed25519
credentials.json credentials.*.json service-account*.json
secrets.json secrets.*.json secrets.ts secrets.js
*.min.js *.min.css *.map *.d.ts *.tsbuildinfo
*.generated.* *.gen.* routeTree.gen.*
package-lock.json yarn.lock pnpm-lock.yaml bun.lock bun.lockb
```

Lockfiles are excluded from reading/classification but recorded by filename for package-manager detection before skip.

Binary/media/archive extensions are skipped without reads: images, audio, video, fonts, PDFs, office files, archives, executables, object files, WASM, SQLite/database files.

Security invariants:

1. Hard policy evaluates before `.gitignore`, custom ignores, stats-consuming reads, and classifiers.
2. Symlink `Dirent`/`lstat` entries are counted and skipped; `readlink` is never called.
3. No candidate path is read unless confined under canonical root.
4. No regular file larger than `maxFileBytes` is opened.
5. Reader allocates at most `maxFileBytes` and stops at remaining total budget.
6. No file content, stack trace, absolute evidence path, or environment value appears in output/warnings.
7. Directory names and filenames may appear in warnings only as repo-relative paths.
8. `additionalIgnorePatterns` can exclude more; no option can disable hard policy or enable symlink following.

## Task 1: Contracts, Errors, Package Test Harness

**Files:**

- Create: `packages/repo-scan/src/contracts.ts`
- Create: `packages/repo-scan/src/contracts.test.ts`
- Create: `packages/repo-scan/src/errors.ts`
- Modify: `packages/repo-scan/src/index.ts`
- Modify: `packages/repo-scan/package.json`

- [ ] **Step 1: Add failing contract tests**

Test default option expansion, hard maximum rejection, empty root rejection, complete summary parsing, non-strict forward compatibility, and repo-relative reference shape.

- [ ] **Step 2: Run test and verify failure**

Run: `pnpm --filter @test-framework/repo-scan test`

Expected: fail because test script/contracts do not exist.

- [ ] **Step 3: Add package test dependencies/scripts**

Add `ignore: ^7.0.5` to dependencies, `tsx: ^4.19.2` to devDependencies, and:

```json
"test": "tsx --test src/**/*.test.ts"
```

- [ ] **Step 4: Implement contracts and errors**

Use the exact public contract above. Define `RepoScanErrorCode` values:

```ts
"ROOT_NOT_FOUND" | "ROOT_NOT_DIRECTORY" | "ROOT_UNREADABLE" | "ROOT_REALPATH_FAILED"
```

`RepoScanError` must expose `code`, use a safe message, and never include nested error stacks/content.

- [ ] **Step 5: Export public API**

`index.ts` exports contracts/types, errors, `scanRepository`, and existing manifest. Do not export internal filesystem/traversal helpers.

- [ ] **Step 6: Verify**

Run:

```bash
pnpm --filter @test-framework/repo-scan test
pnpm --filter @test-framework/repo-scan check-types
```

Expected: contract tests pass; scanner export may temporarily point to a typed throwing shell added in this task.

- [ ] **Step 7: Commit**

```bash
git add packages/repo-scan package.json pnpm-lock.yaml
git commit -m "feat: add scan contracts"
```

## Task 2: Root Confinement and Hard Policy

**Files:**

- Create: `packages/repo-scan/src/path-safety.ts`
- Create: `packages/repo-scan/src/path-safety.test.ts`
- Create: `packages/repo-scan/src/policy.ts`
- Create: `packages/repo-scan/src/policy.test.ts`

- [ ] **Step 1: Add failing confinement tests**

Cover:

- canonical directory root accepted;
- requested symlink root resolves to canonical target;
- missing/file roots throw correct codes;
- sibling-prefix escape rejected (`/repo-other`);
- `../`, absolute outside paths, Windows drive/UNC-style absolute inputs rejected;
- output normalization converts separators to `/`;
- `relevantFiles` outside root become warnings/hints dropped, never fatal.

- [ ] **Step 2: Add failing policy tests**

Table-test every hard directory/file class. Explicitly assert:

- `.env.example` excluded;
- `src/auth/token.ts` allowed;
- `src/secrets.ts` excluded;
- `src/generated/user.ts` excluded;
- `src/user.generated.ts` excluded;
- `pnpm-lock.yaml` returns metadata-only package-manager signal;
- custom ignore cannot unignore `.env`.

- [ ] **Step 3: Implement path helpers**

Required functions:

```ts
resolveScanRoot(rootPath: string): Promise<{ requestedRoot: string; canonicalRoot: string }>;
isPathInsideRoot(canonicalRoot: string, candidate: string): boolean;
toRepoRelativePath(canonicalRoot: string, candidate: string): string;
resolveRelevantFileHints(canonicalRoot: string, hints: string[]): HintResolution;
```

Use `resolve`, `realpath`, `lstat`, `relative`, `isAbsolute`, and `sep`; never use string prefix confinement.

- [ ] **Step 4: Implement hard policy**

Required decisions:

```ts
type PolicyDecision =
	| { action: "skip"; reason: string; kind: "policy" | "binary" | "generated" | "lockfile" }
	| { action: "consider"; textEligible: boolean };
```

Keep hard sets/regexes immutable and centralized. Evaluate path components before basename patterns.

- [ ] **Step 5: Verify**

Run package tests/types. Expected: all path/policy tables pass on current OS.

- [ ] **Step 6: Commit**

```bash
git add packages/repo-scan/src
git commit -m "feat: enforce scan policy"
```

## Task 3: Nested Ignore Rules and Safe Filesystem Adapter

**Files:**

- Create: `packages/repo-scan/src/gitignore.ts`
- Create: `packages/repo-scan/src/filesystem.ts`
- Create: `packages/repo-scan/src/traverse.test.ts`

- [ ] **Step 1: Add failing ignore tests**

Create temp trees covering root and nested `.gitignore`, anchored patterns, directory patterns, `**`, negation, comments, escaped markers, and additive ignores. Assert hard excludes still win after a negation.

- [ ] **Step 2: Implement ignore context stack**

Use `ignore` per directory context. Each context stores its repo-relative base and matcher. Evaluate ancestor contexts in order; the last matching rule decides. Read `.gitignore` only through the bounded safe reader, max 64 KiB per file; malformed/unreadable ignore files add warnings and do not fail scan.

- [ ] **Step 3: Define filesystem adapter**

Internal interface:

```ts
export interface ScanFileSystem {
	realpath(path: string): Promise<string>;
	lstat(path: string): Promise<Stats>;
	readdir(path: string): Promise<Dirent[]>;
	open(path: string, flags: number): Promise<FileHandle>;
}
```

Production adapter wraps Node APIs. Tests can spy on `open` to prove excluded files are never opened.

- [ ] **Step 4: Implement bounded safe text read**

`readBoundedTextFile` must:

1. Verify lexical/canonical confinement.
2. `lstat` and reject symlinks/non-regular files.
3. Reject size over per-file or remaining-total budget before open.
4. Open with `O_RDONLY | O_NOFOLLOW` where supported.
5. `FileHandle.stat` and re-check regular-file/size.
6. Read only the allowed byte count into one bounded buffer.
7. Reject NUL-containing content as binary.
8. Decode UTF-8, increment stats by bytes actually read, close in `finally`.

- [ ] **Step 5: Add security assertions**

Using a spy adapter and runtime temp fixtures, assert `.env`, private key, generated file, build output, large file, binary file, symlinked file, and symlinked directory cause zero content reads. Assert a symlink loop terminates.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @test-framework/repo-scan test
pnpm --filter @test-framework/repo-scan check-types
git add packages/repo-scan/src
git commit -m "feat: add safe file reads"
```

## Task 4: Deterministic Bounded Traversal

**Files:**

- Create: `packages/repo-scan/src/traverse.ts`
- Modify: `packages/repo-scan/src/traverse.test.ts`

- [ ] **Step 1: Add failing traversal tests**

Cover exact boundaries and one-over cases for depth, entries, files, per-file bytes, total bytes. Also cover unreadable file/directory continuation and stable lexicographic order.

- [ ] **Step 2: Implement iterative traversal**

Use an explicit queue/stack, not recursive promises. For each directory:

- read entries once;
- sort by name before processing;
- increment `entriesVisited` for every returned entry;
- hard-policy skip before child-directory enqueue;
- skip symlinks and special filesystem types;
- apply Git-ignore contexts;
- count regular considered files;
- stop globally at `maxEntries`/`maxFiles`;
- mark depth-pruned branches and set `max-depth` only if a branch was actually pruned;
- continue on per-path `EACCES`, `EPERM`, `ENOENT`, `ELOOP`, recording safe repo-relative warnings.

- [ ] **Step 3: Define traversal output**

Return internal `TraversedFile[]` with only metadata and optional bounded text:

```ts
interface TraversedFile {
	path: string;
	absolutePath: string;
	size: number;
	text: string | null;
}
```

Do not return skipped absolute paths. Preserve stats/warnings/truncation separately.

- [ ] **Step 4: Verify resource behavior**

Add a 20,000-entry generated temp fixture with low limits. Assert scan stops at configured counts and does not open later files. Do not commit the large tree.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @test-framework/repo-scan test
pnpm --filter @test-framework/repo-scan check-types
git add packages/repo-scan/src
git commit -m "feat: bound repo traversal"
```

## Task 5: Technology and Category Detection

**Files:**

- Create: `packages/repo-scan/src/technology.ts`
- Create: `packages/repo-scan/src/classify.ts`
- Create: `packages/repo-scan/src/scanner.test.ts`

- [ ] **Step 1: Add failing registry tests**

Use table tests for every framework, package manager, validation library, auth library, feature-flag SDK, DB library, and external integration listed above. Test malformed and oversized `package.json` handling.

- [ ] **Step 2: Implement safe manifest parsing**

Parse only safely-read `package.json` text. Accept object-shaped `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`; ignore non-string values. Never execute package code or resolve imports.

- [ ] **Step 3: Implement technology detection**

Return all deduped detections with package/config evidence. Determine singular primary fields exactly as defined in the decision record. Conflicting lockfiles without explicit root field produce a warning and null primary.

- [ ] **Step 4: Implement category classifiers**

Use declarative rules with stable IDs and reasons. Each classifier receives `{path, basename, extension, text, packageSignals}` and returns zero or more category matches. Never classify from arbitrary substring alone when it would create common false positives.

- [ ] **Step 5: Add false-positive tests**

Required negatives:

- `src/routes-helper.ts` is not automatically a route;
- lowercase utility `.tsx` without JSX/component export is not a component;
- `schema.md` is not DB/validation code;
- string mention of `stripe` in a comment is not an integration;
- generic `config.ts` is not a feature-flag file;
- `token.ts` is not treated as a secret;
- generated declarations never classify.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @test-framework/repo-scan test
pnpm --filter @test-framework/repo-scan check-types
git add packages/repo-scan/src
git commit -m "feat: classify repo evidence"
```

## Task 6: Scanner Orchestration and Fixtures

**Files:**

- Create: `packages/repo-scan/src/scanner.ts`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/package.json`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/pnpm-lock.yaml`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/package.json`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/app/dashboard/page.tsx`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/app/api/users/route.ts`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/components/UserCard.tsx`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/middleware.ts`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/validation/user.ts`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/flags.ts`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/integrations/stripe.ts`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/db/schema.ts`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/web/src/components/UserCard.test.tsx`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/api/package.json`
- Create: `packages/repo-scan/test/fixtures/next-hono-monorepo/apps/api/src/index.ts`
- Create: `packages/repo-scan/test/fixtures/express-app/package.json`
- Create: `packages/repo-scan/test/fixtures/express-app/package-lock.json`
- Create: `packages/repo-scan/test/fixtures/express-app/src/routes/users.ts`
- Create: `packages/repo-scan/test/fixtures/express-app/src/models/user.model.ts`
- Create: `packages/repo-scan/test/fixtures/express-app/src/auth/middleware.ts`
- Create: `packages/repo-scan/test/fixtures/express-app/test/users.spec.ts`
- Create: `packages/repo-scan/test/fixtures/unconventional-layout/package.json`
- Create: `packages/repo-scan/test/fixtures/unconventional-layout/product/domains/accounts/http/users.ts`
- Create: `packages/repo-scan/test/fixtures/unconventional-layout/business/entities/user.ts`
- Create: `packages/repo-scan/test/fixtures/unconventional-layout/ui/widgets/UserCard.tsx`
- Create: `packages/repo-scan/test/fixtures/unconventional-layout/security/session-guard.ts`
- Create: `packages/repo-scan/test/fixtures/unconventional-layout/quality/accounts.check.ts`
- Modify: `packages/repo-scan/src/scanner.test.ts`
- Modify: `packages/repo-scan/src/index.ts`

- [ ] **Step 1: Add fixture expectations**

Assert exact primary technologies, exact category paths/reasons, all repo-relative paths, no duplicates, stable ordering, valid summary schema, and identical repeated results.

For `unconventional-layout`, assert detection succeeds without `src`, `app`, `apps`, `pages`, `routes`, `components`, `packages`, workspace config, or conventional `*.test.*` naming. Content/package signals must identify API, DB model, component, auth, and test evidence. Where evidence cannot be classified confidently, assert omission rather than a guessed category.

- [ ] **Step 2: Implement `scanRepository`**

Flow:

1. Parse request/options and apply defaults.
2. Resolve canonical root and safe relevant-file hints.
3. Traverse with policy, Git-ignore, and budgets.
4. Parse manifests and metadata-only lockfile signals.
5. Run technology/category classifiers.
6. Dedupe category/path using first stable rule reason.
7. Order hinted paths first, then lexicographically.
8. Cap each category and warn when evidence is truncated.
9. Build singular primary fields, stats, warnings, truncation.
10. Parse final output through `repoScanSummarySchema`.

- [ ] **Step 3: Add runtime negative/security fixture**

Build a temp repository during test containing `.env`, `.env.example`, key material, `node_modules`, `dist`, generated files, a >limit file, binary NUL file, external symlink, internal symlink, directory loop, nested `.gitignore`, conflicting lockfiles, malformed manifest, and permission failure where supported. Assert no excluded path appears and no excluded content is opened.

- [ ] **Step 4: Add empty-repo test**

Expected: null singular technologies, empty arrays, zero reads or only `.gitignore` read if present, `truncated: false`, valid stats.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @test-framework/repo-scan test
pnpm --filter @test-framework/repo-scan check-types
git add packages/repo-scan
git commit -m "feat: scan repository"
```

## Task 7: Planner Contract and MCP Composition

**Files:**

- Modify: `packages/planner/src/index.ts`
- Modify: `apps/mcp/src/stub-handlers.ts`
- Create: `apps/mcp/src/tool-handlers.ts`
- Modify: `apps/mcp/src/server.ts`
- Modify: `apps/mcp/src/tools.ts`
- Modify: `apps/mcp/src/server.test.ts`

- [ ] **Step 1: Add failing planner/MCP tests**

Tests must prove:

- `mapFeatureInputSchema` accepts omitted options and bounded overrides;
- options above hard caps fail before handler execution;
- `createMcpServer(createStubToolHandlers())` keeps all existing protocol tests deterministic and filesystem-free;
- default `createMcpServer()` scans a temp fixture during `map_feature`;
- other four default handlers retain current stub behavior;
- invalid/missing root returns MCP `isError: true`, no structured content, stable scanner error code;
- tool list remains exactly five names;
- stdio handshake still succeeds;
- stdout remains protocol-only.

- [ ] **Step 2: Extend planner input**

Add:

```ts
scanOptions: repoScanOptionsSchema.partial().default({}),
```

to `mapFeatureInputSchema`. Import the schema from `@test-framework/repo-scan`; do not duplicate limit definitions.

- [ ] **Step 3: Keep empty stub output schema-valid**

Add plural technologies, stats, warnings, and truncation fields to `createStubToolHandlers().mapFeature`.

- [ ] **Step 4: Add production handler composition**

`createToolHandlers` creates stubs once and overrides only `mapFeature`:

```ts
export function createToolHandlers(
	scan: typeof scanRepository = scanRepository,
): ToolHandlers {
	const stubs = createStubToolHandlers();
	return {
		...stubs,
		async mapFeature(input) {
			const stubOutput = await stubs.mapFeature(input);
			const repoScan = await scan({
				rootPath: input.repoPath,
				relevantFiles: input.relevantFiles,
				options: input.scanOptions,
			});
			return mapFeatureOutputSchema.parse({ ...stubOutput, repoScan });
		},
	};
}
```

No MCP SDK imports belong in this file.

- [ ] **Step 5: Switch default server composition**

`createMcpServer(handlers = createToolHandlers())` remains transport-independent and injectable.

- [ ] **Step 6: Correct tool descriptions**

Remove global `stubNotice`. `map_feature` says repository scan is real/deterministic while feature-map and criteria reasoning remain stubs. Other descriptions keep explicit stub notices. Preserve read-only/idempotent/closed-world annotations.

- [ ] **Step 7: Verify focused packages**

```bash
pnpm --filter @test-framework/repo-scan test
pnpm --filter @test-framework/planner check-types
pnpm --filter mcp test
pnpm --filter mcp check-types
```

Expected: all pass; five-tool chain remains valid when injected with stubs; real map integration returns fixture evidence.

- [ ] **Step 8: Commit**

```bash
git add packages/planner apps/mcp
git commit -m "feat: wire scanner to map"
```

## Task 8: Docs, Full Verification, Security Audit

**Files:**

- Modify: `README.md`
- Modify: `docs/v1-checkpoint.md`

- [ ] **Step 1: Update README**

State:

- `map_feature` performs a real local read-only scan.
- Symlinks are never followed.
- Secret/build/dependency/generated/binary/large files are excluded.
- Scan defaults and hard caps.
- Partial/truncated summary behavior.
- Remaining feature map/criteria output is still stub reasoning.
- No model key/network/database/write required.

- [ ] **Step 2: Update checkpoint from evidence**

Mark safe scanner done, list actual test counts/gates, and leave provider-backed mapping pending. Do not claim V1 complete.

- [ ] **Step 3: Run full gates**

```bash
pnpm test
pnpm check-types
pnpm build
pnpm check
git diff --check
```

Expected: all pass. Because `pnpm check` writes, inspect diff afterward.

- [ ] **Step 4: Run security contract audit**

```bash
rg -n "readFile|open\(|realpath|lstat|readdir|readlink|symlink" packages/repo-scan/src
rg -n "\.env|node_modules|dist|generated|O_NOFOLLOW|maxTotalReadBytes" packages/repo-scan/src
rg -n "console\.log" apps/mcp/src packages/repo-scan/src
git status --short
```

Expected:

- filesystem access exists only in adapter/path-safety modules;
- no `readlink` use;
- hard policies and budgets are present and tested;
- no stdout logging;
- only intended files changed.

- [ ] **Step 5: Manual MCP smoke test**

Build and invoke `map_feature` through an in-memory/stdio client against this repository with low evidence caps. Confirm returned evidence is relative, excluded directories absent, and `truncated`/stats are coherent.

- [ ] **Step 6: Final commit**

```bash
git add README.md docs/v1-checkpoint.md
git commit -m "docs: describe safe scanner"
```

## Testing Strategy

Unit tests:

- Contract defaults/caps/forward compatibility.
- Root/path confinement across POSIX and Windows-shaped inputs.
- Every hard policy entry and important allowed near-match.
- Nested Git-ignore semantics and additive ignores.
- Technology/classifier registry positives and false positives.
- Dedupe, ordering, relevant-file prioritization, category caps.

Filesystem/security tests:

- External/internal symlinks, directory loop, root symlink.
- Spy-proven zero reads for secrets, ignored dirs, generated, binary, large, lockfiles.
- TOCTOU-resistant open/stat behavior where platform supports `O_NOFOLLOW`.
- Unreadable/vanished paths continue safely.
- Depth/entry/file/read-byte bounds at exact edge and one over.
- Large generated temp tree stops early.

Fixture/integration tests:

- Next.js + Hono pnpm monorepo.
- Express npm single app.
- Unconventional nested layout with no repo-shape resemblance to this project.
- Empty repo.
- Malformed manifest.
- Conflicting lockfiles.
- Real scanner through default MCP `map_feature`.
- Existing injected-stub protocol chain and stdio handshake unchanged.

Snapshot policy:

- Prefer exact object/path assertions over broad snapshots.
- One full-summary golden assertion per committed fixture is acceptable after paths/reasons are stable.
- No snapshots containing absolute temp paths.

## Acceptance Criteria

- [ ] `scanRepository` validates and canonicalizes an existing directory root.
- [ ] All output evidence paths are deterministic, repo-relative, `/`-separated, confined.
- [ ] Scanner never follows file or directory symlinks.
- [ ] Hard exclusions cannot be negated by `.gitignore` or options.
- [ ] `.env*`, private keys, credentials, dependency dirs, build output, generated files, binary files, lockfile contents, and oversized files are never read.
- [ ] Traversal obeys depth, entry, file, per-file byte, total byte, and evidence caps.
- [ ] Soft limit exhaustion returns a valid partial summary with explicit truncation metadata.
- [ ] Root failures are typed/fatal; individual path failures warn and continue.
- [ ] Framework/package-manager detection includes evidence and handles monorepos/conflicts truthfully.
- [ ] All nine requested evidence categories detect representative fixtures with clear reasons.
- [ ] Detection works for flat, monorepo, single-app, and unconventional arbitrary nested layouts; no required `apps/`, `packages/`, `src/`, workspace, or framework-specific root exists.
- [ ] False-positive tests cover ambiguous route/component/schema/flag/integration names.
- [ ] Repeated scans of unchanged fixtures return deep-equal results.
- [ ] `map_feature` default handlers return a real `RepoScanSummary`.
- [ ] Existing five-tool names, schemas, handler injection, in-memory transport, stdio transport, and read-only annotations remain intact.
- [ ] `packages/core` remains unchanged.
- [ ] Full repository test/type/build/Biome gates pass.

## Edge Cases

- Root path is relative, contains `..`, has spaces, or is a symlink.
- Root disappears or changes type during scan.
- Filename contains spaces, Unicode, leading dash, or newline.
- Case-sensitive vs case-insensitive filesystem collisions.
- Broken symlink, circular symlink, symlink to outside, symlink to inside.
- FIFO/socket/device entry.
- Permission denied or file deleted between `readdir`, `lstat`, and `open`.
- Huge directory where ignored child appears after limit boundary.
- Nested `.gitignore` negation and excluded parent directory.
- Malformed/array/non-object/oversized `package.json`.
- Multiple workspace manifests and framework detections.
- No workspace manifest, no `src`, arbitrary nesting, and domain-oriented directory names.
- Explicit `packageManager` conflicts with lockfile; explicit value wins with warning.
- Multiple lockfiles without explicit manager; primary null, all candidates retained.
- Same file legitimately appears in multiple categories.
- Same category matched by multiple rules; one path, first stable reason.
- Relevant-file hint is absolute inside root, relative, duplicated, outside root, ignored, symlinked, missing.
- Total read budget runs out before classification candidates; path-only classifiers still work, content-dependent ones do not guess.

## What Not To Do

- Do not execute repository code, package scripts, git commands, language servers, or framework CLIs.
- Do not traverse `node_modules`, build output, VCS metadata, generated directories, or symlinks.
- Do not read secrets to decide whether they look secret.
- Do not return file contents/excerpts yet.
- Do not use naive absolute-path prefix checks.
- Do not expose a `followSymlinks` or `disableSafety` option.
- Do not add a sixth MCP tool.
- Do not move scanner logic into `apps/mcp` or planner schemas into core.
- Do not implement model-backed feature mapping in this PR.
- Do not add AST/parser dependencies, worker pools, caches, watchers, or incremental indexes.
- Do not promise complete framework/language coverage; document the initial deterministic registry.
- Do not infer that the scanned repository shares this project's monorepo or package layout.
- Do not update checkpoint claims before full gates pass.

## Research Basis

- Node filesystem APIs provide `realpath`, `lstat`, `readdir` with `Dirent`, `open`, `FileHandle.stat`, and bounded reads: https://nodejs.org/api/fs.html
- Git ignore semantics include nested relative patterns, `**`, and negation; Git itself does not follow symlinks for `.gitignore`: https://git-scm.com/docs/gitignore
- `node-ignore` implements Git-compatible ignore filtering and exposes matched-rule inspection: https://github.com/kaelzhang/node-ignore
- Existing architecture contract: `apps/mcp` stays a thin, transport-independent, handler-injected adapter; business logic remains in packages.

## Plan Self-Review

- Spec coverage: every requested scan category, safety boundary, fixture class, and MCP wiring requirement maps to Tasks 2-7.
- Type consistency: `repoScanOptionsSchema`, `RepoScanSummary`, `scanRepository`, and `scanOptions` names are stable across package/planner/MCP tasks.
- Scope control: no provider, artifact, UI, database, execution, or cloud work included.
- Security posture: hard deny rules precede configurable ignores; no symlink following; all reads bounded and confined.
- Architecture: no MCP SDK dependency enters scanner; no filesystem dependency enters planner/core.
