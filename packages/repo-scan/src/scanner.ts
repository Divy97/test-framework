import {
	type CategoryKey,
	classifyFile,
	INTEGRATION_PACKAGES,
} from "./classify.js";
import {
	type RepoFileReference,
	type RepoScanRequest,
	type RepoScanSummary,
	repoScanOptionsSchema,
	repoScanRequestSchema,
	repoScanSummarySchema,
} from "./contracts.js";
import { resolveRelevantFileHints, resolveScanRoot } from "./path-safety.js";
import {
	detectFrameworks,
	detectPackageManagers,
	type ManifestSource,
	parseManifest,
	primaryFramework,
} from "./technology.js";
import type { TraversedFile } from "./traverse.js";
import { traverseRepository } from "./traverse.js";

const CATEGORY_KEYS: readonly CategoryKey[] = [
	"routesPages",
	"components",
	"apiHandlers",
	"dbSchemasModels",
	"existingTests",
	"authMiddleware",
	"validationSchemas",
	"featureFlags",
	"externalIntegrations",
];

/**
 * Scan a local repository and return a deterministic, bounded, secret-safe
 * evidence summary. Root failures are fatal; individual path failures are
 * recorded as warnings during traversal and the scan continues.
 */
export async function scanRepository(
	request: RepoScanRequest,
): Promise<RepoScanSummary> {
	const parsed = repoScanRequestSchema.parse(request);
	const options = repoScanOptionsSchema.parse(parsed.options);

	const { canonicalRoot } = await resolveScanRoot(parsed.rootPath);
	const hintResolution = resolveRelevantFileHints(
		canonicalRoot,
		parsed.relevantFiles,
	);

	const traversal = await traverseRepository({
		canonicalRoot,
		maxDepth: options.maxDepth,
		maxEntries: options.maxEntries,
		maxFiles: options.maxFiles,
		maxFileBytes: options.maxFileBytes,
		maxTotalReadBytes: options.maxTotalReadBytes,
		honorGitignore: options.honorGitignore,
		additionalIgnorePatterns: options.additionalIgnorePatterns,
	});

	const manifests = parseManifests(traversal.files);
	const rootManifest = manifests.find((m) => m.path === "package.json");

	const frameworks = detectFrameworks(
		manifests,
		traversal.files.map((file) => file.path),
	);
	const pmResult = detectPackageManagers(
		rootManifest?.packageManager ?? null,
		traversal.lockfiles,
	);

	const categories = collectCategories(traversal.files, manifests);

	const hintOrder = new Map<string, number>();
	for (const [index, path] of hintResolution.hints.entries()) {
		hintOrder.set(path, index);
	}

	const warnings = [
		...traversal.warnings,
		...hintResolution.warnings,
		...(pmResult.warning ? [pmResult.warning] : []),
	];

	const evidence: Record<CategoryKey, RepoFileReference[]> = {
		routesPages: [],
		components: [],
		apiHandlers: [],
		dbSchemasModels: [],
		existingTests: [],
		authMiddleware: [],
		validationSchemas: [],
		featureFlags: [],
		externalIntegrations: [],
	};

	let evidenceTruncated = false;
	for (const key of CATEGORY_KEYS) {
		const references = orderReferences(categories[key], hintOrder);
		if (references.length > options.maxEvidencePerCategory) {
			evidenceTruncated = true;
			warnings.push(
				`Evidence for ${key} truncated to ${options.maxEvidencePerCategory} entries.`,
			);
		}
		evidence[key] = references.slice(0, options.maxEvidencePerCategory);
	}

	const summary: RepoScanSummary = {
		framework: primaryFramework(frameworks),
		packageManager: pmResult.primary,
		frameworks,
		packageManagers: pmResult.detections,
		routesPages: evidence.routesPages,
		components: evidence.components,
		apiHandlers: evidence.apiHandlers,
		dbSchemasModels: evidence.dbSchemasModels,
		existingTests: evidence.existingTests,
		authMiddleware: evidence.authMiddleware,
		validationSchemas: evidence.validationSchemas,
		featureFlags: evidence.featureFlags,
		externalIntegrations: evidence.externalIntegrations,
		truncated: traversal.truncated || evidenceTruncated,
		stopReason: traversal.stopReason,
		warnings,
		stats: traversal.stats,
	};

	return repoScanSummarySchema.parse(summary);
}

