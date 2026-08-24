import assert from 'node:assert/strict';
import { addDueFollowups, buildExamReviewItems, chooseImmediateItems } from '../js/p19-remediation.js';
import { onFailure } from '../js/p19-remediation-core.js';

const c1 = { id: 'c1', importance: 'core' };
const c2 = { id: 'c2', importance: 'important' };
const cardA = { id: 'cardA', conceptId: 'c1' };
const cardB = { id: 'cardB', conceptId: 'c1' };
const cardC = { id: 'cardC', conceptId: 'c2' };
const qAnchor = { id: 'qAnchor', type: 'single_choice', conceptIds: ['c1'], options: [], correct: [] };
const qTransfer = { id: 'qTransfer', type: 'multiple_choice', conceptIds: ['c1'], options: [], correct: [] };
const qApp = { id: 'qApp', type: 'clinical_case', conceptIds: ['c1'], options: [], correctText: 'x' };
const qOther = { id: 'qOther', type: 'single_choice', conceptIds: ['c2'], options: [], correct: [] };
const questions = [qAnchor, qTransfer, qApp, qOther];

const engine = {
  content: {
    cards: [cardA, cardB, cardC],
    questions,
    cardById: new Map([[cardA.id, cardA], [cardB.id, cardB], [cardC.id, cardC]]),
    questionById: new Map(questions.map((q) => [q.id, q])),
    cardsByConcept: new Map([['c1', [cardA, cardB]], ['c2', [cardC]]])
  },
  cardStates: new Map(),
  questionHistory: new Map(),
  mistakes: new Map(),
  weaknessScore(id) { return id === 'c1' ? 0.9 : 0.2; },
  priorityForCard(card) { return card.id === 'cardB' ? 1 : 0.5; },
  prepareQuestionItem(q) { return { kind: 'question', id: q.id, variant: {} }; },
  examWeakConceptIds() { return ['c1']; }
};

const mistake = {
  id: 'm1', contentType: 'question', contentId: 'qAnchor', conceptIds: ['c1'],
  occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), resolved: false,
  p19: onFailure(null, new Date(Date.now() - 2 * 86_400_000))
};
engine.mistakes.set(mistake.id, mistake);

let session = {
  id: 's1', currentIndex: 0,
  items: [
    { kind: 'question', id: 'qAnchor' },
    { kind: 'card', id: 'cardC' },
    { kind: 'question', id: 'qOther' }
  ]
};
let immediate = chooseImmediateItems(engine, session, mistake, ['c1'], 0);
assert.equal(immediate.length, 3);
assert.equal(immediate[0].id, 'cardB');
assert.equal(immediate[0].remediation.stage, 'support');
assert.equal(immediate[1].id, 'qTransfer');
assert.equal(immediate[1].remediation.stage, 'transfer');
assert.equal(immediate[2].id, 'qApp');
assert.equal(immediate[2].remediation.stage, 'application');
assert.ok(immediate.every((x) => x.id !== 'qAnchor'), 'exact failed question must not be injected as repair');

session = {
  id: 's2', currentIndex: 0,
  items: [
    { kind: 'question', id: 'qAnchor' },
    { kind: 'card', id: 'cardB' },
    { kind: 'card', id: 'cardC' }
  ]
};
immediate = chooseImmediateItems(engine, session, mistake, ['c1'], 0);
assert.ok(!immediate.some((x) => x.kind === 'card' && x.id === 'cardB'), 'support card already in the session must not be duplicated');
assert.ok(immediate.some((x) => x.id === 'qTransfer'));
assert.ok(immediate.some((x) => x.id === 'qApp'));

mistake.p19.nextFollowupAt = new Date(Date.now() - 60_000).toISOString();
mistake.p19.lastFollowupQueuedDay = null;
const base = [
  { kind: 'card', id: 'cardC' },
  { kind: 'question', id: 'qOther', variant: {} },
  { kind: 'card', id: 'cardC-virtual' }
];
engine.content.cardById.set('cardC-virtual', { id: 'cardC-virtual', conceptId: 'c2' });
engine.cardStates.set('cardC', { reps: 2, due: new Date(Date.now() - 60_000).toISOString() });
engine.cardStates.set('cardC-virtual', { reps: 0 });
const withFollowup = addDueFollowups(engine, base, 'seed');
assert.equal(withFollowup.length, base.length, 'follow-up must not increase prescribed workload');
assert.ok(withFollowup.some((x) => x.remediation?.stage === 'spaced_followup'));
assert.ok(withFollowup.some((x) => x.kind === 'card' && x.id === 'cardC'), 'due review must be protected');

const attempt = { id: 'exam1', results: [{ id: 'qAnchor', correct: false }] };
const review = buildExamReviewItems(engine, attempt);
assert.ok(review.length >= 2);
assert.ok(review.some((x) => x.kind === 'card'));
assert.ok(review.some((x) => x.kind === 'question'));
assert.ok(!review.some((x) => x.id === 'qAnchor'), 'exam review must not simply repeat the exact failed question');
assert.ok(review.length <= 30);

console.log(JSON.stringify({ phase: 'P19-runtime', tests: 18, errors: 0 }, null, 2));
