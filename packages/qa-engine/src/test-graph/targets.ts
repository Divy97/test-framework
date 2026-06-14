import { z } from "zod";
import { httpMethodSchema } from "./common.js";

/**
 * Behavioral target of a feature, case, or assertion observation point.
 * Targets describe *what surface* is exercised, never a concrete runner locator,
 * so the model survives a future execution engine without a rewrite.
 */
const targetUnionSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("ui"),
			route: z.string().min(1).optional(),
			component: z.string().min(1).optional(),
			selector: z.string().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("api"),
			method: httpMethodSchema,
			path: z.string().min(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal("integration"),
			system: z.string().min(1),
			operation: z.string().min(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal("generic"),
			description: z.string().min(1),
		})
		.strict(),
]);

export const targetSchema = targetUnionSchema.superRefine((value, ctx) => {
	if (
		value.kind === "ui" &&
		value.route === undefined &&
		value.component === undefined &&
		value.selector === undefined
	) {
		ctx.addIssue({
			code: "custom",
			message:
				"ui target requires at least one of route, component, or selector.",
		});
	}
});
export type Target = z.infer<typeof targetSchema>;
