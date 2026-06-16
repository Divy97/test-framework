import {
	prioritySchema,
	requirementKindSchema,
	riskSchema,
	testCaseTypeSchema,
} from "@test-framework/qa-engine";
import { z } from "zod";
import {
	claimKeySchema,
	evalSchemaVersionSchema,
	fixtureCategorySchema,
	requirementTruthKeySchema,
	scenarioTruthKeySchema,
} from "./common.js";

/** A Candidate provenance classification a strong plan is expected to use. */
export const expectedStrengthSchema = z.enum([
	"explicit",
	"inferred",
	"assumption",
]);
export type ExpectedStrength = z.infer<typeof expectedStrengthSchema>;

/** Mirrors the Test Graph source kinds; documents what the arms were given. */
const suppliedSourceSchema = z
	.object({
		sourceKey: z.string().min(1),
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
		supplied: z.boolean(),
		locators: z
			.array(
				z.discriminatedUnion("kind", [
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
					z.object({ kind: z.literal("url"), url: z.string().min(1) }).strict(),
					z
						.object({
							kind: z.literal("symbol"),
							path: z.string().min(1),
							symbol: z.string().min(1),
						})
						.strict(),
				]),
			)
			.optional(),
	})
	.strict();

export const expectedRequirementSchema = z
	.object({
		truthKey: requirementTruthKeySchema,
		statement: z.string().min(1),
		kind: requirementKindSchema,
		expectedStrength: expectedStrengthSchema,
		priority: prioritySchema,
		risk: riskSchema,
		mustCover: z.boolean(),
	})
	.strict();
export type ExpectedRequirement = z.infer<typeof expectedRequirementSchema>;

export const expectedScenarioSchema = z
	.object({
		truthKey: scenarioTruthKeySchema,
		title: z.string().min(1),
		requirementKeys: z.array(requirementTruthKeySchema),
		type: testCaseTypeSchema,
		priority: prioritySchema,
		risk: riskSchema,
		expectedAssertionHint: z.string().min(1),
	})
	.strict();
export type ExpectedScenario = z.infer<typeof expectedScenarioSchema>;

/** A claim the Ground Truth explicitly marks false or out of scope. */
export const forbiddenClaimSchema = z
	.object({
		claimKey: claimKeySchema,
		statement: z.string().min(1),
	})
	.strict();
export type ForbiddenClaim = z.infer<typeof forbiddenClaimSchema>;

/**
 * One fixture's Ground Truth: the hand-authored, source-backed reference a
 * Candidate is scored against. Truth keys are unique within their kind.
 */
export const fixtureSchema = z
	.object({
		evalSchemaVersion: evalSchemaVersionSchema,
		fixtureId: z.string().regex(/^[a-z0-9-]+$/),
		title: z.string().min(1),
		category: fixtureCategorySchema,
		brief: z.string().min(1),
		suppliedSources: z.array(suppliedSourceSchema),
		expectedRequirements: z.array(expectedRequirementSchema),
		expectedScenarios: z.array(expectedScenarioSchema),
		forbiddenClaims: z.array(forbiddenClaimSchema),
		notes: z.string().min(1).optional(),
	})
	.strict()
	.superRefine((fixture, ctx) => {
		const requirementKeys = new Set<string>();
		fixture.expectedRequirements.forEach((requirement, index) => {
			if (requirementKeys.has(requirement.truthKey)) {
				ctx.addIssue({
					code: "custom",
					path: ["expectedRequirements", index, "truthKey"],
					message: `Duplicate requirement truth key ${requirement.truthKey}.`,
				});
			}
			requirementKeys.add(requirement.truthKey);
		});

		const scenarioKeys = new Set<string>();
		fixture.expectedScenarios.forEach((scenario, index) => {
			if (scenarioKeys.has(scenario.truthKey)) {
				ctx.addIssue({
					code: "custom",
					path: ["expectedScenarios", index, "truthKey"],
					message: `Duplicate scenario truth key ${scenario.truthKey}.`,
				});
			}
			scenarioKeys.add(scenario.truthKey);
			scenario.requirementKeys.forEach((key, keyIndex) => {
				if (!requirementKeys.has(key)) {
					ctx.addIssue({
						code: "custom",
						path: ["expectedScenarios", index, "requirementKeys", keyIndex],
						message: `Scenario references unknown requirement key ${key}.`,
					});
				}
			});
		});
	});
export type Fixture = z.infer<typeof fixtureSchema>;
