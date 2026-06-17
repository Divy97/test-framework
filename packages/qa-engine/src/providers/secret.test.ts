import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";
import { Secret } from "./secret.js";

const RAW = "sk-ant-api03-secretmaterial";

test("string coercion never reveals the value", () => {
	const secret = new Secret(RAW);
	assert.equal(secret.toString(), "[redacted]");
	assert.equal(`${secret}`, "[redacted]");
	assert.equal(String(secret), "[redacted]");
});

test("JSON serialization never reveals the value", () => {
	const secret = new Secret(RAW);
	assert.equal(JSON.stringify(secret), '"[redacted]"');
	assert.equal(JSON.stringify({ key: secret }), '{"key":"[redacted]"}');
});

test("util.inspect (and thus console.log) never reveals the value", () => {
	const secret = new Secret(RAW);
	assert.equal(inspect(secret), "[redacted]");
	assert.equal(inspect({ key: secret }).includes(RAW), false);
});

test("the value is reachable only via .use()", () => {
	const secret = new Secret(RAW);
	assert.equal(
		secret.use((v) => v.length),
		RAW.length,
	);
	assert.equal(
		secret.use((v) => v),
		RAW,
	);
});
