# PflegeLern — Current QA & Release Readiness

## Status

**P27B — Release Truth & Validation Repair**  
Release candidate: **`1.1.0-rc.1`**

P27B replaces the obsolete P9/P10 QA summary as the current release-readiness record. Learning content remains frozen at the P26G-certified question bank.

## Production counts

| Entity | Count |
|---|---:|
| Chapters | 66 |
| Sections/subsections | 1,363 |
| Concepts | 2,089 |
| Flashcards | 2,094 |
| Questions | 1,299 |
| Cases | 120 |

## Certified learning-bank baseline

P26G is **PASS** and freezes `data/questions.json` at:

`40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`

Certified P26 closure:

- P26A/P26B: 7 confirmed semantic defects → 7 repaired
- P26C/P26D: 14 additional confirmed repair targets → 14 repaired
- P26E: 0 actionable semantic defects and 0 unadjudicated signals
- P26F: 0 residual source-alignment findings
- P26G: full 1,299-question certification **PASS**

P27B does **not** edit question prompts, options, answer keys, explanations, difficulty, FSRS scheduling, mastery, remediation, repetition control, input handling or exam logic.

## Learning-system regression surface

The current canonical release gate covers:

- P26G frozen-bank integrity
- P26F/P26E source/semantic closure
- P25A question variety
- P25B bounded repetition control
- P25C answer-input reliability
- P25D question-quality selection
- P17 adaptive study mix
- P18 mastery model
- P19 weakness remediation
- P20 mock-exam core/runtime
- current JavaScript/service-worker syntax
- production counts, release identity and PWA/static asset integrity

Run:

```bash
python3 tools/release_readiness.py --full
```

The historical `tests/validate.mjs` command is now only a compatibility alias to this current gate.

## Browser and responsive QA

P27A established a real Chromium full-product readiness workflow instead of the old P9 “browser boundary” limitation. The workflow covers:

- primary routes: Heute, Lernen, Prüfung, Fortschritt, Einstellungen
- desktop and mobile study-input interaction
- question-quality and repetition-control regressions
- offline reload and visible offline state
- responsive horizontal-overflow checks
- zero unhandled console/page errors

P27B reruns the same real Chromium coverage after changing only release/documentation/cache identity surfaces.

## PWA / offline integrity

The service-worker cache identity is advanced with the P27B release candidate. All precached paths and manifest icons are checked by the canonical validator. Navigation continues to use offline fallback after initial cache population.

## Release-truth repair

P27B closes the five actionable P27A findings by:

1. replacing the stale P10/v1.0.0 README identity;
2. correcting documented production counts;
3. replacing this obsolete P9 QA record;
4. replacing the obsolete primary validator with `tools/release_readiness.py`;
5. aligning learner-facing, manifest and service-worker version identity to `1.1.0-rc.1`.

## Next phase

**P27C — Final Release Certification & Promotion**

P27C should run the final exact-head CI/browser/deployment gate and promote the release candidate only if every required check remains green.
