// BYOK provider seam. Only the neutral surface — adapters are never exported
// here (they are dynamic-imported by the factory), so the vendor SDK stays off
// this common import path.
export * from "./providers/index.js";
export * from "./test-graph/actions.js";
export * from "./test-graph/assertions.js";
export * from "./test-graph/canonical-json.js";
export * from "./test-graph/common.js";
export * from "./test-graph/findings.js";
export * from "./test-graph/ids.js";
export * from "./test-graph/markdown.js";
export * from "./test-graph/migrations.js";
export * from "./test-graph/schema.js";
export * from "./test-graph/targets.js";
export * from "./test-graph/validate.js";
export * from "./test-graph/version.js";

export const qaEngineManifest = {
	name: "qa-engine",
	version: "0.1.0",
} as const;
