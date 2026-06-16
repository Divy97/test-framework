import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	serializeTestGraph,
	validateTestGraph,
} from "@test-framework/qa-engine";
import { fixtureSchema } from "../schema/fixture.js";
import { buildAnnotation, compileGraph } from "./builders.js";
import { CORPUS } from "./data.js";

const CORPUS_DIR = new URL("../../test/fixtures/corpus/", import.meta.url);

function stableJson(value: unknown): string {
	return `${JSON.stringify(value, null, "\t")}\n`;
}

async function writeArtifact(url: URL, text: string): Promise<void> {
	await mkdir(fileURLToPath(new URL(".", url)), { recursive: true });
	await writeFile(fileURLToPath(url), text, "utf8");
}

/**
 * Compiles every corpus arm, validates expectations (valid arms must validate;
 * arms marked `expectValidationFailure` must actually be invalid), and writes the
 * committed JSON the harness reads. Run with `pnpm corpus:build`.
 */
async function main(): Promise<void> {
	await rm(fileURLToPath(CORPUS_DIR), { recursive: true, force: true });

	for (const build of CORPUS) {
		const fixture = fixtureSchema.parse(build.fixture);
		const fixtureDir = new URL(`${fixture.fixtureId}/`, CORPUS_DIR);
		await writeArtifact(
			new URL("fixture.json", fixtureDir),
			stableJson(build.fixture),
		);

		for (const arm of build.arms) {
			const { graph, idOf } = compileGraph(arm.draft);
			const result = validateTestGraph(graph);
			if (arm.anno.expectValidationFailure) {
				if (result.valid) {
					throw new Error(
						`${fixture.fixtureId}/${arm.draft.arm}: expected invalid graph but it validated`,
					);
				}
			} else if (!result.valid) {
				throw new Error(
					`${fixture.fixtureId}/${arm.draft.arm}: ${result.findings.map((f) => f.code).join(", ")}`,
				);
			}

			const graphText = result.valid
				? serializeTestGraph(graph)
				: stableJson(graph);
			const annotation = buildAnnotation(arm.draft, idOf, arm.anno);

			const armDir = new URL(
				`${fixture.fixtureId}/candidates/${arm.draft.arm}/`,
				CORPUS_DIR,
			);
			await writeArtifact(new URL("graph.json", armDir), graphText);
			await writeArtifact(
				new URL("annotations.json", armDir),
				stableJson(annotation),
			);
		}

		process.stdout.write(
			`built ${fixture.fixtureId} (${build.arms.length} arms)\n`,
		);
	}
}

main().catch((error: unknown) => {
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
