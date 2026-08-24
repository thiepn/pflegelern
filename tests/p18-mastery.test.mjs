import assert from 'node:assert/strict';
import {
  channelStrength,
  computeMasteryModel,
  emptyMasteryEvidence,
  masteryLevelRank,
  normalizeMasteryEvidence,
  recordMasteryEvidence,
  spacedStrength
} from '../js/p18-mastery-core.js';

let tests = 0;
const check = (condition, message) => { tests += 1; assert.ok(condition, message); };

const empty = computeMasteryModel();
check(empty.level === 'unseen', 'empty concept must be unseen');
check(empty.label === 'Neu', 'empty concept must be learner-facing Neu');
check(empty.score === 0, 'empty concept must have zero mastery');

let sameDay = emptyMasteryEvidence();
for (let i = 0; i < 8; i += 1) {
  sameDay = recordMasteryEvidence(sameDay, { channel: 'cued', outcome: 'success', day: '2026-08-01', at: `2026-08-01T10:${String(i).padStart(2, '0')}:00Z` });
}
let spacedDays = emptyMasteryEvidence();
for (let i = 1; i <= 4; i += 1) {
  spacedDays = recordMasteryEvidence(spacedDays, { channel: 'cued', outcome: 'success', day: `2026-08-0${i}`, at: `2026-08-0${i}T10:00:00Z`, spaced: true });
}
check(channelStrength(spacedDays.channels.cued) > channelStrength(sameDay.channels.cued), 'distinct study days must outrank same-session repetition');
check(channelStrength(sameDay.channels.cued) < 0.75, 'same-day repetition must remain confidence-capped');
check(spacedStrength(spacedDays.spaced) >= 0.90, 'four spaced successes should create strong stability evidence');

let mixed = emptyMasteryEvidence();
mixed = recordMasteryEvidence(mixed, { channel: 'productive', outcome: 'success', day: '2026-08-01' });
mixed = recordMasteryEvidence(mixed, { channel: 'objective', outcome: 'success', day: '2026-08-02' });
mixed = recordMasteryEvidence(mixed, { channel: 'application', outcome: 'success', day: '2026-08-03' });
const mixedModel = computeMasteryModel({ evidence: mixed });
check(masteryLevelRank(mixedModel.level) >= masteryLevelRank('productive_recall'), 'stronger evidence must advance beyond cued recall');
check(mixedModel.channels.application > 0, 'application evidence must remain a separate channel');
check(mixedModel.channels.objective > 0, 'objective evidence must remain a separate channel');

const cuedOnlyEligible = computeMasteryModel({
  legacy: { cued: 1 },
  cardSignal: 1,
  eligibleObjective: true
});
check(cuedOnlyEligible.label === 'Noch üben', 'flashcard-only evidence cannot mark an objectively assessable concept safe');
check(cuedOnlyEligible.safe === false, 'objective-eligible concept needs independent evidence');

const cuedOnlyNoObjective = computeMasteryModel({
  legacy: { cued: 1 },
  cardSignal: 1,
  eligibleObjective: false,
  eligibleApplication: false
});
check(cuedOnlyNoObjective.safe === true, 'strong spaced cued evidence may suffice when no independent assessment path exists');
check(cuedOnlyNoObjective.label === 'Sicher', 'safe flashcard-only concept should stay simple in the UI');

const objectiveStable = computeMasteryModel({
  legacy: { cued: 0.8, objective: 0.82 },
  cardSignal: 0.74,
  eligibleObjective: true
});
check(objectiveStable.safe === true, 'objective retrieval plus spaced stability should support Sicher');
check(objectiveStable.level === 'spaced_stability', 'durable independent retrieval should reach spaced stability');

const afterFailure = computeMasteryModel({
  legacy: { cued: 0.8, objective: 0.82 },
  cardSignal: 0.74,
  eligibleObjective: true,
  recentFailure: true
});
check(afterFailure.safe === false, 'recent failure must revoke safe classification temporarily');
check(afterFailure.score < objectiveStable.score, 'recent failure must lower mastery score');

const examModel = computeMasteryModel({ legacy: { exam: 0.8 }, cardSignal: 0.7, eligibleObjective: true });
check(examModel.channels.exam === 0.8, 'exam evidence must be tracked independently');
check(examModel.channels.independent === 0.8, 'exam evidence must count as independent retrieval');

let manyDays = emptyMasteryEvidence();
for (let i = 1; i <= 20; i += 1) {
  const day = String(i).padStart(2, '0');
  manyDays = recordMasteryEvidence(manyDays, { channel: 'objective', outcome: 'success', day: `2026-07-${day}` });
}
const normalized = normalizeMasteryEvidence(manyDays);
check(normalized.channels.objective.successDays.length === 12, 'stored evidence days must be bounded');
check(normalized.exposureDays.length === 12, 'exposure-day history must be bounded');

let failureEvidence = emptyMasteryEvidence();
failureEvidence = recordMasteryEvidence(failureEvidence, { channel: 'application', outcome: 'success', day: '2026-08-01' });
const beforeFailureStrength = channelStrength(failureEvidence.channels.application);
failureEvidence = recordMasteryEvidence(failureEvidence, { channel: 'application', outcome: 'failure', day: '2026-08-02' });
check(channelStrength(failureEvidence.channels.application) < beforeFailureStrength, 'failure must reduce channel strength');

check(masteryLevelRank('application') > masteryLevelRank('objective_retrieval'), 'application must rank above objective retrieval');
check(masteryLevelRank('spaced_stability') > masteryLevelRank('application'), 'spaced stability must remain the top evidence level');

console.log(JSON.stringify({ phase: 'P18', tests, errors: 0 }, null, 2));
