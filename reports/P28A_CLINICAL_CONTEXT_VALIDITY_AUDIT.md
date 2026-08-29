# P28A — Clinical & Contextual Question Validity Audit

**Status: ACTION_REQUIRED**

P28A is detection-only. It does not edit the frozen P26G question bank, answer keys, learning logic, grading, FSRS, or release behavior.

## Full-bank coverage

- Questions audited: **1299 / 1,299**
- Frozen SHA-256 preserved: `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`
- Single-choice questions: **699**
- Single-choice items requiring adversarial adjudication before retention: **44**
- Critical-risk questions: **17**
- High/critical objective questions: **44**
- Current-guidance-sensitive review queue: **75**

## Calibrated risk distribution

- critical: **17**
- high: **53**
- medium: **66**
- review: **220**
- clear: **943**

## Most common calibrated signals

- `PSEUDO_CLINICAL_CASE_SOURCE_RECALL`: **148**
- `CURRENT_GUIDANCE_SENSITIVE_TOPIC`: **75**
- `INSUFFICIENT_CLINICAL_CASE_CONTEXT`: **66**
- `UNDER_SPECIFIED_PROMPT_BROAD_REFERENCE`: **39**
- `CONTEXT_DEPENDENT_SINGLE_CHOICE`: **24**
- `CASE_ACTION_NEEDS_MORE_CONTEXT`: **23**
- `OVERLAPPING_NUMERIC_OPTIONS`: **11**
- `OVERLAPPING_MATCHING_LABELS`: **6**
- `MULTIPLE_SOURCE_SUPPORTED_OPTIONS`: **4**
- `SINGLE_CHOICE_FOR_PLURAL_KNOWLEDGE`: **4**
- `KEYED_ANSWER_WEAK_SOURCE_RELATION`: **2**
- `HIDDEN_MULTI_ANSWER_AS_SINGLE_CHOICE`: **1**

## Interpretation

A flag is not automatically a claim that the textbook fact is wrong. It means the question/answer contract may be unsafe for learning without semantic adjudication. P28A deliberately separates source-faithful 2015 correctness from current-guidance validity.

Single-choice is treated strictly: it may remain single-choice only if exactly one answer is defensible under the information explicitly supplied in the prompt.

The first-pass detector was intentionally over-sensitive. Calibration removes wording-only signals such as generic ‘am ehesten’ stems and ordinary conjunctions, and separates pseudo-clinical textbook recall from true answer-ambiguity risk.

## Next phase

**P28B — Adversarial Question-by-Question Adjudication & Repair**

P28B must inspect the priority queues semantically and repair each unsafe item by adding context, converting to multiple choice/free response/clinical case, accepting additional answers, rewriting distractors, or removing the item. Any question-bank edit invalidates the P26G freeze and requires re-certification.
