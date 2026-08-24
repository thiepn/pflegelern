import * as db from './storage.js';
import { StudyEngine } from './study-engine.js';
import { Rating, isDue } from './fsrs.js';
import { stableShuffle } from './util.js';
import {
  APPLICATION_TYPES, OBJECTIVE_TYPES, evidenceWeight, immediateOffsets, isFollowupDue,
  localDayKey, normalizeRemediation, onFailure, onIndependentSuccess, remediationPriority
} from './p19-remediation-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p19.weaknessRemediationPatched');
const DAY_MS = 86_400_000;

function intersects(a = [], b = []) {
  const set = b instanceof Set ? b : new Set(b);
  return a.some((x) => set.has(x));
}

function itemConceptIds(engine, item) {
  if (item?.kind === 'card') {
    const id = engine.content.cardById.get(item.id)?.conceptId;
    return id ? [id] : [];
  }
  if (item?.kind === 'question') return engine.content.questionById.get(item.id)?.conceptIds || [];
  return [];
}

function unresolvedMistakesForConcepts(engine, conceptIds = []) {
  const concepts = new Set(conceptIds);
  return [...engine.mistakes.values()]
    .filter((m) => !m.resolved && intersects(m.conceptIds || [], concepts))
    .sort((a, b) => remediationPriority(b) - remediationPriority(a) || new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));
}

function anchorMatches(mistake, contentType, contentId) {
  return mistake?.contentType === contentType && mistake?.contentId === contentId;
}

async function persistMistake(engine, mistake) {
  engine.mistakes.set(mistake.id, mistake);
  await db.put('mistakes', mistake);
}

function latestAnchorMistake(engine, contentType, contentId) {
  return [...engine.mistakes.values()]
    .filter((m) => !m.resolved && anchorMatches(m, contentType, contentId))
    .sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0))[0] || null;
}

function seenInSession(session, kind, id) {
  return (session?.items || []).some((item) => item.kind === kind && item.id === id);
}

function nearbyIds(session, afterIndex, window = 14) {
  const slice = (session?.items || []).slice(Math.max(0, afterIndex - 2), afterIndex + window);
  return {
    cards: new Set(slice.filter((x) => x.kind === 'card').map((x) => x.id)),
    questions: new Set(slice.filter((x) => x.kind === 'question').map((x) => x.id))
  };
}

function questionAgeDays(engine, qid) {
  const stamp = engine.questionHistory.get(qid)?.lastSeenAt;
  if (!stamp) return Infinity;
  return Math.max(0, (Date.now() - new Date(stamp).getTime()) / DAY_MS);
}

function candidateCards(engine, mistake, conceptIds, excluded = new Set()) {
  const anchor = mistake?.contentType === 'card' ? mistake.contentId : null;
  const cards = conceptIds.flatMap((id) => engine.content.cardsByConcept.get(id) || []);
  const unique = [...new Map(cards.map((c) => [c.id, c])).values()];
  return unique.sort((a, b) => {
    const aPenalty = a.id === anchor ? 10 : 0;
    const bPenalty = b.id === anchor ? 10 : 0;
    const aExcluded = excluded.has(a.id) ? 3 : 0;
    const bExcluded = excluded.has(b.id) ? 3 : 0;
    return (aPenalty + aExcluded) - (bPenalty + bExcluded) || engine.priorityForCard(b) - engine.priorityForCard(a);
  });
}

function candidateQuestions(engine, mistake, conceptIds, role, excluded = new Set()) {
  const anchor = mistake?.contentType === 'question' ? mistake.contentId : null;
  const set = new Set(conceptIds);
  const eligible = engine.content.questions.filter((q) => {
    if (q.id === anchor || excluded.has(q.id) || !intersects(q.conceptIds || [], set)) return false;
    if (role === 'objective') return OBJECTIVE_TYPES.has(q.type);
    if (role === 'application') return APPLICATION_TYPES.has(q.type);
    return true;
  });
  return eligible.sort((a, b) => {
    const wa = Math.max(0, ...(a.conceptIds || []).map((id) => engine.weaknessScore(id)));
    const wb = Math.max(0, ...(b.conceptIds || []).map((id) => engine.weaknessScore(id)));
    return wb - wa || questionAgeDays(engine, b.id) - questionAgeDays(engine, a.id);
  });
}

