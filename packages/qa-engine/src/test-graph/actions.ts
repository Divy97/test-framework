import { z } from "zod";
import { httpMethodSchema, jsonValueSchema } from "./common.js";

/**
 * The structured action a step performs. Like targets, actions are behavioral
 * intent (navigate, interact, request, invoke, wait, observe), not generated
 * runner code, so V2 can compile them rather than reinterpret prose.
 */
export const actionSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("navigate"),
			route: z.string().min(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal("interact"),
			operation: z.enum([
				"click",
				"fill",
				"select",
				"upload",
				"submit",
				"keypress",
			]),
			selector: z.string().min(1),
			value: jsonValueSchema.optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("request"),
			method: httpMethodSchema,
			path: z.string().min(1),
			headers: z.record(z.string(), z.string()).optional(),
			body: jsonValueSchema.optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("invoke"),
			system: z.string().min(1),
			operation: z.string().min(1),
			input: jsonValueSchema.optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("wait"),
			condition: z.string().min(1),
			timeoutMs: z.number().int().positive().optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("observe"),
			subject: z.string().min(1),
		})
		.strict(),
]);
export type Action = z.infer<typeof actionSchema>;
