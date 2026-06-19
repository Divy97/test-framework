// Coarse QA Engine surface. The eight internal stages stay private (ADR-0003);
// only the create/load operations, their types, and the error taxonomy are public.
export { createPlan, loadPlan, refinePlan } from "./engine.js";
export { EngineError, type EngineErrorCode } from "./errors.js";
export type {
	CreatePlanInput,
	CreatePlanResult,
	CreatePlanSource,
	EngineDeps,
	LoadPlanInput,
	RefinePlanInput,
	RefinePlanResult,
	RepoContext,
} from "./types.js";
