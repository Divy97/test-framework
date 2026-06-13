import { join } from "node:path";
import type { RepoScanStats, RepoScanStopReason } from "./contracts.js";
import {
	nodeFileSystem,
	readBoundedTextFile,
	type ScanFileSystem,
} from "./filesystem.js";
import { GitignoreStack } from "./gitignore.js";
import { evaluateDirectory, evaluateFile } from "./policy.js";

export interface TraverseOptions {
	canonicalRoot: string;
	maxDepth: number;
	maxEntries: number;
	maxFiles: number;
	maxFileBytes: number;
	maxTotalReadBytes: number;
	honorGitignore: boolean;
	additionalIgnorePatterns: string[];
	fs?: ScanFileSystem;
}

export interface TraversedFile {
	path: string;
	absolutePath: string;
	size: number;
	text: string | null;
}

export interface TraverseResult {
	files: TraversedFile[];
	lockfiles: string[];
	stats: RepoScanStats;
	warnings: string[];
	truncated: boolean;
	stopReason: RepoScanStopReason | null;
}

interface PendingDirectory {
	absolutePath: string;
	relPath: string;
	depth: number;
}

/** Bounded `.gitignore` read budget; independent of the content budget. */
const GITIGNORE_MAX_BYTES = 65_536;

/**
 * Deterministically traverse a confined repository, applying hard policy
 * before Git-ignore, skipping symlinks, bounding every dimension, and reading
 * only eligible files within budget. Returns partial results plus truncation
 * metadata when a soft limit is reached; individual path failures warn and
 * continue.
 */
