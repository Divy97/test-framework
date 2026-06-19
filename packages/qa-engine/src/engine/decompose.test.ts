import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeTestGraph } from "../test-graph/canonical-json.js";
import { createStableId } from "../test-graph/ids.js";
import {
	buildValidTestGraph,
	testGraphIds,
} from "../test-graph/test-helpers.js";
import { validateTestGraph } from "../test-graph/validate.js";
import { type AssembleMeta, assemble } from "./assemble.js";
import { decomposePlan } from "./decompose.js";

function metaFrom(graph: ReturnType<typeof buildValidTestGraph>): AssembleMeta {
	return {
		generatedAt: graph.generation.generatedAt,
		createdAt: graph.createdAt,
		updatedAt: graph.updatedAt,
		methodologyVersion: graph.generation.methodologyVersion,
		workflowVersion: graph.generation.workflowVersion,
		generator: graph.generation.generator,
		status: graph.status === "draft" ? "incomplete" : graph.status,
		warnings: [...graph.generation.warnings],
		planVersion: graph.planVersion,
		// The fixture's generation id is keyed "initial".
		generationKey: "initial",
		// decompose → assemble is the refine path: preserve id-shaped keys verbatim.
		preserveExistingIds: true,
		...(graph.generation.repositoryRevision !== undefined && {
			repositoryRevision: graph.generation.repositoryRevision,
		}),
	};
}

test("decompose then assemble at the same version reproduces the graph", () => {
	const graph = buildValidTestGraph();
	const { ingested, draft } = decomposePlan(graph);
	const rebuilt = assemble(ingested, draft, metaFrom(graph));

	// Decomposition preserves identity (ADR-0007): a same-version round-trip
	// yields a byte-identical canonical graph, so every entity id is unchanged.
	assert.equal(validateTestGraph(rebuilt).valid, true);
	assert.equal(rebuilt.projectId, graph.projectId);
	assert.equal(rebuilt.planId, graph.planId);
	assert.equal(serializeTestGraph(rebuilt), serializeTestGraph(graph));

	// Explicit per-entity id coverage across every entity array.
	const idsOf = (g: typeof graph) => ({
		sources: g.sources.map((s) => s.id).sort(),
		evidence: g.evidence.map((e) => e.id).sort(),
		requirements: g.requirements.map((r) => r.id).sort(),
		features: g.features.map((f) => f.id).sort(),
		testCases: g.testCases.map((c) => c.id).sort(),
		steps: g.steps.map((s) => s.id).sort(),
		assertions: g.assertions.map((a) => a.id).sort(),
		dataRequirements: g.dataRequirements.map((d) => d.id).sort(),
		openQuestions: g.openQuestions.map((q) => q.id).sort(),
		generation: g.generation.id,
	});
	assert.deepEqual(idsOf(rebuilt), idsOf(graph));
});

test("decompose preserves provenance kind and evidence linkage", () => {
	const graph = buildValidTestGraph();
	const { draft } = decomposePlan(graph);

	const requirement = draft.requirements[0];
	assert.ok(requirement);
	// The explicit requirement's provenance round-trips with its evidence key,
	// which is the evidence entity's id (no provenance loss — a CONTEXT invariant).
	assert.equal(requirement.provenance.kind, "explicit");
	assert.deepEqual(requirement.provenance.evidenceKeys, [
		testGraphIds.evidenceId,
	]);
});

test("create-path assemble hashes id-shaped keys; refine preserves them", () => {
	const graph = buildValidTestGraph();
	const { ingested, draft } = decomposePlan(graph);

	// decompose re-keys entities by their (id-shaped) id. On the create path
	// (preserveExistingIds false) those keys are hashed, so a model emitting an
	// id-shaped slug can never pin an entity id (ADR-0007); only refine preserves.
	const created = assemble(ingested, draft, {
		...metaFrom(graph),
		preserveExistingIds: false,
	});
	assert.notEqual(created.requirements[0]?.id, graph.requirements[0]?.id);

	// metaFrom sets preserveExistingIds: true (the refine path) → ids preserved.
	const refined = assemble(ingested, draft, metaFrom(graph));
	assert.equal(refined.requirements[0]?.id, graph.requirements[0]?.id);
});

test("decompose round-trips blockedEntityRefs on open questions", () => {
	// The default fixture has no open questions, so attach one that blocks a real
	// entity. A non-blocking open question is valid even in a complete plan.
	const base = buildValidTestGraph();
	const ref = { kind: "requirement", id: testGraphIds.requirementId } as const;
	const graph: ReturnType<typeof buildValidTestGraph> = {
		...base,
		openQuestions: [
			{
				id: createStableId("openQuestion", testGraphIds.planId, "blocked-q"),
				question: "Which MFA methods must login support?",
				status: "open",
				blocking: false,
				provenance: {
					kind: "explicit",
					evidenceIds: [testGraphIds.evidenceId],
				},
				blockedEntityRefs: [ref],
			},
		],
	};
	// Precondition: the fixture-with-a-blocked-ref is itself valid.
	assert.equal(validateTestGraph(graph).valid, true);

	const { ingested, draft } = decomposePlan(graph);
	const rebuilt = assemble(ingested, draft, metaFrom(graph));

	// The ref survives the revision round-trip — no silent provenance loss.
	assert.equal(serializeTestGraph(rebuilt), serializeTestGraph(graph));
	assert.deepEqual(rebuilt.openQuestions[0]?.blockedEntityRefs, [ref]);
});
