import { z } from "zod";

/**
 * Provider configuration. There is deliberately NO `apiKey` field: a raw key in
 * config is a schema rejection. The key is referenced by `keySource` and
 * resolved at call time (see `resolve-config.ts`). `.strict()` everywhere so a
 * stray `apiKey` (or any typo) fails loudly instead of being silently ignored.
 */

export const keySourceSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("env"), var: z.string().min(1) }).strict(),
	// future: { kind: "file" }, { kind: "command" } — not resolved in V1.
]);
export type KeySource = z.infer<typeof keySourceSchema>;

export const providerDefaultsSchema = z
	.object({
		maxOutputTokens: z.number().int().positive().optional(),
		timeoutMs: z.number().int().positive().optional(),
		temperature: z.number().min(0).optional(),
	})
	.strict();
export type ProviderDefaults = z.infer<typeof providerDefaultsSchema>;

/**
 * Providers that authenticate via a BYOK API key referenced by `keySource`.
 * `claude-cli` is deliberately excluded: it drives the local `claude` CLI under
 * the user's Claude Code subscription, so it carries NO key at all.
 */
const KEYED_PROVIDERS = ["anthropic", "openrouter"] as const;

export const providerConfigSchema = z
	.object({
		provider: z.enum(["anthropic", "openrouter", "claude-cli"]),
		model: z.string().min(1),
		// Optional at the field level; the refinement below makes it REQUIRED for
		// keyed providers and FORBIDDEN for `claude-cli` (no key, by design).
		keySource: keySourceSchema.optional(),
		baseUrl: z.url().optional(),
		defaults: providerDefaultsSchema.optional(),
	})
	.strict()
	.refine(
		(c) =>
			(KEYED_PROVIDERS as readonly string[]).includes(c.provider)
				? c.keySource !== undefined
				: c.keySource === undefined,
		{
			error: (issue) =>
				(KEYED_PROVIDERS as readonly string[]).includes(
					(issue.input as { provider?: string }).provider ?? "",
				)
					? "keySource is required for this provider"
					: "claude-cli takes no keySource (it uses the local Claude Code subscription)",
			path: ["keySource"],
		},
	);
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
