# API Execution Risk Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a local isolated child process can run deterministic API checks against an explicitly allowlisted loopback fixture, produce sanitized evidence for pass/assertion-failure/timeout/policy-rejection outcomes, and leave only a research report plus one canonical failure-bundle example in the repository.

**Architecture:** Build a disposable Node-only experiment under `spikes/execution/`. A parent runner owns target policy, fixture lifecycle, child process timeout, bounded output capture, redaction, evidence assembly, and temp cleanup. A child script performs one hand-written API check and writes a raw structured result to a mode-`0600` file inside a mode-`0700` OS temp directory. Delete the complete spike implementation before the final commit; only documentation survives.

**Tech Stack:** Node.js 25, ESM `.mjs`, built-in `node:http`, `node:child_process`, `node:fs/promises`, `node:test`, `node:assert`, `node:crypto`; no new package, workspace, framework, Docker service, database, or external network request.

---

## Non-Negotiable Decisions

- Timebox implementation and investigation to one working day.
- Bind fixture only to `127.0.0.1` on an ephemeral port.
- Permit only the exact fixture origin, for example `http://127.0.0.1:43123`.
- Reject `localhost`, IPv6, non-loopback addresses, HTTPS, alternate ports, credentials, and redirects.
- Validate target in parent and immediately before the child request.
- Spawn one child process per scenario. Child has no grandchildren.
- Default hard timeout is `2_000 ms`; send `SIGTERM`, wait `250 ms`, then `SIGKILL`.
- Capture stdout/stderr/request/response bodies up to `65_536` UTF-8 bytes each and record truncation.
- Store raw child output only under `os.tmpdir()`, directory mode `0700`, file mode `0600`.
- Delete raw file and temp directory in `finally`, including pass, fail, crash, and timeout paths.
- Redact authorization, cookies, passwords, emails, token/secret/API-key-like fields, and known secret values before persistence.
- Persist no raw provider/process payload and no absolute temp path.
- Do not classify product/test/environment cause. Persist `classification: "unclassified"`.
- Prove four scenarios: passed assertion, failed security assertion, timeout, policy rejection.
- Commit no spike source. Final PR contains this plan, `report.md`, and `failure-bundle.example.json` only.
- Historical spike commits are also disallowed. Do not commit temporary code and later delete it.
- Use `.claude/skills/ship-it/SKILL.md` for final commit, push, and PR.

## Final Failure Bundle Contract

The committed example must use this exact shape:

```json
{
  "schemaVersion": "execution-failure-bundle/v0",
  "runId": "run-security-failure",
  "testId": "api-users-sensitive-fields",
  "createdAt": "2026-06-14T14:00:00.000Z",
  "target": {
    "origin": "http://127.0.0.1:43123",
    "method": "POST",
    "path": "/users"
  },
  "runStatus": "completed",
  "testStatus": "failed",
  "failureKind": "assertion",
  "classification": "unclassified",
  "durationMs": 1,
  "process": {
    "exitCode": 1,
    "signal": null,
    "timedOut": false,
    "stdout": "child: assertion failed\n",
    "stderr": "",
    "stdoutTruncated": false,
    "stderrTruncated": false
  },
  "request": {
    "method": "POST",
    "url": "http://127.0.0.1:43123/users",
    "headers": {
      "authorization": "[REDACTED]",
      "content-type": "application/json"
    },
    "body": {
      "email": "[REDACTED]",
      "password": "[REDACTED]"
    }
  },
  "response": {
    "status": 201,
    "headers": {
      "content-type": "application/json"
    },
    "body": {
      "id": "usr_123",
      "email": "[REDACTED]",
      "role": "admin",
      "internalToken": "[REDACTED]"
    }
  },
  "assertion": {
    "subject": "response.body.role",
    "matcher": "absent",
    "expected": "field absent",
    "actual": "admin",
    "message": "sensitive role field must not be exposed"
  },
  "redaction": {
    "applied": true,
    "replacement": "[REDACTED]",
    "redactedPaths": ["request.headers.authorization"]
  },
  "truncation": {
    "applied": false,
    "limitBytes": 65536,
    "truncatedPaths": []
  },
  "cleanup": {
    "rawResultDeleted": true,
    "tempDirectoryDeleted": true
  }
}
```

Dynamic timestamps, ports, durations, and the complete `redactedPaths` list must come from the actual run. Do not hand-edit the JSON except formatting through `JSON.stringify(value, null, 2)`.

## File Lifecycle

Temporary; create during experiment and delete before final commit:

```text
spikes/execution/
  fixture.mjs
  policy.mjs
  redact.mjs
  child-test.mjs
  runner.mjs
  generate-evidence.mjs
  write-report.mjs
  policy.test.mjs
  redact.test.mjs
  runner.test.mjs
  output/
    failure-bundle.example.json
    spike-results.json
```

Survives and is reviewed:

