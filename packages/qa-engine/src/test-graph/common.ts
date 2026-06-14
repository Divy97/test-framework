import { z } from "zod";
import { evidenceIdSchema } from "./ids.js";

/**
 * A JSON value: the closed set of things that survive a JSON round-trip. We
 * reject `undefined`, functions, `NaN`, and `Infinity` because none of them are
 * representable, so they must never silently enter a durable graph.
 */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

/** RFC3339 timestamp; an explicit `Z` or numeric offset is required. */
export const rfc3339Schema = z.iso.datetime({ offset: true });

export const prioritySchema = z.enum(["p0", "p1", "p2", "p3"]);
export type Priority = z.infer<typeof prioritySchema>;

export const riskSchema = z.enum(["low", "medium", "high"]);
export type Risk = z.infer<typeof riskSchema>;

export const planStatusSchema = z.enum(["draft", "complete", "incomplete"]);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export const qualityTagSchema = z.enum([
	"functional",
	"security",
	"performance",
	"accessibility",
	"usability",
	"reliability",
	"compatibility",
	"data-integrity",
	"observability",
	"localization",
]);
export type QualityTag = z.infer<typeof qualityTagSchema>;

export const httpMethodSchema = z.enum([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
]);
export type HttpMethod = z.infer<typeof httpMethodSchema>;

/**
 * Every graph entity kind that can be referenced by another entity or named in
 * a finding. Kept aligned with the ID prefix kinds.
 */
export const graphEntityKindSchema = z.enum([
	"project",
	"plan",
	"source",
	"evidence",
	"requirement",
	"feature",
	"testCase",
	"step",
	"assertion",
	"dataRequirement",
	"openQuestion",
	"generation",
]);
export type GraphEntityKind = z.infer<typeof graphEntityKindSchema>;

/**
 * A typed pointer to one graph entity. The `id` is structurally a string here;
 * the validator resolves it against the live graph and reports dangling or
 * kind-mismatched references deterministically.
 */
export const graphEntityRefSchema = z
	.object({
		kind: graphEntityKindSchema,
		id: z.string().min(1),
	})
	.strict();
export type GraphEntityRef = z.infer<typeof graphEntityRefSchema>;

/**
 * Provenance classifies a claim and is structurally validated here. Content
 * rules that need the whole graph (explicit must cite a supplied source,
 * inferred must carry evidence or rationale) are enforced by the validator.
 */
export const provenanceSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("explicit"),
			evidenceIds: z.array(evidenceIdSchema),
			rationale: z.string().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("inferred"),
			evidenceIds: z.array(evidenceIdSchema),
			rationale: z.string().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("assumption"),
			evidenceIds: z.array(evidenceIdSchema),
			rationale: z.string().min(1),
		})
		.strict(),
]);
export type Provenance = z.infer<typeof provenanceSchema>;
