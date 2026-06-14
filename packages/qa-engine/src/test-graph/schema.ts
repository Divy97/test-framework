import { z } from "zod";
import { actionSchema } from "./actions.js";
import { assertionSchema } from "./assertions.js";
import {
	graphEntityRefSchema,
	jsonValueSchema,
	planStatusSchema,
	prioritySchema,
	provenanceSchema,
	qualityTagSchema,
	rfc3339Schema,
	riskSchema,
} from "./common.js";
import {
	dataRequirementIdSchema,
	evidenceIdSchema,
	featureIdSchema,
	generationIdSchema,
	openQuestionIdSchema,
	planIdSchema,
	projectIdSchema,
	requirementIdSchema,
	sourceIdSchema,
	stepIdSchema,
	testCaseIdSchema,
} from "./ids.js";
import { targetSchema } from "./targets.js";
import {
	PROJECT_SCHEMA_VERSION,
	TEST_GRAPH_SCHEMA_VERSION,
} from "./version.js";

/**
 * The Project is a separate aggregate. A Test Graph references its `projectId`
 * but never embeds a mutable project snapshot, so a project rename never forces
 * a new plan revision.
 */
export const projectSchema = z
	.object({
		schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
		projectId: projectIdSchema,
		name: z.string().min(1),
		createdAt: rfc3339Schema,
		updatedAt: rfc3339Schema,
	})
	.strict();
export type Project = z.infer<typeof projectSchema>;

export const sourceSchema = z
	.object({
		id: sourceIdSchema,
		kind: z.enum([
			"feature-request",
			"document",
			"repository",
			"diff",
			"user-hint",
			"api-spec",
			"other",
		]),
		title: z.string().min(1),
		locator: z.string().min(1).optional(),
		digest: z.string().min(1).optional(),
		supplied: z.boolean(),
	})
	.strict();
export type Source = z.infer<typeof sourceSchema>;

