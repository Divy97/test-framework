# Eval Report

- Rubric fingerprint: `sha256:ffda22fe93be09c5d979fcba22a53a8269212137a7134a4e8402a6855bf7117e`
- Corpus fingerprint: `sha256:67ff4fa53740ec009b5ca637a40459faac2801c39268433973d39f9fc4f50e8b`

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
| raw-model | PASS | 93 | none |
| host-only | PASS | 88 | none |
| qa-engine | PASS | 84.3 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 1 | 1 | 0.6667 | 1 | 0.6667 | 1 | 1 | 1 | 1 |
| host-only | 0.6667 | 1 | 0.6667 | 1 | 1 | 1 | 1 | 1 | 1 |
| qa-engine | 1 | 1 | 0.6667 | 1 | 0.5 | 1 | 0.625 | 0.625 | 1 |

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
| raw-model | PASS | 82.3 | none |
| host-only | PASS | 58.3 | none |
| qa-engine | PASS | 73.4 | none |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 1 | 1 | 1 | 1 | 0.6667 | 0 | 0 | 1 | 0.9167 |
| host-only | 0.75 | 1 | 0.375 | 1 | 1 | 0 | 0 | 0 | 1 |
| qa-engine | 1 | 1 | 0.625 | 1 | 0.3333 | 0.6 | 0.4 | 0.2 | 0.8667 |

## unsupported-assumptions (unsupported-assumptions)

| Arm | Verdict | Overall | Hard-fail |
| --- | --- | --- | --- |
| raw-model | FAIL | 82.6 | HF-UNSUPPORTED-RATE |
| host-only | PASS | 91 | none |
| qa-engine | FAIL | 72.6 | HF-UNSUPPORTED-RATE |

| Arm | recall | trace | coverage | unsup | prov | dup | assert | ready | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| raw-model | 1 | 1 | 1 | 0.6667 | 1 | 1 | 1 | 0 | 0.7 |
| host-only | 1 | 1 | 0.5 | 1 | 1 | 1 | 1 | 1 | 1 |
| qa-engine | 1 | 1 | 1 | 0.7143 | 1 | 1 | 0 | 0 | 0.8667 |

