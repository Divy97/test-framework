import assert from "node:assert/strict";
import test from "node:test";
import { GitignoreStack } from "./gitignore.js";

test("root patterns ignore matching files and directories", () => {
	const stack = new GitignoreStack();
	stack.add("", "dist/\n*.log\n");
	assert.equal(stack.isIgnored("dist/bundle.js"), true);
	assert.equal(stack.isIgnored("app.log"), true);
	assert.equal(stack.isIgnored("src/index.ts"), false);
});

test("anchored patterns only match at their base", () => {
	const stack = new GitignoreStack();
	stack.add("", "/build\n");
	assert.equal(stack.isIgnored("build"), true);
	assert.equal(stack.isIgnored("src/build/output.js"), false);
});

test("double-star patterns match nested paths", () => {
	const stack = new GitignoreStack();
	stack.add("", "**/coverage/\n");
	assert.equal(stack.isIgnored("packages/a/coverage/report.html"), true);
});

test("comments and blank lines have no effect", () => {
	const stack = new GitignoreStack();
	stack.add("", "# a comment\n\n*.log\n");
	assert.equal(stack.isIgnored("debug.log"), true);
	assert.equal(stack.isIgnored("comment"), false);
});

test("negation within a context re-includes a previously ignored file", () => {
	const stack = new GitignoreStack();
	stack.add("", "*.log\n!keep.log\n");
	assert.equal(stack.isIgnored("debug.log"), true);
	assert.equal(stack.isIgnored("keep.log"), false);
});

test("escaped hash matches a literal hash-prefixed filename", () => {
	const stack = new GitignoreStack();
	stack.add("", "\\#notacomment\n");
	assert.equal(stack.isIgnored("#notacomment"), true);
});

test("nested gitignore only applies under its base", () => {
	const stack = new GitignoreStack();
	stack.add("", "");
	stack.add("pkg", "secret.txt\n");
	assert.equal(stack.isIgnored("pkg/secret.txt"), true);
	assert.equal(stack.isIgnored("other/secret.txt"), false);
});

test("a deeper context negation overrides a shallow ignore", () => {
	const stack = new GitignoreStack();
	stack.add("", "*.tmp\n");
	stack.add("sub", "!important.tmp\n");
	assert.equal(stack.isIgnored("other.tmp"), true);
	assert.equal(stack.isIgnored("sub/important.tmp"), false);
});

test("additional ignore patterns apply without any gitignore file", () => {
	const stack = new GitignoreStack(["*.secret"]);
	assert.equal(stack.isIgnored("config.secret"), true);
	assert.equal(stack.isIgnored("config.ts"), false);
});

test("additional ignore patterns cannot be re-included by a gitignore negation", () => {
	const stack = new GitignoreStack(["*.secret"]);
	stack.add("", "!config.secret\n");
	assert.equal(stack.isIgnored("config.secret"), true);
});

test("the empty repo-relative root path is never ignored", () => {
	const stack = new GitignoreStack(["*"]);
	assert.equal(stack.isIgnored(""), false);
});
