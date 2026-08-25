import assert from 'node:assert/strict';
import { buildQuestionTypePlan, summarizeTypePlan } from '../js/p25a-variety-core.js';

let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };

const fullAvailability = {
  single_choice: 100,
  multiple_choice: 100,
  matching: 100,
  ordering: 100,
  clinical_case: 100,
  short_answer: 100
};

{
  const plan = buildQuestionTypePlan({ objectiveTarget: 4, applicationTarget: 0, availableByType: fullAvailability, seed: 'four' });
  const counts = summarizeTypePlan(plan);
  equal(plan.length, 4, 'four objective slots are filled');
  equal(Object.keys(counts).length, 4, 'four objective slots use four distinct interaction types when healthy pools exist');
  for (const type of ['single_choice', 'multiple_choice', 'matching', 'ordering']) equal(counts[type], 1, `${type} appears once in a four-slot objective mix`);
}

{
  const plan = buildQuestionTypePlan({ objectiveTarget: 5, availableByType: fullAvailability, seed: 'five' });
  const counts = summarizeTypePlan(plan);
  equal(plan.length, 5, 'five objective slots are filled');
  check((counts.single_choice || 0) <= 2, 'Single Choice is capped to at most two of five when alternatives are healthy');
  check(Object.keys(counts).length >= 4, 'five objective slots keep at least four interaction types');
}

{
  const plan = buildQuestionTypePlan({ objectiveTarget: 2, availableByType: fullAvailability, seed: 'two' });
  const counts = summarizeTypePlan(plan);
  equal(plan.length, 2, 'two objective slots are filled');
  equal(counts.single_choice, 1, 'a two-item objective mix keeps one Single Choice anchor');
  check(plan.some((type) => type !== 'single_choice'), 'a two-item objective mix also contains a different interaction type');
}

{
  const plan = buildQuestionTypePlan({ objectiveTarget: 6, availableByType: { single_choice: 20 }, seed: 'fallback' });
  equal(plan.length, 6, 'small scopes can fall back to the only available type');
  check(plan.every((type) => type === 'single_choice'), 'fallback does not invent unavailable types');
}

{
  const plan = buildQuestionTypePlan({ objectiveTarget: 4, availableByType: { single_choice: 20, matching: 1 }, seed: 'scarce' });
  const counts = summarizeTypePlan(plan);
  equal(plan.length, 4, 'scarce-subtype plan still fills target');
  equal(counts.matching || 0, 0, 'a one-question subtype pool is not forced into every mixed session');
  equal(counts.single_choice, 4, 'healthy fallback fills the remaining narrow-scope slots');
}

{
  const plan = buildQuestionTypePlan({ objectiveTarget: 4, availableByType: { single_choice: 20, matching: 4 }, seed: 'healthy-threshold' });
  const counts = summarizeTypePlan(plan);
  equal(plan.length, 4, 'minimum healthy subtype pool can participate');
  check((counts.matching || 0) >= 1, 'a four-question matching pool is eligible for deliberate diversity');
}

{
  const plan = buildQuestionTypePlan({ applicationTarget: 2, availableByType: fullAvailability, seed: 'applications' });
  const counts = summarizeTypePlan(plan);
  equal(plan.length, 2, 'two application slots are filled');
  equal(counts.clinical_case, 1, 'clinical case appears once');
  equal(counts.short_answer, 1, 'short answer appears once');
}

{
  const first = buildQuestionTypePlan({ applicationTarget: 1, availableByType: fullAvailability, seed: 'rotation-a' });
  const second = buildQuestionTypePlan({ applicationTarget: 1, availableByType: fullAvailability, seed: 'rotation-b' });
  equal(first.length, 1, 'one application slot is filled');
  equal(second.length, 1, 'one application slot is filled for another seed');
  check(['clinical_case', 'short_answer'].includes(first[0]), 'single application type is valid');
  check(['clinical_case', 'short_answer'].includes(second[0]), 'second single application type is valid');
}

{
  const available = { single_choice: 6, multiple_choice: 4, matching: 4, ordering: 0, clinical_case: 4, short_answer: 4 };
  const plan = buildQuestionTypePlan({ objectiveTarget: 5, applicationTarget: 4, availableByType: available, seed: 'finite' });
  const counts = summarizeTypePlan(plan);
  equal(plan.length, 9, 'all requested slots fill when healthy capacity is sufficient');
  for (const [type, count] of Object.entries(counts)) check(count <= available[type], `${type} never exceeds available capacity`);
}

console.log(`P25A variety-core: ${assertions} assertions passed`);
