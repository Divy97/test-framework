# Checkout login plan

- Plan: `plan_0b90e147f1bb76ff5469` v1
- Project: `prj_087178311dd0b5489bed`
- Status: complete
- Created: 2026-06-14T10:00:00.000Z
- Updated: 2026-06-14T10:00:00.000Z

## Generation
- Id: `gen_9495025b7d8d0d0968d9`
- Generated at: 2026-06-14T10:00:00.000Z
- Generator: model anthropic/claude-opus-4-8
- Methodology: 1.0.0 — Workflow: 1.0.0
- Input fingerprint: `sha256:demo-input`
- Repository revision: `abc1234`
- Status: complete
- Warnings: None

## Sources
- `src_39bed6ee5830863f2606` — repository — Repository scan — supplied: true — locator: src/app/login
- `src_d1ee76ef6c705a104a99` — feature-request — Login feature request — supplied: true

## Evidence
- `ev_630a97715b4310967410` — api-contract — source `src_d1ee76ef6c705a104a99` — POST /api/login returns 200 with a session token.
- `ev_7bc71c8a0048a65ecb03` — repository-signal — source `src_39bed6ee5830863f2606` — A login route exists at /login.
- `ev_8e16d5f3e13a0c1de422` — statement — source `src_d1ee76ef6c705a104a99` — Registered users must log in with email and password.

## Requirements
- `req_b66060c132bbb2e4e00c` — non-functional — priority p2 — risk low — Provenance: assumption; rationale: No explicit session policy was provided; assuming a 24h expiry.
  - Statement: A session expires after 24 hours.
  - Open questions: None
- `req_c9b990e64001246d3483` — functional — priority p1 — risk medium — Provenance: inferred; evidence `ev_7bc71c8a0048a65ecb03`
  - Statement: The login form is served at /login.
  - Open questions: None
- `req_cbc2b6731e619d9bbf7c` — functional — priority p0 — risk high — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
  - Statement: A registered user can log in with valid credentials.
  - Open questions: `question_3b53a10702d3c22b9786`

## Features
- `feat_2b6f7b4d32997d8edac5` — Authentication — risk high — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
  - Description: Email and password authentication.
  - Requirements: `req_c9b990e64001246d3483`, `req_cbc2b6731e619d9bbf7c`
  - Targets: ui (route `/login`); api `POST` `/api/login`
- `feat_40072c05adef21acfd6d` — Session management — risk medium — parent `feat_2b6f7b4d32997d8edac5` — Provenance: inferred; evidence `ev_7bc71c8a0048a65ecb03`
  - Description: Session lifecycle and expiry.
  - Requirements: `req_b66060c132bbb2e4e00c`
  - Targets: generic: Session store

## Data Requirements
- `data_a5a38e34f231a939b9e8` — Test account — kind account — provisioning case-produced — sensitivity pii — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
  - Description: A registered account used to exercise login.
  - Required state: `{"active":true}`

## Test Cases

### `case_5a89b2e0ae0300aa841b` — Provision a registered test account

- Objective: Create the account other login cases depend on.
- Type: integration — Priority: p0 — Risk: medium
- Risk rationale: Account setup gates downstream login verification.
- Provenance: explicit; evidence `ev_630a97715b4310967410`
- Requirements: `req_cbc2b6731e619d9bbf7c`
- Features: `feat_2b6f7b4d32997d8edac5`
- Quality tags: functional
- Actor: role `system`, auth not-applicable, permissions `accounts:write`
- Target: api `POST` `/api/accounts`
- Depends on: None
- Consumes: None
- Produces: `data_a5a38e34f231a939b9e8`
- Automation: readiness ready — Blockers: None

#### Preconditions
- The accounts API is reachable.

#### Postconditions
- A registered account exists. — expectedState `{"active":true}`

#### Cleanup
- Intent: delete
- Data: `data_a5a38e34f231a939b9e8`
- After cases: `case_9098d44f9b85f0551574`
- Instructions: Delete the provisioned account after login verification.

#### Steps
1. `step_5131de74033dd133ed51` — Create a registered account through the accounts API. — Action: request `POST` `/api/accounts` headers `{"content-type":"application/json"}` body `{"email":"qa@example.com","password":"Sup3r-Secret"}` — Provenance: explicit; evidence `ev_630a97715b4310967410`

#### Assertions
- `assert_45a18463aa751b98a61b` — statusCode — expected `201` — subject create account response status — observation api `POST` `/api/accounts` — step `step_5131de74033dd133ed51` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_2d610122a8790bf541af` — exists — no expected value — subject created account id — observation api `POST` `/api/accounts` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_ea13d0b92548a5ca7815` — conformsToSchema — schemaRef `account.response.schema.json` — subject create account response body — observation api `POST` `/api/accounts` — Provenance: explicit; evidence `ev_630a97715b4310967410`

