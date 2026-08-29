# P28B — Adversarial Question-by-Question Adjudication & Repair

**Status: PASS**

P28B semantically adjudicates every one of the 44 high/critical objective questions carried forward from P28A. Detector flags are not treated as defects without question-level semantic review.

## Outcome

- Questions adjudicated: **44 / 44**
- Confirmed defects repaired: **12**
- Flagged items retained after semantic review: **32**
- Unresolved objective items: **0**
- New exact question-bank SHA-256: `97d27b764223443ac72708524774d3003ff07a44394bdea175ebbd37fb11f708`
- Question count remains **1,299**; IDs and question-type counts are preserved.

## Repair classes

- `answer-contract-narrowing`: **1**
- `distractor-repair`: **1**
- `historical-source-scope`: **4**
- `prompt-precision`: **2**
- `single-choice-contract`: **4**

## Certification meaning

The P26G hash remains the immutable **v1.1.0 release baseline**, but it is no longer the hash of current main after P28B. P28B establishes the new exact development-bank hash above.

P28B does not silently modernize the source. Guidance-sensitive repaired items are explicitly framed as 2015-source questions where necessary.

## Next phase

**P28C — Current-Guidance Sensitivity Adjudication & Historical-Source Safety Pass**

P28C handles the broader P28A current-guidance-sensitive queue, reusing P28B decisions already completed.
