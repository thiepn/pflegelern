# P27A — Full-Product Release Readiness Audit

**Status:** ACTION_REQUIRED

## Certified baseline

- Frozen P26G bank: **1299 questions**
- Frozen SHA-256: `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`
- Static runtime blockers: **0**
- Actionable release-readiness findings: **5**

## Findings

- **HIGH — P27A-DOC-001**: README identifies the repository as the old P10/v1.0.0 release
- **HIGH — P27A-DOC-002**: README study-bank counts are materially stale
- **MEDIUM — P27A-DOC-003**: QA.md is still the P9 release-hardening record
- **CRITICAL — P27A-QA-001**: The README-documented primary validator is obsolete and cannot validate current main
- **HIGH — P27A-REL-001**: Learner-facing application version is hard-coded to the obsolete 1.0.0 identity
- **INFO — P27A-REL-002**: Repository remains on a development-phase version rather than a beta/release-candidate identity

## Runtime gate

P27A additionally requires the real-Chromium workflow to pass route, study-input, question-quality, repetition-control, offline-reload, responsive-overflow and console/page-error checks.

## Next phase

**P27B — Release Truth & Validation Repair**

Repair stale release identity/documentation and the obsolete canonical validation entrypoint, then establish one current release-readiness command/report without modifying the frozen 1,299-question bank.
