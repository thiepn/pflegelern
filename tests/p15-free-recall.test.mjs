import assert from 'node:assert/strict';
import {
  classifyRecallPrompt,
  hasOverconfidenceEvidence,
  normalizeRecallPrompt,
  recallDraftKey,
  selectFreeRecallEligibility,
  shouldOfferFreeRecall
} from '../js/p15-free-recall.js';

assert.equal(classifyRecallPrompt('Was ist eine Thrombose?'), 'definition');
assert.equal(classifyRecallPrompt('Wie heißt eine Herzfrequenz unter 60/min?'), 'definition');
assert.equal(classifyRecallPrompt('Welche drei Faktoren umfasst die Virchow-Trias?'), 'enumeration');
assert.equal(classifyRecallPrompt('Ab welcher Herzfrequenz spricht man von Bradykardie?'), 'threshold');
assert.equal(classifyRecallPrompt('Wo treten venöse Thrombosen besonders häufig auf?'), 'location');
assert.equal(classifyRecallPrompt('Warum ist diese Regel wichtig?'), 'explanation');
assert.equal(classifyRecallPrompt('Beschreibe ausführlich alle denkbaren Aspekte.'), null);
assert.equal(hasOverconfidenceEvidence({ flashCorrect: 2, practiceWrong: 1 }), true);
assert.equal(hasOverconfidenceEvidence({ flashCorrect: 1, examWrong: 2 }), false);
assert.equal(selectFreeRecallEligibility({
  questionText: 'Welche drei Faktoren umfasst die Virchow-Trias?',
  card: { type: 'enumeration' },
  concept: { type: 'summary', importance: 'important' }
}).eligible, true);
assert.equal(selectFreeRecallEligibility({
  questionText: 'Warum ist dieser Zusammenhang relevant?',
  concept: { type: 'principle', importance: 'core' }
}).eligible, true);
assert.equal(selectFreeRecallEligibility({
  questionText: 'Was ist dieser Begriff?',
  concept: { type: 'summary', importance: 'detail' }
}).eligible, true);
assert.equal(selectFreeRecallEligibility({
  questionText: 'Ein offener Hinweis ohne direkte Abruffrage?',
  concept: { type: 'summary', importance: 'important' },
  weaknessScore: 0.55
}).eligible, true);
assert.equal(selectFreeRecallEligibility({
  questionText: 'Ein offener Hinweis ohne direkte Abruffrage?',
  concept: { type: 'summary', importance: 'important' },
  weaknessScore: 0.1
}).eligible, false);
assert.equal(shouldOfferFreeRecall(''), false);
assert.equal(normalizeRecallPrompt('  Welche   drei\nFaktoren?  '), 'Welche drei Faktoren?');
assert.equal(recallDraftKey('card-21-5-virchow'), 'pflegelern:p15:recall:card-21-5-virchow');
assert.equal(recallDraftKey(''), '');

console.log(JSON.stringify({ phase: 'P15', tests: 18, errors: 0 }, null, 2));
