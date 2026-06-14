import { z } from "zod";
import { jsonValueSchema, provenanceSchema } from "./common.js";
import { assertionIdSchema, stepIdSchema, testCaseIdSchema } from "./ids.js";
import { targetSchema } from "./targets.js";

const ALLOWED_REGEX_FLAGS = ["d", "g", "i", "m", "s", "u", "v", "y"] as const;

const regexFlagsSchema = z.string().refine(
	(flags) => {
		const allowed = new Set<string>(ALLOWED_REGEX_FLAGS);
		const seen = new Set<string>();
		for (const flag of flags) {
			if (!allowed.has(flag) || seen.has(flag)) {
				return false;
			}
			seen.add(flag);
		}
		return true;
	},
	{ message: "regex flags must be unique and within d, g, i, m, s, u, v, y." },
);

/**
 * Fields shared by every assertion regardless of matcher. Spread into each
 * matcher member so the discriminated union stays the single source of truth
 * for matcher-specific expected values.
 */
const assertionBaseShape = {
	id: assertionIdSchema,
	testCaseId: testCaseIdSchema,
	stepId: stepIdSchema.optional(),
	provenance: provenanceSchema,
	subject: z.string().min(1),
	observationPoint: targetSchema,
	note: z.string().min(1).optional(),
} as const;

const finiteNumberSchema = z.number();

/**
 * Closed assertion matcher union. Every matcher constrains its own `expected`
 * shape; presence matchers carry no `expected` at all. Arbitrary matcher
 * strings are intentionally impossible in V1.
 */
export const assertionSchema = z.discriminatedUnion("matcher", [
	z
		.object({ ...assertionBaseShape, matcher: z.literal("equals"), expected: jsonValueSchema })
		.strict(),
	z
		.object({ ...assertionBaseShape, matcher: z.literal("notEquals"), expected: jsonValueSchema })
		.strict(),
	z
		.object({ ...assertionBaseShape, matcher: z.literal("contains"), expected: jsonValueSchema })
		.strict(),
	z
		.object({ ...assertionBaseShape, matcher: z.literal("notContains"), expected: jsonValueSchema })
		.strict(),
	z
		.object({ ...assertionBaseShape, matcher: z.literal("greaterThan"), expected: finiteNumberSchema })
		.strict(),
	z
		.object({ ...assertionBaseShape, matcher: z.literal("greaterThanOrEqual"), expected: finiteNumberSchema })
		.strict(),
	z
		.object({ ...assertionBaseShape, matcher: z.literal("lessThan"), expected: finiteNumberSchema })
		.strict(),
	z
		.object({ ...assertionBaseShape, matcher: z.literal("lessThanOrEqual"), expected: finiteNumberSchema })
		.strict(),
	z
		.object({
			...assertionBaseShape,
			matcher: z.literal("matches"),
			pattern: z.string().min(1),
			flags: regexFlagsSchema.optional(),
		})
		.strict(),
	z
		.object({
			...assertionBaseShape,
			matcher: z.enum([
				"exists",
				"notExists",
				"visible",
				"hidden",
				"enabled",
				"disabled",
			]),
		})
		.strict(),
	z
		.object({
			...assertionBaseShape,
			matcher: z.literal("statusCode"),
			expected: z.number().int().min(100).max(599),
		})
		.strict(),
	z
		.object({
			...assertionBaseShape,
			matcher: z.literal("count"),
			expected: z.number().int().nonnegative(),
		})
		.strict(),
	z
		.object({
			...assertionBaseShape,
			matcher: z.literal("conformsToSchema"),
			schemaRef: z.string().min(1),
		})
		.strict(),
]);
export type Assertion = z.infer<typeof assertionSchema>;
