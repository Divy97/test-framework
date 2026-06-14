# Architecture Review — V1 QA Testcase Agent

Date: 2026-06-14
Author: engineering (deep review before continuing V1)
Status: **SUPERSEDED DELIBERATION RECORD**. The final accepted architecture is
[Verification Intelligence Architecture](superpowers/specs/2026-06-14-verification-intelligence-architecture-design.md).
This file is preserved to record the reasoning path and rejected alternatives.

## Former Decision (2026-06-14, Superseded)

Two product constraints were confirmed, and they settle the architecture:

1. **We are an MCP server that runs inside host coding agents** (Claude Code,
   Codex, OpenCode, …). **We are not building an agent.** The host is the
   agent/loop/brain.
2. **Our server is deterministic and never calls a model.** The host's model does
   all generative reasoning. We add value the host model does *not* do reliably on
   its own: encoded QA methodology, deterministic critique, and safe artifacts.

Therefore the product is: **a deterministic QA-methodology + critic + artifact
server for a host coding agent.** Concretely:

- **Generation stays with the host model**, steered by *our* QA methodology
  (delivered as MCP prompts / structured instructions + the schema to fill).
- **The deterministic critic is the centerpiece** (`review_test_cases`): in code,
  it checks the host's draft against the quality bar, detects duplicates, maps
  coverage to acceptance criteria, and flags weak assertions / missing
  preconditions — returning concrete findings the host then fixes.
- **Safe artifact I/O** (atomic, confined JSON + Markdown writers).
- **No BYOK, no model key, no provider abstraction, no agent loop.**

Consequence: the **BYOK principle in `docs/v1-mvp.md` is retired** and the
checkpoint's execution order (which sequenced "BYOK Provider and Real Analysis"
as the core) is superseded by this document. See §6 for the target architecture.

This was the right call: inside a host with a frontier model, a *second* BYOK call
is redundant cost, a second key, and often a weaker model. "Boring and useful"
(the v1 principle) is better served by a rigorous deterministic critic than by
re-doing reasoning the host already does well.

This document is the "step back and think hard" review requested before we build
more of V1. It does three things:

1. States honestly what we have actually built (not what the docs claim).
2. Researches how the agents the market respects are actually architected, and
   extracts the transferable lessons.
3. Lays out the architectural options with full pros/cons, records what we
   **discard** and **why**, what we **accept** and **why**, and gives a
   recommendation. It does not pretend the current architecture is fine if it is
   not, and it does not change direction for novelty's sake.

---

## 1. What we actually have today

Measured, not aspirational (LOC = non-test source lines):

| Area | Reality | LOC |
| --- | --- | --- |
| `packages/repo-scan` | Real, heavily engineered. Safe traversal, secret exclusion, caps, a deterministic framework/library **detection registry**, 9 evidence categories. | 1,966 src / 1,890 test |
| `apps/mcp` | Real MCP stdio adapter. Registers 5 tools. **4 of 5 handlers are deterministic stubs**; `map_feature` is stub + real scan. | 370 src / 478 test |
| `packages/core` | Zod domain schemas (PRD, feature map, acceptance criteria, test case, findings). Good. | 95 |
| `packages/planner` | Zod input/output envelopes for the 5 tools. | 95 |
| `packages/artifacts` | Path constants only. No writer. | 11 |
| `packages/env` | Env validation. | 29 |
| `apps/api`, `apps/web`, `packages/db`, `packages/ui`, `packages/api` | **Dead scaffolds.** Deferred out of V1. Built, maintained, dependabot-tracked, CI-scoped-around. Zero V1 value today. | ~880 combined |

**Honest summary of the product's actual behavior:** none of the QA reasoning
exists yet. We have (a) a very good safe repo scanner, (b) a clean set of
schemas, and (c) an MCP protocol shell with stub handlers. The thing the product
is *for* — turning feature context into high-quality test cases — is 0% built.

### The shape of the current design

The intended V1 is a **5-stage deterministic pipeline**, orchestrated by the host
(Claude Code / Cursor) calling our MCP tools in sequence:

```
analyze_feature → map_feature → generate_test_cases → review_test_cases → export_test_cases
   (PRD)            (+ scan)         (cases)              (findings)          (files)
```

