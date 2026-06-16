import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Annotation, annotationSchema } from "../schema/annotation.js";
import { type Arm, armSchema } from "../schema/common.js";
import { type Fixture, fixtureSchema } from "../schema/fixture.js";

export type DiscoveredCandidate = {
	arm: Arm;
	graphInput: unknown;
	annotation: Annotation;
	leakageText: string;
	rawGraphText: string;
	rawAnnotationText: string;
};

export type DiscoveredFixture = {
	fixture: Fixture;
	rawFixtureText: string;
	candidates: DiscoveredCandidate[];
};

/** Canonical arm order so discovery is independent of filesystem listing order. */
export const ARM_ORDER: readonly Arm[] = [
	"raw-model",
	"host-only",
	"qa-engine",
];

async function listDirs(path: string): Promise<string[]> {
	const entries = await readdir(path, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

async function readJson(
	path: string,
): Promise<{ text: string; value: unknown }> {
	const text = await readFile(path, "utf8");
	return { text, value: JSON.parse(text) as unknown };
}

/**
 * Reads the committed corpus into validated, in-memory fixtures. Scoring stays a
 * pure function of this data; all IO lives here. Fixtures and candidates come back
 * in a deterministic order regardless of how the filesystem lists them.
 */
export async function discoverCorpus(
	corpusDir: string,
): Promise<DiscoveredFixture[]> {
	const fixtureIds = await listDirs(corpusDir);
	const fixtures: DiscoveredFixture[] = [];

	for (const fixtureId of fixtureIds) {
		const fixtureDir = join(corpusDir, fixtureId);
		const fixtureFile = await readJson(join(fixtureDir, "fixture.json"));
		const fixture: Fixture = fixtureSchema.parse(fixtureFile.value);

		const candidatesDir = join(fixtureDir, "candidates");
		const armNames = await listDirs(candidatesDir);
		const candidates: DiscoveredCandidate[] = [];
		for (const armName of armNames) {
			const arm = armSchema.parse(armName);
			const armDir = join(candidatesDir, armName);
			const graphFile = await readJson(join(armDir, "graph.json"));
			const annotationFile = await readJson(join(armDir, "annotations.json"));
			const annotation: Annotation = annotationSchema.parse(
				annotationFile.value,
			);
			candidates.push({
				arm,
				graphInput: graphFile.value,
				annotation,
				leakageText: `${graphFile.text}\n${annotationFile.text}`,
				rawGraphText: graphFile.text,
				rawAnnotationText: annotationFile.text,
			});
		}
		candidates.sort(
			(a, b) => ARM_ORDER.indexOf(a.arm) - ARM_ORDER.indexOf(b.arm),
		);

		fixtures.push({
			fixture,
			rawFixtureText: fixtureFile.text,
			candidates,
		});
	}

	fixtures.sort((a, b) =>
		a.fixture.fixtureId < b.fixture.fixtureId
			? -1
			: a.fixture.fixtureId > b.fixture.fixtureId
				? 1
				: 0,
	);
	return fixtures;
}
