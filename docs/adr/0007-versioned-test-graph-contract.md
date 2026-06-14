---
status: accepted
---

# Adopt a versioned, deterministic Test Graph contract

The `qa-engine` package owns the canonical Test Graph. `Project` is a separate
aggregate; a plan references its `projectId` but never embeds a mutable project
snapshot. Each immutable `Plan` revision is one normalized, plan-scoped graph
that keeps its `planId` and advances `planVersion` by exactly one per revision.
Entity IDs are scoped deterministic hashes over kind, scope, and a caller-supplied
semantic key, never recomputed from editable prose. V1 links are typed IDs in
top-level node arrays; setup and producer-to-consumer dependencies must be a DAG.
JSON is canonical and Markdown is derived. Schema migration is explicit,
adjacent-only upgrade that validates every hop and rejects downgrades and unknown
future versions. Compatibility packages (`core`, `planner`, `artifacts`) and the
current MCP contract stay unchanged in this checkpoint.

We reject: embedding a mutable project snapshot in the plan; random-only IDs;
IDs derived from editable prose; cascade deletion in the schema library;
arbitrary assertion matcher strings; implicit best-effort migration; building the
graph in `core` and relocating it later; and deleting the old packages now.

## Consequences

- Refinement preserves identity and provenance, so V2 execution consumes the
  graph instead of redesigning it.
- Deterministic validation, canonical JSON, and derived Markdown make plan
  revisions diffable and reviewable.
- The migration framework ships only the V1 identity path; no invented V0
  conversion exists, and fake version chains stay test-only.
- Package consolidation is deferred: the canonical owner exists now, and removing
  the compatibility packages is a later engine milestone.
