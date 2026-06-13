import { join } from "node:path";

export const artifactDirName = ".test-framework";

export const artifactPaths = {
	project: join(artifactDirName, "project.json"),
	normalizedPrd: join(artifactDirName, "normalized-prd.md"),
	featureMap: join(artifactDirName, "feature-map.json"),
	testCasesMarkdown: join(artifactDirName, "test-cases.md"),
	testCasesJson: join(artifactDirName, "test-cases.json"),
} as const;
