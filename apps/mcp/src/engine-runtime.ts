import type {
	EngineDeps,
	ModelProvider,
	RepoContext,
} from "@test-framework/qa-engine";

/**
 * Everything the adapter needs to build a per-call `EngineDeps`, minus the
 * per-call `workspaceRoot` (resolved by the roots policy) and `signal` (taken
 * from the request `extra`). The provider and `scan` are constructed once and
 * reused; `workspaceRoot` and `signal` change every call.
 *
 * This mirrors the engine's DI seam (ADR-0010): production builds a real
 * provider via `createProvider(config)`; tests inject a scripted fake. The fake
 * is never a configurable value — it is injected here directly.
 */
export interface EngineRuntime {
	provider: ModelProvider;
	/** Root every artifact write is confined to; resolved per call. */
	workspaceRoot: string;
	scan?: (req: { path: string }) => Promise<RepoContext>;
	now: () => number;
	methodologyVersion?: string;
	workflowVersion?: string;
	repairBudget?: number;
	maxOutputTokens?: number;
	timeoutMs?: number;
}

/**
 * Project a runtime + the per-call resolved root and cancellation signal into the
 * engine's `EngineDeps`. `signal` is omitted when absent so the engine's
 * exactOptionalPropertyTypes-compatible deps stay clean.
 */
export function engineDepsFor(
	runtime: EngineRuntime,
	root: string,
	signal?: AbortSignal,
): EngineDeps {
	return {
		provider: runtime.provider,
		now: runtime.now,
		workspaceRoot: root,
		...(runtime.scan !== undefined && { scan: runtime.scan }),
		...(signal !== undefined && { signal }),
		...(runtime.methodologyVersion !== undefined && {
			methodologyVersion: runtime.methodologyVersion,
		}),
		...(runtime.workflowVersion !== undefined && {
			workflowVersion: runtime.workflowVersion,
		}),
		...(runtime.repairBudget !== undefined && {
			repairBudget: runtime.repairBudget,
		}),
		...(runtime.maxOutputTokens !== undefined && {
			maxOutputTokens: runtime.maxOutputTokens,
		}),
		...(runtime.timeoutMs !== undefined && { timeoutMs: runtime.timeoutMs }),
	};
}
