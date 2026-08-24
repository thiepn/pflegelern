import assert from 'node:assert/strict';
import {
  OBJECTIVE_TYPES, buildExamBlueprint, isExamAnswered, normalizeExamConfig,
  objectiveQuestionType, performanceTier, summarizeBreakdown, typeTargets
} from '../js/p20-exam-core.js';

let tests = 0;
const check = (fn) => { fn(); tests += 1; };

check(() => assert.deepEqual(OBJECTIVE_TYPES, ['single_choice','multiple_choice','ordering','matching']));
check(() => assert.equal(objectiveQuestionType('single_choice'), true));
check(() => assert.equal(objectiveQuestionType('clinical_case'), false));

const quick = normalizeExamConfig({ mode: 'quick' }, 954);
check(() => assert.equal(quick.count, 10));
check(() => assert.equal(quick.timerEnabled, false));
check(() => assert.equal(quick.durationMinutes, null));
check(() => assert.equal(quick.passThreshold, 60));
check(() => assert.equal(quick.weakness, false));

const bounded = normalizeExamConfig({ count: 500, timerEnabled: true, durationMinutes: 999, passThreshold: 0 }, 70);
check(() => assert.equal(bounded.requestedCount, 100));
check(() => assert.equal(bounded.count, 70));
check(() => assert.equal(bounded.durationMinutes, 180));
check(() => assert.equal(bounded.passThreshold, 1));

const weak = normalizeExamConfig({ mode: 'weak', count: 20, chapterIds: ['c1','c1','c2'] }, 40);
check(() => assert.equal(weak.weakness, true));
check(() => assert.deepEqual(weak.chapterIds, ['c1','c2']));

const targets = typeTargets(20);
check(() => assert.equal(Object.values(targets).reduce((a,b)=>a+b,0), 20));
check(() => assert.equal(targets.single_choice, 10));
check(() => assert.equal(targets.multiple_choice, 4));
check(() => assert.equal(targets.ordering, 3));
check(() => assert.equal(targets.matching, 3));

check(() => assert.equal(isExamAnswered({ type:'single_choice' }, { selected:['a'] }), true));
check(() => assert.equal(isExamAnswered({ type:'multiple_choice' }, { selected:[] }), false));
check(() => assert.equal(isExamAnswered({ type:'ordering' }, {}), false, 'pre-shuffled variant must not count as an answer'));
check(() => assert.equal(isExamAnswered({ type:'ordering' }, { order:['a','b'] }), true));
check(() => assert.equal(isExamAnswered({ type:'matching', options:[{},{}] }, { matches:{ a:'x' } }), false));
check(() => assert.equal(isExamAnswered({ type:'matching', options:[{},{}] }, { matches:{ a:'x', b:'y' } }), true));

check(() => assert.equal(performanceTier(.80).id, 'strong'));
check(() => assert.equal(performanceTier(.79).id, 'solid'));
check(() => assert.equal(performanceTier(.65).id, 'solid'));
check(() => assert.equal(performanceTier(.64).id, 'review'));

const summary = summarizeBreakdown([{ id:'x', correct:8, total:10 }, { id:'y', correct:2, total:5 }]);
check(() => assert.equal(summary[0].percentage, 80));
check(() => assert.equal(summary[0].tier.id, 'strong'));
check(() => assert.equal(summary[1].tier.id, 'review'));

const candidates = [];
for (let i = 0; i < 80; i += 1) {
  const type = OBJECTIVE_TYPES[i % OBJECTIVE_TYPES.length];
  candidates.push({
    id: `q${i}`,
    type,
    chapterId: `c${(i % 4) + 1}`,
    conceptIds: [`k${i}`],
    weakness: i < 12 ? .95 : .05,
    lastExamSeenAt: i % 3 === 0 ? '2026-08-24T10:00:00Z' : null
  });
}
const blueprint = buildExamBlueprint(candidates, { count: 30, chapterIds:['c1','c2','c3','c4'] }, 'seed-a', new Date('2026-08-25T10:00:00Z'));
check(() => assert.equal(blueprint.selected.length, 30));
check(() => assert.equal(new Set(blueprint.selected.map((x)=>x.id)).size, 30));
check(() => assert.equal(Object.values(blueprint.blueprint.typeActual).reduce((a,b)=>a+b,0), 30));
check(() => assert.equal(Object.values(blueprint.blueprint.chapterActual).reduce((a,b)=>a+b,0), 30));
check(() => assert.equal(blueprint.blueprint.chaptersRepresented, 4));
check(() => assert.equal(blueprint.blueprint.uniqueConcepts, 30));
check(() => assert.deepEqual(
  buildExamBlueprint(candidates, { count: 15 }, 'repeatable', new Date('2026-08-25T10:00:00Z')).selected.map((x)=>x.id),
  buildExamBlueprint(candidates, { count: 15 }, 'repeatable', new Date('2026-08-25T10:00:00Z')).selected.map((x)=>x.id)
));

const weakBlueprint = buildExamBlueprint(candidates, { count: 10, weakness: true }, 'weak-seed', new Date('2026-08-25T10:00:00Z'));
check(() => assert.ok(weakBlueprint.selected.filter((x)=>x.weakness >= .9).length >= 5));

const scarce = buildExamBlueprint(candidates.slice(0, 7), { count: 30 }, 'scarce');
check(() => assert.equal(scarce.selected.length, 7));
check(() => assert.equal(scarce.config.count, 7));

console.log(JSON.stringify({ phase: 'P20-core', tests, errors: 0 }, null, 2));
