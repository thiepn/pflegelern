import assert from 'node:assert/strict';
import {
  canIntroduceNew, daysUntilExam, examPhaseForDays, examPlanContext,
  localDayKey, normalizeExamPlan, phasePolicy, scopeLabel
} from '../js/p16-exam-plan-core.js';

const now = new Date(2026, 7, 24, 23, 30);
assert.equal(localDayKey(now), '2026-08-24');
assert.equal(daysUntilExam('2026-08-24', now), 0);
assert.equal(daysUntilExam('2026-08-25', now), 1);
assert.equal(daysUntilExam('2026-09-03', now), 10);
assert.equal(examPhaseForDays(-1), 'expired');
assert.equal(examPhaseForDays(0), 'final_day');
assert.equal(examPhaseForDays(2), 'final_days');
assert.equal(examPhaseForDays(5), 'final_week');
assert.equal(examPhaseForDays(20), 'medium');
assert.equal(examPhaseForDays(40), 'long');
assert.equal(phasePolicy('final_day').allowNew, 'none');
assert.equal(canIntroduceNew('core', 'final_days'), true);
assert.equal(canIntroduceNew('important', 'final_days'), false);
assert.equal(canIntroduceNew('detail', 'final_week'), false);
assert.equal(canIntroduceNew('important', 'final_week'), true);
const all = normalizeExamPlan({ examDate:'2026-09-10', scopeType:'all' }, new Set(['chapter-1']));
assert.equal(all.scopeType, 'all');
assert.deepEqual(all.chapterIds, []);
const scoped = normalizeExamPlan({ examDate:'2026-09-10', scopeType:'chapters', chapterIds:['chapter-1','chapter-1','bad'] }, new Set(['chapter-1','chapter-2']));
assert.deepEqual(scoped.chapterIds, ['chapter-1']);
assert.equal(normalizeExamPlan({ examDate:'2026-09-10', scopeType:'chapters', chapterIds:[] }, new Set(['chapter-1'])), null);
assert.equal(normalizeExamPlan({ examDate:'not-a-date', scopeType:'all' }), null);
const ctx = examPlanContext({ examDate:'2026-08-29', scopeType:'all', chapterIds:[] }, now);
assert.equal(ctx.active, true);
assert.equal(ctx.phase, 'final_week');
assert.match(ctx.policy.label, /Schwächen/);
assert.equal(scopeLabel({ scopeType:'all', chapterIds:[] }, []), 'Gesamtes Buch');
assert.equal(scopeLabel({ scopeType:'chapters', chapterIds:['chapter-1','chapter-2','chapter-3'] }, [
  {id:'chapter-1',number:'1',title:'A'}, {id:'chapter-2',number:'2',title:'B'}, {id:'chapter-3',number:'3',title:'C'}
]), '1. A · 2. B +1');
console.log(JSON.stringify({ phase:'P16', pureTests:24, errors:0 }, null, 2));
