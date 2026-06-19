import assert from "node:assert/strict";
import { test } from "node:test";
import { EngineError } from "./errors.js";
import { ingest } from "./identity.js";
import type { CreatePlanInput } from "./types.js";

const INPUT: CreatePlanInput = {
	project: { name: "Acme Loyalty" },
	title: "Login feature",
	sources: [
		{
			kind: "feature-request",
			title: "Login brief",
			content: "Log in please.",
		},
	],
};

test("ingest derives stable, content-independent project and plan IDs", () => {
	const [source] = INPUT.sources;
	assert.ok(source);
	const a = ingest(INPUT);
	const b = ingest({
		...INPUT,
		sources: [{ ...source, content: "Totally different brief text." }],
	});
	// planId is keyed by project+title only, so it survives content changes
	// (a future refinePlan keeps identity); the fingerprint differs.
	assert.equal(a.planId, b.planId);
	assert.equal(a.projectId, b.projectId);
	assert.notEqual(a.inputFingerprint, b.inputFingerprint);
	assert.match(a.planId, /^plan_[0-9a-f]{20}$/);
});

test("ingest rejects empty title, empty content, and duplicate sources", () => {
	assert.throws(
		() => ingest({ ...INPUT, title: "  " }),
		(err: unknown) =>
			err instanceof EngineError && err.code === "INVALID_INPUT",
	);
	assert.throws(
		() =>
			ingest({
				...INPUT,
				sources: [{ kind: "document", title: "Doc", content: "   " }],
			}),
		(err: unknown) =>
			err instanceof EngineError && err.code === "INVALID_INPUT",
	);
	assert.throws(
		() =>
			ingest({
				...INPUT,
				sources: [
					{ kind: "document", title: "Same", content: "a" },
					{ kind: "document", title: "Same", content: "b" },
				],
			}),
		(err: unknown) =>
			err instanceof EngineError && err.code === "INVALID_INPUT",
	);
});

test("ingest builds supplied source nodes keyed by locator or title", () => {
	const result = ingest({
		...INPUT,
		sources: [
			{ kind: "document", title: "Doc", content: "x", locator: "docs/spec.md" },
		],
	});
	assert.equal(result.sources[0]?.key, "docs/spec.md");
	assert.equal(result.sources[0]?.node.supplied, true);
	assert.equal(result.sources[0]?.node.locator, "docs/spec.md");
});

test("inputFingerprint matches the trimmed content the engine commits", () => {
	const [source] = INPUT.sources;
	assert.ok(source);
	const tight = ingest(INPUT);
	const padded = ingest({
		...INPUT,
		sources: [{ ...source, content: `  ${source.content}\n` }],
	});
	// Content differing only by surrounding whitespace is processed identically,
	// so the provenance fingerprint must be identical too.
	assert.equal(tight.inputFingerprint, padded.inputFingerprint);
});
