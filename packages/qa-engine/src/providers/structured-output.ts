import { type ZodType, z } from "zod";
import { ProviderError } from "./errors.js";
import type { RawOutput } from "./types.js";

/**
 * Structured-output validation. The caller always passes a Zod schema; the seam —
 * not the adapter — owns validation, so a provider can never hand back partial
 * or unvalidated data.
 */

/**
 * Convert a caller Zod schema to the JSON Schema a provider needs.
 *
 * `io: "input"` describes the shape the model should EMIT — `validateOutput`
 * runs `schema.safeParse`, so the model emits the input side and the schema's
 * transforms/defaults are applied during validation. `unrepresentable: "any"`
 * keeps conversion from throwing on the engine's stage schemas, which contain
 * Zod transforms and `z.custom()` types (e.g. in the cases/details/plan-draft
 * schemas) with no JSON Schema form: those fields become a permissive `{}` in the
 * hint given to the model, while `validateOutput` still enforces the FULL strict
 * schema (transforms and all) on the returned JSON. Without this the cases stage
 * throws "Transforms cannot be represented in JSON Schema" for every real
 * provider — a path the deterministic fake never exercises.
 */
export function toProviderSchema(schema: ZodType): unknown {
	return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
}

function invalid(detail: string, cause?: unknown): ProviderError {
	return new ProviderError("MODEL_OUTPUT_INVALID", detail, false, { cause });
}

/**
 * Validate a normalized raw output against the caller schema. `native`/`tool`
 * channels yield `json`; the `prompted` channel yields `text` that we strict-parse
 * to JSON first. Any failure throws `MODEL_OUTPUT_INVALID` — never a partial
 * success. Semantic repair is the engine's job, not the seam's.
 */
export function validateOutput<T>(output: RawOutput, schema: ZodType<T>): T {
	let value: unknown;
	if (output.kind === "json") {
		value = output.value;
	} else {
		try {
			value = JSON.parse(output.value);
		} catch (err) {
			throw invalid("model output was not valid JSON", err);
		}
	}

	const result = schema.safeParse(value);
	if (!result.success) {
		throw invalid(
			`model output did not match the requested schema: ${result.error.message}`,
		);
	}
	return result.data;
}
