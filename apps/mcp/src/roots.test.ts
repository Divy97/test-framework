import assert from "node:assert/strict";
import test from "node:test";
import { EngineError } from "@test-framework/qa-engine";
import {
	confineRepoPath,
	type RootsServer,
	resolveWorkspaceRoot,
} from "./roots.js";

function fakeServer(overrides: Partial<RootsServer>): RootsServer {
	return {
		getClientCapabilities: () => undefined,
		listRoots: async () => ({ roots: [] }),
		...overrides,
	};
}

test("resolveWorkspaceRoot uses the first file:// MCP root when available", async () => {
	const server = fakeServer({
		getClientCapabilities: () => ({ roots: {} }),
		listRoots: async () => ({ roots: [{ uri: "file:///tmp/projX" }] }),
	});
	assert.equal(await resolveWorkspaceRoot(server, "/fallback"), "/tmp/projX");
});

test("resolveWorkspaceRoot skips non-file roots and falls to the next file root", async () => {
	const server = fakeServer({
		getClientCapabilities: () => ({ roots: {} }),
		listRoots: async () => ({
			roots: [{ uri: "https://example.com/x" }, { uri: "file:///tmp/projY" }],
		}),
	});
	assert.equal(await resolveWorkspaceRoot(server, "/fallback"), "/tmp/projY");
});

test("resolveWorkspaceRoot falls back to the configured root when roots are absent", async () => {
	const server = fakeServer({ getClientCapabilities: () => undefined });
	assert.equal(
		await resolveWorkspaceRoot(server, "/configured"),
		"/configured",
	);
});

test("resolveWorkspaceRoot falls back to cwd when no root and no config", async () => {
	const server = fakeServer({ getClientCapabilities: () => undefined });
	assert.equal(await resolveWorkspaceRoot(server), process.cwd());
});

test("resolveWorkspaceRoot falls back when listRoots throws", async () => {
	const server = fakeServer({
		getClientCapabilities: () => ({ roots: {} }),
		listRoots: async () => {
			throw new Error("client closed");
		},
	});
	assert.equal(
		await resolveWorkspaceRoot(server, "/configured"),
		"/configured",
	);
});

test("resolveWorkspaceRoot falls back when roots advertised but list is empty", async () => {
	const server = fakeServer({
		getClientCapabilities: () => ({ roots: {} }),
		listRoots: async () => ({ roots: [] }),
	});
	assert.equal(
		await resolveWorkspaceRoot(server, "/configured"),
		"/configured",
	);
});

test("confineRepoPath resolves a path inside the root", () => {
	const resolved = confineRepoPath("/root/project", "packages/app");
	assert.equal(resolved, "/root/project/packages/app");
});

test("confineRepoPath rejects a relative path escaping the root", () => {
	assert.throws(
		() => confineRepoPath("/root/project", "../../etc/passwd"),
		(err) => err instanceof EngineError && err.code === "REPO_ACCESS_DENIED",
	);
});

test("confineRepoPath rejects an absolute path outside the root", () => {
	assert.throws(
		() => confineRepoPath("/root/project", "/etc/passwd"),
		(err) => err instanceof EngineError && err.code === "REPO_ACCESS_DENIED",
	);
});
