const OBJECTIVE_TYPES = Object.freeze(['single_choice', 'multiple_choice', 'ordering', 'matching']);
const TYPE_WEIGHTS = Object.freeze({
  single_choice: 0.50,
  multiple_choice: 0.20,
  ordering: 0.15,
  matching: 0.15
});
const DAY_MS = 86_400_000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function integer(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((x) => String(x || '').trim()).filter(Boolean))];
}

export function normalizeExamConfig(input = {}, availableCount = Infinity) {
  const requestedCount = clamp(integer(input.count, input.mode === 'quick' ? 10 : 30), 5, 100);
  const finiteAvailable = Number.isFinite(Number(availableCount)) ? Math.max(0, integer(availableCount, 0)) : Infinity;
  const count = Math.min(requestedCount, finiteAvailable);
  const timerEnabled = Boolean(input.timerEnabled);
  const defaultDuration = clamp(Math.round(Math.max(10, requestedCount * 1.25)), 10, 120);
  const durationMinutes = timerEnabled ? clamp(integer(input.durationMinutes, defaultDuration), 5, 180) : null;
  const passThreshold = clamp(integer(input.passThreshold, 60), 1, 100);
  return {
    version: 2,
    mode: String(input.mode || 'full'),
    count,
    requestedCount,
    timerEnabled,
    durationMinutes,
    passThreshold,
    weakness: Boolean(input.weakness || input.mode === 'weak'),
    chapterIds: uniqueStrings(input.chapterIds),
    chapterId: input.chapterId ? String(input.chapterId) : null,
    sectionId: input.sectionId ? String(input.sectionId) : null
  };
}

export function objectiveQuestionType(type) {
  return OBJECTIVE_TYPES.includes(type);
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function noise(seed, id) {
  return hashText(`${seed}:${id}`) / 0xffffffff;
}

export function typeTargets(count, availableTypes = OBJECTIVE_TYPES) {
  const types = uniqueStrings(availableTypes).filter((type) => objectiveQuestionType(type));
  if (!types.length || count <= 0) return {};
  const weightSum = types.reduce((sum, type) => sum + (TYPE_WEIGHTS[type] || 0), 0) || types.length;
  const rows = types.map((type) => {
    const raw = count * ((TYPE_WEIGHTS[type] || (1 / types.length)) / weightSum);
    return { type, floor: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let remaining = count - rows.reduce((sum, row) => sum + row.floor, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.type.localeCompare(b.type));
  for (let i = 0; i < rows.length && remaining > 0; i += 1, remaining -= 1) rows[i].floor += 1;
  return Object.fromEntries(rows.map((row) => [row.type, row.floor]));
}

function freshnessScore(candidate, nowMs) {
  const stamp = candidate.lastExamSeenAt ? new Date(candidate.lastExamSeenAt).getTime() : 0;
  if (!Number.isFinite(stamp) || stamp <= 0) return 1;
  const ageDays = Math.max(0, (nowMs - stamp) / DAY_MS);
  return clamp(ageDays / 30, 0, 1);
}

function conceptReusePenalty(candidate, selectedConceptCounts) {
  let reused = 0;
  for (const id of candidate.conceptIds || []) reused += selectedConceptCounts.get(id) || 0;
  return reused;
}

export function buildExamBlueprint(candidates = [], inputConfig = {}, seed = 'p20', now = new Date()) {
  const pool = candidates
    .filter((item) => item?.id && objectiveQuestionType(item.type))
    .map((item) => ({
      ...item,
      chapterId: item.chapterId || null,
      conceptIds: uniqueStrings(item.conceptIds),
      weakness: clamp(Number(item.weakness || 0), 0, 1)
    }));
  const config = normalizeExamConfig(inputConfig, pool.length);
  if (!pool.length || !config.count) return { selected: [], config, blueprint: { typeTargets: {}, typeActual: {}, chapterActual: {} } };

  const availableTypes = [...new Set(pool.map((x) => x.type))];
  const targets = typeTargets(config.count, availableTypes);
  const chapterUniverse = config.chapterIds.length
    ? config.chapterIds
    : [...new Set(pool.map((x) => x.chapterId).filter(Boolean))];
  const perChapterTarget = chapterUniverse.length ? config.count / chapterUniverse.length : config.count;
  const selected = [];
  const selectedIds = new Set();
  const typeActual = {};
  const chapterActual = {};
  const selectedConceptCounts = new Map();
  const nowMs = new Date(now).getTime();

  while (selected.length < config.count) {
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of pool) {
      if (selectedIds.has(candidate.id)) continue;
      const typeTarget = targets[candidate.type] || 0;
      const typeUsed = typeActual[candidate.type] || 0;
      const typeNeed = typeTarget > 0 ? Math.max(0, typeTarget - typeUsed) / typeTarget : 0;
      const chapterUsed = candidate.chapterId ? (chapterActual[candidate.chapterId] || 0) : 0;
      const chapterNeed = candidate.chapterId && perChapterTarget > 0
        ? clamp((perChapterTarget - chapterUsed) / perChapterTarget, 0, 1)
        : 0;
      const freshness = freshnessScore(candidate, nowMs);
      const weakness = config.weakness ? candidate.weakness : candidate.weakness * 0.12;
      const reusePenalty = conceptReusePenalty(candidate, selectedConceptCounts);
      const score =
        typeNeed * 4.2 +
        chapterNeed * 2.1 +
        freshness * 1.45 +
        weakness * (config.weakness ? 4.5 : 0.6) -
        reusePenalty * 0.85 +
        noise(seed, candidate.id) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (!best) break;
    selected.push(best);
    selectedIds.add(best.id);
    typeActual[best.type] = (typeActual[best.type] || 0) + 1;
    if (best.chapterId) chapterActual[best.chapterId] = (chapterActual[best.chapterId] || 0) + 1;
    for (const id of best.conceptIds || []) selectedConceptCounts.set(id, (selectedConceptCounts.get(id) || 0) + 1);
  }

  return {
    selected,
    config,
    blueprint: {
      typeTargets: targets,
      typeActual,
      chapterActual,
      chaptersRepresented: Object.keys(chapterActual).length,
      uniqueConcepts: selectedConceptCounts.size
    }
  };
}

export function isExamAnswered(question, answer) {
  if (!question || !answer) return false;
  if (question.type === 'single_choice' || question.type === 'multiple_choice') return Boolean(answer.selected?.length);
  if (question.type === 'ordering') return Array.isArray(answer.order) && answer.order.length > 0;
  if (question.type === 'matching') {
    const pairs = Array.isArray(question.options) ? question.options.length : 0;
    return pairs > 0 && Object.values(answer.matches || {}).filter(Boolean).length >= pairs;
  }
  return false;
}

export function performanceTier(ratio) {
  const value = clamp(Number(ratio || 0), 0, 1);
  if (value >= 0.80) return { id: 'strong', label: 'Stark' };
  if (value >= 0.65) return { id: 'solid', label: 'Solide' };
  return { id: 'review', label: 'Noch üben' };
}

export function summarizeBreakdown(rows = []) {
  return rows.map((row) => {
    const total = Math.max(0, Number(row.total || 0));
    const correct = clamp(Number(row.correct || 0), 0, total);
    const ratio = total ? correct / total : 0;
    return { ...row, correct, total, ratio, percentage: Math.round(ratio * 100), tier: performanceTier(ratio) };
  });
}

export { OBJECTIVE_TYPES, TYPE_WEIGHTS };
