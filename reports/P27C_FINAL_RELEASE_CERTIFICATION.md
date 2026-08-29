# P27C — Final Release Certification & Promotion

**Status: PASS**

## Release identity

- Version: **1.1.0**
- Phase: **P27C**
- Repository state: **released**
- Service-worker cache: `pflegelern-v1.1.0`

## Frozen learning bank

- Questions: **1299**
- Sections: **1363**
- Concepts: **2089**
- Flashcards: **2094**
- Cases: **120**
- P26G SHA-256: `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`
- Question-bank mutation by P27C: **none**

## Validation

Canonical command: `python3 tools/release_readiness.py --full`

- **PASS — production-counts**: actual={'chapters': 66, 'sections': 1363, 'concepts': 2089, 'cards': 2094, 'questions': 1299, 'cases': 120}
- **PASS — p26g-question-bank-freeze**: 40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024
- **PASS — p26g-certification**: status=PASS questions=1299
- **PASS — manifest-release-identity**: P27C / 1.1.0 / released
- **PASS — learner-facing-version**: 1.1.0
- **PASS — service-worker-cache-identity**: pflegelern-v1.1.0
- **PASS — service-worker-precache-assets**: missing=[]
- **PASS — manifest-icons**: missing=[]
- **PASS — primary-navigation-surface**: today, learn, exam, progress, settings
- **PASS — viewport-metadata**: viewport-fit=cover
- **PASS — readme-release-truth**: current version/counts/canonical command
- **PASS — readme-no-obsolete-primary-release**: no stale P10/85-question identity
- **PASS — final-release-no-rc-identity**: no RC identity on current release surfaces; historical manifest notes are allowed
- **PASS — qa-release-truth**: current final-release QA record
- **PASS — qa-no-obsolete-boundary**: no stale P9 browser limitation

Browser interaction is rerun by the P27C GitHub Actions workflow using real Chromium on desktop/mobile surfaces.

## Release state

**FINAL — PflegeLern v1.1.0**

The exact merged main payload is deployed to GitHub Pages and tag/release `v1.1.0` is published only after live final-identity verification.
