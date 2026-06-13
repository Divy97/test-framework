import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { RepoScanError } from "./errors.js";

export interface ResolvedScanRoot {
	requestedRoot: string;
	canonicalRoot: string;
}

export interface HintResolution {
	hints: string[];
	warnings: string[];
}

/** Matches Windows drive-letter (`C:\`) or UNC (`\\server`) absolute inputs. */
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

interface NodeError {
	code?: string;
}

function errorCodeOf(error: unknown): string | undefined {
	return typeof error === "object" && error !== null
		? (error as NodeError).code
		: undefined;
}

/**
 * Resolve and canonicalize the requested scan root. A symlinked root is allowed
 * and resolved once via realpath; its canonical target becomes the confinement
 * boundary. Throws a typed {@link RepoScanError} on any fatal root problem.
 */
export async function resolveScanRoot(
	rootPath: string,
): Promise<ResolvedScanRoot> {
	const requestedRoot = resolve(rootPath);

	try {
		await lstat(requestedRoot);
	} catch (error) {
		if (errorCodeOf(error) === "ENOENT") {
			throw new RepoScanError("ROOT_NOT_FOUND");
		}
		throw new RepoScanError("ROOT_UNREADABLE");
	}

	let canonicalRoot: string;
	try {
		canonicalRoot = await realpath(requestedRoot);
	} catch (error) {
		if (errorCodeOf(error) === "ENOENT") {
			throw new RepoScanError("ROOT_NOT_FOUND");
		}
		throw new RepoScanError("ROOT_REALPATH_FAILED");
	}

	let stats: Awaited<ReturnType<typeof stat>>;
	try {
		stats = await stat(canonicalRoot);
	} catch {
		throw new RepoScanError("ROOT_UNREADABLE");
	}
	if (!stats.isDirectory()) {
		throw new RepoScanError("ROOT_NOT_DIRECTORY");
	}

	return { requestedRoot, canonicalRoot };
}

/**
 * True when `candidate` is the canonical root itself or a descendant of it.
 * Uses path.relative rather than string-prefix checks so that sibling prefixes
 * (`/repo` vs `/repo-other`) and `..` escapes are rejected.
 */
export function isPathInsideRoot(
	canonicalRoot: string,
	candidate: string,
): boolean {
	const rel = relative(canonicalRoot, candidate);
	if (rel === "") {
		return true;
	}
	if (isAbsolute(rel)) {
		return false;
	}
	return rel !== ".." && !rel.startsWith(`..${sep}`);
}

/** Convert a confined absolute candidate to a `/`-separated repo-relative path. */
export function toRepoRelativePath(
	canonicalRoot: string,
	candidate: string,
): string {
	return relative(canonicalRoot, candidate).split(sep).join("/");
}

/**
 * Normalize relevant-file hints into confined, deduped, repo-relative paths.
 * Out-of-root, parent-escaping, and Windows-shaped absolute hints are dropped
 * with safe warnings that never echo the offending absolute path.
 */
export function resolveRelevantFileHints(
	canonicalRoot: string,
	hints: string[],
): HintResolution {
	const seen = new Set<string>();
	const resolvedHints: string[] = [];
	const warnings: string[] = [];
	let dropped = 0;

	for (const hint of hints) {
		if (hint.length === 0 || WINDOWS_ABSOLUTE.test(hint)) {
			dropped += 1;
			continue;
		}
		const candidate = isAbsolute(hint)
			? resolve(hint)
			: resolve(canonicalRoot, hint);
		if (!isPathInsideRoot(canonicalRoot, candidate)) {
			dropped += 1;
			continue;
		}
		const rel = toRepoRelativePath(canonicalRoot, candidate);
		if (rel === "" || seen.has(rel)) {
			continue;
		}
		seen.add(rel);
		resolvedHints.push(rel);
	}

	if (dropped > 0) {
		warnings.push(
			`Ignored ${dropped} relevant-file hint(s) outside the scan root.`,
		);
	}

	return { hints: resolvedHints, warnings };
}
