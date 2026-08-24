import * as db from './storage.js';
import { StudyEngine } from './study-engine.js';
import { Rating } from './fsrs.js';
import { localDayKey } from './p16-exam-plan-core.js';
import {
  computeMasteryModel,
  normalizeMasteryEvidence,
  recordMasteryEvidence
} from './p18-mastery-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p18.masteryModelPatched');
const OBJECTIVE_TYPES = new Set(['single_choice', 'multiple_choice', 'ordering', 'matching']);
const PRODUCTIVE_DRAFT_PREFIX = 'pflegelern:p15:recall:';
const DAY_MS = 86_400_000;
const pendingProductiveRecall = new Map();
let bridgeStarted = false;

function clamp01(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function outcomeForRating(rating) {
  if (Number(rating) === Rating.AGAIN) return 'failure';
  if (Number(rating) === Rating.HARD) return 'hard';
  return 'success';
}

function boundedLegacySignal(correct = 0, hard = 0, wrong = 0, cap = 0.76) {
  const c = Math.max(0, Number(correct || 0));
  const h = Math.max(0, Number(hard || 0));
  const w = Math.max(0, Number(wrong || 0));
  const total = c + h + w;
  if (!total) return 0;
  const accuracy = (c + h * 0.5) / total;
  // Historical counters do not encode distinct study days, so they are intentionally capped.
  const confidence = Math.min(cap, 0.48 + Math.log2(total + 1) * 0.08);
  return clamp01(accuracy * confidence);
}

function historySignal(engine, conceptId, predicate, cap) {
  let correct = 0;
  let wrong = 0;
  for (const q of engine.content.questionsByConcept.get(conceptId) || []) {
    if (!predicate(q)) continue;
    const h = engine.questionHistory.get(q.id);
    if (!h) continue;
    correct += Number(h.correct || 0);
    wrong += Number(h.incorrect || 0);
  }
  return boundedLegacySignal(correct, 0, wrong, cap);
}

function cardMasterySignal(engine, conceptId) {
  const cards = engine.content.cardsByConcept.get(conceptId) || [];
  if (!cards.length) return 0;
  let safe = 0;
  let reviewed = 0;
  let maxStability = 0;
  for (const card of cards) {
    const state = engine.cardStates.get(card.id);
    if (state?.reps) {
      reviewed += 1;
      maxStability = Math.max(maxStability, Number(state.stability || 0));
    }
    if (engine.visibleCardStatus(card.id) === 'safe') safe += 1;
  }
  const safeRatio = safe / cards.length;
  const reviewedRatio = reviewed / cards.length;
  const stabilitySignal = reviewed ? Math.min(1, Math.log1p(maxStability) / Math.log(31)) * reviewedRatio : 0;
  return clamp01(safeRatio * 0.82 + stabilitySignal * 0.18);
}

function legacySignals(engine, conceptId) {
  const cs = engine.conceptState(conceptId);
  const cardSignal = cardMasterySignal(engine, conceptId);
  const cued = Math.max(
    boundedLegacySignal(cs.flashCorrect, cs.flashHard, cs.flashWrong, 0.72),
    cardSignal * 0.90
  );
  const productive = historySignal(engine, conceptId, (q) => q.type === 'short_answer', 0.68);
  const objective = historySignal(engine, conceptId, (q) => OBJECTIVE_TYPES.has(q.type), 0.76);
  const application = historySignal(engine, conceptId, (q) => q.type === 'clinical_case', 0.72);
  const exam = boundedLegacySignal(cs.examCorrect, 0, cs.examWrong, 0.80);
  return { cued, productive, objective, exam, application, cardSignal };
}

function eligibility(engine, conceptId) {
  const questions = engine.content.questionsByConcept.get(conceptId) || [];
  return {
    objective: questions.some((q) => OBJECTIVE_TYPES.has(q.type)),
    application: questions.some((q) => q.type === 'clinical_case')
  };
}

function hasRecentFailure(engine, conceptId, now = Date.now()) {
  const stamp = engine.conceptState(conceptId).lastFailureAt;
  if (!stamp) return false;
  const time = new Date(stamp).getTime();
  return Number.isFinite(time) && now - time < 3 * DAY_MS;
}

export function masteryModelForConcept(engine, conceptId) {
  const cs = engine.conceptState(conceptId);
  const legacy = legacySignals(engine, conceptId);
  const eligible = eligibility(engine, conceptId);
  return computeMasteryModel({
    evidence: cs.p18Evidence,
    legacy,
    cardSignal: legacy.cardSignal,
    eligibleObjective: eligible.objective,
    eligibleApplication: eligible.application,
    recentFailure: hasRecentFailure(engine, conceptId)
  });
}

function draftKey(cardId) {
  return `${PRODUCTIVE_DRAFT_PREFIX}${cardId}`;
}

function readDraft(cardId) {
  if (!cardId || typeof sessionStorage === 'undefined') return '';
  try { return sessionStorage.getItem(draftKey(cardId)) || ''; } catch { return ''; }
}

function rememberProductiveAttempt(cardId) {
  if (!cardId) return;
  const draft = readDraft(cardId).trim();
  if (draft) pendingProductiveRecall.set(cardId, { typed: true, capturedAt: new Date().toISOString() });
}

function consumeProductiveAttempt(cardId) {
  const pending = pendingProductiveRecall.get(cardId) || null;
  pendingProductiveRecall.delete(cardId);
  const liveDraft = readDraft(cardId).trim();
  try { sessionStorage.removeItem(draftKey(cardId)); } catch {}
  return Boolean(pending?.typed || liveDraft);
}

function currentCardId(root = document) {
  const flashcard = root.querySelector?.('.flashcard');
  if (flashcard?.dataset.cardId) return flashcard.dataset.cardId;
  return root.querySelector?.('.study-topbar [data-card-id]')?.dataset.cardId || '';
}

function bridgeCardIdentity(root = document) {
  const flashcard = root.querySelector?.('.flashcard');
  if (!flashcard || flashcard.dataset.cardId) return false;
  const cardId = root.querySelector?.('.study-topbar [data-card-id]')?.dataset.cardId || '';
  if (!cardId) return false;
  flashcard.dataset.cardId = cardId;
  return true;
}

export function initMasteryInteractionBridge() {
  if (bridgeStarted || typeof document === 'undefined') return;
  bridgeStarted = true;
  const main = document.getElementById('main');
  if (main) {
    bridgeCardIdentity(main);
    new MutationObserver(() => bridgeCardIdentity(main)).observe(main, { childList: true, subtree: true });
  }

  // This capture listener runs before P15 clears its temporary draft on a rating click.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-action="rate-card"]');
    if (!button) return;
    rememberProductiveAttempt(currentCardId(document));
  }, true);

  // Keyboard ratings do not go through P15's click cleanup, so preserve the same evidence path.
  document.addEventListener('keydown', (event) => {
    if (!['1', '2', '3'].includes(event.key)) return;
    if (!document.querySelector('.rating-grid')) return;
    rememberProductiveAttempt(currentCardId(document));
  }, true);
}

