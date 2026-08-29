# P28A — Clinical & Contextual Question Validity Audit

**Audit status: ACTION_REQUIRED**

P28A audits all 1,299 questions for contextual sufficiency, answer-format fit, single-choice uniqueness risk, source-supported alternative answers, overlapping options, narrow reference-answer contracts, and current-guidance sensitivity.

## Final calibrated findings

- Questions audited: **1,299 / 1,299**
- Single-choice questions: **699**
- Single-choice items requiring adversarial adjudication before retention: **44**
- Critical-risk questions: **17**
- High/critical objective questions: **44**
- Current-guidance-sensitive review queue: **75**
- Pseudo-clinical source-recall items: **148**

Risk distribution:

- critical: **17**
- high: **53**
- medium: **66**
- review: **220**
- clear: **943**

The most important objective-question signals include 11 overlapping numeric-option items, 4 single-choice questions phrased for plural knowledge, 4 questions where an unkeyed option is also strongly supported by repository-local source evidence, and 24 context-dependent single-choice questions.

## Detection-only invariant

P28A does not edit question text, answer keys, question types, grading, FSRS, mastery, remediation, exam logic, or current production behavior.

`data/questions.json` remains byte-for-byte identical to the P26G freeze at SHA-256:

`40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`

A P28A signal is a review obligation, not an automatic judgment that the keyed answer is wrong. Source-faithful correctness against the 2015 textbook remains separate from current-guidance validity.

## Next phase

**P28B — Adversarial Question-by-Question Adjudication & Repair**

P28B must adjudicate the priority queues semantically and either retain the item with evidence, add missing context, convert its answer format, accept additional valid answers, rewrite distractors/reference rubrics, or remove the unsafe item. Any edit to `data/questions.json` invalidates P26G and requires a new certification.
