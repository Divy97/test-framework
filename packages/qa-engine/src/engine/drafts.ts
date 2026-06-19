import { z } from "zod";
import { actionSchema } from "../test-graph/actions.js";
import {
	jsonValueSchema,
	prioritySchema,
	qualityTagSchema,
	riskSchema,
} from "../test-graph/common.js";
import {
	requirementKindSchema,
	testCaseTypeSchema,
} from "../test-graph/schema.js";
import { targetSchema } from "../test-graph/targets.js";

/**
 * Per-stage draft schemas. The model emits content plus stable semantic *keys*
 * (slugs) and never IDs; the engine assigns every ID and resolves cross-stage
 * references by key (ADR design, see test-graph/ids.ts). Each schema is the
 * structured-output contract for one model call; the seam validates against it.
 */

const keySchema = z.string().min(1);

/** Provenance the model declares; evidence is referenced by key, resolved later. */
export const provenanceDraftSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("explicit"),
			evidenceKeys: z.array(keySchema),
			rationale: z.string().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("inferred"),
			evidenceKeys: z.array(keySchema),
			rationale: z.string().min(1).optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("assumption"),
			evidenceKeys: z.array(keySchema),
			rationale: z.string().min(1),
		})
		.strict(),
]);
export type ProvenanceDraft = z.infer<typeof provenanceDraftSchema>;

export const evidenceDraftSchema = z
	.object({
		key: keySchema,
		sourceKey: keySchema,
		kind: z.enum([
			"statement",
			"quote",
			"code",
			"api-contract",
			"diff",
			"repository-signal",
		]),
		claim: z.string().min(1),
		excerpt: z.string().min(1).optional(),
	})
	.strict();
export type EvidenceDraft = z.infer<typeof evidenceDraftSchema>;

export const openQuestionDraftSchema = z
	.object({
		key: keySchema,
		question: z.string().min(1),
		status: z.enum(["open", "answered"]),
		blocking: z.boolean(),
		answer: z.string().min(1).optional(),
		provenance: provenanceDraftSchema,
	})
	.strict();
export type OpenQuestionDraft = z.infer<typeof openQuestionDraftSchema>;

export const requirementDraftSchema = z
	.object({
		key: keySchema,
		statement: z.string().min(1),
		kind: requirementKindSchema,
		provenance: provenanceDraftSchema,
		priority: prioritySchema,
		risk: riskSchema,
		openQuestionKeys: z.array(keySchema),
	})
	.strict();
export type RequirementDraft = z.infer<typeof requirementDraftSchema>;

export const featureDraftSchema = z
	.object({
		key: keySchema,
		name: z.string().min(1),
		description: z.string().min(1),
		parentKey: keySchema.optional(),
		requirementKeys: z.array(keySchema),
		targets: z.array(targetSchema),
		provenance: provenanceDraftSchema,
		risk: riskSchema,
	})
	.strict();
export type FeatureDraft = z.infer<typeof featureDraftSchema>;

const actorSchema = z
	.object({
		role: z.string().min(1),
		authentication: z.enum([
			"anonymous",
			"authenticated",
			"expired",
			"not-applicable",
		]),
		permissions: z.array(z.string().min(1)),
	})
	.strict();

const preconditionSchema = z
	.object({
		description: z.string().min(1),
		requiredState: jsonValueSchema.optional(),
	})
	.strict();

const postconditionSchema = z
	.object({
		description: z.string().min(1),
		expectedState: jsonValueSchema.optional(),
	})
	.strict();

const automationSchema = z
	.object({
		readiness: z.enum(["ready", "partial", "blocked"]),
		blockers: z.array(z.string().min(1)),
	})
	.strict();

const cleanupDraftSchema = z
	.object({
		intent: z.enum(["none", "restore", "delete", "reset", "external"]),
		dataKeys: z.array(keySchema),
		afterCaseKeys: z.array(keySchema),
		instructions: z.string().min(1).optional(),
	})
	.strict();

export const testCaseDraftSchema = z
	.object({
		key: keySchema,
		title: z.string().min(1),
		objective: z.string().min(1),
		type: testCaseTypeSchema,
		priority: prioritySchema,
		risk: riskSchema,
		riskRationale: z.string().min(1),
		provenance: provenanceDraftSchema,
		requirementKeys: z.array(keySchema),
		featureKeys: z.array(keySchema),
		qualityTags: z.array(qualityTagSchema),
		actor: actorSchema,
		target: targetSchema,
		preconditions: z.array(preconditionSchema),
		dependsOnCaseKeys: z.array(keySchema),
		consumesDataKeys: z.array(keySchema),
		producesDataKeys: z.array(keySchema),
		postconditions: z.array(postconditionSchema),
		cleanup: cleanupDraftSchema,
		automation: automationSchema,
	})
	.strict();