Each tool is a pure-ish function. Large JSON blobs (the normalized PRD, the
feature map, the criteria) are threaded **through the host** from one tool call
to the next. Each tool is eventually meant to make a single-shot, Zod-constrained
LLM call (BYOK) to do its reasoning.

In Anthropic's taxonomy this is a **workflow** ("LLMs and tools orchestrated
through predefined code paths"), not an **agent** ("an LLM that dynamically
directs its own process and tool usage"). That distinction is the crux of this
review.

---

## 2. What the market actually does

The user's instinct — "OpenCode / pi are ridiculously simple but score well, so
let's think about architecture before adding more" — is correct and worth taking
seriously. Here is what the respected agents actually do.

### pi (Mario Zechner) — the minimalist
- System prompt **+ 4 tools (read, write, edit, bash) in under 1,000 tokens**.
  Claude Code's instruction set is 10,000+. "These four tools are all you need."
- **No to-do lists** (add state the model has to track; "confuse more than help").
- **No plan mode** — planning is just markdown files you can read/edit.
- **No MCP** (as a consumer): MCP dumps 13k–18k context tokens per session;
  a CLI + README gives better *progressive disclosure*.
- **No sub-agents mid-session** — "a workflow symptom"; gather context in a
  separate session first.
- Holds its own against Codex/Cursor/Windsurf on Terminal-Bench 2.0.
- Source: <https://mariozechner.at/posts/2025-11-30-pi-coding-agent/>

### mini-swe-agent (Princeton/Stanford, the SWE-bench team) — the proof
- **~100 lines.** **Bash only — no other tools**, doesn't even use the tool-call
  API, so it runs on any model. **Completely linear history** (every step just
  appends to messages). **>74% on SWE-bench Verified**, matching/beating far more
  complex frameworks. Starts faster than Claude Code.
- Source: <https://github.com/SWE-agent/mini-swe-agent>

### OpenCode — the pragmatic open agent
- Client/server. **Provider abstraction via the AI SDK** (Anthropic/OpenAI/local,
  one interface). 8 tools (bash, edit, read, write, grep, glob, list, LSP) + MCP.
- Sessions persisted to disk; **git snapshots** for rollback; LSP diagnostics fed
  back into context as ground truth. `plan` (read-only) + `build` agents;
  sub-agents via a task tool. The loop auto-summarizes near the context limit.
- Sources: <https://cefboud.com/posts/coding-agents-internals-opencode-deepdive/>,
  <https://medium.com/@gaharwar.milind/inside-opencode-how-to-build-an-ai-coding-agent-that-actually-works-28c614494f4f>

### Codex CLI (OpenAI) — the production harness
- Shared Rust **"Codex core"** harness across CLI/web/IDE: agent loop, thread
  lifecycle (create/resume/fork/archive), sandboxed tool exec.
- A single turn = **dozens of inference→tool cycles**. Prompt caching to keep cost
  linear; automatic context compaction; isolated sandbox + **git worktree per
  task** for parallel safety.
- Sources: <https://openai.com/index/unrolling-the-codex-agent-loop/>,
  <https://www.swequiz.com/articles/openai-codex-architecture>

