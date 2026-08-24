import assert from 'node:assert/strict';
import { buildAdaptiveSelection } from '../js/p17-study-mix.js';

const concepts = Array.from({ length: 30 }, (_, i) => ({ id: `k${i}`, importance: i < 20 ? 'core' : 'important' }));
const cards = concepts.map((concept, i) => ({ id: `c${i}`, conceptId: concept.id }));
const questions = [];
for (let i = 0; i < 18; i += 1) questions.push({ id: `q${i}`, type: 'single_choice', conceptIds: [`k${i}`], options: [{ id: 'a' }, { id: 'b' }], correct: ['a'] });
for (let i = 0; i < 10; i += 1) questions.push({ id: `a${i}`, type: 'clinical_case', conceptIds: [`k${i}`] });

const content = {
  chapters: [{ id: 'ch1' }], concepts, cards, questions,
  cardById: new Map(cards.map((x) => [x.id, x])),
  questionById: new Map(questions.map((x) => [x.id, x])),
  conceptById: new Map(concepts.map((x) => [x.id, x])),
  cardsByConcept: new Map(concepts.map((c, i) => [c.id, [cards[i]]])),
  conceptChapter: () => ({ id: 'ch1' })
};
const engine = {
  content,
  cardStates: new Map(),
  conceptStates: new Map(),
  questionHistory: new Map(),
  weaknessScore: (id) => {
    const cs = engine.conceptStates.get(id);
    const wrong = (cs?.flashWrong || 0) + (cs?.practiceWrong || 0) + (cs?.examWrong || 0);
    const right = (cs?.flashCorrect || 0) + (cs?.practiceCorrect || 0) + (cs?.examCorrect || 0);
    return wrong ? wrong / (wrong + right + 1) : 0;
  },
  priorityForCard: (card) => concepts.find((x) => x.id === card.conceptId)?.importance === 'core' ? 1 : 0.5,
  prepareQuestionItem: (q) => ({ kind: 'question', id: q.id, variant: {} })
};
const base = cards.slice(0, 19).map((card) => ({ kind: 'card', id: card.id }))
  .concat([{ kind: 'question', id: 'q0' }, { kind: 'question', id: 'q1' }, { kind: 'question', id: 'q2' }]);

const fresh = buildAdaptiveSelection(engine, base, { target: 22, seed: 'fresh' });
assert.equal(fresh.result.length, 22);
assert.equal(fresh.result.filter((x) => x.kind === 'question').length, 4);
assert(fresh.result.some((x) => x.kind === 'question' && x.id.startsWith('a')));

for (let i = 0; i < 18; i += 1) {
  engine.cardStates.set(`c${i}`, { reps: 2, due: '2020-01-01T00:00:00Z' });
  engine.conceptStates.set(`k${i}`, { flashCorrect: 3, flashWrong: 0, flashHard: 0, practiceCorrect: 2, practiceWrong: 0, examCorrect: 1, examWrong: 0 });
}
const backlog = buildAdaptiveSelection(engine, base, { target: 22, seed: 'backlog' });
assert(backlog.result.filter((x) => x.kind === 'card').length >= 18);
assert(backlog.result.filter((x) => x.kind === 'question').length <= 4);

engine.cardStates.clear();
engine.conceptStates.clear();
for (let i = 0; i < 25; i += 1) {
  engine.cardStates.set(`c${i}`, { reps: 2, due: '2099-01-01T00:00:00Z' });
  engine.conceptStates.set(`k${i}`, {
    flashCorrect: 5, flashWrong: i < 5 ? 2 : 0, flashHard: 0,
    practiceCorrect: 0, practiceWrong: 0, examCorrect: 0, examWrong: 0,
    lastFailureAt: i < 5 ? new Date().toISOString() : null
  });
}
const established = buildAdaptiveSelection(engine, base, { target: 22, seed: 'established' });
assert(established.result.filter((x) => x.kind === 'question').length >= 8);
assert(established.result.filter((x) => x.kind === 'question' && x.id.startsWith('a')).length >= 2);
for (let i = 2; i < established.result.length; i += 1) {
  assert(!(established.result[i].kind === 'question' && established.result[i - 1].kind === 'question' && established.result[i - 2].kind === 'question'));
}

console.log(JSON.stringify({ phase: 'P17', runtimeHarnessTests: 8, errors: 0 }, null, 2));