function chooseImmediateItems(engine, session, mistake, conceptIds, afterIndex) {
  const nearby = nearbyIds(session, afterIndex);
  const selected = [];

  const cards = candidateCards(engine, mistake, conceptIds, nearby.cards);
  const support = cards.find((card) => !seenInSession(session, 'card', card.id));
  if (support) selected.push({ kind: 'card', id: support.id, remediation: { mistakeId: mistake.id, stage: 'support' } });

  const transfer = candidateQuestions(engine, mistake, conceptIds, 'objective', nearby.questions)
    .find((q) => questionAgeDays(engine, q.id) >= 0.5 && !seenInSession(session, 'question', q.id));
  if (transfer) selected.push({ ...engine.prepareQuestionItem(transfer, `${session.id}-p19-transfer`), remediation: { mistakeId: mistake.id, stage: 'transfer' } });

  const application = candidateQuestions(engine, mistake, conceptIds, 'application', nearby.questions)
    .find((q) => questionAgeDays(engine, q.id) >= 0.5 && !seenInSession(session, 'question', q.id));
  if (application) selected.push({ ...engine.prepareQuestionItem(application, `${session.id}-p19-application`), remediation: { mistakeId: mistake.id, stage: 'application' } });

  return selected.slice(0, 3);
}

function chooseFollowupItem(engine, mistake, seed) {
  const conceptIds = mistake.conceptIds || [];
  const app = candidateQuestions(engine, mistake, conceptIds, 'application')
    .find((q) => questionAgeDays(engine, q.id) >= 1);
  if (app) return { ...engine.prepareQuestionItem(app, `${seed}-${mistake.id}-app`), remediation: { mistakeId: mistake.id, stage: 'spaced_followup' } };

  const objective = candidateQuestions(engine, mistake, conceptIds, 'objective')
    .find((q) => questionAgeDays(engine, q.id) >= 1);
  if (objective) return { ...engine.prepareQuestionItem(objective, `${seed}-${mistake.id}-obj`), remediation: { mistakeId: mistake.id, stage: 'spaced_followup' } };

  const cards = candidateCards(engine, mistake, conceptIds);
  const card = cards.find((c) => c.id !== mistake.contentId) || cards[0];
  return card ? { kind: 'card', id: card.id, remediation: { mistakeId: mistake.id, stage: 'spaced_followup' } } : null;
}

function replaceableIndex(engine, items, candidate) {
  const candidateConcepts = new Set(itemConceptIds(engine, candidate));
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item?.remediation) continue;
    if (item.kind === 'card') {
      const state = engine.cardStates.get(item.id);
      if (state?.reps && isDue(state, new Date())) continue;
    }
    const nearby = items.slice(Math.max(0, i - 3), Math.min(items.length, i + 4));
    if (nearby.some((x) => intersects(itemConceptIds(engine, x), candidateConcepts))) continue;
    return i;
  }
  return -1;
}

function addDueFollowups(engine, baseItems, seed) {
  const now = new Date();
  const today = localDayKey(now);
  const due = [...engine.mistakes.values()]
    .filter((m) => !m.resolved && isFollowupDue(m.p19, now) && m.p19?.lastFollowupQueuedDay !== today)
    .sort((a, b) => remediationPriority(b, now) - remediationPriority(a, now));
  if (!due.length) return baseItems;

  const items = baseItems.map((x) => ({ ...x, variant: x.variant ? { ...x.variant } : x.variant }));
  const usedConceptSignatures = new Set();
  let inserted = 0;
  for (const mistake of due) {
    if (inserted >= 2) break;
    const signature = [...new Set(mistake.conceptIds || [])].sort().join('|');
    if (usedConceptSignatures.has(signature)) continue;
    const candidate = chooseFollowupItem(engine, mistake, seed);
    if (!candidate || items.some((x) => x.kind === candidate.kind && x.id === candidate.id)) continue;
    const index = replaceableIndex(engine, items, candidate);
    if (index < 0) continue;
    items[index] = candidate;
    usedConceptSignatures.add(signature);
    inserted += 1;
  }
  return items;
}

