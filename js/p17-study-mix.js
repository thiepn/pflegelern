import { StudyEngine } from './study-engine.js';
import { isDue } from './fsrs.js';
import { stableShuffle } from './util.js';
import { getActiveExamPlan } from './p16-exam-plan.js';
import { examPlanContext, normalizeExamPlan } from './p16-exam-plan-core.js';
import {
  computeAdaptiveMix, interleaveAdaptive, questionKind, scoreQuestion
} from './p17-study-mix-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p17.adaptiveMixPatched');
const IMPORTANCE = { core: 1, important: 0.68, detail: 0.36 };
const DAY_MS = 86_400_000;

function attemptCount(cs) {
  if (!cs) return 0;
  return (cs.practiceCorrect || 0) + (cs.practiceWrong || 0) + (cs.examCorrect || 0) + (cs.examWrong || 0);
}

function conceptSeen(engine, conceptId) {
  const cs = engine.conceptStates.get(conceptId);
  if (cs && ((cs.flashCorrect || 0) + (cs.flashWrong || 0) + (cs.flashHard || 0) + attemptCount(cs) > 0)) return true;
  return (engine.content.cardsByConcept.get(conceptId) || []).some((card) => (engine.cardStates.get(card.id)?.reps || 0) > 0);
}

function conceptImportance(engine, conceptId) {
  return engine.content.conceptById.get(conceptId)?.importance || 'detail';
}

function planContext(engine) {
  const valid = new Set(engine.content.chapters.map((c) => c.id));
  const plan = normalizeExamPlan(getActiveExamPlan(), valid);
  return examPlanContext(plan);
}

function focusConceptIds(engine, ctx) {
  if (!ctx.active || ctx.plan.scopeType !== 'chapters') return new Set(engine.content.concepts.map((c) => c.id));
  const chapters = new Set(ctx.plan.chapterIds);
  return new Set(engine.content.concepts.filter((concept) => {
    const chapter = engine.content.conceptChapter(concept.id);
    return chapter && chapters.has(chapter.id);
  }).map((c) => c.id));
}

function inExamScope(engine, conceptIds, ctx) {
  if (!ctx.active) return false;
  if (ctx.plan.scopeType !== 'chapters') return true;
  const chapters = new Set(ctx.plan.chapterIds);
  return (conceptIds || []).some((id) => {
    const chapter = engine.content.conceptChapter(id);
    return chapter && chapters.has(chapter.id);
  });
}

function latestConceptEvent(engine, conceptIds) {
  let latest = null;
  let recentlyFailed = false;
  const now = Date.now();
  for (const id of conceptIds || []) {
    const cs = engine.conceptStates.get(id);
    for (const stamp of [cs?.lastSuccessAt, cs?.lastFailureAt]) {
      if (!stamp) continue;
      const time = new Date(stamp).getTime();
      if (Number.isFinite(time) && (latest === null || time > latest)) latest = time;
    }
    const fail = cs?.lastFailureAt ? new Date(cs.lastFailureAt).getTime() : NaN;
    if (Number.isFinite(fail) && now - fail < 7 * DAY_MS) recentlyFailed = true;
  }
  return {
    ageDays: latest === null ? Infinity : Math.max(0, (now - latest) / DAY_MS),
    recentlyFailed
  };
}

function adaptiveSignals(engine, ctx) {
  const focus = focusConceptIds(engine, ctx);
  const concepts = [...focus];
  const seen = concepts.filter((id) => conceptSeen(engine, id));
  const weak = concepts.filter((id) => engine.weaknessScore(id) >= 0.40);
  const priority = concepts.filter((id) => conceptImportance(engine, id) !== 'detail');
  const uncovered = priority.filter((id) => attemptCount(engine.conceptStates.get(id)) === 0);

  const applicationQuestions = engine.content.questions.filter((q) => questionKind(q.type) === 'application');
  const applicationEligible = new Set();
  const applicationCovered = new Set();
  for (const q of applicationQuestions) {
    const ids = (q.conceptIds || []).filter((id) => focus.has(id));
    if (!ids.length) continue;
    for (const id of ids) applicationEligible.add(id);
    if ((engine.questionHistory.get(q.id)?.attempts || 0) > 0) for (const id of ids) applicationCovered.add(id);
  }

  const now = new Date();
  const dueCount = engine.content.cards.reduce((sum, card) => {
    const state = engine.cardStates.get(card.id);
    return sum + (state?.reps && isDue(state, now) ? 1 : 0);
  }, 0);

  return {
    dueCount,
    weakCount: weak.length,
    seenRatio: concepts.length ? seen.length / concepts.length : 0,
    coverageDebt: priority.length ? uncovered.length / priority.length : 0,
    applicationDebt: applicationEligible.size ? 1 - applicationCovered.size / applicationEligible.size : 0,
    focusConcepts: focus
  };
}

