import { join } from "node:path";
import { artifactPaths } from "@test-framework/artifacts";
import {
	analyzeFeatureOutputSchema,
	exportTestCasesOutputSchema,
	generateTestCasesOutputSchema,
	mapFeatureOutputSchema,
	reviewTestCasesOutputSchema,
} from "@test-framework/planner";
import type { ToolHandlers } from "./handlers.js";

export function createStubToolHandlers(): ToolHandlers {
	return {
		async analyzeFeature(input) {
			return analyzeFeatureOutputSchema.parse({
				normalizedPrd: {
					featureSummary: input.featureRequest,
					userRoles: [],
					goals: [input.featureRequest],
					inScopeBehavior: [input.featureRequest],
					outOfScopeBehavior: [],
					businessRules: [],
					uiStates: [],
					dataRules: [],
					apiContracts: [],
					authPermissionRules: [],
					edgeCases: [],
					openQuestions: [],
					sourceReferences: input.relevantFiles.map((path) => ({
						label: "Relevant implementation file",
						path,
					})),
				},
			});
		},
		async mapFeature(input) {
			const summary = input.normalizedPrd.featureSummary;
			return mapFeatureOutputSchema.parse({
				featureMap: [
					{
						feature: summary,
						subFeature: summary,
						userFlow: summary,
						screensRoutes: [],
						componentsFiles: input.relevantFiles,
						apisDataStores: [],
						dependencies: [],
						riskLevel: "medium",
					},
				],
				acceptanceCriteria: [
					{
						id: "AC-001",
						statement: `The feature satisfies: ${summary}`,
						strength: "assumption",
						evidenceSource: "inferred",
						sourceReferences: input.normalizedPrd.sourceReferences,
					},
				],
				repoScan: {
					framework: null,
					packageManager: null,
					routesPages: [],
					components: [],
					apiHandlers: [],
					dbSchemasModels: [],
					existingTests: [],
					authMiddleware: [],
					validationSchemas: [],
					featureFlags: [],
					externalIntegrations: [],
				},
			});
		},
		async generateTestCases(input) {
			const objective =
				input.acceptanceCriteria[0]?.statement ??
				input.normalizedPrd.featureSummary;
			return generateTestCasesOutputSchema.parse({
				testCases: [
					{
						id: "TC-001",
						title: `Verify ${input.normalizedPrd.featureSummary}`,
						type: "positive",
						priority: "p1",
						objective,
						preconditions: [],
						testDataAccounts: [],
						steps: ["Exercise the described feature flow"],
						expectedResults: [objective],
						postconditions: [],
						relatedFilesRoutesApis: input.featureMap.flatMap(
							(item) => item.componentsFiles,
						),
						evidenceSource: "inferred",
						automationReadiness: "manual",
					},
				],
			});
		},
		async reviewTestCases(input) {
			return reviewTestCasesOutputSchema.parse({
				findings:
					input.testCases.length > 0
						? []
						: [
								{
									id: "RF-001",
									severity: "high",
									summary: "No test cases were provided",
									recommendation:
										"Generate at least one test case before review",
									relatedTestCaseIds: [],
								},
							],
			});
		},
		async exportTestCases(input) {
			const paths = {
				json: artifactPaths.testCasesJson,
				markdown: artifactPaths.testCasesMarkdown,
			} as const;
			return exportTestCasesOutputSchema.parse({
				status: "preview",
				testCases: input.testCases,
				artifacts: input.formats.map((format) => ({
					format,
					path: join(input.repoPath, paths[format]),
					written: false,
				})),
			});
		},
	};
}
