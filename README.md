# PflegeLern — 1.1.1-dev.28b

**PflegeLern** is a mobile-first, offline-capable nursing study app built from a source-faithful learning bank based on the uploaded 2015 edition of *I care – Pflege*.

Current `main` is the **P28B development line (`1.1.1-dev.28b`)**. The latest immutable published release remains **v1.1.0 / P27C**. P28B is a bounded post-release content-quality repair phase and does not rewrite the historical v1.1.0 tag or P26G certification.

## Product

- Heute adaptive recommended study and short rounds
- Lernen unrestricted hierarchical learning, search and bookmarks
- flashcards, free recall and calibrated self-assessment
- adaptive study mix and weakness remediation
- Prüfung quick/full/weakness/chapter/section/mock-exam workflows
- Fortschritt mastery, weak topics, recent mistakes and history
- FSRS-6 at 90% target retention
- IndexedDB v2 persistence, backup/restore and recovery
- offline PWA after first successful load
- responsive phone-first and desktop layouts

## Current study bank

- **66 chapters**
- **1,363 sections/subsections**
- **2,089 concepts**
- **2,094 flashcards**
- **1,299 questions**
- **120 cases**

P28B question-bank SHA-256:

`97d27b764223443ac72708524774d3003ff07a44394bdea175ebbd37fb11f708`

The former P26G SHA `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024` remains the immutable **v1.1.0 release baseline**. It is intentionally no longer the current-main bank hash after P28B's bounded repairs.

## P28B adjudication

P28A surfaced 44 high/critical objective questions for semantic adjudication. P28B reviews all 44 independently of the existing answer key:

- **12 confirmed defects repaired**
- **32 detector flags retained after semantic review**
- **0 unresolved high/critical objective questions**

Repairs include source-contract narrowing, explicit 2015 historical scoping, prompt precision, one misleading distractor replacement, and four single-choice symptom stems rewritten to ask for a symptom combination.

The learning bank remains source-faithful to the **2015 textbook edition**. Historical source statements are not silently modernized into current clinical guidance.

## Canonical current-main validation

```bash
python3 tools/p28b_validate.py --full
```

`node tests/validate.mjs` is the compatibility alias for current main. Historical `tools/release_readiness.py` remains the v1.1.0/P27C release validator.

## Release state

- Latest immutable release: **v1.1.0 / P27C**
- Current main development identity: **1.1.1-dev.28b / P28B**
- Current bank certification: **P28B bounded adjudication hash above**
- Next phase: **P28C — Current-Guidance Sensitivity Adjudication & Historical-Source Safety Pass**
