# P28B — Adversarial Question-by-Question Adjudication & Repair

## Status

**PASS — 44 / 44 high/critical objective questions adjudicated**

P28B consumes the exact P28A objective priority queue and semantically reviews every item. Detector heuristics are not accepted as defects without adjudication.

## Results

- Adjudicated: **44**
- Repaired: **12**
- Retained after review: **32**
- Unresolved: **0**
- Questions after repair: **1,299**
- New question-bank SHA-256: `97d27b764223443ac72708524774d3003ff07a44394bdea175ebbd37fb11f708`

The v1.1.0/P26G hash `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024` remains a historical release artifact and is not rewritten.

## Invariants

P28B changes no FSRS scheduling, mastery model, remediation logic, repetition control, answer-input implementation, or exam scoring. Question IDs and type counts remain stable.

Current mainline identity: `P28B / 1.1.1-dev.28b / development`; cache `pflegelern-p28b-v1.1.1-dev28b`.

## Validation

```bash
python3 tools/p28b_validate.py --full
```

CI additionally runs real Chromium route/runtime, responsive overflow, offline-PWA and question-repair checks plus P25B/P25C/P25D browser regressions.

## Next phase

**P28C — Current-Guidance Sensitivity Adjudication & Historical-Source Safety Pass**
