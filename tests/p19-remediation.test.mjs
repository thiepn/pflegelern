import assert from 'node:assert/strict';
import {
  evidenceWeight, immediateOffsets, isFollowupDue, nextFollowupAt, normalizeRemediation,
  onFailure, onIndependentSuccess, questionRole, remediationPriority, shouldResolve
} from '../js/p19-remediation-core.js';

const failAt = new Date('2026-08-01T10:00:00Z');
let r = onFailure(null, failAt);
assert.equal(r.status, 'active');
assert.equal(r.failureCount, 1);
assert.equal(r.independentEvidence, 0);
assert.deepEqual(r.successDays, []);
assert.equal(r.nextFollowupAt, '2026-08-02T10:00:00.000Z');
assert.equal(isFollowupDue(r, new Date('2026-08-02T09:59:59Z')), false);
assert.equal(isFollowupDue(r, new Date('2026-08-02T10:00:00Z')), true);

assert.equal(evidenceWeight({ contentType: 'question', sameAnchor: true, questionType: 'clinical_case' }), 0.10);
assert.equal(evidenceWeight({ contentType: 'card' }), 0.45);
assert.equal(evidenceWeight({ contentType: 'question', questionType: 'single_choice' }), 1.00);
assert.equal(evidenceWeight({ contentType: 'question', questionType: 'clinical_case' }), 1.20);
assert.equal(evidenceWeight({ contentType: 'question', questionType: 'single_choice', source: 'exam' }), 1.25);

r = onIndependentSuccess(r, { day: '2026-08-02', at: '2026-08-02T10:00:00Z', weight: 1.0 });
assert.equal(r.status, 'active', 'one independent day must not resolve a weakness');
assert.equal(r.followupStage, 1);
assert.equal(r.nextFollowupAt, '2026-08-05T10:00:00.000Z');
r = onIndependentSuccess(r, { day: '2026-08-02', at: '2026-08-02T15:00:00Z', weight: 1.0 });
assert.equal(r.status, 'active', 'repeating on the same day must not resolve a weakness');
assert.equal(r.successDays.length, 1);
r = onIndependentSuccess(r, { day: '2026-08-05', at: '2026-08-05T10:00:00Z', weight: 0.6 });
assert.equal(shouldResolve(r, new Date('2026-08-05T10:00:00Z')), true);
assert.equal(r.status, 'resolved');
assert.equal(r.nextFollowupAt, null);

r = onFailure(r, new Date('2026-08-06T08:00:00Z'));
assert.equal(r.status, 'active');
assert.equal(r.independentEvidence, 0, 'a new miss must invalidate the previous repair proof');
assert.deepEqual(r.successDays, []);
assert.equal(r.resolvedAt, null);

assert.deepEqual(immediateOffsets(3), [3, 7, 11]);
assert.deepEqual(immediateOffsets(2), [3, 7]);
assert.equal(questionRole('single_choice'), 'objective');
assert.equal(questionRole('clinical_case'), 'application');
assert.equal(questionRole('short_answer'), 'application');
assert.equal(questionRole('other'), 'productive');
assert.equal(nextFollowupAt(new Date('2026-08-01T00:00:00Z'), 2), '2026-08-08T00:00:00.000Z');

const legacy = normalizeRemediation({ failureCount: 4, successDays: ['bad', '2026-08-01', '2026-08-01'] }, failAt);
assert.equal(legacy.failureCount, 4);
assert.deepEqual(legacy.successDays, ['2026-08-01']);
assert.ok(remediationPriority({ occurredAt: '2026-08-01T09:00:00Z', p19: r }, new Date('2026-08-06T10:00:00Z')) > 0);

console.log(JSON.stringify({ phase: 'P19-core', tests: 27, errors: 0 }, null, 2));
