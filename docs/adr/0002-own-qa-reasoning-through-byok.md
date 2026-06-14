---
status: accepted
---

# Own QA reasoning through BYOK

V1 calls a user-selected model with the user's key through provider adapters. We
reject host-model-only generation because its context, prompts, model, and output
cannot be controlled or evaluated consistently enough to support our quality
claim. BYOK lets us own and measure the workflow without funding inference or
building hosted model infrastructure.

## Consequences

- Provider keys stay local and never enter artifacts.
- Semantic review is model-based; deterministic validation enforces objective
  invariants around it.
- Host-assisted generation may be added later, but cannot be the only quality
  path while verification intelligence is the product claim.
