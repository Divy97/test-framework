import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EngineError } from "@test-framework/qa-engine";

/**
 * The slice of the underlying MCP `Server` the roots policy needs. Narrowed to
 * an interface so the policy is testable with a stub (and decoupled from the SDK
 * surface): does the client advertise roots, and what does `roots/list` return.
 */
export interface RootsServer {
	getClientCapabilities(): { roots?: unknown } | undefined;
	listRoots(): Promise<{ roots: Array<{ uri: string; name?: string }> }>;
}

/**
 * Convert a `file://` root URI to a filesystem path, or `undefined` for any
 * non-`file:` scheme (those fall through to the configured/cwd fallback).
 */
function rootUriToPath(uri: string): string | undefined {
	try {
		const url = new URL(uri);
		if (url.protocol !== "file:") return undefined;
		return fileURLToPath(url);
	} catch {
		return undefined;
	}
}

/**
 * Resolve the per-call `workspaceRoot`:
 *   firstRoot (via MCP roots) ?? configuredRoot ?? process.cwd().
 * Resolved once per tool call (no `roots/list_changed` subscription in V1).
 */
export async function resolveWorkspaceRoot(
	server: RootsServer,
	configuredRoot?: string,
): Promise<string> {
	const supportsRoots = server.getClientCapabilities()?.roots !== undefined;
	if (supportsRoots) {
		try {
			const { roots } = await server.listRoots();
			for (const root of roots) {
				const path = rootUriToPath(root.uri);
				if (path !== undefined) return path;
			}
		} catch {
			// A failing roots/list falls through to the configured/cwd fallback.
		}
	}
	return configuredRoot ?? process.cwd();
}

/**
 * Resolve `repoPath` against `root` and hard-confine it inside `root`. A path
 * that escapes the root (or is absolute outside it) is rejected as
 * `REPO_ACCESS_DENIED` before any engine call. The error message is curated by
 * the translator; it never echoes the offending path.
 */
export function confineRepoPath(root: string, repoPath: string): string {
	const resolvedRoot = resolve(root);
	const resolved = resolve(resolvedRoot, repoPath);
	const rel = relative(resolvedRoot, resolved);
	const escapes = rel === ".." || rel.startsWith("..") || isAbsolute(rel);
	if (escapes) {
		throw new EngineError(
			"REPO_ACCESS_DENIED",
			"Repository path is outside the project root.",
		);
	}
	return resolved;
}
