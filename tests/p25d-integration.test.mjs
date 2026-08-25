import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyQuestionQualityGuard } from '../js/p25d-question-quality.js';
import { assessQuestionQuality } from '../js/p25d-question-quality-core.js';

const questions = JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
const byId = new Map(questions.map((q) => [q.id, q]));

const weak = questions.find((q) => ['single_choice', 'multiple_choice'].includes(q.type) && !assessQuestionQuality(q).selectable);
const strongSameType = weak && questions.find((q) => q.type === weak.type && q.id !== weak.id && assessQuestionQuality(q).selectable);

if (weak && strongSameType) {
  const chapterByConcept = new Map();
  for (const id of weak.conceptIds || []) chapterByConcept.set(id, { id: 'shared' });
  for (const id of strongSameType.conceptIds || []) chapterByConcept.set(id, { id: 'shared' });
  const engine = {
    content: {
      questions,
      questionById: byId,
      conceptChapter(id) { return chapterByConcept.get(id) || { id: 'other' }; }
    },
    questionHistory: new Map(),
    weaknessScore() { return 0; },
    prepareQuestionItem(question) { return { kind: 'question', id: question.id, variant: {} }; }
  };
  const result = applyQuestionQualityGuard(engine, [{ kind: 'question', id: weak.id, variant: {} }], {
    seed: 'p25d-integration',
    candidateQuestions: [weak, strongSameType]
  });
  assert.equal(result.replacements, 1);
  assert.equal(result.retainedWeak, 0);
  assert.equal(result.items[0].id, strongSameType.id);
}

const runtime = fs.readFileSync(new URL('../js/p25d-question-quality.js', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../js/p18-bootstrap.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../data/manifest.json', import.meta.url), 'utf8'));

assert.match(runtime, /previousPrepare/);
assert.match(runtime, /balancedSingleChoiceOrder/);
assert.match(runtime, /previousSelectRecommended/);
assert.match(runtime, /previousCreateScopedSession/);
assert.match(runtime, /previousCreateExam/);
assert.match(runtime, /p25dQuestionQualitySummary/);
assert.match(bootstrap, /installQuestionQualityPatches/);
assert.ok(bootstrap.indexOf('installMockExamPatches();') < bootstrap.indexOf('installQuestionQualityPatches();'), 'P25D must wrap the final P20 exam creator');
assert.ok(bootstrap.indexOf('installQuestionRepetitionPatches();') < bootstrap.indexOf('installQuestionQualityPatches();'), 'P25D must run after P25B repetition control');

// Phase-forward regression contract: later phases are expected to change the current
// cache/manifest version, but the P25D runtime must remain installed and offline-cached.
assert.match(sw, /\.\/js\/p25d-question-quality-core\.js/);
assert.match(sw, /\.\/js\/p25d-question-quality\.js/);
assert.ok(Array.isArray(manifest.notes) && manifest.notes.some((note) => String(note).startsWith('P25D adds a non-destructive question-quality gate')), 'manifest must preserve the P25D compatibility contract');
assert.equal(questions.length, 1299);

console.log('P25D integration contract passed.');
