---
status: accepted
---

# Defer cloud and use a local modular monolith

V1 runs locally as a modular monolith with a thin MCP adapter, deep QA engine,
and independent safe repo scanner. We reject building cloud control-plane,
worker, database, billing, dashboard, or microservice architecture before managed
execution or collaboration requires them. Empty scaffolding is not readiness.

## Consequences

- Cloud arrives with V3 managed execution and team workflows.
- Internal roles guide code locality but do not force one package per role.
- Infrastructure choices for V3 remain deferred until usage provides constraints.
