import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
let tests = 0;
const check = (condition, message) => { tests += 1; assert.ok(condition, message); };

const index = read('index.html');
const sw = read('service-worker.js');
const runtime = read('js/p18-mastery.js');
const core = read('js/p18-mastery-core.js');
const bootstrap = read('js/p18-bootstrap.js');
const p15 = read('js/p15-free-recall.js');
const storage = read('js/storage.js');
const manifest = json('data/manifest.json');
const cards = json('data/cards.json');
const concepts = json('data/concepts.json');
const questions = json('data/questions.json');
const cases = json('data/cases.json');

check(index.includes('./js/p18-bootstrap.js'), 'index must load P18 bootstrap');
check(index.includes('./js/p14-calibration.js'), 'P14 calibration must remain active');
check(index.includes('./js/p15-free-recall.js'), 'P15 free recall must remain active');
check(!index.includes('./js/p17-bootstrap.js'), 'P17 bootstrap must be superseded by P18 bootstrap');

check(bootstrap.includes('installExamPlanPatches'), 'P16 planner patches must still install');
check(bootstrap.includes('installAdaptiveMixPatches'), 'P17 adaptive mix patches must still install');
check(bootstrap.includes('installMasteryModelPatches'), 'P18 mastery patches must install');
check(bootstrap.indexOf('installMasteryModelPatches') < bootstrap.indexOf("import('./app.js')"), 'P18 patches must install before app module');

check(runtime.includes('recordCardReview'), 'P18 must capture card evidence');
check(runtime.includes('recordQuestionResult'), 'P18 must capture question evidence');
check(runtime.includes("channel: 'productive'"), 'P18 must track productive recall separately');
check(runtime.includes("'application'"), 'P18 must track application separately');
check(runtime.includes("'exam'"), 'P18 must track exam evidence separately');
check(runtime.includes('masteryLabel'), 'P18 must expose simple learner-facing mastery label');
check(runtime.includes('p18LegacyConceptMastery'), 'legacy mastery implementation must remain available for audit comparison');
check(runtime.includes('bridgeCardIdentity'), 'P18 must bridge the current study card ID for P15/P18 recall evidence');
check(runtime.includes('pendingProductiveRecall'), 'typed productive recall must survive P15 draft cleanup long enough to be recorded');

check(core.includes('spaced_stability'), 'P18 hierarchy must include spaced stability');
check(core.includes('objective_retrieval'), 'P18 hierarchy must include objective retrieval');
check(core.includes('productive_recall'), 'P18 hierarchy must include productive recall');
check(core.includes('distinctDays'), 'same-session resistance must use distinct study days');
check(core.includes('eligibleObjective'), 'mastery must know when independent assessment exists');
check(core.includes("'Neu'"), 'learner-facing Neu label must exist');
check(core.includes("'Noch üben'"), 'learner-facing Noch üben label must exist');
check(core.includes("'Sicher'"), 'learner-facing Sicher label must exist');

check(p15.includes("DRAFT_PREFIX = 'pflegelern:p15:recall:'"), 'P15 draft namespace must remain stable for P18 evidence bridge');
check(storage.includes("const DB_VERSION = 2"), 'P18 must not require an IndexedDB schema migration');
check(storage.includes('conceptState'), 'concept state store must remain the persistence target');

check(sw.includes("pflegelern-p18-v1.1.0-dev18"), 'P18 service-worker cache must be versioned');
check(sw.includes('./js/p18-mastery-core.js'), 'P18 core must be available offline');
check(sw.includes('./js/p18-mastery.js'), 'P18 runtime must be available offline');
check(sw.includes('./js/p18-bootstrap.js'), 'P18 bootstrap must be available offline');

check(manifest.phase === 'P18', 'manifest phase must be P18');
check(manifest.version === '1.1.0-dev.18', 'manifest version must be dev.18');
check(manifest.status === 'p18-mastery-model-v2', 'manifest status must identify P18');

check(concepts.length === 2089, `concept bank changed unexpectedly: ${concepts.length}`);
check(cards.length === 2094, `card bank changed unexpectedly: ${cards.length}`);
check(questions.length === 954, `question bank changed unexpectedly: ${questions.length}`);
check(cases.length === 120, `case bank changed unexpectedly: ${cases.length}`);

console.log(JSON.stringify({ phase: 'P18-integration', tests, errors: 0 }, null, 2));
