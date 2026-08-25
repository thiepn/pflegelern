const OBJECTIVE_TYPES = Object.freeze(['single_choice', 'multiple_choice', 'matching', 'ordering']);
const APPLICATION_TYPES = Object.freeze(['clinical_case', 'short_answer']);
const DIVERSITY_MIN_POOL = 4;

function hashText(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotate(values, seed) {
  if (!values.length) return [];
  const offset = hashText(seed) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function capacityOf(availableByType, type) {
  const value = Number(availableByType?.[type] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function pushIfAvailable(plan, used, type, availableByType, target) {
  if (plan.length >= target) return false;
  const usedCount = used.get(type) || 0;
  if (usedCount >= capacityOf(availableByType, type)) return false;
  plan.push(type);
  used.set(type, usedCount + 1);
  return true;
}

function objectivePlan(target, availableByType, seed) {
  const safeTarget = Math.max(0, Math.floor(Number(target) || 0));
  if (!safeTarget) return [];
  const available = OBJECTIVE_TYPES.filter((type) => capacityOf(availableByType, type) > 0);
  if (!available.length) return [];

  const plan = [];
  const used = new Map();
  const healthyAlternatives = rotate(OBJECTIVE_TYPES.filter((type) => type !== 'single_choice'), `${seed}:objective-alternatives`)
    .filter((type) => capacityOf(availableByType, type) >= DIVERSITY_MIN_POOL);

  // Anchor mixed objective sets with one conventional item, then add distinct
  // interaction types only when their pools are large enough not to cause the
  // same scarce question to be forced into every session.
  if (available.includes('single_choice')) pushIfAvailable(plan, used, 'single_choice', availableByType, safeTarget);
  for (const type of healthyAlternatives) pushIfAvailable(plan, used, type, availableByType, safeTarget);
  if (!plan.length) pushIfAvailable(plan, used, available[0], availableByType, safeTarget);

  const healthy = new Set(['single_choice', ...healthyAlternatives]);
  const cycle = ['single_choice', 'multiple_choice', 'single_choice', 'matching', 'ordering'];
  let guard = 0;
  while (plan.length < safeTarget && guard < safeTarget * 20 + 20) {
    const type = cycle[guard % cycle.length];
    if (healthy.has(type)) pushIfAvailable(plan, used, type, availableByType, safeTarget);
    guard += 1;
    if (guard % cycle.length === 0) {
      const remaining = [...healthy].some((candidate) => (used.get(candidate) || 0) < capacityOf(availableByType, candidate));
      if (!remaining) break;
    }
  }

  // If a narrow topic genuinely has no healthy mixed pool, fill from whatever is
  // available rather than dropping questions from the session.
  for (const type of available) {
    while (plan.length < safeTarget && pushIfAvailable(plan, used, type, availableByType, safeTarget)) {}
  }
  return plan;
}

function applicationPlan(target, availableByType, seed) {
  const safeTarget = Math.max(0, Math.floor(Number(target) || 0));
  if (!safeTarget) return [];
  const available = APPLICATION_TYPES.filter((type) => capacityOf(availableByType, type) > 0);
  if (!available.length) return [];

  const healthy = available.filter((type) => capacityOf(availableByType, type) >= DIVERSITY_MIN_POOL);
  const order = rotate(healthy.length ? healthy : available, `${seed}:application`);
  const plan = [];
  const used = new Map();
  let guard = 0;
  while (plan.length < safeTarget && guard < safeTarget * 10 + 10) {
    const type = order[guard % order.length];
    pushIfAvailable(plan, used, type, availableByType, safeTarget);
    guard += 1;
    if (guard % order.length === 0) {
      const remaining = order.some((candidate) => (used.get(candidate) || 0) < capacityOf(availableByType, candidate));
      if (!remaining) break;
    }
  }
  for (const type of available) {
    while (plan.length < safeTarget && pushIfAvailable(plan, used, type, availableByType, safeTarget)) {}
  }
  return plan;
}

export function buildQuestionTypePlan({
  objectiveTarget = 0,
  applicationTarget = 0,
  availableByType = {},
  seed = 'p25a'
} = {}) {
  return [
    ...objectivePlan(objectiveTarget, availableByType, seed),
    ...applicationPlan(applicationTarget, availableByType, seed)
  ];
}

export function summarizeTypePlan(plan = []) {
  const counts = {};
  for (const type of plan) counts[type] = (counts[type] || 0) + 1;
  return counts;
}

export { OBJECTIVE_TYPES, APPLICATION_TYPES, DIVERSITY_MIN_POOL };
