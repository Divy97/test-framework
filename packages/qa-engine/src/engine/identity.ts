import { createHash } from "node:crypto";
import {
	createStableId,
	type PlanId,
	type ProjectId,
	type SourceId,
} from "../test-graph/ids.js";
import type { Source } from "../test-graph/schema.js";
import { EngineError } from "./errors.js";
import type { CreatePlanInput } from "./types.js";

/** Workspace namespace under which every project ID is scoped. */
const PROJECT_NAMESPACE = "test-framework";

/**
 * Canonicalize a caller string into a stable semantic key. `createStableId`
 * refuses non-canonical keys, so we trim + NFC here and reject empties at the
 * boundary as INVALID_INPUT rather than letting a deep call throw raw.
 */
export function canonicalKey(value: string, label: string): string {
	const canonical = value.trim().normalize("NFC");
	if (canonical.length === 0) {
		throw new EngineError("INVALID_INPUT", `${label} must not be empty.`);
	}
	return canonical;
}

export interface IngestedSource {
	/** Identity key the model uses to reference this source. */
	key: string;
	id: SourceId;
	node: Source;
	content: string;
}

export interface Ingested {
	projectId: ProjectId;
	planId: PlanId;
	title: string;
	inputFingerprint: string;
	sources: IngestedSource[];
}

/**
 * Deterministic ingest + identity. Validates the brief, derives stable project
 * and plan IDs (never from content fingerprint, so refinement keeps identity),
 * builds Source nodes, and fingerprints the inputs for provenance.
 */
export function ingest(input: CreatePlanInput): Ingested {
	const title = canonicalKey(input.title, "title");
	const projectKey = canonicalKey(input.project.name, "project.name");

	if (input.sources.length === 0) {
		throw new EngineError("INVALID_INPUT", "At least one source is required.");
	}

	const projectId = createStableId("project", PROJECT_NAMESPACE, projectKey);
	const planId = createStableId("plan", projectId, title);

	const sources: IngestedSource[] = [];
	const seenKeys = new Set<string>();
	for (const source of input.sources) {
		const content = source.content.trim();
		if (content.length === 0) {
			throw new EngineError(
				"INVALID_INPUT",
				`Source "${source.title}" has empty content.`,
			);
		}
		const key = canonicalKey(source.locator ?? source.title, "source identity");
		if (seenKeys.has(key)) {
			throw new EngineError(
				"INVALID_INPUT",
				`Duplicate source identity "${key}"; give each source a distinct locator or title.`,
			);
		}
		seenKeys.add(key);

		const node: Source = {
			id: createStableId("source", planId, key),
			kind: source.kind,
			title: canonicalKey(source.title, "source.title"),
			supplied: true,
			...(source.locator !== undefined && {
				locator: canonicalKey(source.locator, "source.locator"),
			}),
		};
		sources.push({ key, id: node.id, node, content });
	}

	const inputFingerprint = createHash("sha256")
		.update(
			JSON.stringify({
				project: projectKey,
				title,
				sources: input.sources.map((source) => ({
					kind: source.kind,
					title: source.title,
					locator: source.locator ?? null,
					// Hash the trimmed content the engine actually commits, so the
					// fingerprint matches what was processed (provenance accuracy).
					content: source.content.trim(),
				})),
				repo: input.repo?.path ?? null,
			}),
			"utf8",
		)
		.digest("hex");

	return { projectId, planId, title, inputFingerprint, sources };
}
