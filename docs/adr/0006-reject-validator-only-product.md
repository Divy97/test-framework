---
status: accepted
---

# Reject a deterministic-validator-only product

We reject reducing V1 to a Skill, schema, prompt, or deterministic critic driven
entirely by the host model. Deterministic code can validate IDs, links, structure,
and declared coverage, but cannot reliably judge semantic duplicates, missing
behavior, or scenario quality. Those require owned model reasoning and comparative
evals.

## Consequences

- Deterministic validation and semantic review coexist.
- The moat is the QA methodology, workflow, test graph, eval corpus, and eventual
  execution evidence loop, not one critic function.
- Skills may improve discovery and onboarding later, but remain adapters.
