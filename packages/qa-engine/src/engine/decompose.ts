import type { Provenance } from "../test-graph/common.js";
import type { TestGraphV1 } from "../test-graph/schema.js";
import type {
	AssertionDraft,
	DataRequirementDraft,
	EvidenceDraft,
	FeatureDraft,
	OpenQuestionDraft,
	PlanDraft,
	ProvenanceDraft,
	RequirementDraft,
	StepDraft,
	TestCaseDraft,
} from "./drafts.js";
import type { Ingested, IngestedSource } from "./identity.js";

/**
 * Decompose a persisted, validated Test Graph back into the slug-keyed seed
 * (`Ingested` + `PlanDraft`) that `assemble` consumes, so refine can re-run the
 * pipeline and produce a revision. Pure and deterministic.
 *
 * Every entity is re-keyed by its own existing stable id; `assemble` passes an
 * id-shaped key through verbatim (see assemble.ts `stableId`), so every entity
 * the refine model leaves untouched keeps its id constant across the revision —
 * the ADR-0007 identity invariant. Cross-references are carried as the referenced
 * entity's id (= its key).
 */
export function decomposePlan(graph: TestGraphV1): {
	ingested: Ingested;
	draft: PlanDraft;
} {
	const sources: IngestedSource[] = graph.sources.map((node) => ({
		// The source content is not persisted (only its node is); refine does not
		// re-run the evidence stage, so a non-empty placeholder is sufficient.
		key: node.id,
		id: node.id,
		node,
		content: node.title,
	}));

	const ingested: Ingested = {
		projectId: graph.projectId,
		planId: graph.planId,
		title: graph.title,
		inputFingerprint: graph.generation.inputFingerprint,
		sources,
	};

	const draft: PlanDraft = {
		evidence: graph.evidence.map(decomposeEvidence),
		requirements: graph.requirements.map(decomposeRequirement),
		openQuestions: graph.openQuestions.map(decomposeOpenQuestion),
		features: graph.features.map(decomposeFeature),
		testCases: graph.testCases.map(decomposeTestCase),
		dataRequirements: graph.dataRequirements.map(decomposeDataRequirement),
		steps: graph.steps.map(decomposeStep),
		assertions: graph.assertions.map(decomposeAssertion),
	};

	return { ingested, draft };
}

function decomposeProvenance(provenance: Provenance): ProvenanceDraft {
	const evidenceKeys = [...provenance.evidenceIds];
	if (provenance.kind === "assumption") {
		return {
			kind: "assumption",
			evidenceKeys,
			rationale: provenance.rationale,
		};
	}
	return {
		kind: provenance.kind,
		evidenceKeys,
		...(provenance.rationale !== undefined && {
			rationale: provenance.rationale,
		}),
	};
}

function decomposeEvidence(
	evidence: TestGraphV1["evidence"][number],
): EvidenceDraft {
	return {
		key: evidence.id,
		sourceKey: evidence.sourceId,
		kind: evidence.kind,
		claim: evidence.claim,
		...(evidence.excerpt !== undefined && { excerpt: evidence.excerpt }),
	};
}

function decomposeOpenQuestion(
	question: TestGraphV1["openQuestions"][number],
): OpenQuestionDraft {
	return {
		key: question.id,
		question: question.question,
		status: question.status,
		blocking: question.blocking,
		...(question.answer !== undefined && { answer: question.answer }),
		provenance: decomposeProvenance(question.provenance),
	};
}

function decomposeRequirement(
	requirement: TestGraphV1["requirements"][number],
): RequirementDraft {
	return {
		key: requirement.id,
		statement: requirement.statement,
		kind: requirement.kind,
		provenance: decomposeProvenance(requirement.provenance),
		priority: requirement.priority,
		risk: requirement.risk,
		openQuestionKeys: [...requirement.openQuestionIds],
	};
}

function decomposeFeature(
	feature: TestGraphV1["features"][number],
): FeatureDraft {
	return {
		key: feature.id,
		name: feature.name,
		description: feature.description,
		...(feature.parentFeatureId !== undefined && {
			parentKey: feature.parentFeatureId,
		}),
		requirementKeys: [...feature.requirementIds],
		targets: feature.targets,
		provenance: decomposeProvenance(feature.provenance),
		risk: feature.risk,
	};
}

function decomposeTestCase(
	testCase: TestGraphV1["testCases"][number],
): TestCaseDraft {
	return {
		key: testCase.id,
		title: testCase.title,
		objective: testCase.objective,
		type: testCase.type,
		priority: testCase.priority,
		risk: testCase.risk,
		riskRationale: testCase.riskRationale,
		provenance: decomposeProvenance(testCase.provenance),
		requirementKeys: [...testCase.requirementIds],
		featureKeys: [...testCase.featureIds],
		qualityTags: testCase.qualityTags,
		actor: testCase.actor,
		target: testCase.target,
		preconditions: testCase.preconditions,
		dependsOnCaseKeys: [...testCase.dependsOnCaseIds],
		consumesDataKeys: [...testCase.consumesDataRequirementIds],
		producesDataKeys: [...testCase.producesDataRequirementIds],
		postconditions: testCase.postconditions,
		cleanup: {
			intent: testCase.cleanup.intent,
			dataKeys: [...testCase.cleanup.dataRequirementIds],
			afterCaseKeys: [...testCase.cleanup.afterCaseIds],
			...(testCase.cleanup.instructions !== undefined && {
				instructions: testCase.cleanup.instructions,
			}),
		},
		automation: testCase.automation,
	};
}

function decomposeDataRequirement(
	dataRequirement: TestGraphV1["dataRequirements"][number],
): DataRequirementDraft {
	return {
		key: dataRequirement.id,
		name: dataRequirement.name,
		description: dataRequirement.description,
		kind: dataRequirement.kind,
		provisioning: dataRequirement.provisioning,
		sensitivity: dataRequirement.sensitivity,
		provenance: decomposeProvenance(dataRequirement.provenance),
		...(dataRequirement.requiredState !== undefined && {
			requiredState: dataRequirement.requiredState,
		}),
	};
}

function decomposeStep(step: TestGraphV1["steps"][number]): StepDraft {
	return {
		key: step.id,
		caseKey: step.testCaseId,
		order: step.order,
		description: step.description,
		action: step.action,
		provenance: decomposeProvenance(step.provenance),
	};
}

function decomposeAssertion(
	assertion: TestGraphV1["assertions"][number],
): AssertionDraft {
	return {
		key: assertion.id,
		caseKey: assertion.testCaseId,
		...(assertion.stepId !== undefined && { stepKey: assertion.stepId }),
		provenance: decomposeProvenance(assertion.provenance),
		subject: assertion.subject,
		observationPoint: assertion.observationPoint,
		...(assertion.note !== undefined && { note: assertion.note }),
		matcher: assertion.matcher,
		...("expected" in assertion &&
			assertion.expected !== undefined && { expected: assertion.expected }),
		...("pattern" in assertion &&
			assertion.pattern !== undefined && { pattern: assertion.pattern }),
		...("flags" in assertion &&
			assertion.flags !== undefined && { flags: assertion.flags }),
		...("schemaRef" in assertion &&
			assertion.schemaRef !== undefined && { schemaRef: assertion.schemaRef }),
	};
}