```text
docs/superpowers/plans/2026-06-14-api-execution-risk-spike.md
docs/research/execution-spike/report.md
docs/research/execution-spike/failure-bundle.example.json
```

Do not modify application/package source, package manifests, workspace config, lockfile, MCP tools, QA schemas, or CI for this spike.

## Task 1: Establish Disposable Experiment and Target Policy

**Files:**
- Create temporarily: `spikes/execution/policy.mjs`
- Create temporarily: `spikes/execution/policy.test.mjs`

- [ ] **Step 1: Confirm clean branch and create untracked spike directory**

Run:

```bash
git status --short --branch
mkdir -p spikes/execution/output
```

Expected: branch `test/api-execution-risk-spike`; only this plan may be untracked/modified. Do not stage `spikes/`.

- [ ] **Step 2: Write failing target-policy tests**

Create `spikes/execution/policy.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { assertAllowedTarget } from "./policy.mjs";

const allowedOrigin = "http://127.0.0.1:43123";

test("accepts the exact allowlisted loopback origin", () => {
  const url = assertAllowedTarget(`${allowedOrigin}/users`, allowedOrigin);
  assert.equal(url.origin, allowedOrigin);
  assert.equal(url.pathname, "/users");
});

for (const target of [
  "http://localhost:43123/users",
  "http://[::1]:43123/users",
  "http://127.0.0.2:43123/users",
  "https://127.0.0.1:43123/users",
  "http://127.0.0.1:43124/users",
  "http://user:pass@127.0.0.1:43123/users",
]) {
  test(`rejects disallowed target ${target}`, () => {
    assert.throws(
      () => assertAllowedTarget(target, allowedOrigin),
      (error) => error?.code === "TARGET_NOT_ALLOWED",
    );
  });
}
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
node --test spikes/execution/policy.test.mjs
```

Expected: FAIL because `spikes/execution/policy.mjs` does not exist.

- [ ] **Step 4: Implement strict target policy**

Create `spikes/execution/policy.mjs`:

```js
export class TargetPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "TargetPolicyError";
    this.code = "TARGET_NOT_ALLOWED";
  }
}

export function assertAllowedTarget(target, allowedOrigin) {
  const url = new URL(target);
  const allowed = new URL(allowedOrigin);
  const validAllowedOrigin =
    allowed.protocol === "http:" &&
    allowed.hostname === "127.0.0.1" &&
    allowed.port !== "" &&
    allowed.username === "" &&
    allowed.password === "" &&
    allowed.pathname === "/";
  const validTarget =
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    url.origin === allowed.origin &&
    url.username === "" &&
    url.password === "";

  if (!validAllowedOrigin || !validTarget) {
    throw new TargetPolicyError("target must match exact allowlisted loopback origin");
  }

  return url;
}
```

- [ ] **Step 5: Run policy tests and verify GREEN**

Run:

```bash
node --test spikes/execution/policy.test.mjs
```

Expected: 7 tests pass, 0 fail.

## Task 2: Build Recursive Redaction and Bounded Capture

**Files:**
- Create temporarily: `spikes/execution/redact.mjs`
- Create temporarily: `spikes/execution/redact.test.mjs`

- [ ] **Step 1: Write failing redaction tests**

Create `spikes/execution/redact.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { redactEvidence, truncateUtf8 } from "./redact.mjs";

test("redacts sensitive keys and known values recursively", () => {
  const input = {
    headers: { authorization: "Bearer spike-secret" },
    body: {
      email: "builder@example.com",
      password: "spike-password",
      nested: { internalToken: "fixture-internal-token" },
    },
    stdout: "token=fixture-internal-token authorization=Bearer spike-secret",
  };
  const result = redactEvidence(input, [
    "spike-secret",
    "spike-password",
    "fixture-internal-token",
    "builder@example.com",
  ]);
  const serialized = JSON.stringify(result.value);

  for (const forbidden of [
    "spike-secret",
    "spike-password",
    "fixture-internal-token",
    "builder@example.com",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(result.applied, true);
  assert.ok(result.redactedPaths.includes("headers.authorization"));
  assert.ok(result.redactedPaths.includes("body.nested.internalToken"));
});

test("truncates UTF-8 by bytes and reports truncation", () => {
  const result = truncateUtf8("abcdefgh", 4);
  assert.deepEqual(result, { value: "abcd", truncated: true });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test spikes/execution/redact.test.mjs
```

Expected: FAIL because `redact.mjs` does not exist.

- [ ] **Step 3: Implement redaction and truncation**

Create `spikes/execution/redact.mjs`:

