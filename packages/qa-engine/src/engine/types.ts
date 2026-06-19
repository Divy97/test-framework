import type { ModelProvider, NormalizedUsage } from "../providers/types.js";
import type { Source, TestGraphV1 } from "../test-graph/schema.js";

/**
 * Coarse engine surface. Callers hand in a brief (and optionally a repo) and get
 * back a validated, persisted Test Graph. The eight internal stages
 * (ingest -> contextualize -> evidence -> requirements -> features -> cases ->
 * details -> review/validate/repair -> persist) are never exposed (ADR-0003).
 */

/** One supplied source the model reads. `content` is the text it extracts from. */
export interface CreatePlanSource {
	kind: Source["kind"];
	title: string;
	content: string;
	/** Stable external pointer (path/url). Used as the source's identity key. */
	locator?: string;
}

export interface CreatePlanInput {
	project: { name: string };
	title: string;
	sources: CreatePlanSource[];
	/** Optional repo context; pulled only when `deps.scan` is also provided. */
	repo?: { path: string };
}

/** Bounded, confined repository context. Shape kept minimal for V1. */
export interface RepoContext {
	revision?: string;
	/** One synthesized claim per signal the scan surfaced. */
	signals: string[];
	/** True when the scan hit a cap and the context is partial. */
	truncated: boolean;
}

export interface EngineDeps {
	provider: ModelProvider;
	/** Injected clock (epoch ms); matches the provider seam DI. */
	now: () => number;
	/** Root every artifact write is confined to. */
	workspaceRoot: string;
	/** Optional repo context provider; called only when `input.repo` is set. */
	scan?: (req: { path: string }) => Promise<RepoContext>;
	/** Cancellation propagated to every model call. */
	signal?: AbortSignal;
	methodologyVersion?: string;
	workflowVersion?: string;
	/** Max model re-calls after a failed validation. Default 2. */
	repairBudget?: number;
	/** Per-call output-token budget. Default 4096. */
	maxOutputTokens?: number;
	/** Per-call wall-clock budget (ms). Default 60_000. */
	timeoutMs?: number;
}

export interface CreatePlanResult {
	graph: TestGraphV1;
	/** Directory the plan was persisted to (under `workspaceRoot`). */
	planDir: string;
	usage: NormalizedUsage;
	warnings: string[];
	status: "complete" | "incomplete";
}

export interface LoadPlanInput {
	planId: string;
}

/**
 * Refine an existing persisted plan into a `planVersion + 1` revision from scoped
 * feedback. `expectedVersion` is the optimistic conflict token: the version the
 * caller last loaded. When supplied and stale, refine throws `ARTIFACT_CONFLICT`
 * before any model spend or write. `sources` may add new sources to the plan.
 */
export interface RefinePlanInput {
	planId: string;
	feedback: string;
	expectedVersion?: number;
	sources?: CreatePlanSource[];
}

export interface RefinePlanResult {
	graph: TestGraphV1;
	/** Directory the revision was persisted to (under `workspaceRoot`). */
	planDir: string;
	usage: NormalizedUsage;
	warnings: string[];
	status: "complete" | "incomplete";
	/** The `planVersion` of the revision this one replaced. */
	previousVersion: number;
}