const evidenceLocatorSchema = z.discriminatedUnion("kind", [
	z
		.object({
			kind: z.literal("text"),
			start: z.number().int().nonnegative(),
			end: z.number().int().nonnegative(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("file"),
			path: z.string().min(1),
			startLine: z.number().int().positive().optional(),
			endLine: z.number().int().positive().optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("url"),
			url: z.string().min(1),
		})
		.strict(),
	z
		.object({
			kind: z.literal("symbol"),
			path: z.string().min(1),
			symbol: z.string().min(1),
		})
		.strict(),
]);
export type EvidenceLocator = z.infer<typeof evidenceLocatorSchema>;

export const evidenceSchema = z
	.object({
		id: evidenceIdSchema,
		sourceId: sourceIdSchema,
		kind: z.enum([
			"statement",
			"quote",
			"code",
			"api-contract",
			"diff",
			"repository-signal",
		]),
		claim: z.string().min(1),
		locator: evidenceLocatorSchema.optional(),
		excerpt: z.string().min(1).optional(),
		digest: z.string().min(1).optional(),
	})
	.strict();
export type Evidence = z.infer<typeof evidenceSchema>;

export const requirementKindSchema = z.enum([
	"functional",
	"non-functional",
	"business-rule",
	"constraint",
	"data",
	"security",
	"ux",
]);
export type RequirementKind = z.infer<typeof requirementKindSchema>;

export const requirementSchema = z
	.object({
		id: requirementIdSchema,
		statement: z.string().min(1),
		kind: requirementKindSchema,
		provenance: provenanceSchema,
		priority: prioritySchema,
		risk: riskSchema,
		openQuestionIds: z.array(openQuestionIdSchema),
	})
	.strict();
export type Requirement = z.infer<typeof requirementSchema>;

export const featureSchema = z
	.object({
		id: featureIdSchema,
		name: z.string().min(1),
		description: z.string().min(1),
		parentFeatureId: featureIdSchema.optional(),
		requirementIds: z.array(requirementIdSchema),
		targets: z.array(targetSchema),
		provenance: provenanceSchema,
		risk: riskSchema,
	})
	.strict();
export type Feature = z.infer<typeof featureSchema>;

export const testCaseTypeSchema = z.enum([
	"positive",
	"negative",
	"edge",
	"security",
	"regression",
	"integration",
]);
export type TestCaseType = z.infer<typeof testCaseTypeSchema>;

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

export const testCaseSchema = z
	.object({
		id: testCaseIdSchema,
		title: z.string().min(1),
		objective: z.string().min(1),
		type: testCaseTypeSchema,
		priority: prioritySchema,
		risk: riskSchema,
		riskRationale: z.string().min(1),
		provenance: provenanceSchema,
		requirementIds: z.array(requirementIdSchema),
		featureIds: z.array(featureIdSchema),
		qualityTags: z.array(qualityTagSchema),
		actor: z
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
			.strict(),
		target: targetSchema,
		preconditions: z.array(preconditionSchema),
		dependsOnCaseIds: z.array(testCaseIdSchema),
		consumesDataRequirementIds: z.array(dataRequirementIdSchema),
		producesDataRequirementIds: z.array(dataRequirementIdSchema),
		postconditions: z.array(postconditionSchema),
		cleanup: z
			.object({
				intent: z.enum(["none", "restore", "delete", "reset", "external"]),
				dataRequirementIds: z.array(dataRequirementIdSchema),
				afterCaseIds: z.array(testCaseIdSchema),
				instructions: z.string().min(1).optional(),
			})
			.strict(),
		automation: z
			.object({
				readiness: z.enum(["ready", "partial", "blocked"]),
				blockers: z.array(z.string().min(1)),
			})
			.strict(),
	})
	.strict();
export type TestCase = z.infer<typeof testCaseSchema>;

export const stepSchema = z
	.object({
		id: stepIdSchema,
		testCaseId: testCaseIdSchema,
		order: z.number().int().positive(),
		description: z.string().min(1),
		action: actionSchema,
		provenance: provenanceSchema,
	})
	.strict();
export type Step = z.infer<typeof stepSchema>;

export const dataRequirementSchema = z
	.object({
		id: dataRequirementIdSchema,
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
		// `case-produced` requires exactly one producing case; every other mode
		// must NOT name a producer. The validator enforces that agreement.
		provisioning: z.enum([
			"existing",
			"generated",
			"external",
			"case-produced",
		]),
		sensitivity: z.enum(["none", "internal", "pii", "secret", "financial"]),
		provenance: provenanceSchema,
		requiredState: jsonValueSchema.optional(),
	})
	.strict();
export type DataRequirement = z.infer<typeof dataRequirementSchema>;

export const openQuestionSchema = z
	.object({
		id: openQuestionIdSchema,
		question: z.string().min(1),
		status: z.enum(["open", "answered"]),
		blocking: z.boolean(),
		answer: z.string().min(1).optional(),
		provenance: provenanceSchema,
		blockedEntityRefs: z.array(graphEntityRefSchema),
	})
	.strict();
export type OpenQuestion = z.infer<typeof openQuestionSchema>;

export const generationMetadataSchema = z
	.object({
		id: generationIdSchema,
		generatedAt: rfc3339Schema,
		methodologyVersion: z.string().min(1),
		workflowVersion: z.string().min(1),
		inputFingerprint: z.string().min(1),
		repositoryRevision: z.string().min(1).optional(),
		generator: z.discriminatedUnion("kind", [
			z.object({ kind: z.literal("manual") }).strict(),
			z
				.object({
					kind: z.literal("model"),
					provider: z.string().min(1),
					model: z.string().min(1),
				})
				.strict(),
		]),
		status: z.enum(["complete", "incomplete"]),
		warnings: z.array(z.string().min(1)),
	})
	.strict();
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;

/**
 * One immutable Plan revision, serialized as a single normalized plan-scoped
 * graph. Ownership and links are expressed through top-level node arrays whose
 * members point at one another by typed ID; there are no duplicated
 * bidirectional adjacency arrays.
 */
export const testGraphV1Schema = z
	.object({
		schemaVersion: z.literal(TEST_GRAPH_SCHEMA_VERSION),
		projectId: projectIdSchema,
		planId: planIdSchema,
		planVersion: z.number().int().min(1),
		title: z.string().min(1),
		status: planStatusSchema,
		createdAt: rfc3339Schema,
		updatedAt: rfc3339Schema,
		generation: generationMetadataSchema,
		sources: z.array(sourceSchema),
		evidence: z.array(evidenceSchema),
		requirements: z.array(requirementSchema),
		features: z.array(featureSchema),
		testCases: z.array(testCaseSchema),
		steps: z.array(stepSchema),
		assertions: z.array(assertionSchema),
		dataRequirements: z.array(dataRequirementSchema),
		openQuestions: z.array(openQuestionSchema),
	})
	.strict();
export type TestGraphV1 = z.infer<typeof testGraphV1Schema>;