### `case_9098d44f9b85f0551574` — Login succeeds with valid credentials

- Objective: A registered user logs in and reaches the dashboard.
- Type: positive — Priority: p0 — Risk: high
- Risk rationale: Login is the primary entry point to the product.
- Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
- Requirements: `req_c9b990e64001246d3483`, `req_cbc2b6731e619d9bbf7c`
- Features: `feat_2b6f7b4d32997d8edac5`
- Quality tags: functional, security
- Actor: role `registered-user`, auth anonymous, permissions None
- Target: ui (route `/login`)
- Depends on: `case_5a89b2e0ae0300aa841b`
- Consumes: `data_a5a38e34f231a939b9e8`
- Produces: None
- Automation: readiness ready — Blockers: None

#### Preconditions
- A registered account exists.

#### Postconditions
- The user is on the dashboard.

#### Cleanup
- Intent: none
- Data: None
- After cases: None
- Instructions: None

#### Steps
1. `step_af4b627261faf0cc9d2d` — Open the login page. — Action: navigate to `/login` — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
2. `step_67951bd9baba2a72c406` — Fill and submit valid credentials. — Action: interact submit on `#login-form` — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
3. `step_6b0ea8691e30231e9828` — Wait for the session to be established. — Action: wait for session cookie is set (5000ms) — Provenance: inferred; evidence `ev_7bc71c8a0048a65ecb03`

#### Assertions
- `assert_49541552db2130be6c21` — equals — expected `"/dashboard"` — subject current route — observation ui (route `/dashboard`) — step `step_6b0ea8691e30231e9828` — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
- `assert_40e1824750a014ec79c7` — visible — no expected value — subject welcome banner — observation ui (route `/dashboard`, selector `#welcome`) — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
- `assert_4f66cafed8e626c71ca0` — contains — expected `"Welcome"` — subject welcome banner text — observation ui (route `/dashboard`, selector `#welcome`) — Provenance: inferred; evidence `ev_7bc71c8a0048a65ecb03`
- `assert_86943087b83b0721586a` — hidden — no expected value — subject login error banner — observation ui (route `/login`, selector `#login-error`) — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`

### `case_d5e4403aa46c9f598658` — Invalid credentials are rejected

- Objective: Login with a wrong password is denied.
- Type: negative — Priority: p1 — Risk: medium
- Risk rationale: Auth must fail closed to protect accounts.
- Provenance: explicit; evidence `ev_630a97715b4310967410`
- Requirements: `req_cbc2b6731e619d9bbf7c`
- Features: `feat_2b6f7b4d32997d8edac5`
- Quality tags: security
- Actor: role `registered-user`, auth anonymous, permissions None
- Target: api `POST` `/api/login`
- Depends on: `case_5a89b2e0ae0300aa841b`
- Consumes: `data_a5a38e34f231a939b9e8`
- Produces: None
- Automation: readiness ready — Blockers: None

#### Preconditions
- A registered account exists.

#### Postconditions
- No session is established.

#### Cleanup
- Intent: none
- Data: None
- After cases: None
- Instructions: None

#### Steps
1. `step_4a82cb1c12fe5bfe4fce` — Submit an invalid password. — Action: request `POST` `/api/login` body `{"email":"qa@example.com","password":"wrong"}` — Provenance: explicit; evidence `ev_630a97715b4310967410`

#### Assertions
- `assert_6f1adc8191f65e0af34c` — statusCode — expected `401` — subject invalid login response status — observation api `POST` `/api/login` — step `step_4a82cb1c12fe5bfe4fce` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_5af5d83680079409d0b7` — lessThanOrEqual — expected `4` — subject remaining login attempts — observation api `POST` `/api/login` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_5b8522310c09fcc05454` — notExists — no expected value — subject response token field — observation api `POST` `/api/login` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_6193cf6be93480ee371d` — notContains — expected `"password"` — subject error message — observation api `POST` `/api/login` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_759bd4b2d096143a40b8` — matches — pattern `^AUTH_[A-Z_]+$` flags `i` — subject error code — observation api `POST` `/api/login` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_7cf0d534ad5554f9303f` — greaterThan — expected `0` — subject remaining login attempts — observation api `POST` `/api/login` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_83565e2a9b71c8b7eea2` — count — expected `1` — subject error count — observation api `POST` `/api/login` — Provenance: explicit; evidence `ev_630a97715b4310967410`
- `assert_93cd272e60f8f457450a` — notEquals — expected `"OK"` — subject error code — observation api `POST` `/api/login` — Provenance: explicit; evidence `ev_630a97715b4310967410`

## Open Questions
- `question_3b53a10702d3c22b9786` — status answered — blocking false — Provenance: explicit; evidence `ev_8e16d5f3e13a0c1de422`
  - Question: Which password policy applies to login validation?
  - Answer: Minimum 12 characters with one symbol.
  - Blocks: None
