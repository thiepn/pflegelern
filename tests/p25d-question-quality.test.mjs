import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assessQuestionQuality,
  balancedSingleChoiceOrder,
  correctOptionIndex,
  summarizeQuestionQuality
} from '../js/p25d-question-quality-core.js';

const questions = JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
assert.equal(questions.length, 1299, 'P25D must not change the certified 1,299-question bank');

const summary = summarizeQuestionQuality(questions);
assert.equal(summary.total, 1299);
assert.equal(summary.strong + summary.usable + summary.weak, 1299);
assert.ok(summary.selectable > 0);

const optionQuestions = questions.filter((q) => ['single_choice', 'multiple_choice'].includes(q.type));
const selectableOptionQuestions = optionQuestions.filter((q) => assessQuestionQuality(q).selectable);
assert.ok(selectableOptionQuestions.length / optionQuestions.length >= 0.70, 'quality gate must keep a broad usable option-question pool');

const allCorrectMc = optionQuestions.filter((q) => q.type === 'multiple_choice' && (q.correct || []).length === (q.options || []).length);
for (const q of allCorrectMc) {
  const quality = assessQuestionQuality(q);
  assert.equal(quality.selectable, false, `${q.id} all-correct MC must not pass automatic quality gate`);
  assert.ok(quality.blockers.includes('multiple-choice-all-correct'));
}

const duplicateSample = {
  id: 'duplicate', type: 'single_choice', prompt: 'Test?', conceptIds: ['x'],
  options: [{ id: 'a', text: 'Gleich' }, { id: 'b', text: ' gleich ' }, { id: 'c', text: 'Anders' }], correct: ['c']
};
assert.equal(assessQuestionQuality(duplicateSample).selectable, false);
assert.ok(assessQuestionQuality(duplicateSample).blockers.includes('duplicate-or-empty-option-text'));

const giveawaySample = {
  id: 'giveaway', type: 'single_choice', prompt: 'Welche Aussage passt?', conceptIds: ['x'],
  options: [
    { id: 'a', text: 'Kurz' },
    { id: 'b', text: 'Dies ist eine außergewöhnlich lange und offensichtlich anders formulierte richtige Antwort, die sich allein durch ihre Länge verrät.' },
    { id: 'c', text: 'Nein' },
    { id: 'd', text: 'Falsch' }
  ], correct: ['b']
};
assert.ok(assessQuestionQuality(giveawaySample).warnings.includes('correct-answer-length-giveaway'));

const singles = questions.filter((q) => q.type === 'single_choice' && (q.options || []).length >= 3 && (q.correct || []).length === 1);
for (const q of singles.slice(0, 100)) {
  const a = balancedSingleChoiceOrder(q, 'p25d-deterministic');
  const b = balancedSingleChoiceOrder(q, 'p25d-deterministic');
  assert.deepEqual(a, b, `${q.id} option order must be deterministic for a seed`);
  assert.equal(new Set(a).size, (q.options || []).length, `${q.id} must preserve every option exactly once`);
  assert.ok(correctOptionIndex(q, a) >= 0, `${q.id} correct option must remain present`);
}

const fourOptionSingles = singles.filter((q) => (q.options || []).length === 4);
const slots = [0, 0, 0, 0];
for (const q of fourOptionSingles) {
  const order = balancedSingleChoiceOrder(q, 'p25d-slot-audit');
  slots[correctOptionIndex(q, order)] += 1;
}
const slotMin = Math.min(...slots);
const slotMax = Math.max(...slots);
assert.ok(slotMin > 0, 'every answer slot must be used');
assert.ok(slotMax - slotMin <= Math.max(12, fourOptionSingles.length * 0.12), `correct-answer slots too imbalanced: ${slots.join(',')}`);

const varyingQuestion = fourOptionSingles[0];
if (varyingQuestion) {
  const positions = new Set(Array.from({ length: 12 }, (_, i) => correctOptionIndex(varyingQuestion, balancedSingleChoiceOrder(varyingQuestion, `seed-${i}`))));
  assert.ok(positions.size >= 3, 'same question should not stay in one habitual answer position across sessions');
}

console.log(JSON.stringify({
  phase: 'P25D',
  total: questions.length,
  optionQuestions: optionQuestions.length,
  selectableOptionQuestions: selectableOptionQuestions.length,
  allCorrectMultipleChoiceBlocked: allCorrectMc.length,
  qualitySummary: summary,
  fourOptionSingleChoiceSlots: slots
}, null, 2));
console.log('P25D question-quality tests passed.');
