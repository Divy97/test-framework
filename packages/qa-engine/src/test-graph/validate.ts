import type { z } from "zod";
import type { GraphEntityKind, Provenance } from "./common.js";
import {
	sortFindings,
	type TestGraphFinding,
	type TestGraphFindingCode,
	TestGraphValidationError,
} from "./findings.js";
import type { DataRequirement, TestCase, TestGraphV1 } from "./schema.js";
import { testGraphV1Schema } from "./schema.js";
import { detectSchemaVersion, TEST_GRAPH_SCHEMA_VERSION } from "./version.js";

export type TestGraphValidationResult =
	| { valid: true; graph: TestGraphV1; findings: [] }
	| { valid: false; findings: TestGraphFinding[] };

type EntityRef = { kind: GraphEntityKind; id: string };

function jsonPath(segments: ReadonlyArray<string | number>): string {
	if (segments.length === 0) return "/";
	return `/${segments.map(String).join("/")}`;
}

function makeFinding(
	code: TestGraphFindingCode,
	path: string,
	message: string,
	entity?: EntityRef,
	relatedIds: readonly string[] = [],
): TestGraphFinding {
	return {
		code,
		severity: "error",
		message,
		path,
		...(entity ? { entity } : {}),
		relatedIds: [...relatedIds],
	};
}

// ---------------------------------------------------------------------------
// Phase 1: schema detection and structural parsing.
// ---------------------------------------------------------------------------

function mapZodIssue(issue: z.core.$ZodIssue): TestGraphFinding {
	const path = issue.path as ReadonlyArray<string | number>;
	const pathStr = jsonPath(path);

	if (path[0] === "assertions") {
		return makeFinding("MALFORMED_ASSERTION", pathStr, issue.message);
	}

	const last = path[path.length - 1];
	if (last === "status" && issue.code === "invalid_value") {
		return makeFinding("UNSUPPORTED_STATE", pathStr, issue.message);
	}

	return makeFinding("SCHEMA_INVALID", pathStr, issue.message);
}

function runSchemaPhase(
	input: unknown,
):
	| { graph: TestGraphV1; findings: [] }
	| { graph: null; findings: TestGraphFinding[] } {
	const version = detectSchemaVersion(input);
	if (version === null) {
		return {
			graph: null,
			findings: [
				makeFinding(
					"UNSUPPORTED_SCHEMA_VERSION",
					"/schemaVersion",
					`Missing schemaVersion; expected ${TEST_GRAPH_SCHEMA_VERSION}.`,
				),
			],
		};
	}
	if (version !== TEST_GRAPH_SCHEMA_VERSION) {
		return {
			graph: null,
			findings: [
				makeFinding(
					"UNSUPPORTED_SCHEMA_VERSION",
					"/schemaVersion",
					`Unsupported schemaVersion ${JSON.stringify(version)}; expected ${TEST_GRAPH_SCHEMA_VERSION}.`,
					undefined,
					[version],
				),
			],
		};
	}

	const parsed = testGraphV1Schema.safeParse(input);
	if (!parsed.success) {
		return { graph: null, findings: parsed.error.issues.map(mapZodIssue) };
	}
	return { graph: parsed.data, findings: [] };
}

// ---------------------------------------------------------------------------
// Phase 2: indexing and invariant checks over a structurally valid graph.
// ---------------------------------------------------------------------------

type GraphIndex = {
	sources: Map<string, TestGraphV1["sources"][number]>;
	evidence: Map<string, TestGraphV1["evidence"][number]>;
	requirements: Map<string, TestGraphV1["requirements"][number]>;
	features: Map<string, TestGraphV1["features"][number]>;
	testCases: Map<string, TestCase>;
	steps: Map<string, TestGraphV1["steps"][number]>;
	assertions: Map<string, TestGraphV1["assertions"][number]>;
	dataRequirements: Map<string, DataRequirement>;
	openQuestions: Map<string, TestGraphV1["openQuestions"][number]>;
	allIds: Map<string, GraphEntityKind>;
};

const ARRAY_KINDS = {
	sources: "source",
	evidence: "evidence",
	requirements: "requirement",
	features: "feature",
	testCases: "testCase",
	steps: "step",
	assertions: "assertion",
	dataRequirements: "dataRequirement",
	openQuestions: "openQuestion",
} as const satisfies Record<string, GraphEntityKind>;

