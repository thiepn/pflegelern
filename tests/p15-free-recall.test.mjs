import assert from 'node:assert/strict';
import {
  classifyRecallPrompt,
  normalizeRecallPrompt,
  recallDraftKey,
  shouldOfferFreeRecall
} from '../js/p15-free-recall.js';

assert.equal(classifyRecallPrompt('Was ist eine Thrombose?'), 'definition');
assert.equal(classifyRecallPrompt('Wie heißt eine Herzfrequenz unter 60/min?'), 'definition');
assert.equal(classifyRecallPrompt('Welche drei Faktoren umfasst die Virchow-Trias?'), 'enumeration');
assert.equal(classifyRecallPrompt('Ab welcher Herzfrequenz spricht man von Bradykardie?'), 'threshold');
assert.equal(classifyRecallPrompt('Wo treten venöse Thrombosen besonders häufig auf?'), 'location');
assert.equal(shouldOfferFreeRecall('Warum darf der Erwachsenen-Grenzwert nicht auf Kinder übertragen werden?'), false);
assert.equal(shouldOfferFreeRecall('Beschreibe ausführlich den Ablauf einer komplexen Pflegesituation.'), false);
assert.equal(shouldOfferFreeRecall(''), false);
assert.equal(normalizeRecallPrompt('  Welche   drei\nFaktoren?  '), 'Welche drei Faktoren?');
assert.equal(recallDraftKey('card-21-5-virchow'), 'pflegelern:p15:recall:card-21-5-virchow');
assert.equal(recallDraftKey(''), '');

console.log(JSON.stringify({ phase: 'P15', tests: 11, errors: 0 }, null, 2));
