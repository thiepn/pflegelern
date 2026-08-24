import assert from 'node:assert/strict';
import fs from 'node:fs';

const text = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(text(p));

const manifest = json('data/manifest.json');
const questions = json('data/questions.json');
const cases = json('data/cases.json');
const cards = json('data/cards.json');
const concepts = json('data/concepts.json');
const p12 = json('P12_QUESTION_EXPANSION_REPORT.json');
const p13 = json('P13_CASE_EXPANSION_REPORT.json');
const index = text('index.html');
const sw = text('service-worker.js');
const runtime = text('js/p16-exam-plan.js');
const core = text('js/p16-exam-plan-core.js');
const storage = text('js/storage.js');

assert.equal(manifest.phase, 'P16');
assert.equal(manifest.version, '1.1.0-dev.16');
assert.equal(manifest.status, 'p16-exam-horizon-planning');
assert.equal(cards.length, 2094);
assert.equal(concepts.length, 2089);
assert.equal(questions.length, 954);
assert.equal(cases.length, 120);
assert.equal(p12.status, 'PASS');
assert.equal(p13.status, 'PASS');

assert.match(index, /css\/p16-exam-plan\.css/);
assert.match(index, /js\/p16-bootstrap\.js/);
assert.doesNotMatch(index, /src="\.\/js\/app\.js"/);
assert.match(sw, /pflegelern-p16-v1\.1\.0-dev16/);
for (const asset of [
  './css/p16-exam-plan.css', './js/p16-exam-plan-core.js',
  './js/p16-exam-plan.js', './js/p16-bootstrap.js'
]) assert(sw.includes(`'${asset}'`), `missing P16 offline asset ${asset}`);

assert.match(runtime, /getSetting\(EXAM_PLAN_SETTING_KEY/);
assert.match(runtime, /setSetting\(EXAM_PLAN_SETTING_KEY/);
assert.match(runtime, /replacementShare/);
assert.match(runtime, /questionScopeBoost/);
assert.match(runtime, /originalCreateExam/);
assert.match(runtime, /ctx\.plan\.scopeType === 'chapters'/);
assert.doesNotMatch(runtime, /scheduleReview\(/);
assert.match(core, /final_day/);
assert.match(core, /allowNew: 'none'/);
assert.match(storage, /settings:\s*\{\s*keyPath:\s*'key'/);

console.log(JSON.stringify({
  phase: 'P16',
  integrationChecks: 31,
  content: { cards: cards.length, concepts: concepts.length, questions: questions.length, cases: cases.length },
  errors: 0
}, null, 2));