function buildIndex(
	graph: TestGraphV1,
	findings: TestGraphFinding[],
): GraphIndex {
	const index: GraphIndex = {
		sources: new Map(),
		evidence: new Map(),
		requirements: new Map(),
		features: new Map(),
		testCases: new Map(),
		steps: new Map(),
		assertions: new Map(),
		dataRequirements: new Map(),
		openQuestions: new Map(),
		allIds: new Map(),
	};

	for (const [arrayName, kind] of Object.entries(ARRAY_KINDS)) {
		const bucket = index[arrayName as keyof typeof ARRAY_KINDS] as Map<
			string,
			{ id: string }
		>;
		const entities = graph[arrayName as keyof typeof ARRAY_KINDS] as Array<{
			id: string;
		}>;
		entities.forEach((entity, position) => {
			if (bucket.has(entity.id)) {
				findings.push(
					makeFinding(
						"DUPLICATE_ID",
						jsonPath([arrayName, position, "id"]),
						`Duplicate ${kind} id ${entity.id}.`,
						{ kind, id: entity.id },
						[entity.id],
					),
				);
				return;
			}
			bucket.set(entity.id, entity);
			index.allIds.set(entity.id, kind);
		});
	}

	index.allIds.set(graph.generation.id, "generation");
	index.allIds.set(graph.planId, "plan");
	index.allIds.set(graph.projectId, "project");
	return index;
}

function checkSetDuplicates(
	ids: readonly string[],
	basePath: ReadonlyArray<string | number>,
	owner: EntityRef,
	findings: TestGraphFinding[],
): void {
	const seen = new Set<string>();
	ids.forEach((id, position) => {
		if (seen.has(id)) {
			findings.push(
				makeFinding(
					"DUPLICATE_REFERENCE",
					jsonPath([...basePath, position]),
					`Duplicate reference ${id}.`,
					owner,
					[id],
				),
			);
		}
		seen.add(id);
	});
}

function checkRefs(
	ids: readonly string[],
	target: Map<string, unknown>,
	targetKind: GraphEntityKind,
	basePath: ReadonlyArray<string | number>,
	owner: EntityRef,
	findings: TestGraphFinding[],
): void {
	ids.forEach((id, position) => {
		if (!target.has(id)) {
			findings.push(
				makeFinding(
					"DANGLING_REFERENCE",
					jsonPath([...basePath, position]),
					`References missing ${targetKind} ${id}.`,
					owner,
					[id],
				),
			);
		}
	});
}

function checkRef(
	id: string,
	target: Map<string, unknown>,
	targetKind: GraphEntityKind,
	path: ReadonlyArray<string | number>,
	owner: EntityRef,
	findings: TestGraphFinding[],
): void {
	if (target.has(id)) return;
	findings.push(
		makeFinding(
			"DANGLING_REFERENCE",
			jsonPath(path),
			`References missing ${targetKind} ${id}.`,
			owner,
			[id],
		),
	);
}

function checkEntityRefDuplicates(
	refs: readonly EntityRef[],
	basePath: ReadonlyArray<string | number>,
	owner: EntityRef,
	findings: TestGraphFinding[],
): void {
	const seen = new Set<string>();
	refs.forEach((ref, position) => {
		const key = `${ref.kind}\u001f${ref.id}`;
		if (seen.has(key)) {
			findings.push(
				makeFinding(
					"DUPLICATE_REFERENCE",
					jsonPath([...basePath, position]),
					`Duplicate ${ref.kind} reference ${ref.id}.`,
					owner,
					[ref.id],
				),
			);
		}
		seen.add(key);
	});
}

