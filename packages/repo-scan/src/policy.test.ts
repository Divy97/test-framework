import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDirectory, evaluateFile } from "./policy.js";

test("hard-excluded directory components are excluded case-insensitively", () => {
	for (const name of [
		".git",
		"node_modules",
		"dist",
		"build",
		".next",
		".turbo",
		"coverage",
		"generated",
		"__generated__",
		".test-framework",
		".ssh",
		".aws",
	]) {
		assert.equal(evaluateDirectory(name).excluded, true, name);
		assert.equal(evaluateDirectory(name.toUpperCase()).excluded, true, name);
	}
});

test("ordinary directories are not excluded", () => {
	for (const name of ["src", "app", "components", "lib", "auth", "tests"]) {
		assert.equal(evaluateDirectory(name).excluded, false, name);
	}
});

test("a file nested under an excluded directory is skipped by policy", () => {
	const decision = evaluateFile("src/generated/user.ts");
	assert.equal(decision.action, "skip");
	if (decision.action === "skip") {
		assert.equal(decision.kind, "policy");
	}
});

test(".env and all .env.* files are excluded, including .env.example", () => {
	for (const path of [
		".env",
		".env.local",
		".env.production",
		".env.example",
	]) {
		const decision = evaluateFile(path);
		assert.equal(decision.action, "skip", path);
		if (decision.action === "skip") {
			assert.equal(decision.kind, "policy", path);
		}
	}
});

test("secret material files are excluded", () => {
	for (const path of [
		"server.pem",
		"private.key",
		"cert.p12",
		"id_rsa",
		"id_ed25519",
		"credentials.json",
		"credentials.prod.json",
		"service-account-prod.json",
		"secrets.json",
		"secrets.local.json",
		"src/secrets.ts",
		"src/secrets.js",
	]) {
		const decision = evaluateFile(path);
		assert.equal(decision.action, "skip", path);
		if (decision.action === "skip") {
			assert.equal(decision.kind, "policy", path);
		}
	}
});

test("generated and build artifacts are skipped as generated", () => {
	for (const path of [
		"src/user.generated.ts",
		"src/api.gen.ts",
		"src/routeTree.gen.ts",
		"bundle.min.js",
		"styles.min.css",
		"bundle.js.map",
		"types/index.d.ts",
		"app.tsbuildinfo",
	]) {
		const decision = evaluateFile(path);
		assert.equal(decision.action, "skip", path);
		if (decision.action === "skip") {
			assert.equal(decision.kind, "generated", path);
		}
	}
});

test("binary and media files are skipped as binary", () => {
	for (const path of [
		"logo.png",
		"photo.jpeg",
		"clip.mp4",
		"font.woff2",
		"doc.pdf",
		"archive.zip",
		"app.wasm",
		"data.sqlite",
	]) {
		const decision = evaluateFile(path);
		assert.equal(decision.action, "skip", path);
		if (decision.action === "skip") {
			assert.equal(decision.kind, "binary", path);
		}
	}
});

test("lockfiles are skipped as lockfile for metadata-only signals", () => {
	for (const path of [
		"package-lock.json",
		"npm-shrinkwrap.json",
		"yarn.lock",
		"pnpm-lock.yaml",
		"bun.lockb",
	]) {
		const decision = evaluateFile(path);
		assert.equal(decision.action, "skip", path);
		if (decision.action === "skip") {
			assert.equal(decision.kind, "lockfile", path);
		}
	}
});

test("a file literally named token.ts is allowed and text-eligible", () => {
	const decision = evaluateFile("src/auth/token.ts");
	assert.equal(decision.action, "consider");
	if (decision.action === "consider") {
		assert.equal(decision.textEligible, true);
	}
});

test("ordinary source files are considered and text-eligible", () => {
	for (const path of [
		"src/app/page.tsx",
		"package.json",
		"src/lib/util.ts",
		"docs/readme.md",
	]) {
		const decision = evaluateFile(path);
		assert.equal(decision.action, "consider", path);
		if (decision.action === "consider") {
			assert.equal(decision.textEligible, true, path);
		}
	}
});

test("considered files with unknown extensions are not text-eligible", () => {
	const decision = evaluateFile("bin/tool");
	assert.equal(decision.action, "consider");
	if (decision.action === "consider") {
		assert.equal(decision.textEligible, false);
	}
});
