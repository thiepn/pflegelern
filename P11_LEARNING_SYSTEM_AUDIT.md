# P11 — Learning-System Audit & Optimization Specification

Status: **PASS — optimization specification locked for P12**  
Baseline: **PflegeLern v1.0.0**  
Scope: learning effectiveness, study-flow design, assessment quality and adaptive sequencing.  
Non-goal: rebuilding the released application or replacing FSRS without evidence of a defect.

## 1. Executive conclusion

PflegeLern v1.0.0 already has a strong retention foundation: spaced scheduling, active retrieval, immediate corrective feedback during study questions, interleaving, weakness targeting, exam-mode delayed feedback, concept-level evidence and unrestricted voluntary study.

The main learning-system limitation is **not the scheduler**. It is the imbalance between a very large flashcard bank and a comparatively small objective/application assessment bank. The v1.1 optimization therefore focuses on increasing the *quality and variety of retrieval evidence* while preserving the current one-click experience.

Current production bank:

- 66 chapters
- 1,361 sections/subsections
- 2,089 concepts
- 2,094 flashcards
- 85 practice/exam questions
- 18 clinical cases

The 85-question count is only about 4.1 questions per 100 concepts. That ratio is not identical to concept coverage because a question can reference more than one concept, but it clearly shows that objective/application retrieval is much thinner than flashcard retrieval.

## 2. Learning-science basis

The optimization specification follows four evidence-backed principles.

1. **Spacing remains foundational.** Distributed retrieval should remain the default for durable memory.
2. **Retrieval must stay effortful.** Showing an answer before attempting retrieval weakens the value of the exercise.
3. **Feedback matters.** Objective practice and free recall need corrective/reference feedback after the attempt.
4. **Interleaving is useful selectively, not dogmatically.** It is particularly valuable where learners must discriminate between similar concepts; it should not be forced into every content type.

Reference reviews used for this audit:

- Carpenter SK, Pan SC, Butler AC. *The science of effective learning with spacing and retrieval practice.* Nature Reviews Psychology (2022). DOI: 10.1038/s44159-022-00089-1.
- Agarwal PK, Nunes LD, Blunt JR. *Retrieval Practice Consistently Benefits Student Learning: a Systematic Review of Applied Research in Schools and Classrooms.* Educational Psychology Review (2021). DOI: 10.1007/s10648-021-09595-9.
- Firth J, Rivers I, Boyle J. *A systematic review of interleaving as a concept learning strategy.* Review of Education (2021). DOI: 10.1002/rev3.3266.
- Gonçalves AO, Muniz BFB, Jaeger A. *Retrieval Practice Versus Elaborative Encoding: A Systematic and Meta-analytic Review.* Educational Psychology Review (2025). DOI: 10.1007/s10648-025-10076-6. This review reinforces that retrieval quality and corrective feedback matter; retrieval should not be treated as automatically superior to every useful elaborative activity.

## 3. Existing study-interaction map

### 3.1 Onboarding

Current role: reduce setup friction and communicate the 2015 textbook boundary.

Learning value: indirect. It succeeds by avoiding configuration burden.

Decision: **keep simple**. Do not add learning-style quizzes, scheduler settings or onboarding diagnostics that delay the first study session.

### 3.2 Heute — recommended session

Current role:

- selects due cards first;
- adds weak material;
- prioritizes new cards by concept importance;
- normally adds a small set of practice questions;
- interleaves the resulting items;
- reduces new-card intake when the review backlog is high.

Learning value: high. This is the correct default entry point.

Limitation: the question component is currently too small and relatively fixed compared with the flashcard component. As the question bank expands, the mix should become adaptive rather than simply adding roughly the same small question count.

Decision: **preserve one-click start; upgrade mix logic in P17.**

### 3.3 5-Minuten-Runde

Current role: low-friction short retrieval session.

Learning value: high for adherence and opportunistic retrieval.

Decision: retain. It must remain a genuine short session, not become a compressed version of every future feature.

### 3.4 Automatisch weiterlernen

Current role: scoped or global adaptive continuation using due, weak and fresh cards, with questions where available.