function checkProvenance(
	provenance: Provenance,
	owner: EntityRef,
	basePath: ReadonlyArray<string | number>,
	index: GraphIndex,
	findings: TestGraphFinding[],
): void {
	checkSetDuplicates(
		provenance.evidenceIds,
		[...basePath, "evidenceIds"],
		owner,
		findings,
	);
	checkRefs(
		provenance.evidenceIds,
		index.evidence,
		"evidence",
		[...basePath, "evidenceIds"],
		owner,
		findings,
	);

	if (provenance.kind === "explicit") {
		if (provenance.evidenceIds.length === 0) {
			findings.push(
				makeFinding(
					"PROVENANCE_EVIDENCE_REQUIRED",
					jsonPath([...basePath, "evidenceIds"]),
					"Explicit provenance requires at least one evidence reference.",
					owner,
				),
			);
		}
		for (const evidenceId of provenance.evidenceIds) {
			const evidence = index.evidence.get(evidenceId);
			if (evidence === undefined) continue;
			const source = index.sources.get(evidence.sourceId);
			if (source !== undefined && source.supplied !== true) {
				findings.push(
					makeFinding(
						"EXPLICIT_SOURCE_REQUIRED",
						jsonPath([...basePath, "evidenceIds"]),
						`Explicit provenance must cite supplied sources; ${evidence.sourceId} is not supplied.`,
						owner,
						[evidenceId, evidence.sourceId],
					),
				);
			}
		}
	} else if (provenance.kind === "inferred") {
		if (
			provenance.evidenceIds.length === 0 &&
			provenance.rationale === undefined
		) {
			findings.push(
				makeFinding(
					"PROVENANCE_RATIONALE_REQUIRED",
					jsonPath(basePath),
					"Inferred provenance requires evidence or a rationale.",
					owner,
				),
			);
		}
	}
}

/** A node is on a cycle when it can reach itself by following directed edges. */
function nodesOnCycle(
	nodes: readonly string[],
	edges: Map<string, Set<string>>,
): string[] {
	const onCycle: string[] = [];
	for (const start of [...nodes].sort()) {
		const stack = [...(edges.get(start) ?? [])];
		const visited = new Set<string>();
		let found = false;
		while (stack.length > 0) {
			const current = stack.pop();
			if (current === undefined) break;
			if (current === start) {
				found = true;
				break;
			}
			if (visited.has(current)) continue;
			visited.add(current);
			for (const next of edges.get(current) ?? []) stack.push(next);
		}
		if (found) onCycle.push(start);
	}
	return onCycle;
}

function checkFeatureCycles(
	graph: TestGraphV1,
	findings: TestGraphFinding[],
): void {
	const nodes = graph.features.map((feature) => feature.id);
	const edges = new Map<string, Set<string>>();
	for (const feature of graph.features) {
		if (feature.parentFeatureId !== undefined) {
			edges.set(feature.id, new Set([feature.parentFeatureId]));
		}
	}
	const cyclic = nodesOnCycle(nodes, edges);
	if (cyclic.length > 0) {
		findings.push(
			makeFinding(
				"FEATURE_CYCLE",
				"/features",
				`Feature parent links form a cycle: ${cyclic.join(", ")}.`,
				undefined,
				cyclic,
			),
		);
	}
}

function checkDependencyGraph(
	graph: TestGraphV1,
	findings: TestGraphFinding[],
): void {
	const caseIds = new Set(graph.testCases.map((testCase) => testCase.id));
	const edges = new Map<string, Set<string>>();
	const addEdge = (from: string, to: string): void => {
		const set = edges.get(from) ?? new Set<string>();
		set.add(to);
		edges.set(from, set);
	};

	graph.testCases.forEach((testCase, position) => {
		testCase.dependsOnCaseIds.forEach((depId, depPosition) => {
			if (depId === testCase.id) {
				findings.push(
					makeFinding(
						"DEPENDENCY_SELF_REFERENCE",
						jsonPath(["testCases", position, "dependsOnCaseIds", depPosition]),
						`Test case ${testCase.id} cannot depend on itself.`,
						{ kind: "testCase", id: testCase.id },
						[testCase.id],
					),
				);
				return;
			}
			if (caseIds.has(depId)) addEdge(depId, testCase.id);
		});
	});

	for (const data of graph.dataRequirements) {
		const producers = graph.testCases
			.filter((testCase) =>
				testCase.producesDataRequirementIds.includes(data.id),
			)
			.map((testCase) => testCase.id);
		const consumers = graph.testCases
			.filter((testCase) =>
				testCase.consumesDataRequirementIds.includes(data.id),
			)
			.map((testCase) => testCase.id);
		for (const producer of producers) {
			for (const consumer of consumers) {
				if (producer === consumer) {
					const casePosition = graph.testCases.findIndex(
						(testCase) => testCase.id === producer,
					);
					findings.push(
						makeFinding(
							"DEPENDENCY_SELF_REFERENCE",
							jsonPath([
								"testCases",
								casePosition,
								"consumesDataRequirementIds",
							]),
							`Test case ${producer} cannot consume data ${data.id} that it produces.`,
							{ kind: "testCase", id: producer },
							[data.id],
						),
					);
				} else {
					addEdge(producer, consumer);
				}
			}
		}
	}

	const cyclic = nodesOnCycle([...caseIds], edges);
	if (cyclic.length > 0) {
		findings.push(
			makeFinding(
				"DEPENDENCY_CYCLE",
				"/testCases",
				`Test case setup/data dependencies form a cycle: ${cyclic.join(", ")}.`,
				undefined,
				cyclic,
			),
		);
	}
}

