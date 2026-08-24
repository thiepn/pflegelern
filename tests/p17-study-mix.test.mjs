import assert from 'node:assert/strict';
import {
  applicationShareForPhase, computeAdaptiveMix, conceptRecencyPenalty,
  examPhaseAdjustment, interleaveAdaptive, questionKind, recencyPenalty, scoreQuestion
} from '../js/p17-study-mix-core.js';

assert.equal(questionKind('clinical_case'), 'application');
assert.equal(questionKind('short_answer'), 'application');
assert.equal(questionKind('single_choice'), 'objective');
assert.equal(recencyPenalty(0.2), 0.30);
assert.equal(recencyPenalty(8), 0);
assert.equal(conceptRecencyPenalty(0.2, false), 0.14);
assert.equal(conceptRecencyPenalty(0.2, true), 0);
assert.equal(examPhaseAdjustment('final_days'), 5);
assert(applicationShareForPhase('final_days') > applicationShareForPhase('long'));

const fresh = computeAdaptiveMix({ target: 22, seenRatio: 0.01, dueCount: 0, weakCount: 0, coverageDebt: 1, applicationDebt: 1 });
assert(fresh.questionTarget <= 4);
assert.equal(fresh.target, 22);

const established = computeAdaptiveMix({ target: 22, seenRatio: 0.7, dueCount: 2, weakCount: 5, coverageDebt: 0.7, applicationDebt: 0.8 });
assert(established.questionTarget >= 8);
assert(established.applicationTarget >= 2);
assert.equal(established.cardTarget + established.questionTarget, 22);

const backlog = computeAdaptiveMix({ target: 22, seenRatio: 0.8, dueCount: 20, weakCount: 10, coverageDebt: 1, applicationDebt: 1, examPhase: 'final_days' });
assert(backlog.questionTarget <= 6);

const finalDays = computeAdaptiveMix({ target: 22, seenRatio: 0.8, dueCount: 2, weakCount: 4, coverageDebt: 0.8, applicationDebt: 0.9, examPhase: 'final_days' });
assert(finalDays.questionTarget >= established.questionTarget);
assert(finalDays.applicationTarget >= established.applicationTarget);

const quick = computeAdaptiveMix({ target: 8, quick: true, seenRatio: 0.8, dueCount: 0, weakCount: 5, coverageDebt: 1, applicationDebt: 1, examPhase: 'final_days' });
assert(quick.questionTarget <= 3);
assert(quick.applicationTarget <= 1);

const baseScore = scoreQuestion({ type:'single_choice', importance:'core', exposed:true, questionAgeDays:10 });
const weakScore = scoreQuestion({ type:'single_choice', importance:'core', exposed:true, weakness:0.8, objectiveDebt:true, questionAgeDays:10 });
assert(weakScore > baseScore);
const recentScore = scoreQuestion({ type:'single_choice', importance:'core', exposed:true, questionAgeDays:0.2 });
assert(recentScore < baseScore);
const appLate = scoreQuestion({ type:'clinical_case', importance:'core', exposed:true, applicationDebt:true, examPhase:'final_days', inExamScope:true, questionAgeDays:10 });
const appLong = scoreQuestion({ type:'clinical_case', importance:'core', exposed:true, applicationDebt:true, examPhase:'long', inExamScope:true, questionAgeDays:10 });
assert(appLate > appLong);

const items = [
  {kind:'question',id:'q1'}, {kind:'question',id:'q2'}, {kind:'question',id:'q3'},
  {kind:'card',id:'c1'}, {kind:'card',id:'c2'}
];
const cardMap = new Map([['c1','a'],['c2','b']]);
const qMap = new Map([['q1',['a']],['q2',['b']],['q3',['c']]]);
const mixed = interleaveAdaptive(items, { collisionWindow:3, maxConsecutiveQuestions:2, cardConceptById:cardMap, questionConceptsById:qMap });
for (let i=2;i<mixed.length;i++) assert(!(mixed[i].kind==='question' && mixed[i-1].kind==='question' && mixed[i-2].kind==='question'));

console.log(JSON.stringify({ phase:'P17', tests:23, errors:0, fresh, established, backlog, finalDays, quick }, null, 2));
