const OPTION_TYPES = new Set(['single_choice', 'multiple_choice']);
const ABSOLUTE_PATTERN = /\b(immer|nie|niemals|ausschließlich|grundsätzlich|unter keinen umständen|in jedem fall)\b/i;
const ALL_NONE_PATTERN = /^(?:alle|keine)\s+(?:der|die|diese|genannten|antworten|aussagen)/i;

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (const ch of String(value ?? '')) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function deterministicOrder(ids, seed) {
  return [...ids].sort((a, b) => {
    const ah = hashString(`${seed}|${a}`);
    const bh = hashString(`${seed}|${b}`);
    return ah - bh || String(a).localeCompare(String(b));
  });
}

export function assessQuestionQuality(question = {}) {
  if (!OPTION_TYPES.has(question.type)) {
    return { score: 1, tier: 'strong', selectable: true, blockers: [], warnings: [] };
  }

  const options = Array.isArray(question.options) ? question.options : [];
  const correct = Array.isArray(question.correct) ? question.correct : [];
  const blockers = [];
  const warnings = [];
  let score = 1;

  const optionIds = options.map((option) => String(option?.id ?? ''));
  const normalized = options.map((option) => normalizeText(option?.text));
  const normalizedNonEmpty = normalized.filter(Boolean);
  const uniqueText = new Set(normalizedNonEmpty);
  const uniqueIds = new Set(optionIds.filter(Boolean));

  if (options.length < 3) blockers.push('too-few-options');
  if (uniqueIds.size !== options.length) blockers.push('duplicate-option-id');
  if (normalizedNonEmpty.length !== options.length || uniqueText.size !== options.length) blockers.push('duplicate-or-empty-option-text');
  if (correct.some((id) => !uniqueIds.has(String(id)))) blockers.push('missing-correct-option');

  if (question.type === 'single_choice' && correct.length !== 1) blockers.push('single-choice-correct-count');
  if (question.type === 'multiple_choice') {
    if (!correct.length) blockers.push('multiple-choice-no-correct');
    if (correct.length >= options.length && options.length) blockers.push('multiple-choice-all-correct');
    if (correct.length / Math.max(1, options.length) > 0.75) {
      score -= 0.16;
      warnings.push('multiple-choice-high-correct-ratio');
    }
  }

  const lengths = normalized.map((text) => text.length).filter((length) => length > 0);
  if (lengths.length >= 3) {
    const med = median(lengths);
    const spread = Math.max(...lengths) - Math.min(...lengths);
    if (med > 0 && spread > Math.max(24, med * 1.6)) {
      score -= 0.08;
      warnings.push('option-length-spread');
    }
  }

  if (question.type === 'single_choice' && correct.length === 1) {
    const correctIndex = options.findIndex((option) => String(option.id) === String(correct[0]));
    if (correctIndex >= 0) {
      const correctLength = normalized[correctIndex]?.length || 0;
      const distractorLengths = normalized.filter((_, index) => index !== correctIndex).map((text) => text.length).filter(Boolean);
      const distractorMedian = median(distractorLengths);
      if (distractorMedian > 0) {
        const ratio = correctLength / distractorMedian;
        const difference = Math.abs(correctLength - distractorMedian);
        if (difference >= 14 && (ratio > 2.4 || ratio < 0.35)) {
          score -= 0.20;
          warnings.push('correct-answer-length-giveaway');
        }
      }
    }
  }

  const wrongOptions = options.filter((option) => !correct.map(String).includes(String(option.id)));
  const absoluteDistractors = wrongOptions.filter((option) => ABSOLUTE_PATTERN.test(String(option.text || ''))).length;
  if (wrongOptions.length >= 2 && absoluteDistractors >= Math.ceil(wrongOptions.length / 2)) {
    score -= 0.10;
    warnings.push('absolute-word-distractors');
  }

  if (options.some((option) => ALL_NONE_PATTERN.test(normalizeText(option.text)))) {
    score -= 0.10;
    warnings.push('all-none-option');
  }

  if (!String(question.prompt || '').trim()) blockers.push('empty-prompt');
  if (!Array.isArray(question.conceptIds) || !question.conceptIds.length) {
    score -= 0.08;
    warnings.push('missing-concept-anchor');
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  if (blockers.length) score = Math.min(score, 0.35);
  const tier = blockers.length || score < 0.58 ? 'weak' : score >= 0.82 ? 'strong' : 'usable';
  return {
    score,
    tier,
    selectable: !blockers.length && score >= 0.58,
    blockers,
    warnings
  };
}

export function isQuestionSelectable(question) {
  return assessQuestionQuality(question).selectable;
}

export function qualityWeight(question) {
  const result = assessQuestionQuality(question);
  if (!OPTION_TYPES.has(question?.type)) return 1;
  if (!result.selectable) return -1;
  return result.score;
}

export function balancedSingleChoiceOrder(question = {}, seed = '') {
  const options = Array.isArray(question.options) ? question.options : [];
  const ids = options.map((option) => String(option.id));
  if (question.type !== 'single_choice' || !ids.length || !Array.isArray(question.correct) || question.correct.length !== 1) {
    return deterministicOrder(ids, `${seed}|fallback`);
  }

  const correctId = String(question.correct[0]);
  if (!ids.includes(correctId)) return deterministicOrder(ids, `${seed}|fallback`);
  const distractors = deterministicOrder(ids.filter((id) => id !== correctId), `${seed}|distractors|${question.id || ''}`);
  const targetIndex = hashString(`${seed}|slot|${question.id || ''}`) % ids.length;
  const order = [...distractors];
  order.splice(targetIndex, 0, correctId);
  return order;
}

export function correctOptionIndex(question, order) {
  if (question?.type !== 'single_choice' || !Array.isArray(question.correct) || question.correct.length !== 1) return -1;
  return (order || []).map(String).indexOf(String(question.correct[0]));
}

export function summarizeQuestionQuality(questions = []) {
  const summary = {
    total: questions.length,
    strong: 0,
    usable: 0,
    weak: 0,
    selectable: 0,
    blocked: 0,
    warningCounts: {},
    blockerCounts: {}
  };
  for (const question of questions) {
    const result = assessQuestionQuality(question);
    summary[result.tier] += 1;
    if (result.selectable) summary.selectable += 1;
    if (result.blockers.length) summary.blocked += 1;
    for (const warning of result.warnings) summary.warningCounts[warning] = (summary.warningCounts[warning] || 0) + 1;
    for (const blocker of result.blockers) summary.blockerCounts[blocker] = (summary.blockerCounts[blocker] || 0) + 1;
  }
  return summary;
}