function checkDataProducers(
	graph: TestGraphV1,
	findings: TestGraphFinding[],
): void {
	graph.dataRequirements.forEach((data, position) => {
		const producers = graph.testCases
			.filter((testCase) =>
				testCase.producesDataRequirementIds.includes(data.id),
			)
			.map((testCase) => testCase.id)
			.sort();
		const owner: EntityRef = { kind: "dataRequirement", id: data.id };
		const path = jsonPath(["dataRequirements", position]);

		if (data.provisioning === "case-produced") {
			if (producers.length === 0) {
				findings.push(
					makeFinding(
						"MISSING_DATA_PRODUCER",
						path,
						`Case-produced data ${data.id} needs exactly one producing case.`,
						owner,
					),
				);
			} else if (producers.length > 1) {
				findings.push(
					makeFinding(
						"MULTIPLE_DATA_PRODUCERS",
						path,
						`Case-produced data ${data.id} must have one producer, found ${producers.length}.`,
						owner,
						producers,
					),
				);
			}
		} else if (producers.length > 0) {
			findings.push(
				makeFinding(
					"MULTIPLE_DATA_PRODUCERS",
					path,
					`Data ${data.id} uses provisioning ${data.provisioning} and must not be produced by any case.`,
					owner,
					producers,
				),
			);
		}
	});
}

function checkStepOrders(
	graph: TestGraphV1,
	findings: TestGraphFinding[],
): void {
	const byCase = new Map<string, TestGraphV1["steps"]>();
	for (const step of graph.steps) {
		const bucket = byCase.get(step.testCaseId) ?? [];
		bucket.push(step);
		byCase.set(step.testCaseId, bucket);
	}

	for (const [caseId, steps] of byCase) {
		if (!graph.testCases.some((testCase) => testCase.id === caseId)) continue;
		const owner: EntityRef = { kind: "testCase", id: caseId };
		const orders = steps.map((step) => step.order);
		const duplicates = orders.filter(
			(order, position) => orders.indexOf(order) !== position,
		);
		if (duplicates.length > 0) {
			findings.push(
				makeFinding(
					"DUPLICATE_STEP_ORDER",
					"/steps",
					`Test case ${caseId} has duplicate step orders.`,
					owner,
					steps.map((step) => step.id).sort(),
				),
			);
			continue;
		}
		const sorted = [...orders].sort((a, b) => a - b);
		const contiguous = sorted.every(
			(order, position) => order === position + 1,
		);
		if (!contiguous) {
			findings.push(
				makeFinding(
					"NONCONTIGUOUS_STEP_ORDER",
					"/steps",
					`Test case ${caseId} step orders must run 1..${steps.length} without gaps.`,
					owner,
					steps.map((step) => step.id).sort(),
				),
			);
		}
	}
}

