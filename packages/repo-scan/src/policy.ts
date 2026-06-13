export type PolicySkipKind = "policy" | "binary" | "generated" | "lockfile";

export type PolicyDecision =
	| { action: "skip"; reason: string; kind: PolicySkipKind }
	| { action: "consider"; textEligible: boolean };

export interface DirectoryDecision {
	excluded: boolean;
	reason?: string;
}

/** Immutable, centralized hard exclusion sets. Never weakened by user options. */
const HARD_DIR_COMPONENTS: ReadonlySet<string> = new Set([
	".git",
	".hg",
	".svn",
	"node_modules",
	".pnpm-store",
	".yarn",
	".pnp",
	"dist",
	"build",
	"out",
	"target",
	"coverage",
	".nyc_output",
	".next",
	".nuxt",
	".svelte-kit",
	".turbo",
	".nx",
	".cache",
	"tmp",
	"temp",
	"logs",
	".vercel",
	".serverless",
	".terraform",
	"generated",
	"__generated__",
	".generated",
	".test-framework",
	".ssh",
	".gnupg",
	".aws",
]);

const LOCKFILES: ReadonlySet<string> = new Set([
	"package-lock.json",
	"npm-shrinkwrap.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lock",
	"bun.lockb",
]);

const SECRET_EXACT: ReadonlySet<string> = new Set([
	"id_rsa",
	"id_dsa",
	"id_ecdsa",
	"id_ed25519",
	"credentials.json",
	"secrets.json",
	"secrets.ts",
	"secrets.js",
]);

const SECRET_EXTENSIONS: ReadonlySet<string> = new Set([
	"pem",
	"key",
	"p12",
	"pfx",
	"crt",
	"cer",
	"der",
]);

const SECRET_GLOBS: readonly RegExp[] = [
	/^\.env(\..*)?$/,
	/^credentials\..*\.json$/,
	/^secrets\..*\.json$/,
	/^service-account.*\.json$/,
];

const GENERATED_GLOBS: readonly RegExp[] = [
	/\.generated\./,
	/\.gen\./,
	/\.min\.js$/,
	/\.min\.css$/,
	/\.map$/,
	/\.d\.ts$/,
	/\.tsbuildinfo$/,
];

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
	// images
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"avif",
	"ico",
	"bmp",
	"tif",
	"tiff",
	"svg",
	"heic",
	// audio
	"mp3",
	"wav",
	"flac",
	"aac",
	"ogg",
	"m4a",
	// video
	"mp4",
	"mov",
	"avi",
	"mkv",
	"webm",
	// fonts
	"woff",
	"woff2",
	"ttf",
	"otf",
	"eot",
	// documents
	"pdf",
	"doc",
	"docx",
	"xls",
	"xlsx",
	"ppt",
	"pptx",
	// archives
	"zip",
	"tar",
	"gz",
	"tgz",
	"bz2",
	"7z",
	"rar",
	"xz",
	"zst",
	// executables / objects
	"exe",
	"dll",
	"so",
	"dylib",
	"o",
	"a",
	"bin",
	"wasm",
	"class",
	// databases
	"sqlite",
	"sqlite3",
	"db",
]);

const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"mts",
	"cts",
	"json",
	"jsonc",
	"md",
	"mdx",
	"yaml",
	"yml",
	"toml",
	"html",
	"htm",
	"css",
	"scss",
	"sass",
	"less",
	"vue",
	"svelte",
	"astro",
	"graphql",
	"gql",
	"prisma",
	"txt",
]);

function extensionOf(basename: string): string {
	const dot = basename.lastIndexOf(".");
	if (dot <= 0) {
		return "";
	}
	return basename.slice(dot + 1).toLowerCase();
}

/** Decide whether a directory component is hard-excluded. Case-insensitive. */
export function evaluateDirectory(name: string): DirectoryDecision {
	if (HARD_DIR_COMPONENTS.has(name.toLowerCase())) {
		return { excluded: true, reason: "Excluded directory component" };
	}
	return { excluded: false };
}

/**
 * Evaluate a repo-relative POSIX path against the immutable hard policy. Path
 * components are checked before basename patterns. Lockfiles are reported with
 * a dedicated kind so package-manager detection can record them before the skip.
 */
export function evaluateFile(relPath: string): PolicyDecision {
	const components = relPath.split("/");
	for (let i = 0; i < components.length - 1; i += 1) {
		const component = components[i];
		if (component && evaluateDirectory(component).excluded) {
			return {
				action: "skip",
				reason: "Excluded directory component",
				kind: "policy",
			};
		}
	}

	const basename = (components.at(-1) ?? "").toLowerCase();
	const extension = extensionOf(basename);

	if (
		SECRET_EXACT.has(basename) ||
		SECRET_EXTENSIONS.has(extension) ||
		SECRET_GLOBS.some((pattern) => pattern.test(basename))
	) {
		return {
			action: "skip",
			reason: "Secret or environment file",
			kind: "policy",
		};
	}

	if (LOCKFILES.has(basename)) {
		return {
			action: "skip",
			reason: "Lockfile (metadata only)",
			kind: "lockfile",
		};
	}

	if (GENERATED_GLOBS.some((pattern) => pattern.test(basename))) {
		return {
			action: "skip",
			reason: "Generated or build artifact",
			kind: "generated",
		};
	}

	if (BINARY_EXTENSIONS.has(extension)) {
		return {
			action: "skip",
			reason: "Binary or media file",
			kind: "binary",
		};
	}

	return { action: "consider", textEligible: TEXT_EXTENSIONS.has(extension) };
}
