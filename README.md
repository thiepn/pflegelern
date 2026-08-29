# PflegeLern — 1.1.0-rc.1

**PflegeLern** is a mobile-first, offline-capable nursing study app built from a source-faithful learning bank based on the uploaded 2015 edition of *I care – Pflege*.

The repository is currently the **P27B release candidate (`1.1.0-rc.1`)**. The frozen question bank completed P26G certification; P27B repairs release identity, documentation and the canonical validation entrypoint without changing learning content.

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

Serve locally when browser interaction is needed:

```bash
python3 -m http.server 4173
```

The single current non-browser release-readiness command is:

```bash
python3 tools/release_readiness.py --full
```

This validates P27B release truth, current production counts, PWA/static integrity, the frozen P26G question-bank hash and the semantic/question/adaptive/exam regression chain. Real-Chromium desktop/mobile interaction is rerun in the P27B CI workflow.

`node tests/validate.mjs` is retained only as a compatibility alias to the canonical command above.

## Release state

- P26G question-bank certification: **PASS**
- P27A full-product readiness audit: **completed; release-truth drift identified**
- P27B release truth & validation repair: **release candidate gate**
- next phase after P27B: **P27C — Final Release Certification & Promotion**
