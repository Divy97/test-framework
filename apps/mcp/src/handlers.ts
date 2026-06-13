import type {
	AnalyzeFeatureInput,
	AnalyzeFeatureOutput,
	ExportTestCasesInput,
	ExportTestCasesOutput,
	GenerateTestCasesInput,
	GenerateTestCasesOutput,
	MapFeatureInput,
	MapFeatureOutput,
	ReviewTestCasesInput,
	ReviewTestCasesOutput,
} from "@test-framework/planner";

export interface ToolHandlers {
	analyzeFeature(input: AnalyzeFeatureInput): Promise<AnalyzeFeatureOutput>;
	mapFeature(input: MapFeatureInput): Promise<MapFeatureOutput>;
	generateTestCases(
		input: GenerateTestCasesInput,
	): Promise<GenerateTestCasesOutput>;
	reviewTestCases(input: ReviewTestCasesInput): Promise<ReviewTestCasesOutput>;
	exportTestCases(input: ExportTestCasesInput): Promise<ExportTestCasesOutput>;
}
