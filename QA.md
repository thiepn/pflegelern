# P9 — Full Product QA, UX Audit & Release Hardening

## Release status

**PASS — static/engine/content release gate cleared for P10 live deployment validation.**

Release candidate: **`1.0.0-rc.1`**  
Content manifest: **`0.9.0-rc1`**

## Final production counts

| Entity | Count |
|---|---:|
| Chapters | 66 |
| Sections/subsections | 1,361 |
| Concepts | 2,089 |
| Flashcards | 2,094 |
| Questions | 85 |
| Cases | 18 |

## Textbook hierarchy audit

P9 re-read the real PDF hierarchy from heading typography instead of trusting the P7 extraction blindly.

Results:

- **544** section-heading repairs
- **7** omitted real parent sections restored
- **2** false figure-caption sections removed (`28.9`, `59.16`)
- synthetic `36.3–36.4` pilot section removed
- **23** affected concepts rerouted
- all subsection records now have their required immediate parent
- known multiline headings such as `36.4.2 Hinweise zu verschiedenen Applikationsformen` and `37.2.5 Akuter und chronischer Schmerz` are complete
- all **66 chapters** retain flashcard coverage

## Content audit and cleanup

P9 performed another learner-facing audit rather than treating P7B as immutable.

- **536** machine-like prompts were naturalized
- malformed/truncated items found during the audit were repaired when source support was clear or removed when it was not
- learner-facing control/extraction characters: **0**
- normalized duplicate flashcard fronts: **0**
- `Aspekt 1/2` placeholder cards: **0**
- old `Was gilt bei … im Zusammenhang …?` generated-template prompts: **0**

A final catheter card containing an extraction control character was caught by the expanded P9 validator and repaired against the source before the gate passed.

## Study-engine QA

Fresh profile test:

```text
Recommended session: 14 items
11 new flashcards
3 questions
Estimated duration: 7 minutes
Flashcard importance: 11/11 CORE
Nearby same-concept collisions: 0
False weakness evidence: none
```

Verified behavior:

- CORE priority is preserved while randomizing within the same importance tier
- recommended study remains bounded while unrestricted study remains uncapped
- parent topic scope includes all descendant subsection cards/questions
- same-concept proximity suppression remains active
- practice/exam evidence is kept separate from FSRS card state
- fresh weakness exams are unavailable until actual weakness evidence exists
- exam recency is tracked to reduce immediate repeats
- wrong exam concepts can generate a focused review session
- interrupted exams are recoverable
- active study time is accumulated from interaction periods rather than browser-open wall time

## FSRS invariants

Automated checks verify:

- first successful review increments repetitions
- next due date moves into the future
- the forgetting-curve invariant `R(t=S) = 0.9` holds

Result: **PASS**.

## Persistence and recovery

IndexedDB schema: **v2**.

P9 adds `questionHistory` and validates backup contents before import. Automated validation confirms:

- valid backup shape accepted
- missing required store keys rejected
- reset includes question history
- open study sessions remain persisted
- open exams remain persisted and are surfaced for continuation

## UX/accessibility static gates

Verified in source/automated checks:

- rating controls are exposed as an accessible group
- exam ordering buttons have explicit `Nach oben` / `Nach unten` labels
- critical ordering controls are at least **44 × 44 px**
- segmented controls are at least **44 px** high
- mobile bottom navigation has **48 px+** touch targets
- safe-area inset handling is present
- horizontal page-overflow safeguard is present
- confirmation dialog has labelled title/description
- production CSS contains no gradients
- reduced-motion handling remains enabled

## JavaScript validation

All production JavaScript modules, the service worker and validator pass `node --check`.

## HTTP smoke test

Served from a local HTTP server; all checked resources returned **HTTP 200**:

```text
/                           200
/index.html                 200
/?view=today                200
/manifest.webmanifest       200
/service-worker.js          200
/js/app.js                  200
/js/study-engine.js         200
/data/cards.json            200
/data/questions.json        200
/icons/icon-192.png         200
```

## PWA/static asset gate

The validator confirms that every service-worker precache path, local `index.html` asset and manifest icon exists. Navigation requests use network-first behavior with cached `index.html` fallback for offline use.

Result: **PASS**.

## Automated browser boundary

A Chromium headless interaction run was retried during P9. The browser process again failed to complete against the local test origin in this environment before a usable DOM result could be obtained. No browser E2E result is therefore fabricated.

This does **not** block the static release candidate because the source, engine, data graph, HTTP delivery and PWA asset gates all pass. It does mean that **P10 must perform the live-browser smoke test on the deployed GitHub Pages origin before v1.0.0 promotion**.

P10 minimum live checks:

1. Android Chrome: onboarding → Heute → reveal/rate → exit/resume.
2. Android Chrome: hierarchical topic selection and unlimited study.
3. Desktop Chromium: keyboard reveal/rating and responsive sidebar.
4. Exam start → answer → leave → resume → submit → error review.
5. Refresh during study and exam.
6. Backup export/import on the live origin.
7. Install/offline reload after initial cache fill.
8. No horizontal scroll at 320–430 px widths.

## P9 conclusion

**P9 is release-candidate complete.** No known static/data/engine blocker remains. The application is ready for P10 deployment and live browser/device validation; it should not be labeled final `v1.0.0` until that live gate passes.
