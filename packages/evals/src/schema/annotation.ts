import {
	assertionIdSchema,
	requirementIdSchema,
	sourceIdSchema,
	testCaseIdSchema,
} from "@test-framework/qa-engine";
import { z } from "zod";
import {
	armSchema,
	evalSchemaVersionSchema,
	recordKindSchema,
	requirementTruthKeySchema,
	scenarioTruthKeySchema,
} from "./common.js";

const satisfactionSchema = z.enum(["full", "partial"]);
export type Satisfaction = z.infer<typeof satisfactionSchema>;

/** How an `extra` (non-truth) Candidate claim is judged. */
export const extraClassificationSchema = z.enum([
	"supported-inferred",
	"unsupported-invented",
	"contradicts-truth",
]);
export type ExtraClassification = z.infer<typeof extraClassificationSchema>;

const mapsRequirementSchema = z
	.object({
		requirementId: requirementIdSchema,
		verdict: z.literal("maps"),
		truthKeys: z.array(requirementTruthKeySchema).min(1),
		satisfaction: satisfactionSchema,
		reason: z.string().min(1).optional(),
		supportsCitedEvidence: z.boolean().optional(),
	})
	.strict();

const extraRequirementSchema = z
	.object({
		requirementId: requirementIdSchema,
		verdict: z.literal("extra"),
		classification: extraClassificationSchema,
		reason: z.string().min(1),
		supportsCitedEvidence: z.boolean().optional(),
	})
	.strict();

export const requirementAnnotationSchema = z
	.discriminatedUnion("verdict", [
		mapsRequirementSchema,
		extraRequirementSchema,
	])
	.superRefine((annotation, ctx) => {
		if (
			annotation.verdict === "maps" &&
			annotation.satisfaction === "partial" &&
			annotation.reason === undefined
		) {
			ctx.addIssue({
				code: "custom",
				path: ["reason"],
				message: "partial satisfaction requires a reason.",
			});
		}
	});
export type RequirementAnnotation = z.infer<typeof requirementAnnotationSchema>;

const mapsCaseSchema = z
	.object({
		caseId: testCaseIdSchema,
		verdict: z.literal("maps"),
		truthKeys: z.array(scenarioTruthKeySchema).min(1),
		satisfaction: satisfactionSchema,
		reason: z.string().min(1).optional(),
		supportsCitedEvidence: z.boolean().optional(),
	})
	.strict();

const extraCaseSchema = z
	.object({
		caseId: testCaseIdSchema,
		verdict: z.literal("extra"),
		classification: extraClassificationSchema,
		reason: z.string().min(1),
		supportsCitedEvidence: z.boolean().optional(),
	})
	.strict();

export const caseAnnotationSchema = z
	.discriminatedUnion("verdict", [mapsCaseSchema, extraCaseSchema])
	.superRefine((annotation, ctx) => {
		if (
			annotation.verdict === "maps" &&
			annotation.satisfaction === "partial" &&
			annotation.reason === undefined
		) {
			ctx.addIssue({
				code: "custom",
				path: ["reason"],
				message: "partial satisfaction requires a reason.",
			});
		}
	});
export type CaseAnnotation = z.infer<typeof caseAnnotationSchema>;

export const assertionAnnotationSchema = z
	.object({
		assertionId: assertionIdSchema,
		supportsCitedEvidence: z.boolean(),
		reason: z.string().min(1).optional(),
	})
	.strict();
export type AssertionAnnotation = z.infer<typeof assertionAnnotationSchema>;

export const sourceAnnotationSchema = z
	.object({
		sourceId: sourceIdSchema,
		sourceKey: z.string().min(1),
	})
	.strict();
export type SourceAnnotation = z.infer<typeof sourceAnnotationSchema>;

/**
 * The reviewed mapping from a Candidate's entities to Ground Truth. It is the only
 * human judgment scoring consumes; the join over it is fully deterministic.
 */
export const annotationSchema = z
	.object({
		evalSchemaVersion: evalSchemaVersionSchema,
		fixtureId: z.string().regex(/^[a-z0-9-]+$/),
		arm: armSchema,
		recordKind: recordKindSchema,
		expectValidationFailure: z.boolean(),
		sourceAnnotations: z.array(sourceAnnotationSchema),
		requirementAnnotations: z.array(requirementAnnotationSchema),
		caseAnnotations: z.array(caseAnnotationSchema),
		assertionAnnotations: z.array(assertionAnnotationSchema).optional(),
	})
	.strict();
export type Annotation = z.infer<typeof annotationSchema>;