type ParsedManifestSource = ManifestSource & { packageManager: string | null };

function parseManifests(
	files: readonly TraversedFile[],
): ParsedManifestSource[] {
	const manifests: ParsedManifestSource[] = [];
	for (const file of files) {
		if (file.text === null || file.path.split("/").at(-1) !== "package.json") {
			continue;
		}
		const parsedManifest = parseManifest(file.text);
		if (!parsedManifest) {
			continue;
		}
		manifests.push({
			path: file.path,
			dependencyNames: parsedManifest.dependencyNames,
			packageManager: parsedManifest.packageManager,
		});
	}
	return manifests;
}

function collectCategories(
	files: readonly TraversedFile[],
	manifests: readonly ManifestSource[],
): Record<CategoryKey, Map<string, string>> {
	const categories: Record<CategoryKey, Map<string, string>> = {
		routesPages: new Map(),
		components: new Map(),
		apiHandlers: new Map(),
		dbSchemasModels: new Map(),
		existingTests: new Map(),
		authMiddleware: new Map(),
		validationSchemas: new Map(),
		featureFlags: new Map(),
		externalIntegrations: new Map(),
	};

	for (const file of files) {
		const matches = classifyFile({
			path: file.path,
			text: file.text,
			packageSignals: signalsForFile(file.path, manifests),
		});
		for (const match of matches) {
			const bucket = categories[match.category];
			if (!bucket.has(file.path)) {
				bucket.set(file.path, match.reason);
			}
		}
	}

	// Dependency-based external integrations, evidenced on the owning manifest.
	for (const manifest of manifests) {
		for (const integration of INTEGRATION_PACKAGES) {
			const pkg = integration.packages.find((candidate) =>
				manifest.dependencyNames.has(candidate),
			);
			if (pkg && !categories.externalIntegrations.has(manifest.path)) {
				categories.externalIntegrations.set(
					manifest.path,
					`${integration.name} SDK dependency (${pkg})`,
				);
			}
		}
	}

	return categories;
}

/** Repo-relative directory of a manifest path (`""` for the root manifest). */
function manifestDirOf(manifestPath: string): string {
	const slash = manifestPath.lastIndexOf("/");
	return slash === -1 ? "" : manifestPath.slice(0, slash);
}

/**
 * Package signals visible to a file: dependencies from the root manifest plus
 * every ancestor package's manifest. Sibling packages' dependencies are
 * excluded so that, for example, React in one workspace does not make an
 * unrelated package's PascalCase `.tsx` look like a component.
 */
function signalsForFile(
	filePath: string,
	manifests: readonly ManifestSource[],
): Set<string> {
	const slash = filePath.lastIndexOf("/");
	const fileDir = slash === -1 ? "" : filePath.slice(0, slash);
	const signals = new Set<string>();
	for (const manifest of manifests) {
		const dir = manifestDirOf(manifest.path);
		const applies =
			dir === "" || fileDir === dir || fileDir.startsWith(`${dir}/`);
		if (applies) {
			for (const name of manifest.dependencyNames) {
				signals.add(name);
			}
		}
	}
	return signals;
}

function orderReferences(
	bucket: Map<string, string>,
	hintOrder: Map<string, number>,
): RepoFileReference[] {
	const references = [...bucket.entries()].map(([path, reason]) => ({
		path,
		reason,
	}));
	references.sort((a, b) => {
		const ha = hintOrder.get(a.path);
		const hb = hintOrder.get(b.path);
		if (ha !== undefined && hb !== undefined) {
			return ha - hb;
		}
		if (ha !== undefined) {
			return -1;
		}
		if (hb !== undefined) {
			return 1;
		}
		return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
	});
	return references;
}