function checkTestCase(
	testCase: TestCase,
	position: number,
	index: GraphIndex,
	findings: TestGraphFinding[],
): void {
	const owner: EntityRef = { kind: "testCase", id: testCase.id };
	const base = ["testCases", position] as const;

	if (testCase.requirementIds.length === 0) {
		findings.push(
			makeFinding(
				"CASE_REQUIREMENT_REQUIRED",
				jsonPath([...base, "requirementIds"]),
				`Test case ${testCase.id} must cover at least one requirement.`,
				owner,
			),
		);
	}

	const referenceArrays: ReadonlyArray<{
		ids: readonly string[];
		field: string;
		target: Map<string, unknown>;
		kind: GraphEntityKind;
	}> = [
		{
			ids: testCase.requirementIds,
			field: "requirementIds",
			target: index.requirements,
			kind: "requirement",
		},
		{
			ids: testCase.featureIds,
			field: "featureIds",
			target: index.features,
			kind: "feature",
		},
		{
			ids: testCase.dependsOnCaseIds,
			field: "dependsOnCaseIds",
			target: index.testCases,
			kind: "testCase",
		},
		{
			ids: testCase.consumesDataRequirementIds,
			field: "consumesDataRequirementIds",
			target: index.dataRequirements,
			kind: "dataRequirement",
		},
		{
			ids: testCase.producesDataRequirementIds,
			field: "producesDataRequirementIds",
			target: index.dataRequirements,
			kind: "dataRequirement",
		},
	];
	for (const reference of referenceArrays) {
		checkSetDuplicates(
			reference.ids,
			[...base, reference.field],
			owner,
			findings,
		);
		checkRefs(
			reference.ids,
			reference.target,
			reference.kind,
			[...base, reference.field],
			owner,
			findings,
		);
	}

	checkProvenance(
		testCase.provenance,
		owner,
		[...base, "provenance"],
		index,
		findings,
	);

	// Cleanup teardown metadata (validated separately from the setup DAG).
	checkSetDuplicates(
		testCase.cleanup.afterCaseIds,
		[...base, "cleanup", "afterCaseIds"],
		owner,
		findings,
	);
	checkRefs(
		testCase.cleanup.afterCaseIds,
		index.testCases,
		"testCase",
		[...base, "cleanup", "afterCaseIds"],
		owner,
		findings,
	);
	if (testCase.cleanup.afterCaseIds.includes(testCase.id)) {
		findings.push(
			makeFinding(
				"CLEANUP_SELF_REFERENCE",
				jsonPath([...base, "cleanup", "afterCaseIds"]),
				`Cleanup for ${testCase.id} cannot order itself after itself.`,
				owner,
				[testCase.id],
			),
		);
	}
	checkSetDuplicates(
		testCase.cleanup.dataRequirementIds,
		[...base, "cleanup", "dataRequirementIds"],
		owner,
		findings,
	);
	checkRefs(
		testCase.cleanup.dataRequirementIds,
		index.dataRequirements,
		"dataRequirement",
		[...base, "cleanup", "dataRequirementIds"],
		owner,
		findings,
	);
	const usedData = new Set([
		...testCase.consumesDataRequirementIds,
		...testCase.producesDataRequirementIds,
	]);
	testCase.cleanup.dataRequirementIds.forEach((dataId, dataPosition) => {
		if (index.dataRequirements.has(dataId) && !usedData.has(dataId)) {
			findings.push(
				makeFinding(
					"CLEANUP_DATA_NOT_USED",
					jsonPath([...base, "cleanup", "dataRequirementIds", dataPosition]),
					`Cleanup data ${dataId} is neither consumed nor produced by ${testCase.id}.`,
					owner,
					[dataId],
				),
			);
		}
	});
}