function questionScore(engine, q, ctx, preferredConcepts) {
  const ids = q.conceptIds || [];
  const importance = ids.reduce((best, id) => {
    const label = conceptImportance(engine, id);
    const value = IMPORTANCE[label] || 0.36;
    return value > best.value ? { value, label } : best;
  }, { value: 0, label: 'detail' }).label;
  const weakness = ids.length ? Math.max(0, ...ids.map((id) => engine.weaknessScore(id))) : 0;
  const objectiveDebt = ids.some((id) => attemptCount(engine.conceptStates.get(id)) === 0);
  const applicationDebt = questionKind(q.type) === 'application' && (engine.questionHistory.get(q.id)?.attempts || 0) === 0;
  const exposed = ids.some((id) => conceptSeen(engine, id));
  const preferred = ids.some((id) => preferredConcepts.has(id));
  const history = engine.questionHistory.get(q.id);
  const questionAgeDays = history?.lastSeenAt ? Math.max(0, (Date.now() - new Date(history.lastSeenAt).getTime()) / DAY_MS) : Infinity;
  const event = latestConceptEvent(engine, ids);
  return scoreQuestion({
    type: q.type,
    importance,
    weakness,
    objectiveDebt,
    applicationDebt,
    exposed,
    preferred,
    inExamScope: inExamScope(engine, ids, ctx),
    examPhase: ctx.active ? ctx.phase : 'inactive',
    questionAgeDays,
    conceptAgeDays: event.ageDays,
    recentlyFailed: event.recentlyFailed
  });
}

function candidateQuestions(engine, ctx) {
  if (!ctx.active || ctx.plan.scopeType !== 'chapters' || !['final_week', 'final_days', 'final_day'].includes(ctx.phase)) return engine.content.questions;
  const scoped = engine.content.questions.filter((q) => inExamScope(engine, q.conceptIds || [], ctx));
  return scoped.length >= 20 ? scoped : engine.content.questions;
}

function selectQuestions(engine, mix, preferredConcepts, ctx, seed) {
  const preferred = new Set(preferredConcepts);
  const candidates = stableShuffle(candidateQuestions(engine, ctx), `${seed}-p17-question-bank`)
    .map((q) => ({ q, score: questionScore(engine, q, ctx, preferred) }))
    .sort((a, b) => b.score - a.score);

  const used = new Set();
  const chosen = [];
  const takeKind = (kind, count) => {
    for (const row of candidates) {
      if (count <= 0) break;
      if (used.has(row.q.id) || questionKind(row.q.type) !== kind) continue;
      chosen.push(row.q);
      used.add(row.q.id);
      count -= 1;
    }
    return count;
  };

  let appMissing = takeKind('application', mix.applicationTarget);
  let objMissing = takeKind('objective', mix.objectiveTarget);
  let missing = appMissing + objMissing;
  if (missing > 0) {
    for (const row of candidates) {
      if (missing <= 0) break;
      if (used.has(row.q.id)) continue;
      chosen.push(row.q);
      used.add(row.q.id);
      missing -= 1;
    }
  }
  return chosen;
}

function cardKeepScore(engine, item, index, now) {
  const card = engine.content.cardById.get(item.id);
  if (!card) return -Infinity;
  const state = engine.cardStates.get(card.id);
  const due = Boolean(state?.reps && isDue(state, now));
  return (due ? 100 : 0) + engine.priorityForCard(card, now) * 10 + (IMPORTANCE[conceptImportance(engine, card.conceptId)] || 0.36) + Math.max(0, 1 - index / 1000);
}

