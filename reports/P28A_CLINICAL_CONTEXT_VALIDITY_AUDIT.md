# P28A — Clinical & Contextual Question Validity Audit

**Status: ACTION_REQUIRED**

P28A is detection-only. It does not edit the frozen P26G question bank.

## Full-bank coverage

- Questions audited: **1299 / 1,299**
- Frozen SHA-256 preserved: `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`
- Single-choice questions: **699**
- Single-choice items requiring adversarial adjudication before retention: **287**
- Critical-risk questions: **17**
- High/critical objective questions: **538**
- Current-guidance-sensitive review queue: **75**

## Risk distribution

- critical: **17**
- high: **735**
- medium: **6**
- review: **77**
- clear: **464**

## Most common audit signals

- `PRIORITY_QUESTION_WITHOUT_DECISION_CONTEXT`: **406**
- `HIDDEN_MULTI_ANSWER_AS_SINGLE_CHOICE`: **260**
- `INSUFFICIENT_CLINICAL_CASE_CONTEXT`: **214**
- `CURRENT_GUIDANCE_SENSITIVE_TOPIC`: **75**
- `UNDER_SPECIFIED_PROMPT_BROAD_REFERENCE`: **39**
- `CONTEXT_DEPENDENT_SINGLE_CHOICE`: **24**
- `CASE_ACTION_NEEDS_MORE_CONTEXT`: **23**
- `OVERLAPPING_NUMERIC_OPTIONS`: **11**
- `OVERLAPPING_MATCHING_LABELS`: **6**
- `MULTIPLE_SOURCE_SUPPORTED_OPTIONS`: **4**
- `SINGLE_CHOICE_FOR_PLURAL_KNOWLEDGE`: **4**
- `KEYED_ANSWER_WEAK_SOURCE_RELATION`: **2**

## Interpretation

A P28A flag is not automatically a claim that the textbook fact is wrong. It means the question/answer contract may be unsafe for learning without semantic adjudication. The audit deliberately separates source-faithful 2015 correctness from current-guidance validity.

Single-choice is treated strictly: it may remain single-choice only if exactly one answer is defensible under the information explicitly supplied in the prompt.

## Next phase

**P28B — Adversarial Question-by-Question Adjudication & Repair**

P28B must inspect the priority queues semantically and repair each unsafe item by adding context, converting to multiple choice/free response/clinical case, accepting additional answers, rewriting distractors, or removing the item. Any question-bank edit invalidates the P26G freeze and requires re-certification.
