export type RepoScanErrorCode =
	| "ROOT_NOT_FOUND"
	| "ROOT_NOT_DIRECTORY"
	| "ROOT_UNREADABLE"
	| "ROOT_REALPATH_FAILED";

/**
 * Fatal scan error. Carries a stable {@link RepoScanErrorCode} and a safe,
 * static message. It never embeds nested error stacks, file contents, or
 * absolute paths so that error surfaces stay leak-free.
 */
export class RepoScanError extends Error {
	readonly code: RepoScanErrorCode;

	constructor(code: RepoScanErrorCode) {
		super(safeMessageFor(code));
		this.name = "RepoScanError";
		this.code = code;
	}
}

function safeMessageFor(code: RepoScanErrorCode): string {
	switch (code) {
		case "ROOT_NOT_FOUND":
			return "Scan root does not exist.";
		case "ROOT_NOT_DIRECTORY":
			return "Scan root is not a directory.";
		case "ROOT_UNREADABLE":
			return "Scan root is not readable.";
		case "ROOT_REALPATH_FAILED":
			return "Scan root could not be canonicalized.";
	}
}