Learning value: high.

Decision: retain as the default unrestricted continuation flow.

### 3.5 Meine Schwächen

Current role: selects uncertain/weak material using accumulated card, practice and exam evidence.

Learning value: useful, but current remediation is mostly selection-based: the learner receives weak material again.

Limitation: repeating the same item is weaker than diagnosing the associated concept and changing the retrieval route.

Decision: keep current mode; P19 adds structured remediation without removing the simple button.

### 3.6 Neue Karten / Alle Karten / unlimited study

Current role: removes artificial caps and allows highly motivated study.

Learning value: important product constraint. A recommended daily workload must never become a wall.

Risk: massed exposure can be mistaken for mastery.

Decision: preserve unlimited access, but mastery must depend on evidence quality and spacing rather than raw same-session volume.

### 3.7 Flashcard reveal + three-button rating

Current flow:

Question → learner attempts recall → answer reveal → Nicht gewusst / Unsicher / Gewusst.

Strengths:

- active retrieval occurs before answer exposure;
- only three visible decisions;
- ratings map cleanly to the scheduler;
- keyboard operation is fast on desktop.

Primary limitation: self-assessment is noisy. A learner may choose `Gewusst` after recalling only part of a multi-point answer.

Decision: **do not add more rating buttons.** P14 adds concise key-point grading guidance only where it improves calibration.

### 3.8 Practice questions

Current role:

- single choice;
- multiple choice;
- ordering;
- matching;
- short-answer/free-text handling;
- immediate feedback in study mode;
- question history and concept evidence.

Strength: objective questions provide stronger evidence than flashcard self-rating.

Primary limitation: only 85 questions exist for 2,089 concepts.

Decision: **P12 is the highest-priority content expansion.**

### 3.9 Clinical/free-response questions

Current role: optional typed or mental answer, reveal of a model answer, then learner self-grades correct/incorrect.

Strength: supports productive recall without mandatory typing.

Limitations:

- sparse coverage;
- binary self-grading can be coarse;
- cases are not yet numerous enough to make application evidence common.

Decision: P13 expands cases; P15 formalizes selective free recall and key-point comparison.

### 3.10 Prüfung

Current role:

- quick test;
- full mixed exam;
- weakness exam;
- topic exam;
- no correctness feedback until submission;
- leave/resume support;
- post-exam error review;
- exam evidence updates concept mastery without creating fake FSRS card reviews.

Learning value: high and structurally correct.

Limitations:

- small question bank constrains diversity;
- no exam-date planning;
- no full mock-exam configuration/timer/overview layer yet.

Decision: preserve evidence separation. P16 adds exam-date planning; P20 upgrades mock exams.

### 3.11 Fortschritt

Current role: shows safe/uncertain/new, weak chapters and recent activity.

Strength: intentionally simple.

Limitation: current mastery compresses different evidence types into a single score and can make flashcard familiarity look closer to application competence than it should.

Decision: preserve simple learner-facing labels; P18 improves the internal evidence model.

## 4. Audit findings — strengths to freeze

The following behavior is considered **protected** for v1.1 unless a concrete defect is discovered:

1. `Heute → Lernen starten` remains the primary one-click path.
2. The four primary navigation areas remain `Heute · Lernen · Prüfung · Fortschritt`.
3. Recommended study is bounded; voluntary study remains uncapped.
4. Flashcards keep exactly three visible ratings.
5. The learner is never forced to type every answer.
6. Exam answers receive no correctness feedback before submission.
7. Exam/practice evidence must never fabricate an FSRS card review.
8. Early voluntary successful practice must not automatically push a card's normal due date forward.
9. Weakness targeting uses concept evidence rather than only exact-item repetition.
10. No XP, streak punishment, coins, hearts, leaderboards or fake daily obligations.
11. Advanced intelligence remains mostly invisible; the interface should expose the next useful action, not scheduler machinery.
12. 2015 textbook fidelity remains explicit and separate from any future current-guideline layer.

## 5. Audit findings — highest-value deficiencies

