# PflegeLern — v1.0.0 Release

**PflegeLern** is a mobile-first, offline-capable nursing study app built from the source-faithful study bank for the uploaded 2015 edition of *I care – Pflege*.

This repository is the **P10 final release (`1.0.0`)**. The application is build-free and intended for GitHub Pages.

## What is included

- **Heute** — one-click adaptive study and a 5-minute round
- **Lernen** — unrestricted learning, weak/new/all modes, hierarchical textbook navigation, search and bookmarks
- **Flashcards** — `Nicht gewusst · Unsicher · Gewusst`
- **Prüfung** — quick, full, weakness, chapter and section tests with recovery
- **Fortschritt** — mastery, weak topics, recent mistakes and study history
- **FSRS-6** scheduling with a 90% target retention
- **IndexedDB v2** local persistence, backup/restore and session/exam recovery
- **Offline PWA** after the first successful load
- responsive phone-first and desktop layouts

Recommended study is never a gate. `Lernen` allows unrestricted study without an artificial daily cap.

## Study bank

- **66 chapters**
- **1,361 textbook section/subsection records**
- **2,089 concepts**
- **2,094 flashcards**
- **85 practice/exam questions**
- **18 clinical/application cases**

The learning content follows the **2015 textbook edition** and is not a silent update to current clinical guidance.

## Validation

Run locally with:

```bash
python3 -m http.server 8000
```

Then validate with:

```bash
node tests/validate.mjs
```

P9 static/content QA passed with zero validator errors. P10 adds live GitHub Pages smoke testing before final `v1.0.0` promotion.
