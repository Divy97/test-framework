import type { Action } from "./actions.js";
import type { Assertion } from "./assertions.js";
import { canonicalizeTestGraph } from "./canonical-json.js";
import type { GraphEntityRef, JsonValue, Provenance } from "./common.js";
import type { GenerationMetadata, TestCase, TestGraphV1 } from "./schema.js";
import type { Target } from "./targets.js";

function assertNever(value: never): never {
	throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

/**
 * Escape Markdown control characters in free-text prose so a stray pipe or
 * asterisk never breaks a table or smuggles in emphasis. Newlines collapse to a
 * space so multi-line prose stays on one readable line.
 */
function escapeInline(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\|/g, "\\|")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/\[/g, "\\[")
		.replace(/\]/g, "\\]")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\r?\n/g, " ");
}

function code(value: string): string {
	const normalized = value.replace(/[\r\n]+/g, " ");
	const longestRun = Math.max(
		0,
		...(normalized.match(/`+/g) ?? []).map((run) => run.length),
	);
	const delimiter = "`".repeat(longestRun + 1);
	return longestRun === 0
		? `${delimiter}${normalized}${delimiter}`
		: `${delimiter} ${normalized} ${delimiter}`;
}

function json(value: JsonValue): string {
	return code(JSON.stringify(value));
}

function codeList(ids: readonly string[]): string {
	return ids.length === 0 ? "None" : ids.map(code).join(", ");
}

function optional(value: string | undefined): string {
	return value === undefined ? "None" : escapeInline(value);
}

function provenanceLine(provenance: Provenance): string {
	const parts: string[] = [provenance.kind];
	if (provenance.evidenceIds.length > 0) {
		parts.push(`evidence ${codeList(provenance.evidenceIds)}`);
	}
	if (provenance.rationale !== undefined) {
		parts.push(`rationale: ${escapeInline(provenance.rationale)}`);
	}
	return parts.join("; ");
}

function targetSummary(target: Target): string {
	switch (target.kind) {
		case "ui": {
			const parts = [
				target.route !== undefined ? `route ${code(target.route)}` : null,
				target.component !== undefined
					? `component ${code(target.component)}`
					: null,
				target.selector !== undefined
					? `selector ${code(target.selector)}`
					: null,
			].filter((part): part is string => part !== null);
			return `ui (${parts.join(", ")})`;
		}
		case "api":
			return `api ${code(target.method)} ${code(target.path)}`;
		case "integration":
			return `integration ${code(target.system)}.${code(target.operation)}`;
		case "generic":
			return `generic: ${escapeInline(target.description)}`;
		default:
			return assertNever(target);
	}
}

function actionSummary(action: Action): string {
	switch (action.kind) {
		case "navigate":
			return `navigate to ${code(action.route)}`;
		case "interact":
			return `interact ${action.operation} on ${code(action.selector)}${
				action.value !== undefined ? ` with ${json(action.value)}` : ""
			}`;
		case "request":
			return `request ${code(action.method)} ${code(action.path)}${
				action.headers !== undefined ? ` headers ${json(action.headers)}` : ""
			}${action.body !== undefined ? ` body ${json(action.body)}` : ""}`;
		case "invoke":
			return `invoke ${code(action.system)}.${code(action.operation)}${
				action.input !== undefined ? ` input ${json(action.input)}` : ""
			}`;
		case "wait":
			return `wait for ${escapeInline(action.condition)}${
				action.timeoutMs !== undefined ? ` (${action.timeoutMs}ms)` : ""
			}`;
		case "observe":
			return `observe ${escapeInline(action.subject)}`;
		default:
			return assertNever(action);
	}
}

function assertionDetail(assertion: Assertion): string {
	switch (assertion.matcher) {
		case "equals":
		case "notEquals":
		case "contains":
		case "notContains":
			return `expected ${json(assertion.expected)}`;
		case "greaterThan":
		case "greaterThanOrEqual":
		case "lessThan":
		case "lessThanOrEqual":
		case "statusCode":
		case "count":
			return `expected ${code(String(assertion.expected))}`;
		case "matches":
			return `pattern ${code(assertion.pattern)}${
				assertion.flags !== undefined ? ` flags ${code(assertion.flags)}` : ""
			}`;
		case "exists":
		case "notExists":
		case "visible":
		case "hidden":
		case "enabled":
		case "disabled":
			return "no expected value";
		case "conformsToSchema":
			return `schemaRef ${code(assertion.schemaRef)}`;
		default:
			return assertNever(assertion);
	}
}

function refLine(ref: GraphEntityRef): string {
	return `${ref.kind} ${code(ref.id)}`;
}

function generatorLine(generation: GenerationMetadata): string {
	return generation.generator.kind === "manual"
		? "manual"
		: `model ${escapeInline(generation.generator.provider)}/${escapeInline(generation.generator.model)}`;
}

function renderTestCase(testCase: TestCase, lines: string[]): void {
	lines.push(`### ${code(testCase.id)} — ${escapeInline(testCase.title)}`, "");
	lines.push(`- Objective: ${escapeInline(testCase.objective)}`);
	lines.push(
		`- Type: ${testCase.type} — Priority: ${testCase.priority} — Risk: ${testCase.risk}`,
	);
	lines.push(`- Risk rationale: ${escapeInline(testCase.riskRationale)}`);
	lines.push(`- Provenance: ${provenanceLine(testCase.provenance)}`);
	lines.push(`- Requirements: ${codeList(testCase.requirementIds)}`);
	lines.push(`- Features: ${codeList(testCase.featureIds)}`);
	lines.push(
		`- Quality tags: ${testCase.qualityTags.length === 0 ? "None" : testCase.qualityTags.join(", ")}`,
	);
	lines.push(
		`- Actor: role ${code(testCase.actor.role)}, auth ${testCase.actor.authentication}, permissions ${codeList(testCase.actor.permissions)}`,
	);
	lines.push(`- Target: ${targetSummary(testCase.target)}`);
	lines.push(`- Depends on: ${codeList(testCase.dependsOnCaseIds)}`);
	lines.push(`- Consumes: ${codeList(testCase.consumesDataRequirementIds)}`);
	lines.push(`- Produces: ${codeList(testCase.producesDataRequirementIds)}`);
	lines.push(
		`- Automation: readiness ${testCase.automation.readiness} — Blockers: ${
			testCase.automation.blockers.length === 0
				? "None"
				: testCase.automation.blockers.map(escapeInline).join("; ")
		}`,
	);
	lines.push("");

	lines.push("#### Preconditions");
	if (testCase.preconditions.length === 0) {
		lines.push("- None");
	} else {
		for (const precondition of testCase.preconditions) {
			lines.push(
				`- ${escapeInline(precondition.description)}${
					precondition.requiredState !== undefined
						? ` — requiredState ${json(precondition.requiredState)}`
						: ""
				}`,
			);
		}
	}
	lines.push("");

	lines.push("#### Postconditions");
	if (testCase.postconditions.length === 0) {
		lines.push("- None");
	} else {
		for (const postcondition of testCase.postconditions) {
			lines.push(
				`- ${escapeInline(postcondition.description)}${
					postcondition.expectedState !== undefined
						? ` — expectedState ${json(postcondition.expectedState)}`
						: ""
				}`,
			);
		}
	}
	lines.push("");

	lines.push("#### Cleanup");
	lines.push(`- Intent: ${testCase.cleanup.intent}`);
	lines.push(`- Data: ${codeList(testCase.cleanup.dataRequirementIds)}`);
	lines.push(`- After cases: ${codeList(testCase.cleanup.afterCaseIds)}`);
	lines.push(`- Instructions: ${optional(testCase.cleanup.instructions)}`);
	lines.push("");
}

/**
 * Deterministic, derived-only Markdown view of a Test Graph. The JSON graph
 * stays canonical; this is a read projection. Every entity ID, provenance, and
 * dependency/data/cleanup link is shown by ID, never title alone.
 */
export function renderTestGraphMarkdown(input: unknown): string {
	const graph: TestGraphV1 = canonicalizeTestGraph(input);
	const lines: string[] = [];

	lines.push(`# ${escapeInline(graph.title)}`, "");
	lines.push(`- Plan: ${code(graph.planId)} v${graph.planVersion}`);
	lines.push(`- Project: ${code(graph.projectId)}`);
	lines.push(`- Status: ${graph.status}`);
	lines.push(`- Created: ${graph.createdAt}`);
	lines.push(`- Updated: ${graph.updatedAt}`);
	lines.push("");

	lines.push("## Generation");
	lines.push(`- Id: ${code(graph.generation.id)}`);
	lines.push(`- Generated at: ${graph.generation.generatedAt}`);
	lines.push(`- Generator: ${generatorLine(graph.generation)}`);
	lines.push(
		`- Methodology: ${escapeInline(graph.generation.methodologyVersion)} — Workflow: ${escapeInline(graph.generation.workflowVersion)}`,
	);
	lines.push(`- Input fingerprint: ${code(graph.generation.inputFingerprint)}`);
	lines.push(
		`- Repository revision: ${graph.generation.repositoryRevision !== undefined ? code(graph.generation.repositoryRevision) : "None"}`,
	);
	lines.push(`- Status: ${graph.generation.status}`);
	if (graph.generation.warnings.length === 0) {
		lines.push("- Warnings: None");
	} else {
		lines.push("- Warnings:");
		for (const warning of graph.generation.warnings) {
			lines.push(`  - ${escapeInline(warning)}`);
		}
	}
	lines.push("");

	lines.push("## Sources");
	if (graph.sources.length === 0) {
		lines.push("- None");
	} else {
		for (const source of graph.sources) {
			lines.push(
				`- ${code(source.id)} — ${source.kind} — ${escapeInline(source.title)} — supplied: ${source.supplied}${
					source.locator !== undefined
						? ` — locator: ${escapeInline(source.locator)}`
						: ""
				}`,
			);
		}
	}
	lines.push("");

	lines.push("## Evidence");
	if (graph.evidence.length === 0) {
		lines.push("- None");
	} else {
		for (const evidence of graph.evidence) {
			lines.push(
				`- ${code(evidence.id)} — ${evidence.kind} — source ${code(evidence.sourceId)} — ${escapeInline(evidence.claim)}`,
			);
		}
	}
	lines.push("");

	lines.push("## Requirements");
	if (graph.requirements.length === 0) {
		lines.push("- None");
	} else {
		for (const requirement of graph.requirements) {
			lines.push(
				`- ${code(requirement.id)} — ${requirement.kind} — priority ${requirement.priority} — risk ${requirement.risk} — Provenance: ${provenanceLine(requirement.provenance)}`,
			);
			lines.push(`  - Statement: ${escapeInline(requirement.statement)}`);
			lines.push(
				`  - Open questions: ${codeList(requirement.openQuestionIds)}`,
			);
		}
	}
	lines.push("");

	lines.push("## Features");
	if (graph.features.length === 0) {
		lines.push("- None");
	} else {
		for (const feature of graph.features) {
			lines.push(
				`- ${code(feature.id)} — ${escapeInline(feature.name)} — risk ${feature.risk}${
					feature.parentFeatureId !== undefined
						? ` — parent ${code(feature.parentFeatureId)}`
						: ""
				} — Provenance: ${provenanceLine(feature.provenance)}`,
			);
			lines.push(`  - Description: ${escapeInline(feature.description)}`);
			lines.push(`  - Requirements: ${codeList(feature.requirementIds)}`);
			lines.push(
				`  - Targets: ${
					feature.targets.length === 0
						? "None"
						: feature.targets.map(targetSummary).join("; ")
				}`,
			);
		}
	}
	lines.push("");

	lines.push("## Data Requirements");
	if (graph.dataRequirements.length === 0) {
		lines.push("- None");
	} else {
		for (const data of graph.dataRequirements) {
			lines.push(
				`- ${code(data.id)} — ${escapeInline(data.name)} — kind ${data.kind} — provisioning ${data.provisioning} — sensitivity ${data.sensitivity} — Provenance: ${provenanceLine(data.provenance)}`,
			);
			lines.push(`  - Description: ${escapeInline(data.description)}`);
			lines.push(
				`  - Required state: ${data.requiredState === undefined ? "None" : json(data.requiredState)}`,
			);
		}
	}
	lines.push("");

	lines.push("## Test Cases");
	lines.push("");
	if (graph.testCases.length === 0) {
		lines.push("None", "");
	} else {
		for (const testCase of graph.testCases) {
			renderTestCase(testCase, lines);
			const steps = graph.steps.filter(
				(step) => step.testCaseId === testCase.id,
			);
			lines.push("#### Steps");
			if (steps.length === 0) {
				lines.push("- None");
			} else {
				for (const step of steps) {
					lines.push(
						`${step.order}. ${code(step.id)} — ${escapeInline(step.description)} — Action: ${actionSummary(step.action)} — Provenance: ${provenanceLine(step.provenance)}`,
					);
				}
			}
			lines.push("");

			const assertions = graph.assertions.filter(
				(assertion) => assertion.testCaseId === testCase.id,
			);
			lines.push("#### Assertions");
			if (assertions.length === 0) {
				lines.push("- None");
			} else {
				for (const assertion of assertions) {
					lines.push(
						`- ${code(assertion.id)} — ${assertion.matcher} — ${assertionDetail(assertion)} — subject ${escapeInline(assertion.subject)} — observation ${targetSummary(assertion.observationPoint)}${
							assertion.stepId !== undefined
								? ` — step ${code(assertion.stepId)}`
								: ""
						} — Provenance: ${provenanceLine(assertion.provenance)}`,
					);
				}
			}
			lines.push("");
		}
	}

	lines.push("## Open Questions");
	if (graph.openQuestions.length === 0) {
		lines.push("- None");
	} else {
		for (const question of graph.openQuestions) {
			lines.push(
				`- ${code(question.id)} — status ${question.status} — blocking ${question.blocking} — Provenance: ${provenanceLine(question.provenance)}`,
			);
			lines.push(`  - Question: ${escapeInline(question.question)}`);
			lines.push(`  - Answer: ${optional(question.answer)}`);
			lines.push(
				`  - Blocks: ${
					question.blockedEntityRefs.length === 0
						? "None"
						: question.blockedEntityRefs.map(refLine).join(", ")
				}`,
			);
		}
	}

	return `${lines.join("\n")}\n`;
}