### D1 — Assessment-bank imbalance — severity P0

2,094 flashcards versus 85 questions and 18 cases makes the system much stronger at memorization than application/testing.

Consequence: a learner can accumulate substantial flashcard evidence without enough independent objective evidence that the knowledge transfers to exam-style or clinical-context retrieval.

Required response: P12 and P13.

### D2 — Flashcard rating calibration — severity P0

Three-button self-rating is intentionally simple, but multi-point answers can be over-rated.

Required response: P14 adds `keyPoints`, optional `criticalKeyPoints` and compact grade guidance. No extra rating button is permitted.

### D3 — Limited productive/free recall — severity P1

Most cards use cued self-recall followed by self-rating. Productive recall exists in question handling but is not systematically targeted at CORE or repeatedly weak concepts.

Required response: P15.

### D4 — No exam-horizon adaptation — severity P1

The system does not currently know whether the exam is tomorrow or six weeks away.

Required response: P16 adds an optional exam plan that changes study priority without replacing FSRS.

### D5 — Daily mix cannot exploit a large future question bank — severity P1

The current recommended session intentionally adds only a small question set. This is reasonable with 85 questions but will become suboptimal after P12/P13.

Required response: P17 adaptive mix v2.

### D6 — Mastery conflates evidence strength — severity P1

Current concept mastery combines card status with practice and exam correctness. This is useful but does not explicitly distinguish recognition/cued recall, productive recall, application and spaced stability.

Required response: P18.

### D7 — Weakness repair is selection, not diagnosis — severity P1

Weak items are prioritized, and exam errors can create focused review, but the engine does not yet deliberately choose prerequisites, discriminations and later transfer questions as a remediation sequence.

Required response: P19.

### D8 — Mock exam depth — severity P2

Current exam mode is valid but not yet a full exam-simulation environment.

Required response: P20 after the question bank is large enough to support it.

## 6. Concept-to-learning-demand taxonomy

P12 must classify every production concept into one or more learning demands. The classification is derived from existing concept metadata and manual/automated rules; it is not a new learner-facing taxonomy.

### A. Factual recall

Typical concept types:

- definition
- normal_value
- symptom
- sign
- cause
- risk_factor
- medication facts
- legal_rule facts

Preferred evidence:

- flashcard retrieval;
- short answer where useful;
- objective question for assessment-eligible CORE material.

### B. Discrimination / comparison

Typical concept types:

- comparison
- classification
- closely related symptom/sign sets
- concepts where common confusion is plausible

Preferred evidence:

- contrast questions;
- matching;
- carefully designed MCQ;
- interleaving with the confusable concept.

### C. Sequence / procedure

Typical concept types:

- procedure
- sequence
- intervention with ordered steps

Preferred evidence:

- flashcard for key rule;
- ordering task;
- application question;
- case when the source supports context/priority.

### D. Safety / contraindication / complication

Typical concept types:

- contraindication
- complication
- high-risk medication/intervention rules
- warning signs

Preferred evidence:

- objective retrieval;
- scenario/application;
- delayed retest;
- higher QA threshold.

### E. Applied judgment

Typical concept types:

- diagnostic/observation decisions
- nursing_goal
- patient_education
- communication
- intervention selection
- legal/ethical application

Preferred evidence:

- clinical scenario;
- prioritization;
- rationale question;
- free recall.

### F. Principle / conceptual explanation

Typical concept types:

- principle
- mechanism-like relationships where present in source
- rationale-based content

Preferred evidence:

- explain-in-own-words retrieval;
- cause/effect questions;
- application to a novel but source-supported situation.

## 7. Assessment eligibility model

Not every concept should receive an MCQ. P12 therefore adds internal classification fields during content generation/audit:

```json
{
  "learningDemands": ["factual_recall", "application"],
  "assessmentEligible": true,
  "applicationEligible": true,
  "freeRecallEligible": true,
  "safetyCritical": false,
  "confusableWith": []
}
```

These fields may live in generated audit metadata rather than the public concept JSON if runtime use is not yet required.

Rules:

