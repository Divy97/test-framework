---
status: accepted
---

# Ship planning-first V1 with an execution-ready graph

V1 ships high-quality test planning and excludes released test execution. We
reject bundling safe API or browser execution into V1 because sandboxing,
credentials, cleanup, dependency ordering, and liability would multiply solo
delivery time. Cases still include structured targets, data, actions, assertions,
and cleanup intent so V2 can compile them instead of redesigning the model.

## Consequences

- A disposable one-day execution spike de-risks evidence capture before V1
  planning polish.
- Comparative generation evals are the V1 release gate and differentiation.
- V2 execution is a committed extension of the graph, not an optional rewrite.
