---
status: accepted
---

# Verification intelligence is the product

The product is the ability to understand intended behavior, plan meaningful
verification, and eventually produce evidence-backed verdicts. MCP, CLI, Skill,
web, and cloud are adapters or deployment surfaces. We reject defining the
product around any one host or protocol because that would make specialized QA
reasoning and the durable test graph secondary to integration mechanics.

## Consequences

- MCP is the first adapter, not the domain owner.
- The QA engine must be callable from future CLI, CI, and hosted APIs.
- Product quality is measured through plans and verification evidence, not tool
  count or integration breadth.