### Anthropic — "Building Effective Agents"
- **Workflow vs agent**: workflows = predefined code paths (predictable, for
  well-defined tasks); agents = LLM directs its own process (for open-ended
  problems where the number of steps can't be predicted).
- **Start simple. Add agentic complexity only when simpler solutions fall short.**
- An agent is just "an LLM autonomously using tools in a loop," and it must "gain
  ground truth from the environment at each step."
- Source: <https://www.anthropic.com/research/building-effective-agents>

### What actually drives quality (scaffold research)
- Scaffold matters as much as the model: same Opus 4.5, three frameworks, a
  2.3-point spread that reorders rankings; standardized vs vendor scaffold gap is
  10–30 points — **"mostly context retrieval and tool-use quality, not model
  capability."** Context-first designs (index the whole repo before acting) win on
  cross-module tasks. Yet minimal designs (mini-swe) match complex ones.
- Source: <https://www.marktechpost.com/2026/05/15/best-ai-agents-for-software-development-ranked-a-benchmark-driven-look-at-the-current-field/>

### The five transferable lessons

1. **An agent is an LLM in a loop with a few good tools. The model reasons; the
   scaffold stays out of the way.** Every respected example is this shape.
2. **Simplicity is a feature, not a compromise.** 100 lines and bash beat elaborate
   pipelines. Complexity is a cost you must justify, not a default.
3. **Quality comes from context retrieval + tool-use quality, not from rigid
   staging.** This is the single most important finding for us.
4. **Few coarse tools beat many fine-grained ones.** Fine-grained, must-call-in-
   order tools push orchestration burden and token cost onto whoever calls them.
5. **Own the loop if quality is your product.** pi, mini-swe, OpenCode, Codex all
   own their loop. You cannot measure or defend reasoning quality you don't
   generate.

---

## 3. The core tension in our design

Our stated product success criteria (`docs/v1-mvp.md`) are *quality* claims:

> "Covers obvious misses beyond the user's written PRD… separates explicit from
> inferred… **fewer duplicate/low-value cases than raw LLM output**."

That is a claim you can only make if you **own and can measure the reasoning**.
But our architecture pushes the reasoning out to the host model across a rigid
pipeline, and invests our own effort in the two things the research says matter
*least*: a fixed deterministic **scanner registry** (a worse, brittler version of
the adaptive context retrieval the host already does well) and **multi-stage
orchestration** (which the host has to drive).

Put bluntly: **we have spent ~2,000 lines on the part the model is better at
(exploring a repo) and 0 lines on the part that is actually our product (QA
reasoning quality and its evaluation).** That is the architectural mismatch worth
fixing before we build more.

### Two specific design smells

- **The bespoke scanner as the context mechanism.** A hardcoded framework/library
  registry is layout-sensitive, perpetually incomplete, and needs forever-
  maintenance — and when our MCP server runs *inside* Claude Code, the host
  already has read/grep/glob/bash and explores better than any registry we write.
  The scanner's *safety primitives* (root confinement, secret exclusion, byte
  caps) are genuinely valuable; the *detection registry* is the part fighting the
  current.
- **Five fine-grained, must-sequence tools with large JSON handoffs.** The host
  must call them in the right order and re-pass big blobs each time. This is
  orchestration burden + token cost we impose. The market lesson is the opposite:
  fewer, coarser tools.

---

## 4. The options (deliberation record)

> **Outcome:** none of A/B/C as originally framed. The confirmed constraints
> ("MCP server inside a host" + "deterministic, no model") select a **fourth
> shape**: a deterministic methodology + critic + artifact server (closest to A,
> but with a real code-based critic instead of "just a prompt," and explicitly no
> model in our process). B (own-the-loop agent) is rejected outright. The options
> below are kept to record what was weighed and why.

### Option A — Stay a thin tool library for a host agent (evolve current)
We remain an MCP server; the host (Claude Code) is the brain. We collapse to 1–2
coarse tools, stop relying on the bespoke scan (let the host gather context), and
our value is the QA schema + a strong QA prompt baked into the tool.

- **Pros:** zero loop/BYOK/provider burden; cheapest to ship; rides host model
  upgrades for free; genuinely simple.
- **Cons:** thinnest possible moat — we are "a schema + a prompt"; **we cannot run
  golden evals on output we don't generate**, so we cannot honestly claim the
  quality bar; hostage to host behavior; "be a feature, not a product."

### Option B — Own a *minimal* QA agent loop (the pi / mini-swe shape) — **recommended**
We become a small agent that owns its loop: BYOK model + a few tools (read,
grep/glob, and the safe-scan reused as the read **sandbox**), a strong QA system
prompt + the quality-bar checklist, and a schema-validated final artifact. Ship it
as **one coarse MCP tool** whose handler runs the loop, and/or a CLI. "Own the
loop" and "be packaged as MCP" are orthogonal — we can do both.

- **Pros:** matches every high-performing example; we own the reasoning, so we can
  build the **eval harness** the success criteria require; portable (CLI works in
  CI later, not only inside a host); a real moat (QA prompt + evals + safe
  exploration); still minimal — closer to 200 lines of loop than the current
  pipeline. Salvages the best ~30% of `repo-scan` (the safety sandbox).
- **Cons:** we own a loop, context budget, provider abstraction, and bounded-cost
  concerns; more responsibility than Option A.

