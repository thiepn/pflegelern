import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const json = (rel) => JSON.parse(text(rel));

const manifest = json('data/manifest.json');
assert.equal(manifest.phase, 'P15');
assert.equal(manifest.version, '1.1.0-dev.15');
assert.equal(manifest.status, 'p15-selective-free-recall');

const expected = { chapters: 66, sections: 1361, concepts: 2089, cards: 2094, questions: 954, cases: 120 };
for (const [name, count] of Object.entries(expected)) assert.equal(json(`data/${name}.json`).length, count, `${name} count changed`);

const index = text('index.html');
assert.match(index, /css\/p14-calibration\.css/);
assert.match(index, /css\/p15-free-recall\.css/);
assert.match(index, /js\/p14-calibration\.js/);
assert.match(index, /js\/p15-free-recall\.js/);

const app = text('js/app.js');
for (const label of ['Nicht gewusst', 'Unsicher', 'Gewusst']) assert.ok(app.includes(label), `missing protected rating: ${label}`);

const p15 = text('js/p15-free-recall.js');
assert.ok(p15.includes('selectFreeRecallEligibility'));
assert.ok(p15.includes("concept?.importance === 'core'"));
assert.ok(p15.includes('weaknessScore'));
assert.ok(p15.includes('hasOverconfidenceEvidence'));
assert.ok(p15.includes("concept?.type === 'definition'"));
assert.ok(p15.includes("['sequence', 'procedure']"));
assert.ok(p15.includes('sessionStorage'));
assert.ok(!p15.includes('recordCardReview('), 'P15 must not fabricate an FSRS review');
assert.ok(!p15.includes('scheduleReview('), 'P15 must not mutate FSRS scheduling directly');
assert.ok(!p15.includes('autofocus'), 'P15 must not force the mobile keyboard open');
assert.ok(p15.includes('Keine automatische Bewertung'));

const sw = text('service-worker.js');
assert.ok(sw.includes("pflegelern-p15-v1.1.0-dev15"));
for (const asset of ['./css/p15-free-recall.css', './js/p15-free-recall.js']) assert.ok(sw.includes(asset), `service worker missing ${asset}`);

const report = json('P15_FREE_RECALL_REPORT.json');
assert.equal(report.phase, 'P15');
assert.equal(report.status, 'PASS');
assert.equal(report.validation.pureFreeRecallTests, 18);
assert.equal(report.validation.contentBankMutated, false);
assert.equal(report.validation.fsrsMutated, false);

console.log(JSON.stringify({ phase: 'P15', integrationTests: 31, errors: 0, counts: expected }, null, 2));