- `assessmentEligible=false` when an objective question would be artificial, ambiguous or redundant.
- `applicationEligible=true` only when the source genuinely supports an application context; never invent clinical guidance to manufacture cases.
- `safetyCritical=true` raises source-verification and distractor-review requirements.
- `confusableWith` is used only where there is a real, pedagogically useful discrimination pair/set.

## 8. Evidence hierarchy for Mastery v2

P18 will use this P11 hierarchy. Higher evidence is not simply worth more points; it represents a qualitatively stronger demonstration.

1. **Unseen** — no retrieval evidence.
2. **Exposed** — encountered but not successfully retrieved.
3. **Cued recall** — successful flashcard retrieval/self-rating.
4. **Productive recall** — successful free/short recall against a reference/key-point rubric.
5. **Objective retrieval** — correct independent practice/exam item.
6. **Application** — correct scenario, prioritization, rationale or multi-concept task.
7. **Spaced stability** — successful retrieval of the concept across meaningful time intervals.

Learner-facing UI does **not** need seven labels. It may continue to show `Neu`, `Noch üben`, `Sicher` while the engine uses richer evidence internally.

## 9. P12 question-bank specification

P12 is now locked to these rules:

- Generate from approved/source-supported concepts only.
- Favor assessment-eligible CORE and IMPORTANT concepts before DETAIL.
- Add a second question for a concept only when it tests a genuinely different retrieval demand.
- Avoid turning every flashcard into an MCQ.
- Include objective formats appropriate to the concept: single choice, multiple choice, ordering, matching and source-supported short answer.
- Prefer discrimination/application over trivial wording substitutions where supported.
- Distractors must be plausible but unambiguously wrong according to the source.
- Do not use answer-length, grammar or category mismatch as a giveaway.
- No duplicate normalized prompts.
- No same-fact near-duplicates simply to increase count.
- Safety/numeric items receive an additional verification pass.
- Preserve qualifications such as `kann`, `häufig`, `i.d.R.` and example-only scope.
- New content must remain clearly based on the 2015 textbook edition unless a separate future guideline layer is explicitly created.

### P12 coverage gate

P12 should optimize **coverage quality**, not hit an arbitrary raw target. Expected useful scale is approximately 500–800 total questions, but release is governed by these gates instead:

1. Every assessment-eligible CORE concept has an objective or productive retrieval path beyond the basic flashcard, unless documented as unsuitable.
2. Every safety-critical assessment-eligible concept receives independent assessment coverage.
3. Procedure/sequence concepts receive ordering/application coverage where the source supports it.
4. Confusable concept sets receive at least one discrimination task where useful.
5. No chapter with substantive CORE material is left without meaningful question coverage.
6. Duplicate/ambiguity/source-support audits pass globally.

## 10. P13 case-bank specification

Expected useful scale: approximately 80–150 cases, governed by source support rather than quota.

A valid case must:

- require application, prioritization, interpretation or integration;
- combine concepts only when the source supports the relationship;
- avoid merely wrapping a direct fact question in a patient name;
- expose 2–5 linked retrieval decisions when appropriate;
- clearly separate source-faithful exam content from any future current-guideline content.

Priority areas:

- observation and warning signs;
- complications and safety;
- procedures;
- medication handling;
- patient education;
- communication;
- nursing priorities;
- common clinical situations represented in the textbook.

## 11. P14 calibrated flashcard grading specification

Optional card fields:

```json
{
  "keyPoints": ["..."],
  "criticalKeyPoints": ["..."],
  "gradingHint": "Gewusst = alle Kernpunkte sicher erinnert."
}
```

Rules:

- `keyPoints` appear only after reveal.
- They must be concise and must not duplicate long answer prose unnecessarily.
- `criticalKeyPoints` are reserved for answers where omission materially changes correctness.
- Visible rating remains exactly three buttons.
- No automatic semantic grading is required for v1.1.

Suggested learner interpretation:

- `Gewusst`: all essential points recalled; no critical point missing.
- `Unsicher`: core idea correct but one or more important points missing/hesitant.
- `Nicht gewusst`: substantially wrong, absent or critical point missed.

