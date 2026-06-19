import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	type CreatePlanInput,
	createPlan,
	createProvider,
	type ModelProvider,
	type ProviderConfig,
	serializeTestGraph,
	type TestGraphV1,
	testGraphV1Schema,
	validateTestGraph,
} from "@test-framework/qa-engine";
import { type Fixture, fixtureSchema } from "../schema/fixture.js";

/**
 * Gated recording tool (workstream #9, Slice 2/3). It runs a real BYOK provider to
 * capture either the full qa-engine arm (`createPlan`) or the single-prompt
 * raw-model control for a corpus fixture, validates the captured graph, and writes
 * it as canonical `candidates/<arm>/graph.json` so the deterministic eval harness
 * can score it as committed bytes.
 *
 * IMPORTANT: this is the one network step in #9. It is NEVER part of `pnpm eval`
 * or `pnpm test` — it hard-requires `RUN_LIVE_PROVIDER` + a provider key and errors
 * fast otherwise, exactly like `providers/adapters/live.test.ts`. CI never has a
 * key, so CI never reaches the live path. The non-live machinery (fixture →
 * `CreatePlanInput`, the arm runners, the validate → canonical-write path) is pure
 * and is unit-tested keylessly with the deterministic fake provider.
 *
 * The tool writes only `graph.json`. The matching `annotations.json` is a one-time,
 * hand-authored, PR-reviewed step (ADR-0009 human-calibration) with
 * `recordKind: "recorded"`; it is never auto-generated (that would be a model judge).
 */

export type RecordableArm = "qa-engine" | "raw-model";

const CORPUS_DIR = new URL("../../test/fixtures/corpus/", import.meta.url);

/** The provider used by the raw-model control. Reused by the engine for qa-engine. */
const RAW_MODEL_MAX_OUTPUT_TOKENS = 8192;
const RAW_MODEL_TIMEOUT_MS = 120_000;

/**
 * A resolved live configuration. Keyed providers reference their key by env var
 * name (`keyVar`); the keyless `claude-cli` provider has no `keyVar` — it uses
 * the local Claude Code subscription.
 */
export interface LiveRecordingEnv {
	provider: ProviderConfig["provider"];
	model: string;
	keyVar?: string;
}

/**
 * Resolve the live recording configuration from the environment, throwing fast if
 * the gate is not satisfied. Mirrors `live.test.ts`: recording requires
 * `RUN_LIVE_PROVIDER` plus EITHER a provider key OR an explicit keyless
 * `RECORD_PROVIDER=claude-cli` that drives the local `claude` CLI (no key, no
 * API cost). CI never has a key nor sets `RECORD_PROVIDER`, so it never records.
 */
export function requireLiveConfig(
	env: Record<string, string | undefined>,
): LiveRecordingEnv {
	if (!env.RUN_LIVE_PROVIDER) {
		throw new Error(
			"record:arms is a gated live tool: set RUN_LIVE_PROVIDER=1 and a provider key (or RECORD_PROVIDER=claude-cli). It never runs in CI.",
		);
	}

	// Keyless host-model path: explicit opt-in, or the fallback when no key is set.
	if (env.RECORD_PROVIDER === "claude-cli") {
		return {
			provider: "claude-cli",
			model: env.RECORD_MODEL ?? "opus",
		};
	}

	if (env.ANTHROPIC_API_KEY) {
		return {
			provider: "anthropic",
			model: env.RECORD_MODEL ?? "claude-opus-4-8",
			keyVar: "ANTHROPIC_API_KEY",
		};
	}
	if (env.OPENROUTER_API_KEY) {
		return {
			provider: "openrouter",
			model: env.RECORD_MODEL ?? "anthropic/claude-opus-4",
			keyVar: "OPENROUTER_API_KEY",
		};
	}

	throw new Error(
		"record:arms needs ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or RECORD_PROVIDER=claude-cli (keys referenced by env, never inlined).",
	);
}

/**
 * Build the provider config from resolved live env. Keyed providers reference
 * their key by env var; the keyless `claude-cli` provider carries no keySource.
 */
export function providerConfigFor(live: LiveRecordingEnv): ProviderConfig {
	if (live.keyVar === undefined) {
		return { provider: live.provider, model: live.model };
	}
	return {
		provider: live.provider,
		model: live.model,
		keySource: { kind: "env", var: live.keyVar },
	};
}

/**
 * Build a `CreatePlanInput` from a fixture's Ground Truth. The brief becomes a
 * `feature-request` source; each supplied source becomes its own source. Pure and
 * deterministic — no provider, no IO — so it is unit-tested keylessly.
 */
export function buildCreatePlanInput(fixture: Fixture): CreatePlanInput {
	const briefSource: CreatePlanInput["sources"][number] = {
		kind: "feature-request",
		title: fixture.title,
		content: fixture.brief,
	};

	const supplied = fixture.suppliedSources
		.filter((source) => source.supplied)
		.map((source) => ({
			kind: source.kind,
			title: source.title,
			content: source.title,
		}));

	return {
		project: { name: "eval-recording" },
		title: fixture.title,
		sources: [briefSource, ...supplied],
	};
}

/**
 * Validate a captured graph and serialize it to canonical bytes. Throws on an
 * invalid graph (mirroring `build-corpus.ts`): a recorded arm that does not
 * validate is a real engine/model signal, never hand-edited to pass.
 */
export function validateAndSerialize(
	graph: TestGraphV1,
	label: string,
): string {
	const result = validateTestGraph(graph);
	if (!result.valid) {
		throw new Error(
			`${label}: captured graph is invalid: ${result.findings
				.map((finding) => finding.code)
				.join(", ")}`,
		);
	}
	return serializeTestGraph(result.graph);
}

