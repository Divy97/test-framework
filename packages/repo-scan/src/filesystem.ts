import { constants } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { isPathInsideRoot } from "./path-safety.js";

/** Minimal filesystem surface the scanner depends on; spyable in tests. */
export interface ScanFileSystem {
	realpath(path: string): Promise<string>;
	lstat(path: string): Promise<Stats>;
	readdir(path: string): Promise<Dirent[]>;
	open(path: string, flags: number): Promise<FileHandle>;
}

/** Production adapter over Node `fs/promises`. */
export const nodeFileSystem: ScanFileSystem = {
	realpath: (path) => realpath(path),
	lstat: (path) => lstat(path),
	readdir: (path) => readdir(path, { withFileTypes: true }),
	open: (path, flags) => open(path, flags),
};

/**
 * Open flags for confined, non-following reads. `O_NOFOLLOW` is added where the
 * platform supports it; on platforms without it the `lstat` guard below remains
 * the conservative defense (documented limitation, never permission to follow).
 */
const READ_FLAGS =
	constants.O_RDONLY |
	(typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);

export interface BoundedReadOptions {
	canonicalRoot: string;
	absolutePath: string;
	maxFileBytes: number;
	remainingTotalBytes: number;
	fs?: ScanFileSystem;
}

export type BoundedReadResult =
	| { ok: true; text: string; bytesRead: number }
	| {
			ok: false;
			reason:
				| "confinement"
				| "not-regular"
				| "too-large"
				| "binary"
				| "budget"
				| "unreadable";
	  };

/**
 * Read a bounded, confined, regular text file. Performs confinement and
 * symlink/size checks before opening, opens without following symlinks,
 * re-checks via the open handle, reads at most the allowed byte count, rejects
 * NUL-containing (binary) content, and always closes the handle.
 */
export async function readBoundedTextFile(
	options: BoundedReadOptions,
): Promise<BoundedReadResult> {
	const {
		canonicalRoot,
		absolutePath,
		maxFileBytes,
		remainingTotalBytes,
		fs = nodeFileSystem,
	} = options;

	if (!isPathInsideRoot(canonicalRoot, absolutePath)) {
		return { ok: false, reason: "confinement" };
	}

	let preStat: Stats;
	try {
		preStat = await fs.lstat(absolutePath);
	} catch {
		return { ok: false, reason: "unreadable" };
	}
	if (!preStat.isFile()) {
		return { ok: false, reason: "not-regular" };
	}
	if (preStat.size > maxFileBytes) {
		return { ok: false, reason: "too-large" };
	}
	if (remainingTotalBytes <= 0) {
		return { ok: false, reason: "budget" };
	}

	let handle: FileHandle;
	try {
		handle = await fs.open(absolutePath, READ_FLAGS);
	} catch {
		return { ok: false, reason: "unreadable" };
	}

	try {
		const postStat = await handle.stat();
		if (!postStat.isFile()) {
			return { ok: false, reason: "not-regular" };
		}
		if (postStat.size > maxFileBytes) {
			return { ok: false, reason: "too-large" };
		}

		const toRead = Math.min(postStat.size, maxFileBytes, remainingTotalBytes);
		if (toRead <= 0) {
			return { ok: true, text: "", bytesRead: 0 };
		}

		const buffer = Buffer.alloc(toRead);
		const { bytesRead } = await handle.read(buffer, 0, toRead, 0);
		const slice = buffer.subarray(0, bytesRead);
		if (slice.includes(0)) {
			return { ok: false, reason: "binary" };
		}
		return { ok: true, text: slice.toString("utf8"), bytesRead };
	} catch {
		return { ok: false, reason: "unreadable" };
	} finally {
		await handle.close();
	}
}
