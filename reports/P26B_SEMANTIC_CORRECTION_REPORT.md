# P26B — Confirmed Semantic Defect Correction

> Corrects only the seven high-confidence defects certified by P26A. The P26A manual-review queue is preserved for later phases.

- Questions in bank: **1299**
- P26A confirmed defects targeted: **7**
- P26A manual-review candidates preserved: **108**
- Non-target questions preserved: **1292**

## Repairs

| Question | P26A defect | Repair |
|---|---|---|
| `q-16-1-01` | `NUMERIC_ANSWER_OVERLAP` | Replaced overlapping bradycardia distractors with mutually non-overlapping threshold/range choices. |
| `q-16-1-02` | `NUMERIC_ANSWER_OVERLAP` | Replaced nested tachycardia thresholds with non-overlapping adult-frequency choices. |
| `q-16-1-04` | `MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT` | Added two source-backed contrast distractors so the multiple-choice item discriminates knowledge. |
| `q-36-01` | `MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT` | Added FIFO and Vier-Augen as separate medication-management principles, not 6-R components. |
| `q-48-4-06` | `MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT` | Added actions from steps 4 and 5 as source-backed distractors for step-2 information categories. |
| `q-61-4-04` | `MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT` | Added separate aphasia communication strategies as distractors to the alternative-aids list. |
| `q-p12-0040` | `NEAR_EQUIVALENT_ANSWER_OPTIONS` | Replaced the near-duplicate nosocomial-infection distractor with the source-backed Epidemie definition. |

## Invariants

- No external clinical guidance is introduced.
- Question IDs, types, concept anchors, difficulty and status remain unchanged.
- The 108 P26A manual-review candidates are not adjudicated or rewritten in P26B.
- FSRS, mastery, remediation and mock-exam logic are outside P26B scope.

Residual-defect certification is performed by `tests/p26b-semantic-correction.test.py` using the P26A detector itself.
