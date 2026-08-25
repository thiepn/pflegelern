# P26A — Semantic Defect Detection

> Detection only. `data/questions.json` is intentionally unchanged in P26A.

- Questions scanned: **1299**
- Confirmed semantic defects: **14**
- Manual-review candidates: **108**
- Total flagged questions: **122**

## Confirmed defects

| Question | Type | Severity | Codes | Prompt |
|---|---|---|---|---|
| `q-16-1-04` | multiple_choice | critical | MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT | Welche Begleitzeichen machen eine plötzlich und ohne erkennbare Ursache auftretende Tachykardie laut Lehrbu… |
| `q-36-01` | multiple_choice | critical | MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT | Welche Punkte gehören zur 6-R-Regel? |
| `q-48-4-06` | multiple_choice | critical | MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT | Welche Informationen sollen im zweiten Schritt der ethischen Entscheidungsfindung gesammelt werden? |
| `q-61-4-04` | multiple_choice | critical | MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT | Welche Hilfsmittel nennt das Lehrbuch, wenn verbale Kommunikation bei Aphasie nicht ausreicht? |
| `q-16-1-01` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Pulsfrequenz entspricht laut Lehrbuch einer Bradykardie beim Erwachsenen? |
| `q-16-1-02` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Herzfrequenz bezeichnet das Lehrbuch beim Erwachsenen als Tachykardie? |
| `q-36-02` | single_choice | high | NEAR_EQUIVALENT_ANSWER_OPTIONS | Wie früh dürfen flüssige Arzneimittel laut Lehrbuch höchstens vor der Verabreichung gerichtet werden? |
| `q-p12-0040` | single_choice | high | NEAR_EQUIVALENT_ANSWER_OPTIONS | Welche Beschreibung passt laut Lehrbuch am besten zu „Nosokomiale Infektion“? |
| `q-p12-0047` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Angabe passt laut Lehrbuch zu „Physiologischer Pulsbereich bei Erwachsenen“? |
| `q-p12-0053` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Beschreibung passt laut Lehrbuch am besten zu „Hypotonie“? |
| `q-p12-0166` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Beschreibung passt laut Lehrbuch am besten zu „Gestationshypertonie“? |
| `q-p12-0218` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Aussage passt laut Lehrbuch zu „Grundlagen Fieber“ im Abschnitt „Grundlagen“? |
| `q-p12-0447` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Therapie nennt das Lehrbuch bei einer distalen Radiusfraktur? |
| `q-p7b-chapter-16-definition-01` | single_choice | high | NUMERIC_ANSWER_OVERLAP | Welche Aussage beschreibt „Bradykardie“ nach dem Lehrbuch am besten? |

## Issue counts

- `UNDER_SPECIFIED_FREE_RESPONSE_PROMPT`: 54
- `BROAD_REFERENCE_ANSWER_TO_NARROW_PROMPT`: 29
- `EXACT_PROMPT_DUPLICATE`: 12
- `DISTRACTOR_ABSOLUTE_WORDING_CLUSTER`: 12
- `NUMERIC_ANSWER_OVERLAP`: 8
- `MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT`: 4
- `NEAR_EQUIVALENT_ANSWER_OPTIONS`: 2
- `CLINICAL_CASE_WITHOUT_CASE_CONTEXT`: 2
- `ANSWER_OPTION_SUBSUMPTION`: 2

## Review policy

- **confirmed-defect** requires a high-confidence `high` or `critical` finding.
- **manual-review** means the detector found a plausible semantic/editorial risk but not enough evidence to auto-classify it as wrong.
- P26A does not change answers, prompts, explanations, difficulty, FSRS, mastery, remediation, or exam scoring.

Manual-review entries are fully enumerated in `P26A_SEMANTIC_DEFECT_REGISTRY.json` (108 candidates).
