import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  QUESTION_INPUT_TYPES,
  mergeStudyTextDraft,
  normalizeDraftRecord,
  studyDraftStorageKey,
  validateQuestionInputContract
} from '../js/p25c-input-core.js';

const questions = JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
assert.equal(questions.length, 1299, 'P25C must preserve the certified P25A/P25B question bank');

const invalid = [];
const counts = Object.fromEntries(QUESTION_INPUT_TYPES.map((type) => [type, 0]));
for (const question of questions) {
  const result = validateQuestionInputContract(question);
  counts[result.type] = (counts[result.type] || 0) + 1;
  if (!result.valid) invalid.push({ id: question.id, type: question.type, issues: result.issues });
}

if (invalid.length) console.error('Invalid input contracts:', JSON.stringify(invalid.slice(0, 30), null, 2));
assert.equal(invalid.length, 0, `${invalid.length} questions cannot be presented with a reliable answer control`);
for (const type of QUESTION_INPUT_TYPES) assert.ok(counts[type] > 0, `missing question type ${type}`);

assert.equal(studyDraftStorageKey('session-1'), 'pflegelern:p25c:study-text:session-1');
assert.deepEqual(normalizeDraftRecord('Hallo', 4), { index: 4, text: 'Hallo', updatedAt: null });
assert.deepEqual(normalizeDraftRecord({ index: 3, text: 'Antwort', updatedAt: 'x' }), { index: 3, text: 'Antwort', updatedAt: 'x' });

const session = { currentIndex: 2, responses: { 2: { checked: false } } };
assert.equal(mergeStudyTextDraft(session, { index: 2, text: 'Sofort gespeichert' }), true);
assert.equal(session.responses['2'].text, 'Sofort gespeichert');
assert.equal(mergeStudyTextDraft(session, { index: 2, text: 'Sofort gespeichert' }), false);
assert.equal(session.responses['2'].checked, false, 'draft merge must preserve answer state');

console.log('P25C input contract PASS', counts);
