import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { NormalizedUsage } from "../providers/types.js";
import { serializeTestGraph } from "../test-graph/canonical-json.js";
import { TestGraphValidationError } from "../test-graph/findings.js";
import { renderTestGraphMarkdown } from "../test-graph/markdown.js";
import type { TestGraphV1 } from "../test-graph/schema.js";
import { parseTestGraph, validateTestGraph } from "../test-graph/validate.js";
import { EngineError } from "./errors.js";

const PLANS_DIR = join(".test-framework", "plans");

/** Non-secret generation manifest persisted alongside the graph. */
export interface GenerationManifest {
	generatedAt: string;
	methodologyVersion: string;
	workflowVersion: string;
	inputFingerprint: string;
	generator:
		| { kind: "manual" }
		| { kind: "model"; provider: string; model: string };
	status: "complete" | "incomplete";
	warnings: string[];
	usage: NormalizedUsage;
}

/** Resolve the plan directory and assert it stays under the workspace root. */
function planDirFor(workspaceRoot: string, planId: string): string {
	const root = resolve(workspaceRoot);
	const dir = resolve(root, PLANS_DIR, planId);
	const rel = relative(root, dir);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new EngineError(
			"ARTIFACT_WRITE_FAILED",
			`Plan directory escapes the workspace root: ${planId}.`,
		);
	}
	return dir;
}

/** Stable, sorted-key JSON for the manifest so the file is byte-reproducible. */
function serializeManifest(manifest: GenerationManifest): string {
	const usage: Record<string, number> = {
		inputTokens: manifest.usage.inputTokens,
		outputTokens: manifest.usage.outputTokens,
		totalTokens: manifest.usage.totalTokens,
		...(manifest.usage.cachedInputTokens !== undefined && {
			cachedInputTokens: manifest.usage.cachedInputTokens,
		}),
		...(manifest.usage.reasoningTokens !== undefined && {
			reasoningTokens: manifest.usage.reasoningTokens,
		}),
	};
	const ordered = {
		generatedAt: manifest.generatedAt,
		generator: manifest.generator,
		inputFingerprint: manifest.inputFingerprint,
		methodologyVersion: manifest.methodologyVersion,
		status: manifest.status,
		usage,
		warnings: manifest.warnings,
		workflowVersion: manifest.workflowVersion,
	};
	return `${JSON.stringify(ordered, null, "\t")}\n`;
}

async function atomicWrite(path: string, contents: string): Promise<void> {
	// ponytail: unique temp path avoids concurrent temp collisions; optimistic
	// version conflicts move to Workstream #7.
	const tmp = `${path}.${randomUUID()}.tmp`;
	await writeFile(tmp, contents, "utf8");
	await rename(tmp, path);
}

/**
 * Persist a validated graph atomically: write plan.json (canonical), plan.md
 * (derived), and generation.json under a temp plan dir, read-back validate, then
 * rename the complete directory into place. Any failure throws
 * ARTIFACT_WRITE_FAILED and leaves no partial final plan directory.
 */
export async function persistPlan(
	graph: TestGraphV1,
	manifest: GenerationManifest,
	workspaceRoot: string,
): Promise<string> {
	const dir = planDirFor(workspaceRoot, graph.planId);
	const plansRoot = dirname(dir);
	const tmpDir = join(plansRoot, `.tmp-${graph.planId}-${randomUUID()}`);
	const planJson = serializeTestGraph(graph);
	try {
		await mkdir(tmpDir, { recursive: true });
		await atomicWrite(join(tmpDir, "plan.json"), planJson);
		await atomicWrite(join(tmpDir, "plan.md"), renderTestGraphMarkdown(graph));
		await atomicWrite(
			join(tmpDir, "generation.json"),
			serializeManifest(manifest),
		);
		const readBack = await readFile(join(tmpDir, "plan.json"), "utf8");
		let parsed: unknown;
		try {
			parsed = JSON.parse(readBack);
		} catch (err) {
			throw new EngineError(
				"ARTIFACT_WRITE_FAILED",
				`Persisted plan.json is not parseable JSON for ${graph.planId}.`,
				{ cause: err },
			);
		}
		const result = validateTestGraph(parsed);
		if (!result.valid) {
			throw new EngineError(
				"ARTIFACT_WRITE_FAILED",
				`Persisted plan.json failed read-back validation for ${graph.planId}.`,
				{ findings: result.findings },
			);
		}
		await rename(tmpDir, dir);
	} catch (err) {
		await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
		if (err instanceof EngineError) throw err;
		throw new EngineError(
			"ARTIFACT_WRITE_FAILED",
			`Failed to persist plan ${graph.planId}.`,
			{ cause: err },
		);
	}
	return dir;
}

/** Read and re-validate a persisted plan; missing → ARTIFACT_NOT_FOUND. */
export async function readPlan(
	workspaceRoot: string,
	planId: string,
): Promise<TestGraphV1> {
	const dir = planDirFor(workspaceRoot, planId);
	let raw: string;
	try {
		raw = await readFile(join(dir, "plan.json"), "utf8");
	} catch (err) {
		throw new EngineError(
			"ARTIFACT_NOT_FOUND",
			`No plan found for ${planId}.`,
			{
				cause: err,
			},
		);
	}
	try {
		return parseTestGraph(JSON.parse(raw));
	} catch (err) {
		if (err instanceof TestGraphValidationError) {
			throw new EngineError(
				"PLAN_INVARIANT_FAILED",
				`Persisted plan ${planId} is invalid.`,
				{ findings: err.findings },
			);
		}
		throw new EngineError(
			"PLAN_INVARIANT_FAILED",
			`Persisted plan ${planId} is not parseable JSON.`,
			{ cause: err },
		);
	}
}