/** Inputs the arm runners need, injectable so the fake provider drives them. */
export interface RecordArmDeps {
	provider: ModelProvider;
	now: () => number;
	workspaceRoot: string;
	signal?: AbortSignal;
	/**
	 * Per-call model output budget. Reasoning models (e.g. kimi-k2.5) spend tokens
	 * thinking before emitting JSON, so the engine's small default starves the
	 * answer; the recording path sets this generously. Omitted ⇒ engine default.
	 */
	maxOutputTokens?: number;
	/** Per-call timeout; reasoning + a large output can exceed the engine default. */
	timeoutMs?: number;
}

/**
 * Record the qa-engine arm: drive the full engine through `createPlan` and return
 * the persisted graph. The provider is injected, so the fake covers the wiring.
 */
export async function recordQaEngineArm(
	input: CreatePlanInput,
	deps: RecordArmDeps,
): Promise<TestGraphV1> {
	const result = await createPlan(input, {
		provider: deps.provider,
		now: deps.now,
		workspaceRoot: deps.workspaceRoot,
		...(deps.signal !== undefined ? { signal: deps.signal } : {}),
		...(deps.maxOutputTokens !== undefined
			? { maxOutputTokens: deps.maxOutputTokens }
			: {}),
		...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
	});
	return result.graph;
}

/**
 * Record the raw-model control: a single structured generation against the brief,
 * asking the model for a `test-graph/v1` graph directly (no engine workflow). This
 * is the honest "same model, raw prompt" baseline the moat claim is measured against.
 */
export async function recordRawModelArm(
	input: CreatePlanInput,
	deps: RecordArmDeps,
): Promise<TestGraphV1> {
	const brief = input.sources
		.map((source) => `## ${source.title}\n${source.content}`)
		.join("\n\n");

	const result = await deps.provider.generate(
		{
			system:
				"You are a QA engineer. Produce a single test-graph/v1 JSON object planning the tests for the brief. Respond with only the JSON object.",
			messages: [
				{
					role: "user",
					content: `Plan the tests for this brief as a test-graph/v1 graph.\n\n${brief}`,
				},
			],
			schema: testGraphV1Schema,
			maxOutputTokens: deps.maxOutputTokens ?? RAW_MODEL_MAX_OUTPUT_TOKENS,
		},
		{
			timeoutMs: deps.timeoutMs ?? RAW_MODEL_TIMEOUT_MS,
			...(deps.signal ? { signal: deps.signal } : {}),
		},
	);

	if (result.data === undefined) {
		throw new Error("raw-model: provider returned no structured graph");
	}
	return result.data;
}

async function readFixture(fixtureId: string): Promise<Fixture> {
	const url = new URL(`${fixtureId}/fixture.json`, CORPUS_DIR);
	const text = await readFile(fileURLToPath(url), "utf8");
	return fixtureSchema.parse(JSON.parse(text));
}

async function writeGraph(
	fixtureId: string,
	arm: RecordableArm,
	graphText: string,
): Promise<string> {
	const armDir = new URL(`${fixtureId}/candidates/${arm}/`, CORPUS_DIR);
	await mkdir(fileURLToPath(armDir), { recursive: true });
	const graphUrl = new URL("graph.json", armDir);
	await writeFile(fileURLToPath(graphUrl), graphText, "utf8");
	return fileURLToPath(graphUrl);
}

function parseArgs(argv: string[]): { fixtureId: string; arm: RecordableArm } {
	const fixtureId = argFor(argv, "--fixture");
	const armRaw = argFor(argv, "--arm");
	if (fixtureId === undefined || armRaw === undefined) {
		throw new Error(
			"usage: record:arms --fixture <id> --arm <qa-engine|raw-model>",
		);
	}
	if (armRaw !== "qa-engine" && armRaw !== "raw-model") {
		throw new Error(`--arm must be qa-engine or raw-model, got ${armRaw}`);
	}
	return { fixtureId, arm: armRaw };
}

function argFor(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	if (index === -1) return undefined;
	return argv[index + 1];
}

async function main(): Promise<void> {
	const live = requireLiveConfig(process.env);
	const { fixtureId, arm } = parseArgs(process.argv.slice(2));

	const fixture = await readFixture(fixtureId);
	const input = buildCreatePlanInput(fixture);
	const provider = await createProvider(providerConfigFor(live));

	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const workspaceRoot = await mkdtemp(join(tmpdir(), "record-arms-"));

	try {
		const deps: RecordArmDeps = {
			provider,
			now: () => Date.now(),
			workspaceRoot,
			// Reasoning models spend output tokens thinking; give the answer room.
			maxOutputTokens: Number(process.env.RECORD_MAX_OUTPUT_TOKENS ?? 16000),
			timeoutMs: Number(process.env.RECORD_TIMEOUT_MS ?? 180000),
		};
		const graph =
			arm === "qa-engine"
				? await recordQaEngineArm(input, deps)
				: await recordRawModelArm(input, deps);

		const graphText = validateAndSerialize(graph, `${fixtureId}/${arm}`);
		const path = await writeGraph(fixtureId, arm, graphText);

		process.stdout.write(
			`recorded ${fixtureId}/${arm} -> ${path}\n` +
				`now hand-author candidates/${arm}/annotations.json against this captured graph ` +
				`with recordKind: "recorded" (ADR-0009 human-calibration step).\n`,
		);
	} finally {
		await rm(workspaceRoot, { recursive: true, force: true });
	}
}

// Only run when invoked directly (the `record:arms` script), never on import.
if (
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === process.argv[1]
) {
	main().catch((error: unknown) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	});
}
