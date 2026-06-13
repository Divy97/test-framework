import { plannerManifest } from "@test-framework/planner";
import { repoScanManifest } from "@test-framework/repo-scan";

const startupSummary = {
	app: "mcp",
	status: "placeholder",
	plannerVersion: plannerManifest.version,
	repoScanVersion: repoScanManifest.version,
};

console.log(JSON.stringify(startupSummary, null, 2));
