import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { discoverCorpus } from "../harness/discover.js";
import { compareToBaseline } from "../harness/regression.js";
import { scoreCorpus } from "../harness/run.js";
import { parseEvalResult, serializeEvalResult } from "../report/json.js";
import { renderReportMarkdown } from "../report/markdown.js";
import { rubricSchema, thresholdsSchema } from "../schema/rubric.js";

const ROOT = new URL("../../", import.meta.url);
const CORPUS_DIR = fileURLToPath(new URL("test/fixtures/corpus", ROOT));
const CONFIG_DIR = new URL("test/fixtures/eval-config/", ROOT);
const BASELINE_DIR = new URL("test/fixtures/baseline/", ROOT);

async function readJson(url: URL): Promise<unknown> {
	return JSON.parse(await readFile(fileURLToPath(url), "utf8")) as unknown;
}

async function main(): Promise<number> {
	const update = process.argv.includes("--update-baseline");

	const rubric = rubricSchema.parse(
		await readJson(new URL("rubric.json", CONFIG_DIR)),
	);
	const thresholds = thresholdsSchema.parse(
		await readJson(new URL("thresholds.json", CONFIG_DIR)),
	);

	const fixtures = await discoverCorpus(CORPUS_DIR);
	const result = scoreCorpus(fixtures, rubric, thresholds);
	const resultText = serializeEvalResult(result);
	const reportText = renderReportMarkdown(result);

	const resultsUrl = new URL("results.json", BASELINE_DIR);
	const reportUrl = new URL("report.md", BASELINE_DIR);

	if (update) {
		await mkdir(fileURLToPath(BASELINE_DIR), { recursive: true });
		await writeFile(fileURLToPath(resultsUrl), resultText, "utf8");
		await writeFile(fileURLToPath(reportUrl), reportText, "utf8");
		process.stdout.write(`baseline updated: ${fixtures.length} fixtures\n`);
		return 0;
	}

	let baseline: unknown;
	try {
		baseline = await readJson(resultsUrl);
	} catch {
		process.stderr.write(
			"no accepted baseline; run `pnpm eval:update` to record one\n",
		);
		return 2;
	}

	const report = compareToBaseline(
		result,
		parseEvalResult(baseline),
		thresholds.maxRegressionDelta,
		thresholds.maxUnsupportedRegressionDelta,
	);
	process.stdout.write(reportText);
	for (const note of report.notes) process.stdout.write(`${note}\n`);
	if (report.regressions.length > 0) {
		for (const line of report.regressions) {
			process.stderr.write(`regression: ${line}\n`);
		}
		return 1;
	}
	process.stdout.write("eval: no regressions\n");
	return 0;
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error: unknown) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 2;
	});
