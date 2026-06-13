import assert from "node:assert/strict";
import test from "node:test";
import { classifyFile } from "./classify.js";

function categories(
	path: string,
	text: string | null,
	signals: string[] = [],
): string[] {
	return classifyFile({ path, text, packageSignals: new Set(signals) })
		.map((match) => match.category)
		.sort();
}

test("Next.js App Router page is a route/page", () => {
	const result = classifyFile({
		path: "src/app/dashboard/page.tsx",
		text: "export default function Page() { return <div/>; }",
		packageSignals: new Set(["next", "react"]),
	});
	assert.ok(result.some((m) => m.category === "routesPages"));
});

test("Next.js App Router route handler is an API handler", () => {
	const result = categories(
		"src/app/api/users/route.ts",
		"export async function GET() { return Response.json([]); }",
		["next"],
	);
	assert.ok(result.includes("apiHandlers"));
});

test("a PascalCase component in components/ is a component", () => {
	assert.ok(
		categories(
			"src/components/UserCard.tsx",
			"export function UserCard() { return <div>hi</div>; }",
			["react"],
		).includes("components"),
	);
});

test("a Drizzle schema file is a db schema/model", () => {
	assert.ok(
		categories(
			"src/db/schema.ts",
			"export const users = pgTable('users', {});",
			["drizzle-orm"],
		).includes("dbSchemasModels"),
	);
});

test("a test file is detected by filename convention", () => {
	assert.ok(
		categories("src/components/UserCard.test.tsx", "test('x', () => {});").includes(
			"existingTests",
		),
	);
});

test("a middleware file is auth/middleware", () => {
	assert.ok(
		categories("src/middleware.ts", "export function middleware() {}", [
			"next",
		]).includes("authMiddleware"),
	);
});

test("a Zod schema file is a validation schema", () => {
	assert.ok(
		categories(
			"src/validation/user.ts",
			"import { z } from 'zod'; export const userSchema = z.object({});",
			["zod"],
		).includes("validationSchemas"),
	);
});

test("a flags module using a flag SDK is a feature flag", () => {
	assert.ok(
		categories(
			"src/flags.ts",
			"import { PostHog } from 'posthog-node'; export const flags = {};",
			["posthog-node"],
		).includes("featureFlags"),
	);
});

test("an imported integration SDK is an external integration", () => {
	assert.ok(
		categories(
			"src/integrations/stripe.ts",
			"import Stripe from 'stripe'; export const stripe = new Stripe('');",
			["stripe"],
		).includes("externalIntegrations"),
	);
});

// ---- False positives ----

test("a routes-helper file is NOT automatically a route", () => {
	assert.equal(
		categories("src/routes-helper.ts", "export const x = 1;").includes(
			"routesPages",
		),
		false,
	);
});

test("a lowercase utility tsx without JSX is NOT a component", () => {
	assert.equal(
		categories("src/util.tsx", "export const add = (a, b) => a + b;", [
			"react",
		]).includes("components"),
		false,
	);
});

test("a markdown schema doc is NOT a db or validation file", () => {
	const result = categories("docs/schema.md", "# Schema\nThis describes data.");
	assert.equal(result.includes("dbSchemasModels"), false);
	assert.equal(result.includes("validationSchemas"), false);
});

test("a comment mention of stripe is NOT an integration", () => {
	assert.equal(
		categories(
			"src/lib/notes.ts",
			"// we might use stripe one day\nexport const note = 1;",
			[],
		).includes("externalIntegrations"),
		false,
	);
});

test("a generic config file is NOT a feature flag", () => {
	assert.equal(
		categories("src/config.ts", "export const config = { debug: true };").includes(
			"featureFlags",
		),
		false,
	);
});

test("classification returns deterministic reasons", () => {
	const first = classifyFile({
		path: "src/app/dashboard/page.tsx",
		text: "export default function Page() { return <div/>; }",
		packageSignals: new Set(["next"]),
	});
	const second = classifyFile({
		path: "src/app/dashboard/page.tsx",
		text: "export default function Page() { return <div/>; }",
		packageSignals: new Set(["next"]),
	});
	assert.deepEqual(first, second);
});