export type TestCaseDraft = z.infer<typeof testCaseDraftSchema>;

export const dataRequirementDraftSchema = z
	.object({
		key: keySchema,
		name: z.string().min(1),
		description: z.string().min(1),
		kind: z.enum([
			"record",
			"account",
			"file",
			"configuration",
			"credential",
			"dataset",
		]),
		provisioning: z.enum([
			"existing",
			"generated",
			"external",
			"case-produced",
		]),
		sensitivity: z.enum(["none", "internal", "pii", "secret", "financial"]),
		provenance: provenanceDraftSchema,
		requiredState: jsonValueSchema.optional(),
	})
	.strict();
export type DataRequirementDraft = z.infer<typeof dataRequirementDraftSchema>;

export const stepDraftSchema = z
	.object({
		key: keySchema,
		caseKey: keySchema,
		order: z.number().int().positive(),
		description: z.string().min(1),
		action: actionSchema,
		provenance: provenanceDraftSchema,
	})
	.strict();
export type StepDraft = z.infer<typeof stepDraftSchema>;

// ponytail: loose assertion draft — the final assertionSchema (run inside
// validateTestGraph) is the real gate on matcher/payload agreement, so we accept
// a matcher + optional payload here instead of re-encoding all 13 union members.
// A bad matcher payload surfaces as MALFORMED_ASSERTION and routes to repair.
export const assertionDraftSchema = z
	.object({
		key: keySchema,
		caseKey: keySchema,
		stepKey: keySchema.optional(),
		provenance: provenanceDraftSchema,
		subject: z.string().min(1),
		observationPoint: targetSchema,
		note: z.string().min(1).optional(),
		matcher: z.enum([
			"equals",
			"notEquals",
			"contains",
			"notContains",
			"greaterThan",
			"greaterThanOrEqual",
			"lessThan",
			"lessThanOrEqual",
			"matches",
			"exists",
			"notExists",
			"visible",
			"hidden",
			"enabled",
			"disabled",
			"statusCode",
			"count",
			"conformsToSchema",
		]),
		expected: jsonValueSchema.optional(),
		pattern: z.string().min(1).optional(),
		flags: z.string().min(1).optional(),
		schemaRef: z.string().min(1).optional(),
	})
	.strict();
export type AssertionDraft = z.infer<typeof assertionDraftSchema>;

// --- Per-stage structured-output contracts -------------------------------

export const evidenceStageSchema = z
	.object({ evidence: z.array(evidenceDraftSchema) })
	.strict();
export type EvidenceStage = z.infer<typeof evidenceStageSchema>;

export const requirementsStageSchema = z
	.object({
		requirements: z.array(requirementDraftSchema),
		openQuestions: z.array(openQuestionDraftSchema),
	})
	.strict();
export type RequirementsStage = z.infer<typeof requirementsStageSchema>;

export const featuresStageSchema = z
	.object({ features: z.array(featureDraftSchema) })
	.strict();
export type FeaturesStage = z.infer<typeof featuresStageSchema>;

export const casesStageSchema = z
	.object({ testCases: z.array(testCaseDraftSchema) })
	.strict();
export type CasesStage = z.infer<typeof casesStageSchema>;

export const detailsStageSchema = z
	.object({
		dataRequirements: z.array(dataRequirementDraftSchema),
		steps: z.array(stepDraftSchema),
		assertions: z.array(assertionDraftSchema),
	})
	.strict();
export type DetailsStage = z.infer<typeof detailsStageSchema>;

export const reviewStageSchema = z
	.object({
		/** True ⇒ the plan has a gap material enough to mark it incomplete. */
		blocking: z.boolean(),
		findings: z.array(
			z
				.object({
					severity: z.enum(["info", "warning", "critical"]),
					message: z.string().min(1),
				})
				.strict(),
		),
	})
	.strict();
export type ReviewStage = z.infer<typeof reviewStageSchema>;

/**
 * The full draft set assembled into a graph. Stages fill their slices; the
 * bounded-repair stage re-emits the whole aggregate given validator findings,
 * so this same schema is the repair contract.
 */
export const planDraftSchema = z
	.object({
		evidence: z.array(evidenceDraftSchema),
		requirements: z.array(requirementDraftSchema),
		openQuestions: z.array(openQuestionDraftSchema),
		features: z.array(featureDraftSchema),
		testCases: z.array(testCaseDraftSchema),
		dataRequirements: z.array(dataRequirementDraftSchema),
		steps: z.array(stepDraftSchema),
		assertions: z.array(assertionDraftSchema),
	})
	.strict();
export type PlanDraft = z.infer<typeof planDraftSchema>;
