import { type ZodType, z } from "zod";
import { ProviderError } from "./errors.js";
import type { RawOutput } from "./types.js";

/**
 * Structured-output validation. The caller always passes a Zod schema; the seam —
 * not the adapter — owns validation, so a provider can never hand back partial
 * or unvalidated data.
 */

/** Convert a caller Zod schema to the JSON Schema a provider needs. */
export function toProviderSchema(schema: ZodType): unknown {
	return z.toJSONSchema(schema);
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
