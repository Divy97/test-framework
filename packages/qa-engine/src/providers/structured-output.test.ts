import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ProviderError } from "./errors.js";
import { toProviderSchema, validateOutput } from "./structured-output.js";

const schema = z.object({
	verdict: z.enum(["pass", "fail"]),
	score: z.number(),
});

test("toProviderSchema emits a JSON Schema object", () => {
	const json = toProviderSchema(schema) as Record<string, unknown>;
	assert.equal(json.type, "object");
	assert.ok("properties" in json);
});

test("validates a json output into typed data", () => {
	const data = validateOutput(
		{ kind: "json", value: { verdict: "pass", score: 0.9 } },
		schema,
	);
	assert.equal(data.verdict, "pass");
	assert.equal(data.score, 0.9);
});

test("strict-parses a text output that is valid JSON", () => {
	const data = validateOutput(
		{ kind: "text", value: '{"verdict":"fail","score":0.1}' },
		schema,
	);
	assert.equal(data.verdict, "fail");
});

test("json output failing the schema throws MODEL_OUTPUT_INVALID, no partial data", () => {
	assert.throws(
		() => validateOutput({ kind: "json", value: { verdict: "maybe" } }, schema),
		(e) => e instanceof ProviderError && e.code === "MODEL_OUTPUT_INVALID",
	);
});

test("non-JSON text throws MODEL_OUTPUT_INVALID", () => {
	assert.throws(
		() => validateOutput({ kind: "text", value: "not json at all" }, schema),
		(e) => e instanceof ProviderError && e.code === "MODEL_OUTPUT_INVALID",
	);
});

test("MODEL_OUTPUT_INVALID is not retryable", () => {
	try {
		validateOutput({ kind: "text", value: "x" }, schema);
		assert.fail("expected throw");
	} catch (e) {
		assert.ok(e instanceof ProviderError);
		assert.equal(e.retryable, false);
	}
});