async function markQueuedFollowups(engine, session) {
  if (!session) return;
  const today = localDayKey(new Date());
  const ids = new Set((session.items || [])
    .filter((x) => x.remediation?.stage === 'spaced_followup')
    .map((x) => x.remediation?.mistakeId)
    .filter(Boolean));
  for (const id of ids) {
    const mistake = engine.mistakes.get(id);
    if (!mistake || mistake.resolved) continue;
    mistake.p19 = normalizeRemediation(mistake.p19);
    mistake.p19.lastFollowupQueuedDay = today;
    mistake.p19.lastFollowupQueuedAt = new Date().toISOString();
    await persistMistake(engine, mistake);
  }
}

async function propagateFailure(engine, conceptIds, contentType, contentId) {
  const now = new Date();
  for (const mistake of unresolvedMistakesForConcepts(engine, conceptIds)) {
    if (anchorMatches(mistake, contentType, contentId)) continue;
    mistake.p19 = onFailure(mistake.p19, now);
    await persistMistake(engine, mistake);
  }
}

async function recordIndependentSuccess(engine, conceptIds, { contentType, contentId, questionType = '', source = 'practice' }) {
  const now = new Date();
  const day = localDayKey(now);
  const at = now.toISOString();
  for (const mistake of unresolvedMistakesForConcepts(engine, conceptIds)) {
    const sameAnchor = anchorMatches(mistake, contentType, contentId);
    const weight = evidenceWeight({ contentType, sameAnchor, questionType, source });
    if (weight <= 0) continue;
    mistake.p19 = onIndependentSuccess(mistake.p19, { day, at, weight });
    if (mistake.p19.status === 'resolved') mistake.resolved = true;
    await persistMistake(engine, mistake);
  }
}

function buildExamReviewItems(engine, attempt) {
  const wrongQuestionIds = new Set((attempt?.results || []).filter((r) => !r.correct).map((r) => r.id));
  const concepts = engine.examWeakConceptIds(attempt)
    .sort((a, b) => engine.weaknessScore(b) - engine.weaknessScore(a))
    .slice(0, 12);
  const items = [];
  const used = new Set();
  for (const conceptId of concepts) {
    const mistake = unresolvedMistakesForConcepts(engine, [conceptId])[0] || { id: `exam:${attempt.id}:${conceptId}`, contentType: 'question', contentId: '', conceptIds: [conceptId] };
    const card = candidateCards(engine, mistake, [conceptId]).find((c) => !used.has(`card:${c.id}`));
    if (card && items.length < 30) {
      items.push({ kind: 'card', id: card.id, remediation: { mistakeId: mistake.id, stage: 'exam_support' } });
      used.add(`card:${card.id}`);
    }
    const objective = candidateQuestions(engine, mistake, [conceptId], 'objective')
      .find((q) => !wrongQuestionIds.has(q.id) && !used.has(`question:${q.id}`));
    if (objective && items.length < 30) {
      items.push({ ...engine.prepareQuestionItem(objective, `${attempt.id}-p19-obj-${conceptId}`), remediation: { mistakeId: mistake.id, stage: 'exam_transfer' } });
      used.add(`question:${objective.id}`);
    }
    const application = candidateQuestions(engine, mistake, [conceptId], 'application')
      .find((q) => !wrongQuestionIds.has(q.id) && !used.has(`question:${q.id}`));
    if (application && items.length < 30) {
      items.push({ ...engine.prepareQuestionItem(application, `${attempt.id}-p19-app-${conceptId}`), remediation: { mistakeId: mistake.id, stage: 'exam_application' } });
      used.add(`question:${application.id}`);
    }
  }
  return stableShuffle(items, `${attempt.id}-p19-review`);
}

