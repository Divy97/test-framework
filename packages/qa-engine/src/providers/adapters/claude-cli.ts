import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { ProviderError } from "../errors.js";
import { toProviderSchema } from "../structured-output.js";
import type {
	GenerationRequest,
	NormalizedUsage,
	ProviderCapabilities,
	RawGeneration,
	RawProvider,
} from "../types.js";

/**
 * Host-model adapter: drives the LOCAL `claude` CLI (Claude Code) as the model.
 * It carries NO API key and incurs NO API cost — the call runs under the user's
 * Claude Code subscription. This lets a user already inside Claude Code drive the
 * QA engine without provisioning a separate provider key.
 *
 * Loaded ONLY via dynamic `import()` in the factory, so `node:child_process`
 * stays off the common import path (consistent with the SDK-backed adapters).
 *
 * THE INVOCATION (settled in Step 0, claude v2.1.x):
 *
 *   claude -p --output-format json \
 *     --model <model> \
 *     --no-session-persistence \
 *     --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
 *     --tools "" \
 *     --disable-slash-commands \
 *     --setting-sources ""
 *
 *   The prompt is fed on STDIN (no positional prompt arg), so an arbitrarily
 *   long schema-embedded prompt is never an argv-length problem.
 *
 * Why each isolation flag (the provider must be a pure text generator, NOT an
 * agent that reads files or runs tools):
 *   --setting-sources ""        → load no user/project/local settings, so the
 *                                 repo's SessionStart hook (and any other hooks)
 *                                 never fire.
 *   --strict-mcp-config + empty
 *     --mcp-config              → no MCP servers attach.
 *   --tools ""                  → no built-in tools (no file reads, no Bash).
 *   --disable-slash-commands    → no skills/commands resolve.
 *   --no-session-persistence    → nothing is written to the session store.
 *   cwd = an out-of-repo temp dir→ defence-in-depth against project CLAUDE.md
 *                                 auto-discovery even if a setting source leaks.
 *
 *   NOTE: `--bare` is deliberately NOT used: it forces Anthropic auth to be
 *   ANTHROPIC_API_KEY / apiKeyHelper only (OAuth/keychain never read), which
 *   defeats the whole "zero API key, use the subscription" purpose.
 *
 * The JSON envelope on stdout (single object, `--output-format json`):
 *   { type:"result", subtype:"success", is_error:boolean, result:string,
 *     usage:{ input_tokens, output_tokens, cache_read_input_tokens, ... }, ... }
 * The model's text is `result`. When a schema is requested the model often wraps
 * the JSON in a ```json fence, so the content is normalized (trim + fence-strip)
 * exactly like the openrouter adapter; the seam then strict-parses + validates it.
 */

export interface ClaudeCliAdapterOptions {
	model: string;
	/** Absolute path / command name for the CLI. Defaults to `claude` on PATH. */
	command?: string;
	/**
	 * Injectable runner so the pure pieces are unit-testable without spawning.
	 * Receives the resolved argv (after the command), the prompt for stdin, and
	 * the abort signal; resolves the raw stdout envelope text.
	 */
	runClaude?: ClaudeRunner;
}

export type ClaudeRunner = (
	args: string[],
	stdin: string,
	signal: AbortSignal,
) => Promise<string>;

const DEFAULT_COMMAND = "claude";

const CAPABILITIES: ProviderCapabilities = {
	// Structured output is delivered through the prompt (the seam strict-parses
	// the returned text), so the channel is "prompted".
	structuredOutput: "prompted",
	supportsSystemPrompt: true,
	supportsCancellation: true,
};

/** Shape of the `--output-format json` envelope we depend on. */
interface ClaudeEnvelope {
	type?: string;
	subtype?: string;
	is_error?: boolean;
	result?: unknown;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
	};
}

/**
 * Build the CLI prompt from the neutral request. `system` is prepended as a
 * leading block; conversation turns are appended labelled by role. When a schema
 * is present, a strict "JSON only" instruction plus the JSON Schema is appended
 * so the model emits a single conforming object (the seam validates it).
 * Pure — exported for unit testing without a spawn.
 */
export function buildClaudePrompt(req: GenerationRequest): string {
	const parts: string[] = [];

	if (req.system !== undefined) {
		parts.push(req.system);
	}

	for (const message of req.messages) {
		const label = message.role === "assistant" ? "Assistant" : "User";
		parts.push(`${label}: ${message.content}`);
	}

	if (req.schema !== undefined) {
		const jsonSchema = JSON.stringify(toProviderSchema(req.schema), null, 2);
		parts.push(
			[
				"Respond with ONLY a single JSON object conforming to the JSON Schema",
				"below. Do not include any prose, explanation, or markdown code fences —",
				"output the raw JSON object and nothing else.",
				"",
				"JSON Schema:",
				jsonSchema,
			].join("\n"),
		);
	}

	return parts.join("\n\n");
}

/**
 * The fixed isolation argv for one completion (see the module header for the
 * rationale of each flag). Pure — exported for unit testing.
 */
export function buildClaudeArgs(model: string): string[] {
	return [
		"-p",
		"--output-format",
		"json",
		"--model",
		model,
		"--no-session-persistence",
		"--strict-mcp-config",
		"--mcp-config",
		'{"mcpServers":{}}',
		"--tools",
		"",
		"--disable-slash-commands",
		"--setting-sources",
		"",
	];
}

