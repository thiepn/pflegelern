const CHANNEL_NAMES = ['cued', 'productive', 'objective', 'exam', 'application'];
const MAX_EVIDENCE_DAYS = 12;

export const MASTERY_MODEL_VERSION = 2;
export const MASTERY_LEVELS = [
  'unseen',
  'exposed',
  'cued_recall',
  'productive_recall',
  'objective_retrieval',
  'application',
  'spaced_stability'
];

function clamp01(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function cleanDays(values) {
  const unique = [...new Set((Array.isArray(values) ? values : []).map(String).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))];
  unique.sort();
  return unique.slice(-MAX_EVIDENCE_DAYS);
}

function emptyChannel() {
  return { successes: 0, hard: 0, failures: 0, successDays: [], hardDays: [], failureDays: [], lastAt: null };
}

export function emptyMasteryEvidence() {
  return {
    version: MASTERY_MODEL_VERSION,
    exposureDays: [],
    channels: Object.fromEntries(CHANNEL_NAMES.map((name) => [name, emptyChannel()])),
    spaced: { successDays: [], failureDays: [], lastSuccessAt: null, lastFailureAt: null }
  };
}

export function normalizeMasteryEvidence(raw) {
  const base = emptyMasteryEvidence();
  if (!raw || typeof raw !== 'object') return base;
  base.exposureDays = cleanDays(raw.exposureDays);
  for (const name of CHANNEL_NAMES) {
    const src = raw.channels?.[name] || raw[name] || {};
    base.channels[name] = {
      successes: Math.max(0, Number(src.successes || 0)),
      hard: Math.max(0, Number(src.hard || 0)),
      failures: Math.max(0, Number(src.failures || 0)),
      successDays: cleanDays(src.successDays),
      hardDays: cleanDays(src.hardDays),
      failureDays: cleanDays(src.failureDays),
      lastAt: src.lastAt || null
    };
  }
  base.spaced = {
    successDays: cleanDays(raw.spaced?.successDays),
    failureDays: cleanDays(raw.spaced?.failureDays),
    lastSuccessAt: raw.spaced?.lastSuccessAt || null,
    lastFailureAt: raw.spaced?.lastFailureAt || null
  };
  return base;
}

function addDay(days, day) {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(String(day))) return cleanDays(days);
  return cleanDays([...(days || []), String(day)]);
}

export function recordMasteryEvidence(raw, {
  channel = 'cued',
  outcome = 'success',
  day = '',
  at = null,
  spaced = false
} = {}) {
  const next = normalizeMasteryEvidence(raw);
  if (!CHANNEL_NAMES.includes(channel)) return next;
  const c = next.channels[channel];
  next.exposureDays = addDay(next.exposureDays, day);
  c.lastAt = at || c.lastAt;

  if (outcome === 'failure') {
    c.failures += 1;
    c.failureDays = addDay(c.failureDays, day);
    if (spaced) {
      next.spaced.failureDays = addDay(next.spaced.failureDays, day);
      next.spaced.lastFailureAt = at || next.spaced.lastFailureAt;
    }
  } else if (outcome === 'hard') {
    c.hard += 1;
    c.hardDays = addDay(c.hardDays, day);
  } else {
    c.successes += 1;
    c.successDays = addDay(c.successDays, day);
    if (spaced) {
      next.spaced.successDays = addDay(next.spaced.successDays, day);
      next.spaced.lastSuccessAt = at || next.spaced.lastSuccessAt;
    }
  }
  return next;
}

export function channelStrength(channel = {}) {
  const successes = Math.max(0, Number(channel.successes || 0));
  const hard = Math.max(0, Number(channel.hard || 0));
  const failures = Math.max(0, Number(channel.failures || 0));
  const attempts = successes + hard + failures;
  if (!attempts) return 0;

  const accuracy = (successes + hard * 0.5) / attempts;
  const successDays = cleanDays(channel.successDays).length;
  const hardDays = cleanDays(channel.hardDays).length;
  const failureDays = cleanDays(channel.failureDays).length;
  const distinctDays = new Set([
    ...cleanDays(channel.successDays),
    ...cleanDays(channel.hardDays),
    ...cleanDays(channel.failureDays)
  ]).size;

  // Repeating the same answer many times in one sitting cannot create high confidence.
  const temporal = distinctDays
    ? Math.min(1, 0.50 + successDays * 0.14 + hardDays * 0.06 + Math.min(3, distinctDays) * 0.04)
    : Math.min(0.62, 0.46 + Math.log2(attempts + 1) * 0.06);
  const volume = Math.min(1, 0.62 + Math.log2(attempts + 1) * 0.11);
  const failureDrag = Math.min(0.30, failureDays * 0.07);
  return clamp01(accuracy * Math.min(temporal, volume) - failureDrag);
}

