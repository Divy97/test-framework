import ignore, { type Ignore } from "ignore";

interface IgnoreContext {
	base: string;
	depth: number;
	matcher: Ignore;
}

/**
 * A stack of Git-compatible ignore contexts plus optional additive patterns.
 *
 * Each context stores its repo-relative base and a matcher built from that
 * directory's `.gitignore`. Contexts are evaluated shallowest-first; the
 * deepest context with a definite decision wins, matching Git semantics where
 * nested ignore files override ancestors.
 *
 * Additional patterns are strictly additive: they can only add exclusions and
 * cannot be re-included by any `.gitignore` negation. Hard policy still runs
 * before this stack in traversal, so secrets/build output cannot be unignored.
 */
export class GitignoreStack {
	private readonly additional: Ignore | null;
	private readonly contexts: IgnoreContext[] = [];

	constructor(additionalPatterns: readonly string[] = []) {
		this.additional =
			additionalPatterns.length > 0
				? ignore().add(additionalPatterns as string[])
				: null;
	}

	/** Register a `.gitignore` discovered at the given repo-relative base. */
	add(base: string, gitignoreContent: string): void {
		const matcher = ignore().add(gitignoreContent);
		const depth = base === "" ? 0 : base.split("/").length;
		this.contexts.push({ base, depth, matcher });
		this.contexts.sort((a, b) => a.depth - b.depth);
	}

	/** Decide whether a repo-relative POSIX path is ignored. */
	isIgnored(relPath: string): boolean {
		if (relPath === "") {
			return false;
		}
		if (this.additional?.ignores(relPath)) {
			return true;
		}

		let decided = false;
		let ignored = false;
		for (const context of this.contexts) {
			const rel = relativeToBase(context.base, relPath);
			if (rel === null || rel === "") {
				continue;
			}
			const result = context.matcher.test(rel);
			if (result.ignored) {
				ignored = true;
				decided = true;
			} else if (result.unignored) {
				ignored = false;
				decided = true;
			}
		}
		return decided ? ignored : false;
	}
}

function relativeToBase(base: string, relPath: string): string | null {
	if (base === "") {
		return relPath;
	}
	if (relPath === base) {
		return "";
	}
	if (relPath.startsWith(`${base}/`)) {
		return relPath.slice(base.length + 1);
	}
	return null;
}