```js
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(authorization|cookie|password|passphrase|secret|token|api[-_]?key|email)/i;

export function truncateUtf8(value, limitBytes = 65_536) {
  const bytes = Buffer.from(String(value), "utf8");
  if (bytes.length <= limitBytes) {
    return { value: String(value), truncated: false };
  }
  return { value: bytes.subarray(0, limitBytes).toString("utf8"), truncated: true };
}

export function redactEvidence(input, knownSecrets = []) {
  const redactedPaths = [];
  const secrets = knownSecrets.filter(Boolean).sort((a, b) => b.length - a.length);

  function replaceKnownSecrets(value) {
    let output = value;
    for (const secret of secrets) {
      output = output.split(secret).join(REDACTED);
    }
    return output;
  }

  function visit(value, path = "") {
    if (Array.isArray(value)) {
      return value.map((item, index) => visit(item, `${path}[${index}]`));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => {
          const childPath = path ? `${path}.${key}` : key;
          if (SENSITIVE_KEY.test(key)) {
            redactedPaths.push(childPath);
            return [key, REDACTED];
          }
          return [key, visit(child, childPath)];
        }),
      );
    }
    if (typeof value === "string") {
      const replaced = replaceKnownSecrets(value);
      if (replaced !== value) redactedPaths.push(path);
      return replaced;
    }
    return value;
  }

  return {
    value: visit(input),
    applied: redactedPaths.length > 0,
    redactedPaths: [...new Set(redactedPaths)].sort(),
    replacement: REDACTED,
  };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
node --test spikes/execution/redact.test.mjs
```

Expected: 2 tests pass, 0 fail.

## Task 3: Build Deterministic Local Fixture and Child Test

**Files:**
- Create temporarily: `spikes/execution/fixture.mjs`
- Create temporarily: `spikes/execution/child-test.mjs`

- [ ] **Step 1: Implement the loopback-only fixture**

Create `spikes/execution/fixture.mjs`:

```js
import http from "node:http";

export async function startFixture() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    requests.push(request.url);

    if (request.method === "POST" && request.url === "/redirect") {
      request.resume();
      response.writeHead(302, { location: "/users" });
      response.end();
      return;
    }

    if (request.method === "POST" && request.url === "/large") {
      request.resume();
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ payload: "x".repeat(70_000) }));
      return;
    }

    if (request.method !== "POST" || request.url !== "/users") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    let rawBody = "";
    for await (const chunk of request) rawBody += chunk;
    const body = JSON.parse(rawBody);

    if (!body.email || !body.password) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_request" }));
      return;
    }

    response.writeHead(201, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "usr_123",
        email: body.email,
        role: "admin",
        internalToken: "fixture-internal-token",
      }),
    );
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture address unavailable");

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
```

- [ ] **Step 2: Implement the child test script**

Create `spikes/execution/child-test.mjs`:

```js
import { writeFile } from "node:fs/promises";
import { assertAllowedTarget } from "./policy.mjs";

const [mode, target, allowedOrigin, resultPath] = process.argv.slice(2);
const startedAt = Date.now();

if (mode === "hang") {
  console.log("child: hanging intentionally");
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}

const url = assertAllowedTarget(target, allowedOrigin);
const request = {
  method: "POST",
  url: url.href,
  headers: {
    authorization: "Bearer spike-secret",
    "content-type": "application/json",
  },
  body: {
    email: "builder@example.com",
    password: "spike-password",
  },
};

const response = await fetch(url, {
  method: request.method,
  headers: request.headers,
  body: JSON.stringify(request.body),
  redirect: "error",
});
const responseBody = await response.json();
const assertion = mode === "pass"
  ? {
      subject: "response.status",
      matcher: "equals",
      expected: 201,
      actual: response.status,
      message: "user creation returns 201",
      passed: response.status === 201,
    }
  : {
      subject: "response.body.role",
      matcher: "absent",
      expected: "field absent",
      actual: responseBody.role,
      message: "sensitive role field must not be exposed",
      passed: !("role" in responseBody),
    };

const rawResult = {
  durationMs: Date.now() - startedAt,
  request,
  response: {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
  },
  assertion,
};

await writeFile(resultPath, `${JSON.stringify(rawResult)}\n`, {
  encoding: "utf8",
  mode: 0o600,
  flag: "wx",
});

if (assertion.passed) {
  console.log("child: assertion passed");
  process.exitCode = 0;
} else {
  console.log("child: assertion failed");
  console.error("authorization=Bearer spike-secret token=fixture-internal-token");
  process.exitCode = 1;
}
```

- [ ] **Step 3: Smoke-test fixture and child manually**

Run:

```bash
node --input-type=module -e '
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { startFixture } from "./spikes/execution/fixture.mjs";
const fixture = await startFixture();
const dir = await mkdtemp(join(tmpdir(), "execution-smoke-"));
const result = join(dir, "raw.json");
const child = spawn(process.execPath, ["spikes/execution/child-test.mjs", "fail", `${fixture.origin}/users`, fixture.origin, result], { stdio: "inherit" });
await new Promise((resolve) => child.once("close", resolve));
console.log(await readFile(result, "utf8"));
await fixture.close();
await rm(dir, { recursive: true, force: true });
'
```

