# P27B — Release Truth & Validation Repair

**Status: PASS**

## Release identity

- Version: **1.1.0-rc.1**
- Phase: **P27B**
- Repository state: **release-candidate**
- Service-worker cache: `pflegelern-p27b-v1.1.0-rc1`

## Frozen learning bank

- Questions: **1299**
- Sections: **1363**
- Concepts: **2089**
- Flashcards: **2094**
- Cases: **120**
- P26G SHA-256: `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`
- Question-bank mutation by P27B: **none**

## Validation

Canonical command: `python3 tools/release_readiness.py --full`

- **PASS — production-counts**: actual={'chapters': 66, 'sections': 1363, 'concepts': 2089, 'cards': 2094, 'questions': 1299, 'cases': 120}
- **PASS — p26g-question-bank-freeze**: 40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024
- **PASS — p26g-certification**: status=PASS questions=1299
- **PASS — manifest-release-identity**: P27B / 1.1.0-rc.1 / release-candidate
- **PASS — learner-facing-version**: 1.1.0-rc.1
- **PASS — service-worker-cache-identity**: pflegelern-p27b-v1.1.0-rc1
- **PASS — service-worker-precache-assets**: missing=[]
- **PASS — manifest-icons**: missing=[]
- **PASS — primary-navigation-surface**: today, learn, exam, progress, settings
- **PASS — viewport-metadata**: viewport-fit=cover
- **PASS — readme-release-truth**: current version/counts/canonical command
- **PASS — readme-no-obsolete-primary-release**: no stale P10/85-question identity
- **PASS — qa-release-truth**: current release-candidate QA record
- **PASS — qa-no-obsolete-boundary**: no stale P9 browser limitation

Browser interaction is rerun by the P27B GitHub Actions workflow using real Chromium on desktop/mobile surfaces.

## Next phase

**P27C — Final Release Certification & Promotion**

Run the final exact-head CI/browser/deployment gate and promote the release candidate only if all checks pass.
