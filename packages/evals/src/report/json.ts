import { type EvalResult, evalResultSchema } from "../schema/result.js";

function compareCodeUnits(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/** Recursively sort object keys; never reorder array elements. */
function deepSortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(deepSortKeys);
	if (value !== null && typeof value === "object") {
		const source = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(source).sort(compareCodeUnits)) {
			Object.defineProperty(sorted, key, {
				value: deepSortKeys(source[key]),
				enumerable: true,
				configurable: true,
				writable: true,
			});
		}
		return sorted;
	}
	return value;
}

/**
 * Canonical EvalResult JSON: validated, key-sorted, tab-indented, single trailing
 * newline. Carries no timestamp, so the same inputs always serialize to the same
 * bytes. Mirrors the Test Graph canonical-JSON discipline.
 */
export function serializeEvalResult(result: EvalResult): string {
	const validated = evalResultSchema.parse(result);
	return `${JSON.stringify(deepSortKeys(validated), null, "\t")}\n`;
}

export function parseEvalResult(input: unknown): EvalResult {
	return evalResultSchema.parse(input);
}
