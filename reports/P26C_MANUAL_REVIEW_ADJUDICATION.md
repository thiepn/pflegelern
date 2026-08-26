# P26C — Manual Review Adjudication

> Resolves the 108 lower-confidence P26A candidates against repository evidence. P26C is adjudication-only; question content is not changed.

- Candidates adjudicated: **108**
- Confirmed for repair: **14**
- Cleared as detector false positives / intentional structure: **94**
- Unresolved: **0**

## Outcome by category

| Category | Count | P26C decision |
|---|---:|---|
| Source-card prompt/reference contract | 80 | Cleared |
| Intentional matching-template prompt | 12 | Cleared |
| Clinical case context already present | 2 | Cleared |
| Absolute/off-scope distractor construction | 12 | Confirmed design defect |
| Answer-option subsumption | 2 | Confirmed semantic defect |

## Confirmed repair queue

- `q-21-5-06` — distractor-absolute-wording-cluster
- `q-36-03` — distractor-absolute-wording-cluster
- `q-p12-0043` — distractor-absolute-wording-cluster
- `q-p12-0163` — distractor-absolute-wording-cluster
- `q-p12-0165` — distractor-absolute-wording-cluster
- `q-p12-0272` — answer-option-subsumption
- `q-p12-0288` — distractor-absolute-wording-cluster
- `q-p12-0295` — distractor-absolute-wording-cluster
- `q-p12-0310` — distractor-absolute-wording-cluster
- `q-p12-0337` — distractor-absolute-wording-cluster
- `q-p12-0344` — answer-option-subsumption
- `q-p12-0348` — distractor-absolute-wording-cluster
- `q-p12-0534` — distractor-absolute-wording-cluster
- `q-p12-0634` — distractor-absolute-wording-cluster

## Invariants

- The 1,299-question bank is not edited in P26C.
- P26B’s seven corrected defects remain closed and are not reopened.
- No external clinical guidance is merged.
- FSRS, mastery, remediation, repetition control and mock-exam behavior are unchanged.
- P26D can consume `confirmedForRepairIds` as the bounded correction queue.