Expected: fixture returns `201`; child exits `1`; raw output contains the intentionally sensitive values. This raw output must remain only in OS temp storage.

## Task 4: Build Parent Runner and Bundle Assembly

**Files:**
- Create temporarily: `spikes/execution/runner.mjs`
- Create temporarily: `spikes/execution/runner.test.mjs`

- [ ] **Step 1: Write failing end-to-end runner tests**

Create `spikes/execution/runner.test.mjs`:

```js
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { startFixture } from "./fixture.mjs";
import { runScenario } from "./runner.mjs";

async function missing(path) {
  try {
    await access(path);
    return false;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

test("produces sanitized pass and assertion-failure bundles", async () => {
  const fixture = await startFixture();
  try {
    const passed = await runScenario({
      mode: "pass",
      target: `${fixture.origin}/users`,
      allowedOrigin: fixture.origin,
      runId: "run-pass",
      testId: "api-users-status",
    });
    assert.equal(passed.bundle.runStatus, "completed");
    assert.equal(passed.bundle.testStatus, "passed");
    assert.equal(passed.bundle.failureKind, null);
    assert.deepEqual(passed.bundle.cleanup, { rawResultDeleted: true, tempDirectoryDeleted: true });
    assert.equal(await missing(passed.diagnostics.rawResultPath), true);
    assert.equal(await missing(passed.diagnostics.tempDirectory), true);

    const failed = await runScenario({
      mode: "fail",
      target: `${fixture.origin}/users`,
      allowedOrigin: fixture.origin,
      runId: "run-security-failure",
      testId: "api-users-sensitive-fields",
    });
    assert.equal(failed.bundle.runStatus, "completed");
    assert.equal(failed.bundle.testStatus, "failed");
    assert.equal(failed.bundle.failureKind, "assertion");
    assert.equal(failed.bundle.classification, "unclassified");
    assert.equal(failed.diagnostics.directoryMode, 0o700);
    assert.equal(failed.diagnostics.rawFileMode, 0o600);

    const serialized = JSON.stringify(failed.bundle);
    for (const secret of [
      "spike-secret",
      "spike-password",
      "fixture-internal-token",
      "builder@example.com",
    ]) assert.equal(serialized.includes(secret), false);

    assert.equal(await missing(failed.diagnostics.rawResultPath), true);
    assert.equal(await missing(failed.diagnostics.tempDirectory), true);
  } finally {
    await fixture.close();
  }
});

test("terminates a hanging child and records timeout evidence", async () => {
  const fixture = await startFixture();
  try {
    const result = await runScenario({
      mode: "hang",
      target: `${fixture.origin}/users`,
      allowedOrigin: fixture.origin,
      runId: "run-timeout",
      testId: "api-users-timeout",
      timeoutMs: 2_000,
      killGraceMs: 250,
    });
    assert.equal(result.bundle.runStatus, "timed_out");
    assert.equal(result.bundle.testStatus, "not_run");
    assert.equal(result.bundle.failureKind, "execution");
    assert.equal(result.bundle.process.timedOut, true);
    assert.equal(await missing(result.diagnostics.rawResultPath), true);
    assert.equal(await missing(result.diagnostics.tempDirectory), true);
    assert.throws(() => process.kill(result.diagnostics.childPid, 0), (error) => error.code === "ESRCH");
  } finally {
    await fixture.close();
  }
});

test("does not follow redirects", async () => {
  const fixture = await startFixture();
  try {
    const result = await runScenario({
      mode: "pass",
      target: `${fixture.origin}/redirect`,
      allowedOrigin: fixture.origin,
      runId: "run-redirect",
      testId: "api-users-redirect",
    });
    assert.equal(result.bundle.runStatus, "crashed");
    assert.equal(result.bundle.testStatus, "not_run");
    assert.equal(result.bundle.failureKind, "execution");
    assert.deepEqual(fixture.requests, ["/redirect"]);
    assert.equal(await missing(result.diagnostics.rawResultPath), true);
    assert.equal(await missing(result.diagnostics.tempDirectory), true);
  } finally {
    await fixture.close();
  }
});

test("truncates oversized response evidence", async () => {
  const fixture = await startFixture();
  try {
    const result = await runScenario({
      mode: "pass",
      target: `${fixture.origin}/large`,
      allowedOrigin: fixture.origin,
      runId: "run-large-response",
      testId: "api-users-large-response",
    });
    assert.equal(result.bundle.runStatus, "completed");
    assert.equal(result.bundle.truncation.applied, true);
    assert.ok(result.bundle.truncation.truncatedPaths.includes("response.body"));
    assert.equal(result.bundle.response.body.truncated, true);
  } finally {
    await fixture.close();
  }
});

test("rejects a non-allowlisted target without spawning a child", async () => {
  const result = await runScenario({
    mode: "pass",
    target: "http://localhost:9999/users",
    allowedOrigin: "http://127.0.0.1:9999",
    runId: "run-policy-rejection",
    testId: "api-users-policy",
  });
  assert.equal(result.bundle.runStatus, "rejected");
  assert.equal(result.bundle.testStatus, "not_run");
  assert.equal(result.bundle.failureKind, "policy");
  assert.equal(result.diagnostics.childPid, null);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test spikes/execution/runner.test.mjs
```

