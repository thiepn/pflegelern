# PflegeLern — 1.1.0

**PflegeLern** is a mobile-first, offline-capable nursing study app built from a source-faithful learning bank based on the uploaded 2015 edition of *I care – Pflege*.

This repository is the **P27C final release (`1.1.0`)**. The complete question bank is frozen under the P26G certification, and the P27 release chain closes product readiness, release truth, exact-head browser certification, deployment verification and final release promotion without changing the certified learning bank.

## Product

- **Heute** — adaptive recommended study and short study rounds
- **Lernen** — unrestricted learning, hierarchical textbook navigation, search and bookmarks
- **Flashcards** — calibrated recall with `Nicht gewusst · Unsicher · Gewusst`
- **Free recall and self-assessment** — active retrieval beyond recognition-only study
- **Adaptive study mix** — bounded selection across cards and question types
- **Weakness remediation** — mastery-aware targeted recovery
- **Prüfung** — quick, full, weakness, chapter/section and mock-exam workflows with recovery
- **Fortschritt** — mastery, weak topics, recent mistakes and study history
- **FSRS-6** scheduling with a 90% target retention
- **IndexedDB v2** local persistence, backup/restore and session/exam recovery
- **Offline PWA** after the first successful load
- responsive phone-first and desktop layouts with real-Chromium regression coverage

Recommended study is never a gate. `Lernen` remains unrestricted and has no artificial daily cap.

## Certified study bank

- **66 chapters**
- **1,363 textbook section/subsection records**
- **2,089 concepts**
- **2,094 flashcards**
- **1,299 practice/exam questions**
- **120 clinical/application cases**

P26G freezes the complete 1,299-question bank at SHA-256:

`40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`

Any mutation of `data/questions.json` invalidates that certification and requires re-certification.

The learning content follows the **2015 textbook edition**. PflegeLern does not silently replace the source with current clinical guidance.

## Canonical validation

The stable non-browser release-certification command is:

```bash
python3 tools/release_readiness.py --full
```

It validates final release identity, production counts, PWA/static integrity, the frozen P26G bank hash and the semantic/question/adaptive/exam regression chain. Real-Chromium desktop/mobile interaction is enforced by the P27C CI workflow.

`node tests/validate.mjs` remains only as a compatibility alias to the canonical command above.

## Release certification

- P26G question-bank certification: **PASS**
- P27A full-product release-readiness audit: **completed**
- P27B release truth & validation repair: **PASS**
- P27C final release certification & promotion: **FINAL — v1.1.0**

The final tag/release `v1.1.0` is created from the exact merged `main` commit only after the live GitHub Pages deployment exposes the final P27C / 1.1.0 identity.

## Maintenance policy

PflegeLern 1.1.0 is the certified release baseline. Maintenance may fix release infrastructure or non-learning defects, but any future mutation of `data/questions.json` invalidates P26G and requires a new question-bank certification before another release.
