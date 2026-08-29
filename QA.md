# P27C — Final Release Certification & Promotion

## Release status

**FINAL — PflegeLern 1.1.0**

P27C promotes the P27B release candidate only after the exact-head deterministic and browser gates pass. After merge, the final publication workflow waits until the corresponding GitHub Pages payload exposes the P27C / 1.1.0 identity before creating tag and GitHub release `v1.1.0`.

## Frozen production bank

| Entity | Count |
|---|---:|
| Chapters | 66 |
| Sections/subsections | 1,363 |
| Concepts | 2,089 |
| Flashcards | 2,094 |
| Questions | 1,299 |
| Cases | 120 |

Frozen P26G question-bank SHA-256:

`40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`

P27C does **not** modify `data/questions.json`, FSRS, mastery, remediation, repetition control, answer-input handling, question grading, exam selection/scoring or textbook-derived learning content.

## Deterministic release gate

Canonical command:

```bash
python3 tools/release_readiness.py --full
```

The final validator requires:

- exact production counts
- P26G hash/certification integrity
- final manifest identity `P27C / 1.1.0 / released`
- learner-facing version `1.1.0`
- service-worker cache `pflegelern-v1.1.0`
- no remaining RC identity on release surfaces
- complete PWA precache and manifest icons
- primary route and viewport contracts
- current README/QA release truth
- P26 semantic/source closure regressions
- P25 question variety/repetition/input/quality regressions
- P17–P20 adaptive learning, mastery, remediation and exam regressions

## Real Chromium certification

P27C reruns the full browser surface against the final payload:

- Heute, Lernen, Prüfung, Fortschritt and Einstellungen
- desktop/mobile runtime and console/page-error checks
- 320, 375, 768, 1024 and 1440 px horizontal-overflow gates
- offline navigation reload after service-worker installation
- all six question types present in the 1,299-question runtime
- P25C desktop/mobile answer-input reliability
- P25D question-quality selection behavior
- P25B repetition-control behavior

## Promotion contract

The final publication workflow runs from the merged `main` commit and:

1. reruns the canonical final validator;
2. proves the frozen P26G bank hash;
3. waits for GitHub Pages to expose `P27C / 1.1.0 / released`;
4. creates tag `v1.1.0` at that exact `main` commit;
5. publishes the GitHub release only after the live deployment check passes.

No post-tag source mutation is required for P27C closeout.
