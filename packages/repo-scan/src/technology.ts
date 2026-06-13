import type { RepoTechnologyDetection } from "./contracts.js";

export interface ParsedManifest {
	packageManager: string | null;
	packageManagerSpec: string | null;
	dependencyNames: Set<string>;
}

export interface ManifestSource {
	path: string;
	dependencyNames: Set<string>;
}

export interface PackageManagerResult {
	detections: RepoTechnologyDetection[];
	primary: string | null;
	warning?: string;
}

const DEP_GROUPS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
] as const;

/**
 * Parse a `package.json` text into normalized manifest data. Returns null for
 * malformed or non-object JSON. Only object-shaped dependency groups with
 * string values contribute names; package code is never executed or resolved.
 */
export function parseManifest(text: string): ParsedManifest | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return null;
	}
	const record = raw as Record<string, unknown>;

	const dependencyNames = new Set<string>();
	for (const group of DEP_GROUPS) {
		const value = record[group];
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			continue;
		}
		for (const [name, version] of Object.entries(
			value as Record<string, unknown>,
		)) {
			if (typeof version === "string" && name.length > 0) {
				dependencyNames.add(name);
			}
		}
	}

	const spec =
		typeof record.packageManager === "string" ? record.packageManager : null;
	const packageManager = spec ? parsePackageManagerName(spec) : null;

	return { packageManager, packageManagerSpec: spec, dependencyNames };
}

function parsePackageManagerName(spec: string): string | null {
	const name = spec.split("@")[0]?.trim().toLowerCase() ?? "";
	return name === "pnpm" || name === "yarn" || name === "npm" || name === "bun"
		? name
		: null;
}

interface FrameworkEntry {
	name: string;
	tier: number; // lower wins as primary
	dependencies: readonly string[];
	configFiles: readonly string[];
}

// Tier 1: full-stack app frameworks, 2: backend, 3: UI library, 4: build tool.
const FRAMEWORKS: readonly FrameworkEntry[] = [
	{
		name: "next",
		tier: 1,
		dependencies: ["next"],
		configFiles: ["next.config.js", "next.config.mjs", "next.config.ts"],
	},
	{
		name: "remix",
		tier: 1,
		dependencies: ["@remix-run/react", "@remix-run/node", "@remix-run/server-runtime"],
		configFiles: ["remix.config.js", "remix.config.mjs"],
	},
	{
		name: "nuxt",
		tier: 1,
		dependencies: ["nuxt"],
		configFiles: ["nuxt.config.js", "nuxt.config.ts"],
	},
	{
		name: "sveltekit",
		tier: 1,
		dependencies: ["@sveltejs/kit"],
		configFiles: ["svelte.config.js"],
	},
	{
		name: "astro",
		tier: 1,
		dependencies: ["astro"],
		configFiles: ["astro.config.mjs", "astro.config.ts"],
	},
	{ name: "nestjs", tier: 2, dependencies: ["@nestjs/core"], configFiles: ["nest-cli.json"] },
	{ name: "hono", tier: 2, dependencies: ["hono"], configFiles: [] },
	{ name: "express", tier: 2, dependencies: ["express"], configFiles: [] },
	{ name: "fastify", tier: 2, dependencies: ["fastify"], configFiles: [] },
	{ name: "react", tier: 3, dependencies: ["react"], configFiles: [] },
	{
		name: "vite",
		tier: 4,
		dependencies: ["vite"],
		configFiles: ["vite.config.js", "vite.config.ts", "vite.config.mjs"],
	},
];

/**
 * Detect all frameworks from manifest dependency sets and distinctive config
 * filenames. Detections are deduped by name (first evidence wins) and returned
 * in stable registry order.
 */
export function detectFrameworks(
	manifests: readonly ManifestSource[],
	configFiles: readonly string[],
): RepoTechnologyDetection[] {
	const detections: RepoTechnologyDetection[] = [];
	const seen = new Set<string>();
	const configSet = new Set(configFiles.map((file) => basenameOf(file)));

	for (const entry of FRAMEWORKS) {
		if (seen.has(entry.name)) {
			continue;
		}
		for (const manifest of manifests) {
			const dependency = entry.dependencies.find((dep) =>
				manifest.dependencyNames.has(dep),
			);
			if (dependency) {
				detections.push({
					name: entry.name,
					path: manifest.path,
					reason: `${entry.name} dependency (${dependency})`,
				});
				seen.add(entry.name);
				break;
			}
		}
		if (seen.has(entry.name)) {
			continue;
		}
		const config = entry.configFiles.find((file) => configSet.has(file));
		if (config) {
			detections.push({
				name: entry.name,
				path: config,
				reason: `${entry.name} config file`,
			});
			seen.add(entry.name);
		}
	}

	return detections;
}

/** Choose the primary framework by tier priority, then registry order. */
export function primaryFramework(
	detections: readonly RepoTechnologyDetection[],
): string | null {
	let best: { tier: number; order: number; name: string } | null = null;
	for (const detection of detections) {
		const order = FRAMEWORKS.findIndex((entry) => entry.name === detection.name);
		if (order === -1) {
			continue;
		}
		const tier = FRAMEWORKS[order]?.tier ?? Number.MAX_SAFE_INTEGER;
		if (
			best === null ||
			tier < best.tier ||
			(tier === best.tier && order < best.order)
		) {
			best = { tier, order, name: detection.name };
		}
	}
	return best?.name ?? null;
}

const LOCKFILE_MANAGERS: ReadonlyMap<string, string> = new Map([
	["pnpm-lock.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["package-lock.json", "npm"],
	["npm-shrinkwrap.json", "npm"],
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
]);

/**
 * Determine package managers. An explicit root `packageManager` field wins. A
 * single lockfile family is accepted. Multiple conflicting lockfile families
 * with no explicit field yield all evidence, a null primary, and a warning.
 */
export function detectPackageManagers(
	explicitName: string | null,
	lockfilePaths: readonly string[],
): PackageManagerResult {
	const detections: RepoTechnologyDetection[] = [];
	const seen = new Set<string>();

	if (explicitName) {
		detections.push({
			name: explicitName,
			path: "package.json",
			reason: "Explicit packageManager field",
		});
		seen.add(explicitName);
	}

	const lockManagers = new Set<string>();
	for (const lockPath of lockfilePaths) {
		const manager = LOCKFILE_MANAGERS.get(basenameOf(lockPath));
		if (!manager) {
			continue;
		}
		lockManagers.add(manager);
		if (!seen.has(manager)) {
			detections.push({
				name: manager,
				path: lockPath,
				reason: "Lockfile present",
			});
			seen.add(manager);
		}
	}

	if (explicitName) {
		return { detections, primary: explicitName };
	}
	if (lockManagers.size === 1) {
		return { detections, primary: [...lockManagers][0] ?? null };
	}
	if (lockManagers.size > 1) {
		return {
			detections,
			primary: null,
			warning:
				"Multiple conflicting lockfiles found; package manager is ambiguous.",
		};
	}
	return { detections, primary: null };
}

function basenameOf(path: string): string {
	const segments = path.split("/");
	return segments[segments.length - 1] ?? path;
}
