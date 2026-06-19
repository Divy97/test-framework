---
status: accepted
---

# Provider modes: BYOK core plus a host-model on-ramp

The QA Engine owns its verification workflow and reaches a model through the
provider-neutral seam ([ADR-0010](0010-byok-provider-seam.md)). This decision
records *which model transports* that seam offers and why, refining
[ADR-0002 (own QA reasoning through BYOK)](0002-own-qa-reasoning-through-byok.md)
in light of how the product is actually invoked: users run the MCP server *inside*
a coding agent they already pay for (Claude Code, Codex, opencode, Cursor). Asking
them for a second API key and a second bill, while a capable model sits right
there in the host, is real adoption friction.

The benefit BYOK buys is **control**, and control is what makes the product more
than a prompt: the engine fixes the prompts, methodology version, structured-output
channel, deterministic validation, and bounded repair, so quality does not swing
with the host — and the moat ("measurably better than the same model with a raw
prompt", [ADR-0006](0006-reject-validator-only-product.md)) is only *provable*
when the engine controls both arms of the comparison
([ADR-0009](0009-reference-based-deterministic-eval.md)). BYOK is also
host-agnostic: it works even where the host exposes no usable model. None of that
depends on *where the tokens come from* — only on the engine owning the workflow.

**Decision.** Keep BYOK as the V1 core and documented default, and treat
"use the model the user already has" as **additional adapters behind the same
`ModelProvider` seam**, not a replacement. Three transports, one engine:

1. **BYOK key** (V1, default) — a provider key (Anthropic, OpenRouter, …). Full
   control; the user supplies and pays for the key. The path the evals are recorded
   under.
2. **Local agent CLI** (V1, realized here) — the engine shells out to an installed
   coding-agent CLI (the `claude` binary first) as a keyless `RawProvider`. Zero
   API key, zero per-call API cost (it rides the user's existing Claude Code
   subscription). The invocation is isolated from the host project's MCP/hooks/tools
   so it is a pure completion, not a nested agent. This is the friction-killer for
   users who are already inside Claude Code.
3. **MCP host sampling** (V2) — `sampling/createMessage`, letting any MCP host run
   the completion with its own model. Architecturally the purest "use the agent
   you're in", but host support is inconsistent, so it is deferred and labeled.

The engine is unchanged by any of these: each is a new adapter plus a capability
declaration. The only thing a host-model transport cedes versus BYOK is the
specific model weights — which were the user's choice anyway — while the owned
workflow, structured-output validation, and repair (and therefore the quality bar)
stay with the engine.

We reject: replacing BYOK with sampling-only (loses host-agnostic compatibility —
many hosts do not implement sampling — and couples quality to each host's sampling
implementation); a thin host-prompt wrapper that delegates the reasoning and keeps
only validation (the validator-only product [ADR-0006](0006-reject-validator-only-product.md)
already rejected); and treating model choice as the product (the workflow is the
product, [ADR-0001](0001-verification-intelligence-is-the-product.md)).

## Consequences

- The provider seam ([ADR-0010](0010-byok-provider-seam.md)) already makes this
  additive: the `claude-cli` adapter is the first host-model provider and required
  no engine change — only a config-provider variant (no `keySource`) and a factory
  case.
- Model guidance for users: bring any model with solid structured-output support
  (Claude, GPT, Gemini, and most OpenRouter models), or point the tool at your local
  Claude Code for free. Reasoning models are fully supported — the engine drives
  Claude (a reasoning model) today.
- Known per-model quirk to document, not a framework limit: `moonshotai/kimi-k2.5`
  via OpenRouter returns an empty message under a forced function tool call, and its
  `response_format` only held on trivial schemas — so it cannot drive the engine's
  union-bearing stage schemas. This is why the recorded eval baseline and the live
  repository runs are taken under a controlled, structured-output-reliable model.
- CI stays keyless and hermetic: the live BYOK test is `RUN_LIVE_PROVIDER`-gated and
  the CLI smoke test skips when the `claude` binary or its gate is absent. No model
  call gates anything ([ADR-0009](0009-reference-based-deterministic-eval.md)).
- The eval moat is unaffected: baselines are recorded under a controlled model, and
  the gate scores committed bytes regardless of which transport produced them.
- V2: an MCP sampling provider for hosts that support it, and additional agent-CLI
  adapters (Codex, opencode) behind the same interface.
