import type { TestGraphV1 } from "@test-framework/qa-engine";
import type { Annotation } from "./schema/annotation.js";
import type { Arm } from "./schema/common.js";
import type { Fixture } from "./schema/fixture.js";

/**
 * Annotation-integrity precondition. Every Candidate requirement and case must
 * have exactly one annotation (nothing unscored), references must resolve, and the
 * declared fixture/arm and all truth keys must be real. Any issue is a Hard-Fail;
 * dimensions are not computed against a broken Annotation. For an invalid graph the
 * entity-resolution checks are skipped (entities cannot be parsed), but fixture/arm
 * and truth-key checks still run.
 */
export function checkAnnotationIntegrity(
	fixture: Fixture,
	annotation: Annotation,
	arm: Arm,
	graph: TestGraphV1 | null,
): string[] {
	const issues: string[] = [];

	if (annotation.fixtureId !== fixture.fixtureId) {
		issues.push(
			`annotation fixtureId ${annotation.fixtureId} != ${fixture.fixtureId}`,
		);
	}
	if (annotation.arm !== arm) {
		issues.push(`annotation arm ${annotation.arm} != directory arm ${arm}`);
	}

	const requirementKeys = new Set(
		fixture.expectedRequirements.map((requirement) => requirement.truthKey),
	);
	const scenarioKeys = new Set(
		fixture.expectedScenarios.map((scenario) => scenario.truthKey),
	);

	for (const item of annotation.requirementAnnotations) {
		if (item.verdict !== "maps") continue;
		for (const key of item.truthKeys) {
			if (!requirementKeys.has(key)) {
				issues.push(`unknown requirement truth key ${key}`);
			}
		}
	}
	for (const item of annotation.caseAnnotations) {
		if (item.verdict !== "maps") continue;
		for (const key of item.truthKeys) {
			if (!scenarioKeys.has(key)) {
				issues.push(`unknown scenario truth key ${key}`);
			}
		}
	}

	if (graph === null) return issues.sort();

	matchExactlyOnce(
		graph.requirements.map((requirement) => requirement.id),
		annotation.requirementAnnotations.map((item) => item.requirementId),
		"requirement",
		issues,
	);
	matchExactlyOnce(
		graph.testCases.map((testCase) => testCase.id),
		annotation.caseAnnotations.map((item) => item.caseId),
		"case",
		issues,
	);

	const assertionIds = new Set(
		graph.assertions.map((assertion) => assertion.id),
	);
	const seenAssertionAnno = new Set<string>();
	for (const item of annotation.assertionAnnotations ?? []) {
		if (!assertionIds.has(item.assertionId)) {
			issues.push(
				`annotation references unknown assertion ${item.assertionId}`,
			);
		}
		if (seenAssertionAnno.has(item.assertionId)) {
			issues.push(`duplicate assertion annotation ${item.assertionId}`);
		}
		seenAssertionAnno.add(item.assertionId);
	}

	return issues.sort();
}

function matchExactlyOnce(
	entityIds: readonly string[],
	annotatedIds: readonly string[],
	label: string,
	issues: string[],
): void {
	const entities = new Set(entityIds);
	const seen = new Set<string>();
	for (const id of annotatedIds) {
		if (!entities.has(id)) {
			issues.push(`annotation references unknown ${label} ${id}`);
		}
		if (seen.has(id)) {
			issues.push(`duplicate ${label} annotation ${id}`);
		}
		seen.add(id);
	}
	for (const id of entities) {
		if (!seen.has(id)) issues.push(`${label} ${id} has no annotation`);
	}
}