function buildAdaptiveSelection(engine, baseItems, options = {}) {
  const target = Math.max(1, Math.floor(options.target || (options.quick ? 8 : 22)));
  const quick = Boolean(options.quick);
  const seed = options.seed ?? Date.now();
  const ctx = planContext(engine);
  const signals = adaptiveSignals(engine, ctx);
  const mix = computeAdaptiveMix({
    target,
    quick,
    dueCount: signals.dueCount,
    weakCount: signals.weakCount,
    seenRatio: signals.seenRatio,
    coverageDebt: signals.coverageDebt,
    applicationDebt: signals.applicationDebt,
    examPhase: ctx.active ? ctx.phase : 'inactive'
  });

  const baseCards = baseItems.filter((item) => item.kind === 'card');
  const now = new Date();
  const dueBase = baseCards.filter((item) => {
    const state = engine.cardStates.get(item.id);
    return Boolean(state?.reps && isDue(state, now));
  });
  const effectiveCardTarget = Math.max(mix.cardTarget, dueBase.length);
  const rankedCards = baseCards.map((item, index) => ({ item, score: cardKeepScore(engine, item, index, now), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const keptCards = rankedCards.slice(0, Math.min(effectiveCardTarget, rankedCards.length)).map((x) => x.item);
  const preferredConcepts = keptCards.map((item) => engine.content.cardById.get(item.id)?.conceptId).filter(Boolean);
  const maxQuestionSlots = Math.max(0, target - keptCards.length);
  const desiredQuestions = Math.min(mix.questionTarget, maxQuestionSlots);
  const adjustedMix = {
    ...mix,
    questionTarget: desiredQuestions,
    applicationTarget: Math.min(mix.applicationTarget, desiredQuestions),
    objectiveTarget: Math.max(0, desiredQuestions - Math.min(mix.applicationTarget, desiredQuestions))
  };
  const questions = selectQuestions(engine, adjustedMix, preferredConcepts, ctx, seed)
    .slice(0, desiredQuestions)
    .map((q) => engine.prepareQuestionItem(q, `${seed}-p17-${q.id}`));

  const combined = [...keptCards, ...questions];
  const seeded = stableShuffle(combined, `${seed}-p17-interleave`);
  const cardConceptById = new Map(engine.content.cards.map((card) => [card.id, card.conceptId]));
  const questionConceptsById = new Map(engine.content.questions.map((q) => [q.id, q.conceptIds || []]));
  const result = interleaveAdaptive(combined, {
    seedOrder: seeded,
    collisionWindow: mix.collisionWindow,
    maxConsecutiveQuestions: mix.maxConsecutiveQuestions,
    cardConceptById,
    questionConceptsById
  }).slice(0, target);

  return { result, mix, signals, ctx };
}

export function installAdaptiveMixPatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousSelectRecommended = StudyEngine.prototype.selectRecommended;
  StudyEngine.prototype.selectRecommended = function p17SelectRecommended(options = {}) {
    const base = previousSelectRecommended.call(this, options);
    return buildAdaptiveSelection(this, base, options).result;
  };

  const previousPreview = StudyEngine.prototype.recommendedPreview;
  StudyEngine.prototype.recommendedPreview = function p17RecommendedPreview() {
    const preview = previousPreview.call(this);
    const applicationQuestions = preview.items.filter((item) => item.kind === 'question' && questionKind(this.content.questionById.get(item.id)?.type) === 'application').length;
    const objectiveQuestions = preview.items.filter((item) => item.kind === 'question' && questionKind(this.content.questionById.get(item.id)?.type) === 'objective').length;
    preview.mix = {
      cards: preview.items.filter((item) => item.kind === 'card').length,
      objectiveQuestions,
      applicationQuestions,
      questions: objectiveQuestions + applicationQuestions
    };
    return preview;
  };
}

export { buildAdaptiveSelection };
