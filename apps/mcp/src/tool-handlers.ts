import { mapFeatureOutputSchema } from "@test-framework/planner";
import { scanRepository } from "@test-framework/repo-scan";
import type { ToolHandlers } from "./handlers.js";
import { createStubToolHandlers } from "./stub-handlers.js";

/**
 * Production tool handlers. Creates the deterministic stubs once and overrides
 * only `mapFeature` so it returns a real repository scan; feature-map and
 * acceptance-criteria reasoning remain stubs until the provider milestone. The
 * scanner is injectable to keep this composition unit-testable.
 */
export function createToolHandlers(
	scan: typeof scanRepository = scanRepository,
): ToolHandlers {
	const stubs = createStubToolHandlers();
	return {
		...stubs,
		async mapFeature(input) {
			const stubOutput = await stubs.mapFeature(input);
			const repoScan = await scan({
				rootPath: input.repoPath,
				relevantFiles: input.relevantFiles,
				options: input.scanOptions,
			});
			return mapFeatureOutputSchema.parse({ ...stubOutput, repoScan });
		},
	};
}
