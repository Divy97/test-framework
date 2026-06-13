export type CategoryKey =
	| "routesPages"
	| "components"
	| "apiHandlers"
	| "dbSchemasModels"
	| "existingTests"
	| "authMiddleware"
	| "validationSchemas"
	| "featureFlags"
	| "externalIntegrations";

export interface ClassifyInput {
	path: string;
	text: string | null;
	packageSignals: Set<string>;
}

export interface ClassifyMatch {
	category: CategoryKey;
	reason: string;
}

export interface IntegrationEntry {
	name: string;
	packages: readonly string[];
}

/** External integration SDKs detected by dependency or import specifier. */
export const INTEGRATION_PACKAGES: readonly IntegrationEntry[] = [
	{ name: "Stripe", packages: ["stripe", "@stripe/stripe-js"] },
	{
		name: "Sentry",
		packages: ["@sentry/node", "@sentry/nextjs", "@sentry/react"],
	},
	{ name: "OpenAI", packages: ["openai"] },
	{ name: "Anthropic", packages: ["@anthropic-ai/sdk"] },
	{
		name: "AWS",
		packages: ["aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-dynamodb"],
	},
	{ name: "Firebase", packages: ["firebase", "firebase-admin"] },
	{ name: "Supabase", packages: ["@supabase/supabase-js"] },
	{ name: "Twilio", packages: ["twilio"] },
	{ name: "SendGrid", packages: ["@sendgrid/mail"] },
	{ name: "PostHog", packages: ["posthog-js", "posthog-node"] },
	{
		name: "LaunchDarkly",
		packages: ["launchdarkly-node-server-sdk", "launchdarkly-js-client-sdk"],
	},
	{ name: "Clerk", packages: ["@clerk/nextjs", "@clerk/clerk-react"] },
	{ name: "Auth0", packages: ["@auth0/nextjs-auth0", "auth0"] },
];

const AUTH_PACKAGES: readonly string[] = [
	"@clerk/nextjs",
	"@clerk/clerk-react",
	"@auth0/nextjs-auth0",
	"auth0",
	"next-auth",
	"lucia",
	"@lucia-auth/adapter-drizzle",
];

const FLAG_PACKAGES: readonly string[] = [
	"posthog-js",
	"posthog-node",
	"launchdarkly-node-server-sdk",
	"launchdarkly-js-client-sdk",
	"unleash-client",
	"@unleash/proxy-client-react",
	"configcat-js",
	"configcat-node",
];

const VALIDATION_LIBS: ReadonlyMap<string, string> = new Map([
	["zod", "Zod"],
	["yup", "Yup"],
	["joi", "Joi"],
	["valibot", "Valibot"],
	["ajv", "Ajv"],
]);

const CODE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"mts",
	"cts",
	"prisma",
]);

const TEST_BASENAME = /\.(test|spec)\.[a-z]+$/;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const JSX_SIGNAL = /<\/[A-Za-z]|<[A-Z][A-Za-z0-9]*[\s/>]/;
const HTTP_VERB_EXPORT =
	/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;
