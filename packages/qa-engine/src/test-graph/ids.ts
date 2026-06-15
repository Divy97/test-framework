import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Stable typed prefixes for every graph entity kind. The prefix is part of the
 * ID contract: it lets a reader tell a `req_*` from a `case_*` without consulting
 * the schema, and it keeps cross-kind references unambiguous.
 */
export const idPrefixes = {
	project: "prj",
	plan: "plan",
	source: "src",
	evidence: "ev",
	requirement: "req",
	feature: "feat",
	testCase: "case",
	step: "step",
	assertion: "assert",
	dataRequirement: "data",
	openQuestion: "question",
	generation: "gen",
} as const;

export type IdKind = keyof typeof idPrefixes;

const HEX_LENGTH = 20;

function idSchemaFor<TBrand extends string>(prefix: string, brand: TBrand) {
	return z
		.string()
		.regex(new RegExp(`^${prefix}_[0-9a-f]{${HEX_LENGTH}}$`))
		.brand(brand);
}

export const projectIdSchema = idSchemaFor(idPrefixes.project, "ProjectId");
export const planIdSchema = idSchemaFor(idPrefixes.plan, "PlanId");
export const sourceIdSchema = idSchemaFor(idPrefixes.source, "SourceId");
export const evidenceIdSchema = idSchemaFor(idPrefixes.evidence, "EvidenceId");
export const requirementIdSchema = idSchemaFor(
	idPrefixes.requirement,
	"RequirementId",
);
export const featureIdSchema = idSchemaFor(idPrefixes.feature, "FeatureId");
export const testCaseIdSchema = idSchemaFor(idPrefixes.testCase, "TestCaseId");
export const stepIdSchema = idSchemaFor(idPrefixes.step, "StepId");
export const assertionIdSchema = idSchemaFor(
	idPrefixes.assertion,
	"AssertionId",
);
export const dataRequirementIdSchema = idSchemaFor(
	idPrefixes.dataRequirement,
	"DataRequirementId",
);
export const openQuestionIdSchema = idSchemaFor(
	idPrefixes.openQuestion,
	"OpenQuestionId",
);
export const generationIdSchema = idSchemaFor(
	idPrefixes.generation,
	"GenerationId",
);

export type ProjectId = z.infer<typeof projectIdSchema>;
export type PlanId = z.infer<typeof planIdSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type EvidenceId = z.infer<typeof evidenceIdSchema>;
export type RequirementId = z.infer<typeof requirementIdSchema>;
export type FeatureId = z.infer<typeof featureIdSchema>;
export type TestCaseId = z.infer<typeof testCaseIdSchema>;
export type StepId = z.infer<typeof stepIdSchema>;
export type AssertionId = z.infer<typeof assertionIdSchema>;
export type DataRequirementId = z.infer<typeof dataRequirementIdSchema>;
export type OpenQuestionId = z.infer<typeof openQuestionIdSchema>;
export type GenerationId = z.infer<typeof generationIdSchema>;

export type GraphIdByKind = {
	project: ProjectId;
	plan: PlanId;
	source: SourceId;
	evidence: EvidenceId;
	requirement: RequirementId;
	feature: FeatureId;
	testCase: TestCaseId;
	step: StepId;
	assertion: AssertionId;
	dataRequirement: DataRequirementId;
	openQuestion: OpenQuestionId;
	generation: GenerationId;
};

const UNIT_SEPARATOR = "\u001f";

/**
 * Caller-supplied identity inputs must already be canonical so the same logical
 * entity always hashes to the same ID. We refuse to silently trim/normalize:
 * choosing the canonical key is a deliberate caller decision, not a side effect.
 */
function assertCanonicalKey(value: string, label: string): void {
	if (value.length === 0) {
		throw new Error(`createStableId: ${label} must not be empty.`);
	}

	if (value !== value.trim().normalize("NFC")) {
		throw new Error(
			`createStableId: ${label} must be trimmed and NFC-normalized; received ${JSON.stringify(value)}.`,
		);
	}
}

/**
 * Deterministic ID: typed prefix plus the first 20 lowercase hex chars of a
 * SHA-256 digest over the entity kind, its scope ID, and a caller-supplied
 * stable semantic key. IDs are never derived from editable prose, array order,
 * timestamps, or plan version, so refinement preserves identity.
 */
export function createStableId<TKind extends IdKind>(
	kind: TKind,
	scopeId: string,
	semanticKey: string,
): GraphIdByKind[TKind] {
	assertCanonicalKey(scopeId, "scopeId");
	assertCanonicalKey(semanticKey, "semanticKey");

	const payload = ["test-framework", kind, scopeId, semanticKey].join(
		UNIT_SEPARATOR,
	);
	const digest = createHash("sha256").update(payload, "utf8").digest("hex");

	return `${idPrefixes[kind]}_${digest.slice(0, HEX_LENGTH)}` as GraphIdByKind[TKind];
}