Expected: FAIL because `runner.mjs` does not exist.

- [ ] **Step 3: Implement the parent runner**

Create `spikes/execution/runner.mjs` with these required functions and behavior:

```js
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllowedTarget } from "./policy.mjs";
import { redactEvidence, truncateUtf8 } from "./redact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, "child-test.mjs");
const CAPTURE_LIMIT = 65_536;
const KNOWN_SECRETS = [
  "spike-secret",
  "spike-password",
  "fixture-internal-token",
  "builder@example.com",
];

function baseBundle({ runId, testId, target }) {
  const url = new URL(target);
  return {
    schemaVersion: "execution-failure-bundle/v0",
    runId,
    testId,
    createdAt: new Date().toISOString(),
    target: { origin: url.origin, method: "POST", path: url.pathname },
    classification: "unclassified",
  };
}

function capture(stream) {
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  stream.on("data", (chunk) => {
    const buffer = Buffer.from(chunk);
    const remaining = CAPTURE_LIMIT - bytes;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    const accepted = buffer.subarray(0, remaining);
    chunks.push(accepted);
    bytes += accepted.length;
    if (accepted.length < buffer.length) truncated = true;
  });
  return () => ({ value: Buffer.concat(chunks).toString("utf8"), truncated });
}

function boundJson(value, path, truncatedPaths) {
  if (value == null) return value;
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") <= CAPTURE_LIMIT) return value;
  truncatedPaths.push(path);
  return {
    truncated: true,
    preview: truncateUtf8(serialized, CAPTURE_LIMIT).value,
  };
}

export async function runScenario({
  mode,
  target,
  allowedOrigin,
  runId,
  testId,
  timeoutMs = 2_000,
  killGraceMs = 250,
}) {
  try {
    assertAllowedTarget(target, allowedOrigin);
  } catch (error) {
    return {
      bundle: {
        ...baseBundle({ runId, testId, target }),
        runStatus: "rejected",
        testStatus: "not_run",
        failureKind: "policy",
        durationMs: 0,
        process: { exitCode: null, signal: null, timedOut: false, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false },
        request: null,
        response: null,
        assertion: null,
        policyError: { code: error.code, message: error.message },
        redaction: { applied: false, replacement: "[REDACTED]", redactedPaths: [] },
        truncation: { applied: false, limitBytes: CAPTURE_LIMIT, truncatedPaths: [] },
        cleanup: { rawResultDeleted: true, tempDirectoryDeleted: true },
      },
      diagnostics: {
        childPid: null,
        rawResultPath: null,
        tempDirectory: null,
        directoryMode: null,
        rawFileMode: null,
      },
    };
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "test-framework-execution-"));
  await chmod(tempDirectory, 0o700);
  const directoryMode = (await stat(tempDirectory)).mode & 0o777;
  const rawResultPath = join(tempDirectory, "raw-result.json");
  const startedAt = Date.now();
  let child;
  let timedOut = false;
  let rawResultDeleted = false;
  let tempDirectoryDeleted = false;
  let result;

  try {
    child = spawn(process.execPath, [CHILD, mode, target, allowedOrigin, rawResultPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {},
    });
    const readStdout = capture(child.stdout);
    const readStderr = capture(child.stderr);
    let killTimer;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
      killTimer.unref();
    }, timeoutMs);
    const closed = await new Promise((resolve) => child.once("close", (exitCode, signal) => resolve({ exitCode, signal })));
    clearTimeout(timeout);
    if (killTimer) clearTimeout(killTimer);
    const stdout = readStdout();
    const stderr = readStderr();
    let raw = null;
    let rawFileMode = null;
    try {
      const rawStats = await stat(rawResultPath);
      rawFileMode = rawStats.mode & 0o777;
      if (rawStats.size > 1_048_576) throw new Error("raw result exceeds 1 MiB hard limit");
      raw = JSON.parse(await readFile(rawResultPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const redacted = redactEvidence(raw, KNOWN_SECRETS);
    const redactedLogs = redactEvidence({ stdout: stdout.value, stderr: stderr.value }, KNOWN_SECRETS);
    const truncatedPaths = [
      ...(stdout.truncated ? ["process.stdout"] : []),
      ...(stderr.truncated ? ["process.stderr"] : []),
    ];
    const request = redacted.value?.request
      ? {
          ...redacted.value.request,
          body: boundJson(redacted.value.request.body, "request.body", truncatedPaths),
        }
      : null;
    const response = redacted.value?.response
      ? {
          ...redacted.value.response,
          body: boundJson(redacted.value.response.body, "response.body", truncatedPaths),
        }
      : null;
    const assertionPassed = redacted.value?.assertion?.passed === true;
    const crashed = !timedOut && raw === null;
    const assertion = redacted.value?.assertion
      ? Object.fromEntries(Object.entries(redacted.value.assertion).filter(([key]) => key !== "passed"))
      : null;

    result = {
      bundle: {
        ...baseBundle({ runId, testId, target }),
        runStatus: timedOut ? "timed_out" : crashed ? "crashed" : "completed",
        testStatus: timedOut || crashed ? "not_run" : assertionPassed ? "passed" : "failed",
        failureKind: timedOut || crashed ? "execution" : assertionPassed ? null : "assertion",
        durationMs: Date.now() - startedAt,
        process: {
          ...closed,
          timedOut,
          stdout: redactedLogs.value.stdout,
          stderr: redactedLogs.value.stderr,
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
        },
        request,
        response,
        assertion,
        redaction: {
          applied: redacted.applied || redactedLogs.applied,
          replacement: "[REDACTED]",
          redactedPaths: [...new Set([...redacted.redactedPaths, ...redactedLogs.redactedPaths.map((path) => `process.${path}`)])].sort(),
        },
        truncation: { applied: truncatedPaths.length > 0, limitBytes: CAPTURE_LIMIT, truncatedPaths },
        cleanup: { rawResultDeleted: false, tempDirectoryDeleted: false },
      },
      diagnostics: {
        childPid: child.pid,
        rawResultPath,
        tempDirectory,
        directoryMode,
        rawFileMode,
      },
    };
  } finally {
    await rm(rawResultPath, { force: true });
    rawResultDeleted = true;
    await rm(tempDirectory, { recursive: true, force: true });
    tempDirectoryDeleted = true;
  }

  result.bundle.cleanup = { rawResultDeleted, tempDirectoryDeleted };
  return result;
}
```

