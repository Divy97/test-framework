---
status: accepted
---

# Keep workflow stages internal

Requirement normalization, repo contextualization, feature mapping, case
generation, semantic review, deterministic validation, repair, and persistence
remain useful stages inside one QA engine. We reject exposing them as five or more
must-sequence MCP tools because that leaks orchestration, sends large intermediate
objects through the host, and makes callers responsible for engine correctness.

## Consequences

- Public adapters expose coarse operations such as `create_test_plan` and
  `refine_test_plan`.
- Intermediate artifacts remain inspectable in the persisted test graph.
- Internal stages may evolve without breaking MCP clients.