export async function traverseRepository(
	options: TraverseOptions,
): Promise<TraverseResult> {
	const fs = options.fs ?? nodeFileSystem;
	const ignoreStack = new GitignoreStack(options.additionalIgnorePatterns);

	const files: TraversedFile[] = [];
	const lockfiles: string[] = [];
	const warnings: string[] = [];
	const stats: RepoScanStats = {
		entriesVisited: 0,
		filesConsidered: 0,
		filesRead: 0,
		bytesRead: 0,
		skippedByPolicy: 0,
		skippedByGitignore: 0,
		skippedSymlinks: 0,
		skippedLargeFiles: 0,
		skippedBinaryFiles: 0,
		unreadablePaths: 0,
	};

	let depthPruned = false;
	let readBudgetExhausted = false;
	let haltReason: "max-entries" | "max-files" | null = null;

	const queue: PendingDirectory[] = [
		{ absolutePath: options.canonicalRoot, relPath: "", depth: 0 },
	];

	while (queue.length > 0 && haltReason === null) {
		const dir = queue.shift();
		if (!dir) {
			break;
		}

		let entries: Awaited<ReturnType<ScanFileSystem["readdir"]>>;
		try {
			entries = await fs.readdir(dir.absolutePath);
		} catch {
			stats.unreadablePaths += 1;
			warnings.push(
				`Skipped unreadable directory: ${dir.relPath === "" ? "." : dir.relPath}`,
			);
			continue;
		}

		entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

		if (options.honorGitignore) {
			const hasGitignore = entries.some(
				(entry) => entry.isFile() && entry.name === ".gitignore",
			);
			if (hasGitignore) {
				await loadGitignore(fs, options.canonicalRoot, dir, ignoreStack, warnings);
			}
		}

		const childDirectories: PendingDirectory[] = [];
		for (const entry of entries) {
			if (haltReason !== null) {
				break;
			}
			if (stats.entriesVisited >= options.maxEntries) {
				haltReason = "max-entries";
				break;
			}
			stats.entriesVisited += 1;

			const relPath = dir.relPath === "" ? entry.name : `${dir.relPath}/${entry.name}`;
			const absolutePath = join(dir.absolutePath, entry.name);

			if (entry.isSymbolicLink()) {
				stats.skippedSymlinks += 1;
				continue;
			}

			if (entry.isDirectory()) {
				if (evaluateDirectory(entry.name).excluded) {
					stats.skippedByPolicy += 1;
					continue;
				}
				if (options.honorGitignore && ignoreStack.isIgnored(relPath)) {
					stats.skippedByGitignore += 1;
					continue;
				}
				if (dir.depth + 1 > options.maxDepth) {
					depthPruned = true;
					continue;
				}
				childDirectories.push({
					absolutePath,
					relPath,
					depth: dir.depth + 1,
				});
				continue;
			}

			if (!entry.isFile()) {
				stats.skippedByPolicy += 1;
				continue;
			}

			// `.gitignore` is consumed as ignore context above, never evidence.
			if (entry.name === ".gitignore") {
				continue;
			}

			const decision = evaluateFile(relPath);
			if (decision.action === "skip") {
				if (decision.kind === "lockfile") {
					lockfiles.push(relPath);
					stats.skippedByPolicy += 1;
				} else if (decision.kind === "binary") {
					stats.skippedBinaryFiles += 1;
				} else {
					stats.skippedByPolicy += 1;
				}
				continue;
			}

			if (options.honorGitignore && ignoreStack.isIgnored(relPath)) {
				stats.skippedByGitignore += 1;
				continue;
			}

			if (stats.filesConsidered >= options.maxFiles) {
				haltReason = "max-files";
				break;
			}
			stats.filesConsidered += 1;

			let size = 0;
			let text: string | null = null;
			if (decision.textEligible) {
				const remaining = options.maxTotalReadBytes - stats.bytesRead;
				if (remaining <= 0) {
					readBudgetExhausted = true;
				} else {
					const read = await readBoundedTextFile({
						canonicalRoot: options.canonicalRoot,
						absolutePath,
						maxFileBytes: options.maxFileBytes,
						remainingTotalBytes: remaining,
						fs,
					});
					if (read.ok) {
						text = read.text;
						size = read.bytesRead;
						stats.bytesRead += read.bytesRead;
						stats.filesRead += 1;
						if (read.truncatedRead) {
							readBudgetExhausted = true;
						}
					} else if (read.reason === "too-large") {
						stats.skippedLargeFiles += 1;
					} else if (read.reason === "binary") {
						stats.skippedBinaryFiles += 1;
					} else if (read.reason === "budget") {
						readBudgetExhausted = true;
					} else {
						stats.unreadablePaths += 1;
						warnings.push(`Skipped unreadable file: ${relPath}`);
					}
				}
			}

			files.push({ path: relPath, absolutePath, size, text });
		}

		// Descend into child directories in lexicographic order (entries are
		// pre-sorted, so unshifting in reverse preserves ascending processing).
		for (let i = childDirectories.length - 1; i >= 0; i -= 1) {
			const child = childDirectories[i];
			if (child) {
				queue.unshift(child);
			}
		}
	}

	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

	const stopReason = resolveStopReason(
		haltReason,
		depthPruned,
		readBudgetExhausted,
	);

	return {
		files,
		lockfiles,
		stats,
		warnings,
		truncated: stopReason !== null,
		stopReason,
	};
}

function resolveStopReason(
	haltReason: "max-entries" | "max-files" | null,
	depthPruned: boolean,
	readBudgetExhausted: boolean,
): RepoScanStopReason | null {
	if (haltReason !== null) {
		return haltReason;
	}
	if (depthPruned) {
		return "max-depth";
	}
	if (readBudgetExhausted) {
		return "max-total-read-bytes";
	}
	return null;
}

async function loadGitignore(
	fs: ScanFileSystem,
	canonicalRoot: string,
	dir: PendingDirectory,
	ignoreStack: GitignoreStack,
	warnings: string[],
): Promise<void> {
	const gitignorePath = join(dir.absolutePath, ".gitignore");
	const read = await readBoundedTextFile({
		canonicalRoot,
		absolutePath: gitignorePath,
		maxFileBytes: GITIGNORE_MAX_BYTES,
		remainingTotalBytes: GITIGNORE_MAX_BYTES,
		fs,
	});
	if (read.ok) {
		ignoreStack.add(dir.relPath, read.text);
	} else {
		warnings.push(
			`Skipped unreadable .gitignore: ${dir.relPath === "" ? "." : dir.relPath}`,
		);
	}
}