- [ ] **Step 4: Run runner tests and verify GREEN**

Run:

```bash
node --test spikes/execution/runner.test.mjs
```

Expected: 5 tests pass, including approximately 2 seconds for timeout; 0 fail; no child remains; redirect destination is never requested; oversized response evidence is truncated.

- [ ] **Step 5: Run all spike tests together**

Run:

```bash
node --test spikes/execution/*.test.mjs
```

Expected: 14 tests pass, 0 fail.

## Task 5: Generate Real Evidence and Research Report

**Files:**
- Create temporarily: `spikes/execution/generate-evidence.mjs`
- Create temporarily: `spikes/execution/write-report.mjs`
- Create temporarily: `spikes/execution/output/failure-bundle.example.json`
- Create temporarily: `spikes/execution/output/spike-results.json`
- Create: `docs/research/execution-spike/failure-bundle.example.json`
- Create: `docs/research/execution-spike/report.md`

- [ ] **Step 1: Implement evidence generator**

Create `spikes/execution/generate-evidence.mjs`:

```js
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFixture } from "./fixture.mjs";
import { runScenario } from "./runner.mjs";

const outputDirectory = new URL("./output/", import.meta.url);
const outputPath = fileURLToPath(outputDirectory);
await mkdir(outputDirectory, { recursive: true });
const fixture = await startFixture();

try {
  const scenarios = {};
  for (const [name, input] of Object.entries({
    pass: { mode: "pass", target: `${fixture.origin}/users`, allowedOrigin: fixture.origin, runId: "run-pass", testId: "api-users-status" },
    assertionFailure: { mode: "fail", target: `${fixture.origin}/users`, allowedOrigin: fixture.origin, runId: "run-security-failure", testId: "api-users-sensitive-fields" },
    timeout: { mode: "hang", target: `${fixture.origin}/users`, allowedOrigin: fixture.origin, runId: "run-timeout", testId: "api-users-timeout" },
    policyRejection: { mode: "pass", target: "http://localhost:9999/users", allowedOrigin: fixture.origin, runId: "run-policy-rejection", testId: "api-users-policy" },
  })) {
    scenarios[name] = (await runScenario(input)).bundle;
  }

  const example = `${JSON.stringify(scenarios.assertionFailure, null, 2)}\n`;
  const hash = createHash("sha256").update(example).digest("hex");
  const summary = {
    generatedAt: new Date().toISOString(),
    sha256: hash,
    scenarios: Object.fromEntries(Object.entries(scenarios).map(([name, bundle]) => [name, {
      runStatus: bundle.runStatus,
      testStatus: bundle.testStatus,
      failureKind: bundle.failureKind,
      durationMs: bundle.durationMs,
      cleanup: bundle.cleanup,
    }])),
  };

  await writeFile(join(outputPath, "failure-bundle.example.json"), example, "utf8");
  await writeFile(join(outputPath, "spike-results.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await fixture.close();
}
```

- [ ] **Step 2: Generate all four scenarios**

Run:

