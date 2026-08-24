import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(read(p));

const manifest = json('data/manifest.json');
const cards = json('data/cards.json');
const concepts = json('data/concepts.json');
const questions = json('data/questions.json');
const cases = json('data/cases.json');
const bootstrap = read('js/p18-bootstrap.js');
const runtime = read('js/p19-remediation.js');
const migration = read('js/p19-remediation-migration.js');
const core = read('js/p19-remediation-core.js');
const sw = read('service-worker.js');
const index = read('index.html');

assert.equal(manifest.phase, 'P19');
assert.equal(manifest.version, '1.1.0-dev.19');
assert.equal(manifest.status, 'p19-weakness-remediation-engine');
assert.equal(concepts.length, 2089);
assert.equal(cards.length, 2094);
assert.equal(questions.length, 954);
assert.equal(cases.length, 120);

assert.match(bootstrap, /installExamPlanPatches/);
assert.match(bootstrap, /installAdaptiveMixPatches/);
assert.match(bootstrap, /installMasteryModelPatches/);
assert.match(bootstrap, /installRemediationMigrationPatch/);
assert.match(bootstrap, /installWeaknessRemediationPatches/);
assert.ok(bootstrap.indexOf('installMasteryModelPatches') < bootstrap.indexOf('installWeaknessRemediationPatches'));
assert.match(index, /\.\/js\/p18-bootstrap\.js/);

assert.match(runtime, /p19LegacyInjectReinforcement/);
assert.match(runtime, /spaced_followup/);
assert.match(runtime, /exam_transfer/);
assert.match(runtime, /exam_application/);
assert.match(runtime, /lastFollowupQueuedDay/);
assert.match(runtime, /isDue/);
assert.doesNotMatch(runtime, /scheduleReview/);
assert.doesNotMatch(runtime, /db\.put\(['"]cardState/);
assert.doesNotMatch(runtime, /db\.put\(['"]questionHistory/);
assert.match(runtime, /sameAnchor/);
assert.match(core, /distinctDays >= 2/);
assert.match(core, /independentEvidence >= 1\.5/);
assert.match(core, /next\.independentEvidence = 0/);
assert.match(migration, /mistake\.p19 = onFailure/);

assert.match(sw, /pflegelern-p19-v1\.1\.0-dev19/);
assert.match(sw, /\.\/js\/p19-remediation-core\.js/);
assert.match(sw, /\.\/js\/p19-remediation-migration\.js/);
assert.match(sw, /\.\/js\/p19-remediation\.js/);
assert.match(sw, /\.\/js\/p18-mastery\.js/);
assert.match(sw, /\.\/js\/p17-study-mix\.js/);
assert.match(sw, /\.\/js\/p16-exam-plan\.js/);

assert.ok(manifest.notes.some((x) => x.includes('P19 converts mistakes into bounded concept-level repair sequences')));
assert.ok(!manifest.notes.some((x) => /current clinical guidance/i.test(x) && /P19/i.test(x)));

console.log(JSON.stringify({ phase: 'P19-integration', tests: 36, errors: 0 }, null, 2));