### Option C — Keep the 5-stage deterministic workflow (status quo, finish it)
Build the four stub handlers as single-shot LLM calls behind the existing pipeline.

- **Pros:** inspectable intermediate artifacts (editable PRD/feature map between
  stages — a real product feature); predictable cost; the schemas already fit.
- **Cons:** it's a *workflow* for an *open-ended* task (Anthropic says use an agent
  here — you can't predict how many look-ups generating good test cases needs);
  rigid staging fights adaptive context retrieval (the thing that drives quality);
  host carries orchestration + big-blob token cost; still leaves us unable to
  own/measure quality end-to-end unless we also own the loop.
- **Note:** the one genuine win here — *editable intermediate artifacts* — does
  **not** require staged *tools*. A loop can still emit a normalized PRD and
  feature map as intermediate files the user edits. We keep the benefit without the
  rigid pipeline.

---

## 5. Decisions (final)

### Discard (and why)

- **The 5-stage rigid pipeline as the product shape.** It's a workflow for an
  open-ended task; it imposes orchestration on the host and fights adaptive
  context retrieval — the very thing the scaffold research says drives quality.
  *Keep the staged **outputs** (PRD, map, cases) as artifacts; drop the staged
  **tools**.*
- **BYOK / provider abstraction / any model call in our process.** Retired by the
  2026-06-14 decision. The host already has a frontier model; a second call is
  redundant cost + a second key + often weaker. This supersedes the BYOK principle
  in `docs/v1-mvp.md` and Workstream #4 in the checkpoint.
- **An owned agent loop (Option B).** Rejected — we are not building an agent.
- **`analyze_feature` and `generate_test_cases` as model-calling tools.** With no
  model in our process they cannot reason. **Generation moves to the host model,**
  steered by our QA methodology delivered as **MCP prompts / structured
  instructions + the schema to fill.** These become prompts, not reasoning tools.
- **The deterministic framework-detection registry as the primary context
  mechanism.** Brittle, layout-sensitive, infinite maintenance, and strictly worse
  than letting the host explore. *Keep the safety primitives; demote the scanner to
  an optional evidence tool; retire the registry as the context source.*
- **Five fine-grained must-sequence tools + large JSON handoffs.** Collapse to a
  small set: a deterministic critic, an artifact writer, and (optional) an evidence
  scan. Fewer, coarser units is the market lesson.
- **Dead `api` / `web` / `db` / `ui` / `packages/api` scaffolds in the active
  tree.** Pure drag (maintenance, dependabot, CI scoping) with zero V1 value.
  Quarantine to `future/` (or a branch); recover from git when a real surface is
  needed.
- **Investing further in scanner breadth.** Freeze it.

### Accept / keep (and why)

- **Deterministic, no-model MCP server (the chosen shape).** Methodology + critic +
  safe I/O. Simple, no key, "boring and useful."
