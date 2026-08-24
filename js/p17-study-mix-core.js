const APPLICATION_TYPES = new Set(['clinical_case', 'short_answer']);
const IMPORTANCE = { core: 1, important: 0.68, detail: 0.36 };

export function questionKind(type) {
  return APPLICATION_TYPES.has(String(type || '')) ? 'application' : 'objective';
}

export function recencyPenalty(daysSince) {
  if (!Number.isFinite(daysSince)) return 0;
  if (daysSince < 0.5) return 0.30;
  if (daysSince < 1) return 0.22;
  if (daysSince < 3) return 0.12;
  if (daysSince < 7) return 0.05;
  return 0;
}

export function conceptRecencyPenalty(daysSince, recentlyFailed = false) {
  if (recentlyFailed) return 0;
  if (!Number.isFinite(daysSince)) return 0;
  if (daysSince < 0.5) return 0.14;
  if (daysSince < 1.5) return 0.08;
  return 0;
}

export function examPhaseAdjustment(phase) {
  return ({
    inactive: 0,
    long: 0,
    medium: 1,
    final_week: 3,
    final_days: 5,
    final_day: 4,
    expired: 0
  })[phase] ?? 0;
}

export function applicationShareForPhase(phase) {
  return ({
    inactive: 0.24,
    long: 0.24,
    medium: 0.28,
    final_week: 0.35,
    final_days: 0.42,
    final_day: 0.30,
    expired: 0.24
  })[phase] ?? 0.24;
}

export function computeAdaptiveMix({
  target = 22,
  quick = false,
  dueCount = 0,
  weakCount = 0,
  seenRatio = 0,
  coverageDebt = 0,
  applicationDebt = 0,
  examPhase = 'inactive'
} = {}) {
  const safeTarget = Math.max(1, Math.floor(target || 1));
  let questions = quick ? 1 : 5;

  if (seenRatio >= 0.25) questions += 1;
  if (seenRatio >= 0.55) questions += 1;
  if (weakCount >= Math.max(2, Math.round(safeTarget * 0.12))) questions += 1;
  if (coverageDebt >= 0.50) questions += 1;
  if (applicationDebt >= 0.65) questions += 1;
  questions += quick ? Math.min(1, examPhaseAdjustment(examPhase)) : examPhaseAdjustment(examPhase);

  if (seenRatio < 0.05) questions = Math.min(questions, quick ? 1 : 4);
  else if (seenRatio < 0.20) questions = Math.min(questions, quick ? 2 : 5);

  const dueRatio = dueCount / safeTarget;
  if (dueCount >= safeTarget) questions = Math.min(questions, quick ? 1 : 4);
  else if (dueRatio >= 0.70) questions = Math.min(questions, quick ? 2 : 6);
  else if (dueRatio >= 0.45) questions = Math.min(questions, quick ? 2 : 8);

  const maxQuestions = quick ? Math.min(3, safeTarget - 1) : Math.min(12, safeTarget - 6);
  questions = Math.max(1, Math.min(maxQuestions, questions));

  let applicationShare = applicationShareForPhase(examPhase);
  if (applicationDebt >= 0.65) applicationShare += 0.08;
  if (applicationDebt >= 0.85) applicationShare += 0.05;
  applicationShare = Math.min(0.50, applicationShare);

  let application = Math.round(questions * applicationShare);
  if (!quick && questions >= 5) application = Math.max(1, application);
  if (quick) application = Math.min(1, application);
  application = Math.min(application, questions);
  const objective = questions - application;

  return {
    target: safeTarget,
    questionTarget: questions,
    objectiveTarget: objective,
    applicationTarget: application,
    cardTarget: Math.max(0, safeTarget - questions),
    collisionWindow: 3,
    maxConsecutiveQuestions: quick ? 1 : 2
  };
}

export function scoreQuestion({
  type,
  importance = 'detail',
  weakness = 0,
  objectiveDebt = false,
  applicationDebt = false,
  exposed = false,
  preferred = false,
  inExamScope = false,
  examPhase = 'inactive',
  questionAgeDays = Infinity,
  conceptAgeDays = Infinity,
  recentlyFailed = false
} = {}) {
  const kind = questionKind(type);
  const phaseBoost = ({ medium: 0.08, final_week: 0.18, final_days: 0.28, final_day: 0.12 })[examPhase] || 0;
  const scopeBoost = inExamScope ? ({ long: 0.12, medium: 0.20, final_week: 0.34, final_days: 0.44, final_day: 0.48 })[examPhase] || 0.08 : 0;
  const importanceWeight = IMPORTANCE[importance] ?? 0.36;
  let score = importanceWeight * 0.20 + Math.max(0, Math.min(1, weakness)) * 0.38;
  if (objectiveDebt) score += 0.18;
  if (kind === 'application' && applicationDebt) score += 0.22;
  if (exposed) score += 0.14;
  if (preferred) score += 0.22;
  if (recentlyFailed) score += 0.18;
  score += scopeBoost;
  if (kind === 'application') score += phaseBoost;
  score -= recencyPenalty(questionAgeDays);
  score -= conceptRecencyPenalty(conceptAgeDays, recentlyFailed);
  return score;
}

export function itemConceptIds(item, cardConceptById, questionConceptsById) {
  if (item?.kind === 'card') {
    const id = cardConceptById.get(item.id);
    return id ? [id] : [];
  }
  if (item?.kind === 'question') return questionConceptsById.get(item.id) || [];
  return [];
}

export function interleaveAdaptive(items, {
  seedOrder = null,
  collisionWindow = 3,
  maxConsecutiveQuestions = 2,
  cardConceptById = new Map(),
  questionConceptsById = new Map()
} = {}) {
  const pending = [...(seedOrder || items)];
  const result = [];
  while (pending.length) {
    const recent = new Set(result.slice(-collisionWindow).flatMap((item) => itemConceptIds(item, cardConceptById, questionConceptsById)));
    let consecutiveQuestions = 0;
    for (let i = result.length - 1; i >= 0 && result[i]?.kind === 'question'; i -= 1) consecutiveQuestions += 1;
    const questionsLeft = pending.filter((item) => item.kind === 'question').length;
    const cardsLeft = pending.length - questionsLeft;
    const mustTakeCard = consecutiveQuestions >= maxConsecutiveQuestions && cardsLeft > 0;
    const mustTakeQuestion = !mustTakeCard && questionsLeft > maxConsecutiveQuestions * Math.max(1, cardsLeft);

    const kindAllowed = (item) => mustTakeCard ? item.kind === 'card' : mustTakeQuestion ? item.kind === 'question' : true;
    let index = pending.findIndex((item) => {
      if (!kindAllowed(item)) return false;
      return itemConceptIds(item, cardConceptById, questionConceptsById).every((id) => !recent.has(id));
    });
    if (index < 0) index = pending.findIndex(kindAllowed);
    if (index < 0) index = pending.findIndex((item) => !(item.kind === 'question' && consecutiveQuestions >= maxConsecutiveQuestions && cardsLeft > 0));
    if (index < 0) index = 0;
    result.push(pending.splice(index, 1)[0]);
  }
  return result;
}
