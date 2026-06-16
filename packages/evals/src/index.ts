export type {
	DiscoveredCandidate,
	DiscoveredFixture,
} from "./harness/discover.js";
export { ARM_ORDER, discoverCorpus } from "./harness/discover.js";
export type { RegressionReport } from "./harness/regression.js";
export { compareToBaseline } from "./harness/regression.js";
export { scoreCorpus } from "./harness/run.js";
export type { ScoreCandidateInput } from "./harness/score-candidate.js";
export { scoreCandidate } from "./harness/score-candidate.js";
export { checkAnnotationIntegrity } from "./integrity.js";
export type { CandidateContext, DimensionResult } from "./join.js";
export { buildContext } from "./join.js";
export { parseEvalResult, serializeEvalResult } from "./report/json.js";
export { renderReportMarkdown } from "./report/markdown.js";
export * from "./schema/annotation.js";
export * from "./schema/common.js";
export * from "./schema/fixture.js";
export * from "./schema/result.js";
export * from "./schema/rubric.js";
export { detectLeakage } from "./scoring/leakage.js";

export const evalsManifest = {
	name: "evals",
	version: "0.1.0",
} as const;