- **The deterministic critic (`review_test_cases`) as the centerpiece and the
  moat.** In code: quality-bar coverage check, duplicate/near-duplicate detection,
  acceptance-criteria coverage mapping, weak-assertion and missing-precondition
  flags. This is the one thing a plain prompt cannot replicate, it needs no model,
  and it directly delivers the v1 success criterion ("fewer duplicate/low-value
  cases than raw LLM output"). **If the critic is weak, we are just a schema — so
  critic quality is the make-or-break of the whole product.**
- **The QA quality-bar checklist** (`v1-mvp.md`) as a **dual-use asset**: it is
  both the host-facing methodology prompt *and* the critic's rule set.
- **The domain schemas (`packages/core`) + a real artifact writer.** Now even more
  central: the schema is the contract the host fills and the critic checks. Make
  the writer real (atomic, confined, JSON + Markdown).
- **The safe-filesystem primitives from `repo-scan`** (confinement, secret
  exclusion, byte/file caps) — kept; the scanner survives as an *optional* evidence
  tool, no longer the centerpiece.
- **MCP as the product surface.** This is now the definition, not one option among
  several. (A thin CLI wrapper for running evals is fine, but MCP is the product.)
- **A model-free eval harness.** Golden fixtures of `(test cases, criteria) →
  expected findings`. Because the critic is deterministic, evals need no model and
  can run in CI. This lands early, not last.
- **Local-first, repo-portable artifacts.**

### What stays exactly as-is
Tooling (pnpm, turbo, biome, husky, commitlint), the CI gate, Zod everywhere, and
the local-first principle. None of these are the problem.

---

## 6. Target architecture (chosen)

A deterministic, no-model MCP server. There is **no loop and no model** in our
process — the host coding agent supplies both.

### Responsibilities split

| Concern | Owner |
| --- | --- |
| Explore the repo, read code, gather context | **Host** (it already has read/grep/glob/bash) |
| Generate the normalized PRD, feature map, test cases | **Host model**, steered by our methodology + schema |
| Encode QA methodology (the quality bar) | **Us** — MCP prompts / structured instructions |
| Critique a draft: coverage, duplicates, weak assertions | **Us** — deterministic code (`review_test_cases`) |
| Persist artifacts (JSON + Markdown, atomic, confined) | **Us** — `export_test_cases` (real writer) |
| Optional repo evidence summary | **Us** — `scan_repo` (demoted, optional) |

### Package shape

```
packages/
  core/        domain schemas + artifact contract               (keep — now central)
  methodology/ QA quality-bar as host-facing prompts/instructions (new; reuses v1-mvp checklist)
  critic/      deterministic review: coverage, dedup, gaps        (new — the centerpiece/moat)
  repo-safe/   safety primitives salvaged from repo-scan          (slim refactor of repo-scan)
  artifacts/   real atomic, confined JSON + Markdown writers       (finish)
  evals/       golden (cases,criteria) -> expected findings        (new; model-free; lands early)
apps/
  mcp/         the product: prompts + critic + writer + opt. scan  (collapse from 5 stub tools)
future/        api, web, db, ui — quarantined until needed         (move out of V1)
```

### Flow (conceptual)

```
host model  --(reads repo, our methodology prompt + schema)-->  draft test cases
host model  --(calls our MCP tool)-->  review_test_cases(cases, criteria)
our critic  --(deterministic)-->  findings: uncovered quality-bar categories,
                                  duplicates, weak assertions, missing preconditions
host model  --(fixes per findings)-->  revised cases
host model  --(calls our MCP tool)-->  export_test_cases  ->  .test-framework/*.json|md
```

The intelligence in that loop is the **host's**. Our leverage on output quality is
exactly two things: the **methodology we inject** and the **rigor of the critic**.
That is the entire moat — keep it sharp.

---

## 7. What this means for the other docs

This decision supersedes parts of the existing specs. Follow-up edits required:

- **`docs/v1-mvp.md`** — remove/retire the **BYOK** section and "we manage
  prompt/task orchestration [that calls models]". Reframe the five MCP tools:
  generation (`analyze_feature`, `generate_test_cases`) becomes host-driven via our
  methodology prompts; `review_test_cases` becomes the deterministic centerpiece;
  `export_test_cases` becomes a real writer; `map_feature`/scan becomes optional.
- **`docs/v1-checkpoint.md`** — rewrite the execution order. The old #4 "BYOK
  Provider and Real Analysis" is deleted. New order (roughly):
  1. Domain schema/artifact contract finalize (mostly done).
  2. **Deterministic critic** + model-free eval harness. ← new core / next milestone.
  3. QA methodology prompts (MCP `prompts`).
  4. Real artifact writer (atomic, confined).
  5. Collapse the MCP tool surface; demote the scanner.
  6. End-to-end: real host (Claude Code) → methodology → draft → critic → export.
- **`README.md`** — update the tool list and the "no model key required" framing
  (now permanent, not a temporary stub property).
- **Repo structure** — quarantine `apps/{api,web}`, `packages/{db,ui,api}` to
  `future/` and narrow the workspace/CI to the live surface.

These are consequential edits to canonical specs and a structural move, so they are
listed here and will be made on confirmation rather than silently.

---

## 8. Key risk to watch

The whole product now rests on the **critic**. A weak critic (one that only
restates schema validation) leaves us indistinguishable from "a schema + a prompt."
The bar: the critic must catch concrete QA gaps a competent host model *misses on
its own* — uncovered quality-bar categories, semantic duplicates, assertion
weakness — and it must be proven by golden evals before we claim the v1 quality
bar. Treat critic precision/recall as the product's primary metric.