/**
 * Normalize structured content: trim, and strip a surrounding markdown code
 * fence (```json … ``` or ``` … ```) if present, mirroring the openrouter
 * adapter. The result is handed to the seam, which strict-parses + validates it.
 * Pure — exported for unit testing.
 */
export function normalizeClaudeContent(content: string): string {
	const trimmed = content.trim();
	const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed);
	return (fence?.[1] ?? trimmed).trim();
}

function normalizeUsage(envelope: ClaudeEnvelope): NormalizedUsage {
	const inputTokens = envelope.usage?.input_tokens ?? 0;
	const outputTokens = envelope.usage?.output_tokens ?? 0;
	const cached = envelope.usage?.cache_read_input_tokens;
	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens + outputTokens,
		...(cached != null && { cachedInputTokens: cached }),
	};
}

/**
 * Parse the CLI's stdout envelope into a neutral `RawGeneration`. Throws a typed
 * `MODEL_OUTPUT_INVALID` on an unparseable envelope, an error result, or an
 * empty result. Never leaks the raw stdout. Pure — exported for unit testing.
 */
export function parseClaudeEnvelope(
	stdout: string,
	model: string,
): RawGeneration {
	let envelope: ClaudeEnvelope;
	try {
		envelope = JSON.parse(stdout) as ClaudeEnvelope;
	} catch (err) {
		throw new ProviderError(
			"MODEL_OUTPUT_INVALID",
			"claude cli returned an unparseable JSON envelope",
			false,
			{ cause: err },
		);
	}

	if (envelope.is_error === true) {
		throw new ProviderError(
			"MODEL_OUTPUT_INVALID",
			"claude cli reported an error result",
			false,
		);
	}

	if (typeof envelope.result !== "string" || envelope.result.trim() === "") {
		throw new ProviderError(
			"MODEL_OUTPUT_INVALID",
			"claude cli returned an empty result",
			false,
		);
	}

	return {
		output: { kind: "text", value: normalizeClaudeContent(envelope.result) },
		usage: normalizeUsage(envelope),
		model,
		finishReason: "stop",
	};
}

/**
 * Default runner: spawn `claude`, feed the prompt on stdin, capture stdout.
 * Honors the abort signal by killing the child and rejecting with the abort
 * reason — the resilience wrapper disambiguates aborts via the composed signal,
 * so we never map them to a ProviderError. A spawn failure (CLI missing / not
 * executable) becomes a retryable PROVIDER_TRANSIENT; a non-zero exit becomes a
 * non-retryable MODEL_OUTPUT_INVALID. Neither leaks stderr or the binary path.
 */
function defaultRunClaude(command: string): ClaudeRunner {
	return (args, stdin, signal) =>
		new Promise<string>((resolve, reject) => {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}

			let child: ReturnType<typeof spawn>;
			try {
				child = spawn(command, args, {
					// Out-of-repo cwd: defence-in-depth against project CLAUDE.md
					// auto-discovery even if a setting source were to leak through.
					cwd: tmpdir(),
					stdio: ["pipe", "pipe", "pipe"],
				});
			} catch (err) {
				reject(
					new ProviderError(
						"PROVIDER_TRANSIENT",
						"failed to spawn the claude cli",
						true,
						{ cause: err },
					),
				);
				return;
			}

			let stdout = "";
			let settled = false;
			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				signal.removeEventListener("abort", onAbort);
				fn();
			};

			const onAbort = () => {
				child.kill("SIGKILL");
				finish(() => reject(signal.reason));
			};
			signal.addEventListener("abort", onAbort, { once: true });

			child.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});

			child.on("error", (err) => {
				finish(() =>
					reject(
						new ProviderError(
							"PROVIDER_TRANSIENT",
							"the claude cli could not be started",
							true,
							{ cause: err },
						),
					),
				);
			});

			child.on("close", (code) => {
				if (code === 0) {
					finish(() => resolve(stdout));
				} else {
					finish(() =>
						reject(
							new ProviderError(
								"MODEL_OUTPUT_INVALID",
								`the claude cli exited with a non-zero status (${code ?? "unknown"})`,
								false,
							),
						),
					);
				}
			});

			child.stdin?.on("error", () => {
				// stdin EPIPE can race a fast-exiting child; the close/error handlers
				// own the outcome, so swallow it here to avoid an unhandled rejection.
			});
			child.stdin?.end(stdin);
		});
}

export function createClaudeCliAdapter(
	options: ClaudeCliAdapterOptions,
): RawProvider {
	const command = options.command ?? DEFAULT_COMMAND;
	const run = options.runClaude ?? defaultRunClaude(command);

	return {
		id: "claude-cli",
		capabilities: () => CAPABILITIES,
		async generate(
			req: GenerationRequest,
			signal: AbortSignal,
		): Promise<RawGeneration> {
			const prompt = buildClaudePrompt(req);
			const args = buildClaudeArgs(options.model);
			const stdout = await run(args, prompt, signal);
			return parseClaudeEnvelope(stdout, options.model);
		},
	};
}