```bash
node spikes/execution/generate-evidence.mjs
```

Expected:

- `pass`: `completed/passed/null`
- `assertionFailure`: `completed/failed/assertion`
- `timeout`: `timed_out/not_run/execution`
- `policyRejection`: `rejected/not_run/policy`
- all cleanup flags `true`
- command prints SHA-256 for the failure example

- [ ] **Step 3: Validate evidence before copying**

Run:

```bash
node -e '
const fs = require("node:fs");
const bundle = JSON.parse(fs.readFileSync("spikes/execution/output/failure-bundle.example.json", "utf8"));
const serialized = JSON.stringify(bundle);
for (const secret of ["spike-secret", "spike-password", "fixture-internal-token", "builder@example.com"]) {
  if (serialized.includes(secret)) throw new Error(`secret leaked: ${secret}`);
}
if (bundle.schemaVersion !== "execution-failure-bundle/v0") throw new Error("wrong schema version");
if (bundle.runStatus !== "completed" || bundle.testStatus !== "failed" || bundle.failureKind !== "assertion") throw new Error("wrong outcome");
if (!bundle.cleanup.rawResultDeleted || !bundle.cleanup.tempDirectoryDeleted) throw new Error("cleanup not proven");
console.log("bundle valid and sanitized");
'
```

Expected: `bundle valid and sanitized`.

- [ ] **Step 4: Implement deterministic report writer**

Create `spikes/execution/write-report.mjs`:

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";

