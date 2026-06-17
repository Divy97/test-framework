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

export const providerConfigSchema = z
	.object({
		provider: z.enum(["anthropic", "fake"]),
		model: z.string().min(1),
		keySource: keySourceSchema,
		baseUrl: z.url().optional(),
		defaults: providerDefaultsSchema.optional(),
	})
	.strict();
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
