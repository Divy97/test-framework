import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEvalResult, serializeEvalResult } from "./json.js";
import { renderReportMarkdown } from "./markdown.js";

const baselineUrl = new URL(
	"../../test/fixtures/baseline/results.json",
	import.meta.url,
);

async function loadBaseline(): Promise<{
	text: string;
	result: ReturnType<typeof parseEvalResult>;
}> {
	const text = await readFile(fileURLToPath(baselineUrl), "utf8");
	return { text, result: parseEvalResult(JSON.parse(text)) };
}

test("serializing the parsed baseline reproduces its exact bytes", async () => {
	const { text, result } = await loadBaseline();
	assert.equal(serializeEvalResult(result), text);
});

test("re-serialization is idempotent", async () => {
	const { result } = await loadBaseline();
	assert.equal(serializeEvalResult(result), serializeEvalResult(result));
});

test("the result carries no wall-clock timestamp", async () => {
	const { text } = await loadBaseline();
	assert.equal(/generatedAt|timestamp|\d{4}-\d{2}-\d{2}T/.test(text), false);
});

test("the markdown report is deterministic", async () => {
	const { result } = await loadBaseline();
	assert.equal(renderReportMarkdown(result), renderReportMarkdown(result));
});