const ROUTE_CALL = /\b(?:app|router)\.(?:get|post|put|patch|delete|all)\s*\(/;
const HONO_NEW = /new\s+Hono\s*\(/;
const DRIZZLE_TABLE = /\b(?:pgTable|sqliteTable|mysqlTable)\s*\(/;
const PRISMA_MODEL = /\bmodel\s+\w+\s*\{/;
const MONGOOSE = /new\s+(?:mongoose\.)?Schema\s*\(|mongoose\.model\s*\(/;
const SEQUELIZE = /sequelize\.define\s*\(|extends\s+Model\b/;
const TYPEORM = /@Entity\s*\(/;
const TEST_RUNNER_PACKAGES: readonly string[] = [
	"node:test",
	"vitest",
	"mocha",
	"bun:test",
	"@jest/globals",
	"@playwright/test",
	"uvu",
	"ava",
];
const TEST_CALL = /\b(?:test|it|describe)\s*\(/;

function basenameOf(path: string): string {
	return path.split("/").at(-1) ?? path;
}

function extensionOf(basename: string): string {
	const dot = basename.lastIndexOf(".");
	return dot <= 0 ? "" : basename.slice(dot + 1).toLowerCase();
}

function segments(path: string): string[] {
	return path.split("/").slice(0, -1);
}

/** Extract module specifiers from import/require/from statements. */
function importSpecifiers(text: string): Set<string> {
	const specifiers = new Set<string>();
	const pattern = /(?:from|import|require\()\s*['"]([^'"]+)['"]/g;
	let match: RegExpExecArray | null = pattern.exec(text);
	while (match !== null) {
		if (match[1]) {
			specifiers.add(match[1]);
		}
		match = pattern.exec(text);
	}
	return specifiers;
}

function importsPackage(specifiers: Set<string>, pkg: string): boolean {
	if (specifiers.has(pkg)) {
		return true;
	}
	for (const specifier of specifiers) {
		if (specifier === pkg || specifier.startsWith(`${pkg}/`)) {
			return true;
		}
	}
	return false;
}

/**
 * Classify a single considered file into zero or more evidence categories
 * using path conventions plus bounded content and package signals. Rules are
 * deterministic and conservative: ambiguous names require a content or package
 * signal so that helpers, utilities, and docs are not miscategorized.
 */
export function classifyFile(input: ClassifyInput): ClassifyMatch[] {
	const matches: ClassifyMatch[] = [];
	const { path, text, packageSignals } = input;
	const basename = basenameOf(path);
	const extension = extensionOf(basename);
	const isCode = CODE_EXTENSIONS.has(extension);
	const dirs = segments(path);
	const dirSet = new Set(dirs);
	const specifiers = text ? importSpecifiers(text) : new Set<string>();
	const add = (category: CategoryKey, reason: string): void => {
		matches.push({ category, reason });
	};
	const hasBackend =
		packageSignals.has("hono") ||
		packageSignals.has("express") ||
		packageSignals.has("fastify");

	// Existing tests
	if (
		TEST_BASENAME.test(basename) ||
		dirSet.has("__tests__") ||
		dirSet.has("tests") ||
		dirSet.has("e2e")
	) {
		add("existingTests", "Test filename or directory convention");
	} else if (
		isCode &&
		text !== null &&
		TEST_CALL.test(text) &&
		TEST_RUNNER_PACKAGES.some((pkg) => importsPackage(specifiers, pkg))
	) {
		// Layout-agnostic: an imported test runner plus a test/it/describe call
		// identifies a test regardless of filename or directory convention.
		add("existingTests", "Test runner declaration");
	}

	// API handlers (evaluate before routes/pages so Next route handlers win)
	const inPagesApi = path.includes("pages/api/");
	if (isCode && basename.startsWith("route.") && dirSet.has("app")) {
		add("apiHandlers", "Next.js route handler convention");
	} else if (isCode && inPagesApi) {
		add("apiHandlers", "Next.js pages/api handler convention");
	} else if (isCode && dirSet.has("api")) {
		add("apiHandlers", "API directory convention");
	} else if (
		isCode &&
		dirSet.has("routes") &&
		text !== null &&
		(HTTP_VERB_EXPORT.test(text) ||
			ROUTE_CALL.test(text) ||
			HONO_NEW.test(text) ||
			hasBackend)
	) {
		add("apiHandlers", "Route module with HTTP handler signals");
	} else if (
		isCode &&
		text !== null &&
		(HTTP_VERB_EXPORT.test(text) ||
			HONO_NEW.test(text) ||
			ROUTE_CALL.test(text))
	) {
		// Layout-agnostic: an exported HTTP verb or framework route call is an
		// API handler regardless of directory name (e.g. `domains/.../http`).
		add("apiHandlers", "Exported HTTP handler signal");
	}

	// Routes / pages
	if (isCode && basename.startsWith("page.") && dirSet.has("app")) {
		add("routesPages", "Next.js App Router page convention");
	} else if (isCode && path.includes("pages/") && !inPagesApi) {
		add("routesPages", "Next.js Pages Router convention");
	} else if (isCode && dirSet.has("routes")) {
		add("routesPages", "Routes directory convention");
	}

	// Components
	const componentBase = basename.replace(/\.[^.]+$/, "");
	if (
		(extension === "tsx" || extension === "jsx") &&
		dirSet.has("components")
	) {
		add("components", "Component directory and module");
	} else if (
		(extension === "tsx" || extension === "jsx") &&
		PASCAL_CASE.test(componentBase) &&
		(packageSignals.has("react") || packageSignals.has("solid-js"))
	) {
		add("components", "PascalCase component module");
	} else if (
		(extension === "tsx" || extension === "jsx") &&
		text !== null &&
		JSX_SIGNAL.test(text)
	) {
		add("components", "JSX component module");
	}

	// DB schemas / models
	if (isCode) {
		const isSchemaName = /^schema\.[a-z]+$/.test(basename);
		const isModelName = /\.model\.[a-z]+$/.test(basename);
		if (extension === "prisma" && text !== null && PRISMA_MODEL.test(text)) {
			add("dbSchemasModels", "Prisma model declaration");
		} else if (text !== null && DRIZZLE_TABLE.test(text)) {
			add("dbSchemasModels", "Drizzle table declaration");
		} else if (text !== null && MONGOOSE.test(text)) {
			add("dbSchemasModels", "Mongoose schema declaration");
		} else if (text !== null && SEQUELIZE.test(text)) {
			add("dbSchemasModels", "Sequelize model declaration");
		} else if (text !== null && TYPEORM.test(text)) {
			add("dbSchemasModels", "TypeORM entity declaration");
		} else if (isModelName || dirSet.has("models")) {
			add("dbSchemasModels", "Model file or directory convention");
		} else if (isSchemaName && (dirSet.has("db") || dirSet.has("database"))) {
			add("dbSchemasModels", "Schema module in database directory");
		}
	}

	// Auth / middleware
	const authImport = AUTH_PACKAGES.find((pkg) =>
		importsPackage(specifiers, pkg),
	);
	if (isCode && basename.startsWith("middleware.")) {
		add("authMiddleware", "Middleware filename convention");
	} else if (authImport) {
		add("authMiddleware", `Auth library import (${authImport})`);
	} else if (isCode && (dirSet.has("auth") || dirSet.has("guards"))) {
		add("authMiddleware", "Auth or guards directory convention");
	}

	// Validation schemas
	const validationLib = [...VALIDATION_LIBS.keys()].find((pkg) =>
		importsPackage(specifiers, pkg),
	);
	if (validationLib) {
		add(
			"validationSchemas",
			`${VALIDATION_LIBS.get(validationLib)} validation schema`,
		);
	} else if (isCode && (dirSet.has("validation") || dirSet.has("validators"))) {
		add("validationSchemas", "Validation directory convention");
	}

	// Feature flags
	const flagImport = FLAG_PACKAGES.find((pkg) =>
		importsPackage(specifiers, pkg),
	);
	if (flagImport) {
		add("featureFlags", `Feature flag SDK usage (${flagImport})`);
	} else if (
		isCode &&
		(basename.startsWith("flags.") || dirSet.has("feature-flags"))
	) {
		add("featureFlags", "Feature flag module convention");
	}

	// External integrations (import-based; dependency-based handled by scanner)
	for (const integration of INTEGRATION_PACKAGES) {
		const pkg = integration.packages.find((candidate) =>
			importsPackage(specifiers, candidate),
		);
		if (pkg) {
			add("externalIntegrations", `${integration.name} SDK import (${pkg})`);
		}
	}

	return matches;
}