export function installMasteryModelPatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousConceptMastery = StudyEngine.prototype.conceptMastery;
  StudyEngine.prototype.p18LegacyConceptMastery = previousConceptMastery;
  StudyEngine.prototype.masteryModel = function p18MasteryModel(conceptId) {
    return masteryModelForConcept(this, conceptId);
  };
  StudyEngine.prototype.conceptMastery = function p18ConceptMastery(conceptId) {
    return this.masteryModel(conceptId).score;
  };
  StudyEngine.prototype.masteryLabel = function p18MasteryLabel(conceptId) {
    return this.masteryModel(conceptId).label;
  };

  const previousCardReview = StudyEngine.prototype.recordCardReview;
  StudyEngine.prototype.recordCardReview = async function p18RecordCardReview(cardId, rating, options = {}) {
    const productiveAttempt = consumeProductiveAttempt(cardId);
    const result = await previousCardReview.call(this, cardId, rating, options);
    const card = this.content.cardById.get(cardId);
    if (!card) return result;

    const now = new Date();
    const day = localDayKey(now);
    const at = now.toISOString();
    const spacedEvent = !result?.earlyPractice && !result?.wasNew;
    const outcome = outcomeForRating(rating);
    const cs = this.conceptState(card.conceptId);
    let evidence = normalizeMasteryEvidence(cs.p18Evidence);
    evidence = recordMasteryEvidence(evidence, { channel: 'cued', outcome, day, at, spaced: spacedEvent });
    if (productiveAttempt) {
      evidence = recordMasteryEvidence(evidence, { channel: 'productive', outcome, day, at, spaced: false });
    }
    cs.p18Evidence = evidence;
    cs.masteryModelVersion = 2;
    cs.updatedAt = at;
    this.conceptStates.set(card.conceptId, cs);
    await db.put('conceptState', cs);
    return result;
  };

  const previousQuestionResult = StudyEngine.prototype.recordQuestionResult;
  StudyEngine.prototype.recordQuestionResult = async function p18RecordQuestionResult(questionId, correct, options = {}) {
    const result = await previousQuestionResult.call(this, questionId, correct, options);
    const q = this.content.questionById.get(questionId);
    if (!q) return result;
    const now = new Date();
    const day = localDayKey(now);
    const at = now.toISOString();
    const source = options?.source || 'practice';
    const channel = source === 'exam'
      ? 'exam'
      : q.type === 'clinical_case'
        ? 'application'
        : q.type === 'short_answer'
          ? 'productive'
          : 'objective';
    const outcome = correct ? 'success' : 'failure';

    for (const conceptId of q.conceptIds || []) {
      const cs = this.conceptState(conceptId);
      cs.p18Evidence = recordMasteryEvidence(cs.p18Evidence, { channel, outcome, day, at, spaced: false });
      cs.masteryModelVersion = 2;
      cs.updatedAt = at;
      this.conceptStates.set(conceptId, cs);
      await db.put('conceptState', cs);
    }
    return result;
  };
}
