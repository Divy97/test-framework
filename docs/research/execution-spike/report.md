# Local API Execution Risk Spike

Date: 2026-06-14
Status: completed research; production execution remains deferred to V2

## Hypothesis

A local parent process can constrain one child API test to an exact loopback origin, capture useful execution evidence, redact sensitive data before persistence, terminate hangs, and clean raw temporary material without adding production runner architecture to V1.

## Experiment

- Node built-ins only; no framework, container, database, or external network.
- Fixture bound to `127.0.0.1` on an ephemeral port.
- One child process per scenario; structured raw result through a mode-`0600` temp file in a mode-`0700` directory.
- Exact-origin target policy, redirect rejection, 2-second timeout, 250 ms termination grace.
- 64 KiB caps for stdout, stderr, request, and response evidence.
- Redaction before persistence.

## Results

| Scenario | Run status | Test status | Failure kind | Duration |
| --- | --- | --- | --- | --- |
| Passing assertion | `completed` | `passed` | `null` | 47 ms |
| Security assertion | `completed` | `failed` | `assertion` | 44 ms |
| Hanging child | `timed_out` | `not_run` | `execution` | 2010 ms |
| Disallowed target | `rejected` | `not_run` | `policy` | 0 ms |

Every scenario that created temporary artifacts confirmed raw-result and temporary-directory cleanup. The timeout child was no longer alive after termination. The policy-rejection scenario was denied before any child spawned, so it created no temporary artifacts to clean.

## Evidence

- Canonical sanitized example: [`failure-bundle.example.json`](failure-bundle.example.json)
- SHA-256: `25c4fbb681b078d3a075ece1001c1d4295ac316316c558506d8d8c6fef525328`
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
- Failure classification remains `unclassified`; product/test/environment diagnosis was not attempted.

## V2 Implications

- Define a versioned execution-bundle schema from this evidence shape.
- Execute generated tests only inside a stronger sandbox/process-tree boundary.
- Enforce target policy independently of generated code.
- Use bounded channels and artifact caps.
- Treat cleanup completion as evidence, not an assumption.
- Preserve portable generated tests while keeping execution controls outside them.

## Conclusion

The evidence-capture path is feasible. This removes the basic uncertainty behind the V2 evidence loop but does not justify moving execution into V1. Proceed with the execution-ready Test Graph next.