export function spacedStrength(spaced = {}, cardSignal = 0) {
  const successDays = cleanDays(spaced.successDays).length;
  const failureDays = cleanDays(spaced.failureDays).length;
  let tracked = 0;
  if (successDays === 1) tracked = 0.45;
  else if (successDays === 2) tracked = 0.70;
  else if (successDays === 3) tracked = 0.86;
  else if (successDays >= 4) tracked = 0.96;
  tracked = Math.max(0, tracked - Math.min(0.25, failureDays * 0.07));
  return Math.max(tracked, clamp01(cardSignal));
}

function evidenceAttemptCount(evidence) {
  return CHANNEL_NAMES.reduce((sum, name) => {
    const c = evidence.channels[name];
    return sum + c.successes + c.hard + c.failures;
  }, 0);
}

export function computeMasteryModel({
  evidence: rawEvidence = null,
  legacy = {},
  cardSignal = 0,
  eligibleObjective = false,
  eligibleApplication = false,
  recentFailure = false
} = {}) {
  const evidence = normalizeMasteryEvidence(rawEvidence);
  const strength = {};
  for (const name of CHANNEL_NAMES) {
    strength[name] = Math.max(channelStrength(evidence.channels[name]), clamp01(legacy[name]));
  }
  const spaced = spacedStrength(evidence.spaced, cardSignal);
  const independent = Math.max(strength.objective, strength.exam);
  const exposure = evidence.exposureDays.length > 0 || evidenceAttemptCount(evidence) > 0 || Object.values(legacy).some((x) => Number(x) > 0);

  let level = exposure ? 'exposed' : 'unseen';
  if (strength.cued >= 0.38) level = 'cued_recall';
  if (strength.productive >= 0.46) level = 'productive_recall';
  if (independent >= 0.48) level = 'objective_retrieval';
  if (strength.application >= 0.48) level = 'application';

  const bestRetrieval = Math.max(strength.cued, strength.productive, independent, strength.application);
  if (spaced >= 0.68 && bestRetrieval >= 0.50) level = 'spaced_stability';

  const candidates = [exposure ? 0.12 : 0];
  if (strength.cued > 0) candidates.push(0.20 + 0.44 * strength.cued);
  if (strength.productive > 0) candidates.push(0.28 + 0.42 * strength.productive);
  if (independent > 0) candidates.push(0.36 + 0.44 * independent);
  if (strength.application > 0) candidates.push(0.42 + 0.46 * strength.application);
  let score = Math.max(...candidates) + (bestRetrieval > 0 ? spaced * 0.12 : 0);
  if (recentFailure) score -= 0.12;
  score = clamp01(score);

  const independentNeeded = Boolean(eligibleObjective || eligibleApplication);
  const independentEvidence = Math.max(independent, strength.application);
  const safe = !recentFailure && score >= 0.72 && spaced >= 0.52 && (!independentNeeded || independentEvidence >= 0.50);
  const label = !exposure && bestRetrieval === 0 ? 'Neu' : safe ? 'Sicher' : 'Noch üben';

  return {
    version: MASTERY_MODEL_VERSION,
    score,
    level,
    label,
    safe,
    recentFailure: Boolean(recentFailure),
    eligibleObjective: Boolean(eligibleObjective),
    eligibleApplication: Boolean(eligibleApplication),
    channels: { ...strength, independent, spaced }
  };
}

export function masteryLevelRank(level) {
  const index = MASTERY_LEVELS.indexOf(level);
  return index < 0 ? 0 : index;
}
