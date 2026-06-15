import { DIMENSION_KEYS } from "../schema/common.js";
import type { CandidateResult, EvalResult } from "../schema/result.js";

/** Short column headers for the dimension breakdown table. */
const DIMENSION_HEADERS: Record<(typeof DIMENSION_KEYS)[number], string> = {
	requirementRecall: "recall",
	traceability: "trace",
	scenarioCoverage: "coverage",
	unsupportedClaims: "unsup",
	provenanceAccuracy: "prov",
	duplicateLowValue: "dup",
	assertionQuality: "assert",
	executionReadiness: "ready",
	evidenceCorrectness: "evidence",
};

function hardFailCell(candidate: CandidateResult): string {
	return candidate.hardFailReasons.length === 0
		? "none"
		: candidate.hardFailReasons.join(", ");
}

/**
 * Derived, byte-stable human report. The JSON result stays canonical; this is a
 * read projection that shows each arm's verdict, aggregate, and per-dimension
 * scores so a reviewer can see why a Candidate scored as it did.
 */
export function renderReportMarkdown(result: EvalResult): string {
	const lines: string[] = [];
	lines.push("# Eval Report", "");
	lines.push(`- Rubric fingerprint: \`${result.rubricFingerprint}\``);
	lines.push(`- Corpus fingerprint: \`${result.corpusFingerprint}\``);
	lines.push("");

	for (const fixture of result.fixtures) {
		lines.push(`## ${fixture.fixtureId} (${fixture.category})`, "");

		lines.push("| Arm | Verdict | Overall | Hard-fail |");
		lines.push("| --- | --- | --- | --- |");
		for (const candidate of fixture.candidates) {
			lines.push(
				`| ${candidate.arm} | ${candidate.verdict} | ${candidate.overall} | ${hardFailCell(candidate)} |`,
			);
		}
		lines.push("");

		const header = [
			"Arm",
			...DIMENSION_KEYS.map((key) => DIMENSION_HEADERS[key]),
		];
		lines.push(`| ${header.join(" | ")} |`);
		lines.push(`| ${header.map(() => "---").join(" | ")} |`);
		for (const candidate of fixture.candidates) {
			const cells = [
				candidate.arm,
				...DIMENSION_KEYS.map((key) => String(candidate.dimensions[key])),
			];
			lines.push(`| ${cells.join(" | ")} |`);
		}
		lines.push("");
	}

	return `${lines.join("\n")}\n`;
}
