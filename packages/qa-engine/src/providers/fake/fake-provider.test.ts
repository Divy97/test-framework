import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ProviderError } from "../errors.js";
import {
	createFakeProvider,
	fakeError,
	fakeHang,
	fakeOk,
} from "./fake-provider.js";

const schema = z.object({ ok: z.boolean() });
const req = (over: object = {}) => ({
	messages: [{ role: "user" as const, content: "hi" }],
	maxOutputTokens: 128,
	...over,
});
const opts = (signal?: AbortSignal) => ({ signal, timeoutMs: 1000 });

test("satisfies the ModelProvider contract", () => {
	const fake = createFakeProvider([]);
	assert.equal(typeof fake.id, "string");
	assert.equal(typeof fake.capabilities("any").structuredOutput, "string");
	assert.equal(typeof fake.generate, "function");
});

test("ok with schema returns validated data", async () => {
	const fake = createFakeProvider([fakeOk({ data: { ok: true } })]);
	const result = await fake.generate(req({ schema }), opts());
	assert.deepEqual(result.data, { ok: true });
	assert.equal(result.usage.totalTokens, 0);
});

test("ok with schema-violating data throws MODEL_OUTPUT_INVALID (fake honors the contract)", async () => {
	const fake = createFakeProvider([fakeOk({ data: { ok: "nope" } })]);
	await assert.rejects(
		fake.generate(req({ schema }), opts()),
		(e) => e instanceof ProviderError && e.code === "MODEL_OUTPUT_INVALID",
	);
});

test("ok without schema returns text", async () => {
	const fake = createFakeProvider([fakeOk({ text: "hello" })]);
	const result = await fake.generate(req(), opts());
	assert.equal(result.text, "hello");
	assert.equal(result.data, undefined);
});

test("error outcome throws a ProviderError with correct retryability", async () => {
	const fake = createFakeProvider([
		fakeError("PROVIDER_TRANSIENT"),
		fakeError("PROVIDER_AUTH"),
	]);
	await assert.rejects(fake.generate(req(), opts()), (e) => {
		assert.ok(e instanceof ProviderError);
		assert.equal(e.code, "PROVIDER_TRANSIENT");
		assert.equal(e.retryable, true);
		return true;
	});
	await assert.rejects(fake.generate(req(), opts()), (e) => {
		assert.ok(e instanceof ProviderError);
		assert.equal(e.retryable, false);
		return true;
	});
});

test("hang rejects only once its signal aborts", async () => {
	const fake = createFakeProvider([fakeHang()]);
	const controller = new AbortController();
	const pending = fake.generate(req(), opts(controller.signal));
	controller.abort();
	await assert.rejects(pending);
});

test("consumes outcomes in order and records calls", async () => {
	const fake = createFakeProvider(
		[fakeOk({ text: "a" }), fakeOk({ text: "b" })],
		{
			recordCalls: true,
		},
	);
	assert.equal((await fake.generate(req(), opts())).text, "a");
	assert.equal((await fake.generate(req(), opts())).text, "b");
	assert.equal(fake.calls.length, 2);
});

test("throws when the script is exhausted", async () => {
	const fake = createFakeProvider([]);
	await assert.rejects(fake.generate(req(), opts()), /exhausted/i);
});