const summary = JSON.parse(
  await readFile(new URL("./output/spike-results.json", import.meta.url), "utf8"),
);
const outputDirectory = new URL("../../docs/research/execution-spike/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const row = (label, scenario) =>
  `| ${label} | \`${scenario.runStatus}\` | \`${scenario.testStatus}\` | \`${String(scenario.failureKind)}\` | ${scenario.durationMs} ms |`;
const report = `# Local API Execution Risk Spike

Date: 2026-06-14
Status: completed research; production execution remains deferred to V2

## Hypothesis

A local parent process can constrain one child API test to an exact loopback origin, capture useful execution evidence, redact sensitive data before persistence, terminate hangs, and clean raw temporary material without adding production runner architecture to V1.

## Experiment

- Node built-ins only; no framework, container, database, or external network.
- Fixture bound to \`127.0.0.1\` on an ephemeral port.
- One child process per scenario; structured raw result through a mode-\`0600\` temp file in a mode-\`0700\` directory.
- Exact-origin target policy, redirect rejection, 2-second timeout, 250 ms termination grace.
- 64 KiB caps for stdout, stderr, request, and response evidence.
- Redaction before persistence.

## Results

| Scenario | Run status | Test status | Failure kind | Duration |
| --- | --- | --- | --- | --- |
${row("Passing assertion", summary.scenarios.pass)}
${row("Security assertion", summary.scenarios.assertionFailure)}
${row("Hanging child", summary.scenarios.timeout)}
${row("Disallowed target", summary.scenarios.policyRejection)}

All scenarios completed with raw-result and temporary-directory cleanup confirmed. The timeout child was no longer alive after termination. The policy-rejection scenario spawned no child.

## Evidence

- Canonical sanitized example: [\`failure-bundle.example.json\`](failure-bundle.example.json)
- SHA-256: \`${summary.sha256}\`
- Forbidden values absent: bearer secret, password, internal token, and email.
- Bundle records expected/actual assertion data, sanitized request/response, process result, timing, redaction, truncation, and cleanup metadata.

## Confirmed Decisions

- Separate child execution is sufficient for an initial local runner boundary.
- Exact loopback allowlisting and redirect rejection can deny obvious network escapes.
- Structured file transfer is more reliable than parsing stdout.
- Redaction must happen before any durable write.
- Run outcome and test outcome must remain separate.
- Assertion, execution, and policy failures require distinct fields.
- A timeout requires escalation and post-exit verification.
- V1 test cases need structured target, action, assertion, data, auth, and cleanup fields.

## Risks Not Solved

- A child process is not a security sandbox.
- This spike does not prevent filesystem access, subprocess creation, environment access, or resource exhaustion by untrusted generated code.
- This spike does not prove Windows process termination semantics or process-tree cleanup.
- DNS rebinding, proxies, alternate network namespaces, TLS policy, containers, production targeting, credentials, cleanup chains, and concurrency remain V2 design work.
- Redaction by key and known value is defense-in-depth, not proof against all secret leakage.
- Failure classification remains \`unclassified\`; product/test/environment diagnosis was not attempted.

## V2 Implications

- Define a versioned execution-bundle schema from this evidence shape.
- Execute generated tests only inside a stronger sandbox/process-tree boundary.
- Enforce target policy independently of generated code.
- Use bounded channels and artifact caps.
- Treat cleanup completion as evidence, not an assumption.
- Preserve portable generated tests while keeping execution controls outside them.

## Conclusion

The evidence-capture path is feasible. This removes the basic uncertainty behind the V2 evidence loop but does not justify moving execution into V1. Proceed with the execution-ready Test Graph next.
`;

await writeFile(new URL("report.md", outputDirectory), report, "utf8");
```

- [ ] **Step 5: Copy canonical example and generate measured report**

Run:

```bash
mkdir -p docs/research/execution-spike
cp spikes/execution/output/failure-bundle.example.json docs/research/execution-spike/failure-bundle.example.json
node spikes/execution/write-report.mjs
```

Expected: both surviving documentation artifacts exist; report contains measured durations and exact SHA-256 without manual substitution.

## Task 6: Verify Truthfulness, Delete Experiment, and Prepare Docs-Only PR

**Files:**
- Delete: `spikes/execution/**`
- Verify: `docs/research/execution-spike/report.md`
- Verify: `docs/research/execution-spike/failure-bundle.example.json`
- Verify: `docs/superpowers/plans/2026-06-14-api-execution-risk-spike.md`

- [ ] **Step 1: Independently verify JSON hash matches report**

Run:

```bash
node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const bytes = await readFile("docs/research/execution-spike/failure-bundle.example.json");
const hash = createHash("sha256").update(bytes).digest("hex");
const report = await readFile("docs/research/execution-spike/report.md", "utf8");
if (!report.includes(hash)) throw new Error(`report missing SHA-256 ${hash}`);
JSON.parse(bytes);
console.log(hash);
'
```

Expected: prints the exact SHA-256 recorded in report; exit 0.

- [ ] **Step 2: Delete all spike implementation and raw output**

Run:

```bash
rm -rf spikes/execution
rmdir spikes 2>/dev/null || true
```

Expected: no `spikes/` path remains.

- [ ] **Step 3: Prove only docs survive**

Run:

```bash
git status --short
git diff --check
find . -path './.git' -prune -o -path './node_modules' -prune -o -path './spikes*' -print
rg -n 'spike-secret|spike-password|fixture-internal-token|builder@example.com' docs/research/execution-spike || true
rg -n 'TB[D]|TO[D]O|FIXM[E]' docs/research/execution-spike docs/superpowers/plans/2026-06-14-api-execution-risk-spike.md || true
```

Expected:

- Git status shows only the plan and two research artifacts.
- No `spikes` path prints.
- No real secret value prints from surviving docs. The plan necessarily contains synthetic values as implementation instructions; therefore secret scan acceptance applies to `docs/research/execution-spike` only.
- No incomplete marker prints.
- `git diff --check` exits 0.

- [ ] **Step 4: Run repository verification**

Run:

```bash
pnpm install --frozen-lockfile
pnpm check:ci
pnpm check-types:ci
pnpm build:ci
pnpm test:ci
```

Expected: frozen install passes; Biome has no errors; typecheck/build pass; 127 existing tests pass. Existing Biome `recommended` deprecation info is unrelated and may remain.

- [ ] **Step 5: Review final diff as a skeptical reviewer**

Run:

```bash
git diff -- docs/superpowers/plans/2026-06-14-api-execution-risk-spike.md docs/research/execution-spike
git status --short --branch
```

Confirm:

- Report values match generated result summary.
- Example bundle parses and matches the documented contract.
- No sensitive synthetic value survives in the example.
- Report states limits and does not call the child process a sandbox.
- Report keeps production execution in V2.
- No application/package/config/lockfile change survives.

- [ ] **Step 6: Use ship-it for the single docs-only commit and PR**

Read and follow `.claude/skills/ship-it/SKILL.md`. The intended commit is:

```text
:white_check_mark: test(docs): record local execution spike
```

Required scope is `docs`. Validate with:

```bash
npx commitlint --from origin/main --to HEAD
```

PR title should match the accepted commit format. PR body must state:

- disposable spike code was deleted before commit;
- only plan/report/example are included;
- four scenarios passed their expected outcome;
- full repository gate passed;
- execution remains deferred to V2.

## Agent Stop Conditions

Stop and report instead of committing if any condition holds:

- A forbidden target reaches the fixture or spawns a child.
- A redirect is followed.
- Any synthetic secret appears in the persisted example bundle.
- Raw result or temp directory survives any scenario.
- Timeout child remains alive.
- The four outcome tuples differ from the expected matrix.
- Report hash does not match committed JSON bytes.
- Implementing the spike requires a new dependency, package, Docker service, database, or production-code edit.
- Full repository verification fails for a reason introduced by the spike.

## Definition of Done

- All four scenarios execute with expected statuses.
- Target rejection happens before child spawn.
- Timeout escalation completes and child is gone.
- Raw temp artifacts are deleted in every path.
- Persisted example contains no forbidden synthetic values.
- Example hash matches report.
- Report explicitly records solved and unsolved risks.
- `spikes/` is deleted.
- Final PR is docs-only.
- Repository checks and commitlint pass.