function runInvariantPhase(graph: TestGraphV1): TestGraphFinding[] {
	const findings: TestGraphFinding[] = [];
	const index = buildIndex(graph, findings);

	// Evidence -> Source.
	graph.evidence.forEach((evidence, position) => {
		checkRef(
			evidence.sourceId,
			index.sources,
			"source",
			["evidence", position, "sourceId"],
			{ kind: "evidence", id: evidence.id },
			findings,
		);
	});

	// Requirements.
	graph.requirements.forEach((requirement, position) => {
		const owner: EntityRef = { kind: "requirement", id: requirement.id };
		checkSetDuplicates(
			requirement.openQuestionIds,
			["requirements", position, "openQuestionIds"],
			owner,
			findings,
		);
		checkRefs(
			requirement.openQuestionIds,
			index.openQuestions,
			"openQuestion",
			["requirements", position, "openQuestionIds"],
			owner,
			findings,
		);
		checkProvenance(
			requirement.provenance,
			owner,
			["requirements", position, "provenance"],
			index,
			findings,
		);
	});

	// Features.
	graph.features.forEach((feature, position) => {
		const owner: EntityRef = { kind: "feature", id: feature.id };
		if (feature.parentFeatureId !== undefined) {
			checkRef(
				feature.parentFeatureId,
				index.features,
				"feature",
				["features", position, "parentFeatureId"],
				owner,
				findings,
			);
		}
		checkSetDuplicates(
			feature.requirementIds,
			["features", position, "requirementIds"],
			owner,
			findings,
		);
		checkRefs(
			feature.requirementIds,
			index.requirements,
			"requirement",
			["features", position, "requirementIds"],
			owner,
			findings,
		);
		checkProvenance(
			feature.provenance,
			owner,
			["features", position, "provenance"],
			index,
			findings,
		);
	});

	// Test cases.
	graph.testCases.forEach((testCase, position) => {
		checkTestCase(testCase, position, index, findings);
	});

	// Steps.
	graph.steps.forEach((step, position) => {
		const owner: EntityRef = { kind: "step", id: step.id };
		checkRef(
			step.testCaseId,
			index.testCases,
			"testCase",
			["steps", position, "testCaseId"],
			owner,
			findings,
		);
		checkProvenance(
			step.provenance,
			owner,
			["steps", position, "provenance"],
			index,
			findings,
		);
	});

	// Assertions.
	graph.assertions.forEach((assertion, position) => {
		const owner: EntityRef = { kind: "assertion", id: assertion.id };
		checkRef(
			assertion.testCaseId,
			index.testCases,
			"testCase",
			["assertions", position, "testCaseId"],
			owner,
			findings,
		);
		if (assertion.stepId !== undefined) {
			const step = index.steps.get(assertion.stepId);
			if (step === undefined) {
				checkRef(
					assertion.stepId,
					index.steps,
					"step",
					["assertions", position, "stepId"],
					owner,
					findings,
				);
			} else if (step.testCaseId !== assertion.testCaseId) {
				findings.push(
					makeFinding(
						"ASSERTION_STEP_CASE_MISMATCH",
						jsonPath(["assertions", position, "stepId"]),
						`Assertion ${assertion.id} references a step from a different case.`,
						owner,
						[assertion.stepId, assertion.testCaseId],
					),
				);
			}
		}
		checkProvenance(
			assertion.provenance,
			owner,
			["assertions", position, "provenance"],
			index,
			findings,
		);
	});

	// Data requirements.
	graph.dataRequirements.forEach((data, position) => {
		checkProvenance(
			data.provenance,
			{ kind: "dataRequirement", id: data.id },
			["dataRequirements", position, "provenance"],
			index,
			findings,
		);
	});

	// Open questions.
	graph.openQuestions.forEach((question, position) => {
		const owner: EntityRef = { kind: "openQuestion", id: question.id };
		checkEntityRefDuplicates(
			question.blockedEntityRefs,
			["openQuestions", position, "blockedEntityRefs"],
			owner,
			findings,
		);
		if (question.status === "answered" && question.answer === undefined) {
			findings.push(
				makeFinding(
					"QUESTION_ANSWER_STATE_INVALID",
					jsonPath(["openQuestions", position]),
					`Answered question ${question.id} must include an answer.`,
					owner,
				),
			);
		}
		if (question.status === "open" && question.answer !== undefined) {
			findings.push(
				makeFinding(
					"QUESTION_ANSWER_STATE_INVALID",
					jsonPath(["openQuestions", position]),
					`Open question ${question.id} must not include an answer.`,
					owner,
				),
			);
		}
		question.blockedEntityRefs.forEach((ref, refPosition) => {
			const actualKind = index.allIds.get(ref.id);
			const path = jsonPath([
				"openQuestions",
				position,
				"blockedEntityRefs",
				refPosition,
			]);
			if (actualKind === undefined) {
				findings.push(
					makeFinding(
						"DANGLING_REFERENCE",
						path,
						`Blocked entity reference ${ref.id} does not resolve.`,
						owner,
						[ref.id],
					),
				);
			} else if (actualKind !== ref.kind) {
				findings.push(
					makeFinding(
						"REFERENCE_KIND_MISMATCH",
						path,
						`Blocked entity ${ref.id} is a ${actualKind}, not a ${ref.kind}.`,
						owner,
						[ref.id],
					),
				);
			}
		});
		checkProvenance(
			question.provenance,
			owner,
			["openQuestions", position, "provenance"],
			index,
			findings,
		);
	});

	checkFeatureCycles(graph, findings);
	checkDependencyGraph(graph, findings);
	checkDataProducers(graph, findings);
	checkStepOrders(graph, findings);

	// Plan-level state agreement.
	const planComplete = graph.status === "complete";
	if (planComplete) {
		graph.openQuestions.forEach((question, position) => {
			if (question.blocking) {
				findings.push(
					makeFinding(
						"COMPLETE_PLAN_BLOCKED",
						jsonPath(["openQuestions", position]),
						`Complete plan cannot retain blocking open question ${question.id}.`,
						{ kind: "openQuestion", id: question.id },
						[question.id],
					),
				);
			}
		});
		graph.testCases.forEach((testCase, position) => {
			if (
				testCase.automation.readiness === "blocked" ||
				testCase.automation.blockers.length > 0
			) {
				findings.push(
					makeFinding(
						"COMPLETE_PLAN_BLOCKED",
						jsonPath(["testCases", position, "automation"]),
						`Complete plan cannot retain blocked test case ${testCase.id}.`,
						{ kind: "testCase", id: testCase.id },
						[testCase.id],
					),
				);
			}
		});
	}

	const generationComplete = graph.generation.status === "complete";
	if (planComplete !== generationComplete) {
		findings.push(
			makeFinding(
				"GENERATION_STATUS_MISMATCH",
				"/generation/status",
				`Plan status ${graph.status} disagrees with generation status ${graph.generation.status}.`,
				{ kind: "generation", id: graph.generation.id },
			),
		);
	}

	return findings;
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export function validateTestGraph(input: unknown): TestGraphValidationResult {
	const schemaPhase = runSchemaPhase(input);
	if (schemaPhase.graph === null) {
		return { valid: false, findings: sortFindings(schemaPhase.findings) };
	}

	const invariantFindings = runInvariantPhase(schemaPhase.graph);
	if (invariantFindings.length > 0) {
		return { valid: false, findings: sortFindings(invariantFindings) };
	}

	return { valid: true, graph: schemaPhase.graph, findings: [] };
}

export function parseTestGraph(input: unknown): TestGraphV1 {
	const result = validateTestGraph(input);
	if (!result.valid) {
		throw new TestGraphValidationError(result.findings);
	}
	return result.graph;
}

/**
 * Validates an `n -> n + 1` plan revision transition. Both graphs must be valid;
 * then the projectId/planId must be stable, the version must increment by
 * exactly one, createdAt must be unchanged, and updatedAt must strictly advance.
 * Entity additions and removals are allowed.
 */
export function validatePlanRevisionTransition(
	previous: unknown,
	next: unknown,
): readonly TestGraphFinding[] {
	const previousResult = validateTestGraph(previous);
	const nextResult = validateTestGraph(next);
	if (!previousResult.valid || !nextResult.valid) {
		return sortFindings([
			...(previousResult.valid ? [] : previousResult.findings),
			...(nextResult.valid ? [] : nextResult.findings),
		]);
	}

	const before = previousResult.graph;
	const after = nextResult.graph;
	const findings: TestGraphFinding[] = [];

	if (before.projectId !== after.projectId) {
		findings.push(
			makeFinding(
				"PROJECT_ID_CHANGED",
				"/projectId",
				`projectId must not change across revisions (${before.projectId} -> ${after.projectId}).`,
				undefined,
				[before.projectId, after.projectId],
			),
		);
	}
	if (before.planId !== after.planId) {
		findings.push(
			makeFinding(
				"PLAN_ID_CHANGED",
				"/planId",
				`planId must not change across revisions (${before.planId} -> ${after.planId}).`,
				undefined,
				[before.planId, after.planId],
			),
		);
	}
	if (after.planVersion !== before.planVersion + 1) {
		findings.push(
			makeFinding(
				"PLAN_VERSION_NOT_INCREMENTED",
				"/planVersion",
				`planVersion must increment by exactly one (${before.planVersion} -> ${after.planVersion}).`,
			),
		);
	}
	if (before.createdAt !== after.createdAt) {
		findings.push(
			makeFinding(
				"PLAN_CREATED_AT_CHANGED",
				"/createdAt",
				"createdAt must not change across revisions.",
			),
		);
	}
	if (Date.parse(after.updatedAt) <= Date.parse(before.updatedAt)) {
		findings.push(
			makeFinding(
				"PLAN_UPDATED_AT_NOT_ADVANCED",
				"/updatedAt",
				"updatedAt must strictly advance across revisions.",
			),
		);
	}

	return sortFindings(findings);
}
