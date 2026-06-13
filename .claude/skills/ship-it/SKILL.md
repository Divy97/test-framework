---
name: ship-it
description: Ship current work the Raft-Labs way — branch off development, atomic gitmoji commits validated by commitlint, and small focused PR(s) against development with the Asana link. Use when the user says ship it, commit and PR, or points here to commit/raise PRs.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob, AskUserQuestion
---

# ship-it

Take the current uncommitted work and ship it: branch (if needed) → atomic conventional commits → one or more small PRs. Follow these conventions exactly; do not ask the user to restate them.

## Hard rules (never violate)

1. **Never commit to a protected branch.** Protected = `main`, `master`, `develop`, `development`, `staging`, `production`. If on one, branch first.
2. **Never mention Claude / AI / Codex / co-author.** No `Co-Authored-By`, no attribution footer, nothing — in commits or PR bodies.
3. **Always raise a PR.** Even a one-line change gets a PR. Never leave work only pushed to a branch without a PR, and never push straight to `development`.
4. **Prefer multiple small PRs over one big PR.** Split independent concerns into separate branches/PRs.
5. **Always put the Asana task link in the PR body** when one is available. If unknown, ask before opening the PR.

## Step 1 — Inspect

```bash
git status --short
git branch --show-current
git diff --stat        # and read the actual diffs to understand the change
```

Understand what changed before grouping anything.

## Step 2 — Branch

- If on a protected branch (Hard rule 1), create one off `development`:
  ```bash
  git checkout development && git pull   # only if safe / asked; otherwise branch off current dev
  git checkout -b <type>/<kebab-slug>
  ```
- Name pattern (validate-branch-name): `^(feature|fix|hotfix|bugfix|release|chore|docs|refactor|test|ci)/[a-z0-9._-]+$`. Pick the prefix matching the dominant change; slug is lowercase kebab.
- If already on a valid feature branch with related work, stay on it.

## Step 3 — Plan the split (commits + PRs)

- Group changes **feature-wise or file-wise** into small, atomic commits, ordered so the tree builds at every commit (e.g. shared lib → consumer → frontend → follow-up fix).
- One concern per commit. One reviewable theme per PR.
- If the working tree contains **independent concerns**, prefer **separate branches → separate PRs** (each off `development`) over bundling. Use a stacked branch only when a later change genuinely depends on an unmerged earlier one.
- State the planned commits (and any PR split) briefly before executing.

## Step 4 — Resolve valid scopes

Scope is **required** and must be in the commitlint `scope-enum`: directory names under `apps/`, `libs/`, `services/`, `docs/` plus meta scopes. Resolve live:

```bash
{ ls -d apps/*/ libs/*/ services/*/ docs/*/ 2>/dev/null | xargs -n1 basename; \
  printf '%s\n' deps ci docs release claude codex stack amplify test frontend backend; } | sort -u
```

Pick the scope that best matches each commit's files (e.g. `brux-dental`, `shared-backend`, `amplify`).

## Step 5 — Commit (gitmoji + conventional)

Format required by `commitlint.config.mjs`: **`:emoji_shortcode: type(scope): subject`**

- subject: **lowercase**, imperative, no trailing period, full header ≤ **100 chars**.
- type ∈ `feat fix docs style refactor perf test build ci chore revert`.
- Emoji shortcode per `.cz-config.js`:

  | type | prefix | | type | prefix |
  |---|---|---|---|---|
  | feat | `:sparkles:` | | test | `:white_check_mark:` |
  | fix | `:bug:` | | chore | `:truck:` |
  | docs | `:memo:` | | revert | `:rewind:` |
  | style | `:lipstick:` | | build | `:construction_worker:` |
  | refactor | `:recycle:` | | ci | `:green_heart:` |
  | perf | `:zap:` | | wip | `:construction:` |

```bash
git add <files-for-this-commit>
git commit -m ":sparkles: feat(<scope>): <lowercase subject>"
```

Example: `:bug: fix(amplify): reject forged in-house uploads from outside target office`

## Step 6 — Validate messages (hooks may be skipped)

Husky hooks are often **non-executable on this machine** and silently skipped, so commitlint does **not** run automatically. Validate manually and confirm exit 0 before pushing:

```bash
npx commitlint --from <base-sha-or-HEAD~N> --to HEAD; echo "EXIT=$?"
```

If non-zero, amend the offending message and re-check.

## Step 7 — Asana link

- If the user already gave an Asana task URL/GID, use it.
- If not, **ask once** (use AskUserQuestion or a direct question): "Asana task link for this PR?" Accept "none" to proceed without (then note `Asana: none` in the body).

## Step 8 — Push + open PR(s)

```bash
git push -u origin <branch>                 # origin = git@github.com:Raft-Labs/brux-dental.git
gh pr create --base development --head <branch> \
  --title ":sparkles: feat: <concise title>" \
  --body-file <body.md>
```

PR title follows the same gitmoji-conventional format. PR body is **concise** (what / why / verification + the **Asana link**), not a wall of text. For a multi-PR split, repeat per branch.

## Step 9 — Report

List each PR URL and what it contains. If work was split, say how.

## Quick checklist

- [ ] Not on a protected branch
- [ ] Atomic, ordered, single-concern commits — feature/file-wise
- [ ] `:emoji: type(scope): lowercase subject`, scope in enum, ≤100 chars
- [ ] No Claude / co-author anywhere
- [ ] `npx commitlint` exit 0
- [ ] PR raised (always), base `development`, split into multiple if independent
- [ ] Asana link in PR body (or asked + `none`)
