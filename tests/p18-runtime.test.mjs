import assert from 'node:assert/strict';
import { CardState, Rating } from '../js/fsrs.js';
import { StudyEngine } from '../js/study-engine.js';
import { installMasteryModelPatches } from '../js/p18-mastery.js';
import { recordMasteryEvidence } from '../js/p18-mastery-core.js';

installMasteryModelPatches();

const concept = { id: 'c1', importance: 'core' };
const card = { id: 'card1', conceptId: 'c1' };
const objective = { id: 'q1', type: 'single_choice', conceptIds: ['c1'] };
const application = { id: 'q2', type: 'clinical_case', conceptIds: ['c1'] };
const content = {
  concepts: [concept],
  cards: [card],
  questions: [objective, application],
  cardById: new Map([[card.id, card]]),
  conceptById: new Map([[concept.id, concept]]),
  questionById: new Map([[objective.id, objective], [application.id, application]]),
  cardsByConcept: new Map([[concept.id, [card]]]),
  questionsByConcept: new Map([[concept.id, [objective, application]]),
  chapterById: new Map(),
  sectionById: new Map()
};

const engine = new StudyEngine(content);
engine.cardStates.set(card.id, {
  cardId: card.id,
  reps: 4,
  state: CardState.REVIEW,
  lastRating: Rating.GOOD,
  stability: 12,
  due: new Date(Date.now() + 5 * 86_400_000).toISOString()
});
engine.conceptStates.set(concept.id, {
  conceptId: concept.id,
  flashCorrect: 5,
  flashWrong: 0,
  flashHard: 0,
  practiceCorrect: 0,
  practiceWrong: 0,
  examCorrect: 0,
  examWrong: 0,
  extraPractice: 0,
  lastFailureAt: null,
  lastSuccessAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

let model = engine.masteryModel(concept.id);
assert.equal(model.safe, false, 'objective/application-eligible concept must not become safe from cards alone');
assert.equal(engine.masteryLabel(concept.id), 'Noch üben');
assert.equal(engine.conceptMastery(concept.id), model.score);

engine.questionHistory.set(objective.id, { questionId: objective.id, attempts: 4, correct: 4, incorrect: 0, lastSeenAt: new Date().toISOString() });
model = engine.masteryModel(concept.id);
assert.ok(model.channels.objective > 0.5, 'legacy objective history should be recognized conservatively');
assert.equal(model.eligibleObjective, true);
assert.equal(model.eligibleApplication, true);

let evidence = null;
for (const day of ['2026-08-01', '2026-08-04', '2026-08-08']) {
  evidence = recordMasteryEvidence(evidence, { channel: 'objective', outcome: 'success', day, at: `${day}T10:00:00Z` });
  evidence = recordMasteryEvidence(evidence, { channel: 'cued', outcome: 'success', day, at: `${day}T10:05:00Z`, spaced: true });
}
evidence = recordMasteryEvidence(evidence, { channel: 'application', outcome: 'success', day: '2026-08-09', at: '2026-08-09T10:00:00Z' });
const state = engine.conceptState(concept.id);
state.p18Evidence = evidence;
engine.conceptStates.set(concept.id, state);
model = engine.masteryModel(concept.id);
assert.ok(model.score > 0.72, 'multi-channel evidence should produce a high mastery score');
assert.equal(model.level, 'spaced_stability');
assert.equal(model.label, 'Sicher');

state.lastFailureAt = new Date().toISOString();
engine.conceptStates.set(concept.id, state);
model = engine.masteryModel(concept.id);
assert.equal(model.safe, false, 'recent failure must immediately prevent Sicher');
assert.equal(model.label, 'Noch üben');

assert.equal(typeof engine.p18LegacyConceptMastery, 'function', 'legacy mastery implementation should remain accessible for audit comparison');

console.log(JSON.stringify({ phase: 'P18-runtime', tests: 12, errors: 0 }, null, 2));