export function installWeaknessRemediationPatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousAddMistake = StudyEngine.prototype.addMistake;
  StudyEngine.prototype.addMistake = async function p19AddMistake(contentType, contentId, conceptIds) {
    await previousAddMistake.call(this, contentType, contentId, conceptIds);
    const mistake = latestAnchorMistake(this, contentType, contentId);
    if (!mistake) return;
    mistake.p19 = onFailure(mistake.p19, new Date());
    await persistMistake(this, mistake);
  };

  const previousInject = StudyEngine.prototype.injectReinforcement;
  StudyEngine.prototype.p19LegacyInjectReinforcement = previousInject;
  StudyEngine.prototype.injectReinforcement = async function p19InjectReinforcement(session, conceptIds, afterIndex = session.currentIndex) {
    if (!session || !conceptIds?.length) return session;
    const mistake = unresolvedMistakesForConcepts(this, conceptIds)[0];
    if (!mistake) return previousInject.call(this, session, conceptIds, afterIndex);
    const r = normalizeRemediation(mistake.p19);
    const last = r.immediateInjectedAt ? new Date(r.immediateInjectedAt).getTime() : 0;
    if (last && Date.now() - last < 6 * 60 * 60 * 1000) return session;

    const additions = chooseImmediateItems(this, session, mistake, conceptIds, afterIndex);
    if (!additions.length) return previousInject.call(this, session, conceptIds, afterIndex);
    const offsets = immediateOffsets(additions.length);
    let inserted = 0;
    additions.forEach((item, i) => {
      const index = Math.min(session.items.length, afterIndex + offsets[i] + inserted);
      session.items.splice(index, 0, item);
      inserted += 1;
    });
    mistake.p19 = r;
    mistake.p19.immediateInjectedAt = new Date().toISOString();
    mistake.p19.immediateItems = additions.map((x) => `${x.kind}:${x.id}:${x.remediation?.stage || ''}`);
    await persistMistake(this, mistake);
    await this.saveSession(session);
    return session;
  };

  const previousCardReview = StudyEngine.prototype.recordCardReview;
  StudyEngine.prototype.recordCardReview = async function p19RecordCardReview(cardId, rating, options = {}) {
    const result = await previousCardReview.call(this, cardId, rating, options);
    const card = this.content.cardById.get(cardId);
    if (!card) return result;
    if (Number(rating) === Rating.AGAIN) await propagateFailure(this, [card.conceptId], 'card', cardId);
    else await recordIndependentSuccess(this, [card.conceptId], { contentType: 'card', contentId: cardId, source: options.source || 'recommended' });
    return result;
  };

  const previousQuestionResult = StudyEngine.prototype.recordQuestionResult;
  StudyEngine.prototype.recordQuestionResult = async function p19RecordQuestionResult(questionId, correct, options = {}) {
    const result = await previousQuestionResult.call(this, questionId, correct, options);
    const q = this.content.questionById.get(questionId);
    if (!q) return result;
    if (!correct) await propagateFailure(this, q.conceptIds || [], 'question', questionId);
    else await recordIndependentSuccess(this, q.conceptIds || [], {
      contentType: 'question', contentId: questionId, questionType: q.type, source: options.source || 'practice'
    });
    return result;
  };

  const previousSelectRecommended = StudyEngine.prototype.selectRecommended;
  StudyEngine.prototype.selectRecommended = function p19SelectRecommended(options = {}) {
    const base = previousSelectRecommended.call(this, options);
    return addDueFollowups(this, base, options.seed ?? Date.now());
  };

  const previousCreateRecommended = StudyEngine.prototype.createRecommendedSession;
  StudyEngine.prototype.createRecommendedSession = async function p19CreateRecommended(options = {}) {
    const session = await previousCreateRecommended.call(this, options);
    await markQueuedFollowups(this, session);
    return session;
  };

  const previousExamReview = StudyEngine.prototype.createExamReviewSession;
  StudyEngine.prototype.p19LegacyExamReviewSession = previousExamReview;
  StudyEngine.prototype.createExamReviewSession = async function p19ExamReviewSession(attempt) {
    const items = buildExamReviewItems(this, attempt);
    if (!items.length) return previousExamReview.call(this, attempt);
    return this.createSession({
      type: 'exam-review',
      items,
      source: 'topic',
      title: 'Fehler gezielt lernen',
      options: { examId: attempt.id, p19Remediation: true }
    });
  };
}

export { addDueFollowups, buildExamReviewItems, chooseImmediateItems };