## 12. P15 selective free-recall specification

Free recall is **selective** rather than universal.

Eligibility priority:

1. CORE concepts;
2. repeatedly weak concepts;
3. definitions where exact conceptual content matters;
4. sequences/lists;
5. concepts with evidence of self-rating overconfidence;
6. exam-plan high-priority concepts.

Interaction:

Prompt → optional text field or mental answer → reveal reference/key points → self-grade.

Typing is never required for every card.

## 13. P16 exam-plan specification

Optional learner inputs:

- exam date;
- scope: whole book or selected chapters/sections.

The planner must not require more configuration.

Internal phases:

- long horizon: coverage + FSRS maintenance;
- medium horizon: consolidation + mixed retrieval;
- final week: weaknesses + objective/application retrieval;
- final 2–3 days: high-yield retrieval + mock exams, little low-value new DETAIL material;
- final day: light targeted review, no artificial workload spike.

Invariant: exam urgency changes *selection priority*, not the underlying truth of an FSRS due date.

## 14. P17 adaptive mix v2 specification

After P12/P13, the recommended session should choose among:

- due flashcards;
- weak flashcards;
- new high-importance cards;
- objective retrieval questions;
- productive recall;
- application/case items.

Mix factors:

- due urgency;
- concept importance;
- weakness;
- evidence level;
- question recency;
- concept recency;
- exam proximity;
- coverage debt;
- application deficit;
- recent same-concept collisions.

No fixed percentage is permanently hard-coded as pedagogically optimal. The engine should use bounded policies and tests for different learner states.

## 15. P18 mastery v2 specification

Mastery must not be inflated by repeated same-session exposures.

The model should separately track:

- card/cued-recall evidence;
- productive-recall evidence;
- objective-practice evidence;
- exam evidence;
- application evidence;
- spaced stability;
- recent failure/uncertainty.

Learner-facing display remains simple.

## 16. P19 weakness-remediation specification

A failed concept may generate a short repair sequence:

1. prerequisite or core rule;
2. direct retrieval of the failed concept;
3. discrimination from a commonly confused concept if applicable;
4. delayed related question;
5. later transfer/application item where supported.

Protections:

- do not repeat the exact failed question immediately unless necessary for feedback;
- do not award strong mastery from same-session repetition;
- cap same-concept clustering;
- use question history to avoid answer memorization;
- remediation may end early when evidence is already sufficient.

## 17. P20 mock-exam specification

Only expand after P12/P13 provide enough unique material.

Required capabilities:

- quick, standard and custom-length exams;
- whole-book or topic scope;
- weakness-focused exam;
- optional timer;
- unanswered overview;
- mark for review;
- mixed item types;
- no correctness feedback until submission;
- post-exam topic/evidence breakdown;
- one-click `Fehler gezielt lernen` remediation.

## 18. UX invariants for all P12–P20 work

The learning upgrade fails if it makes the app harder to start using.

Locked UX requirements:

- primary navigation remains four items;
- default study begins in one meaningful tap from Heute;
- no advanced setup required to study;
- exam planning is optional;
- one dominant action per screen;
- unlimited voluntary study remains easy to reach;
- no mandatory typing for ordinary sessions;
- no gamification pressure;
- new learner-facing terminology must remain plain German;
- accessibility/touch-target/reduced-motion standards from v1.0.0 remain release gates.

## 19. P11 measurable success criteria

P11 is complete when the following are true:

- current learning interactions have been mapped;
- strengths and deficiencies have explicit priority;
- concept learning-demand taxonomy is defined;
- assessment eligibility rules are defined;
- mastery evidence hierarchy is defined;
- P12–P20 have locked implementation constraints;
- no runtime behavior is changed prematurely;
- v1.0.0 remains stable while v1.1 work begins.

Result: **PASS**.

## 20. Next phase

**P12 — Practice Question Bank Expansion**

P12 should begin by producing a machine-readable audit of concept assessment eligibility and existing question coverage, then generate/validate additional questions in controlled batches before merging anything into the production bank.
