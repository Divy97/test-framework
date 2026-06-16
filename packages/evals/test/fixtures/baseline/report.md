# Eval Report

- Rubric fingerprint: `sha256:113bda68cf7457ec447d378dab57a3b5aab15fa1693612709123661dbe87e94e`
- Corpus fingerprint: `sha256:e927c7b50089c23d5e5e04b98a9d50493144d8eb0a102c56ab03bce3911ab169`

## adversarial-shallow (adversarial-shallow)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | PASS | 66 | none |
| host-only | PASS | 91 | none |
| qa-engine | PASS | 100 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 0.5 | 1 | 0.5 | 1 | 1 | 0 | 0 | 1 | 1 |
| host-only | 1 | 1 | 0.5 | 1 | 1 | 1 | 1 | 1 | 1 |
| qa-engine | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## authz-api (authz-api)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 0 | HF-INVALID-GRAPH |
| host-only | PASS | 88 | none |
| qa-engine | PASS | 100 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| host-only | 0.6667 | 1 | 0.6667 | 1 | 1 | 1 | 1 | 1 | 1 |
| qa-engine | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## contradictory-spec (contradictory-spec)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 0 | HF-INVALID-GRAPH |
| host-only | PASS | 92.5 | none |
| qa-engine | PASS | 97 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| host-only | 0.75 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 1 |
| qa-engine | 1 | 0.75 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## evidence-conflict (evidence-conflict)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 49 | HF-CONTRADICTS-TRUTH, HF-UNSUPPORTED-RATE |
| host-only | PASS | 75 | none |
| qa-engine | PASS | 84 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 0 | 1 | 0 | 0 | 1 | 1 | 1 | 1 | 1 |
| host-only | 1 | 1 | 0.5 | 1 | 1 | 0 | 0 | 1 | 1 |
| qa-engine | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 1 | 1 |

## integration-failure (integration-failure)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 0 | HF-INVALID-GRAPH |
| host-only | PASS | 66 | none |
| qa-engine | PASS | 100 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| host-only | 0.6667 | 1 | 0.3333 | 1 | 1 | 0 | 0 | 1 | 1 |
| qa-engine | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## stateful-workflow (stateful-workflow)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 0 | HF-INVALID-GRAPH |
| host-only | PASS | 88 | none |
| qa-engine | PASS | 100 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| host-only | 0.6667 | 1 | 0.6667 | 1 | 1 | 1 | 1 | 1 | 1 |
| qa-engine | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## ui-form-validation (ui-form)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 0 | HF-INVALID-GRAPH |
| host-only | PASS | 58.3 | none |
| qa-engine | PASS | 89 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| host-only | 0.75 | 1 | 0.375 | 1 | 1 | 0 | 0 | 0 | 1 |
| qa-engine | 1 | 1 | 1 | 1 | 1 | 0.5 | 0.25 | 1 | 1 |

## unsupported-assumptions (unsupported-assumptions)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 88.8 | HF-UNSUPPORTED-RATE |
| host-only | PASS | 91 | none |
| qa-engine | PASS | 100 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 1 | 1 | 1 | 0.25 | 1 | 1 | 1 | 1 | 1 |
| host-only | 1 | 1 | 0.5 | 1 | 1 | 1 | 1 | 1 | 1 |
| qa-engine | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

