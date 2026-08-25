import * as db from './storage.js';
import { StudyEngine } from './study-engine.js';
import { stableShuffle } from './util.js';
import {
  buildRecentSessionExposure,
  isHardRepeat,
  mergeSessionExposure,
  questionRepetitionSignal,
  repetitionPenalty
} from './p25b-repetition-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p25b.repetitionPatched');

function copyExposure(exposure) {
  return new Map([...(exposure instanceof Map ? exposure : new Map())].map(([id, row]) => [id, { ...row }]));
}

function signalFor(engine, questionId, exposure = engine.p25bSessionExposure) {
  const history = engine.questionHistory.get(questionId);
  const session = exposure?.get(questionId);
  return questionRepetitionSignal({
    lastAnsweredAt: history?.lastSeenAt,
    lastSessionAt: session?.lastSessionAt,
    recentSessionRank: session?.recentSessionRank,
    sessionCount: session?.sessionCount
  });
}

function questionChapterIds(engine, question) {
  return new Set((question?.conceptIds || []).map((id) => engine.content.conceptChapter(id)?.id).filter(Boolean));
}

function sharesChapter(engine, question, chapterIds) {
  if (!chapterIds.size) return true;
  return (question?.conceptIds || []).some((id) => {
    const chapter = engine.content.conceptChapter(id);
    return chapter && chapterIds.has(chapter.id);
  });
}

function alternativeScore(engine, question, originalConcepts, signal) {
  const ids = question.conceptIds || [];
  const overlap = ids.some((id) => originalConcepts.has(id)) ? 1 : 0;
  const weakness = ids.length ? Math.max(0, ...ids.map((id) => engine.weaknessScore(id))) : 0;
  const attempts = engine.questionHistory.get(question.id)?.attempts || 0;
  return overlap * 0.55 + weakness * 0.30 + (attempts ? 0 : 0.18) - repetitionPenalty(signal);
}

export function applyQuestionRepetitionGuard(engine, items = [], {
  seed = Date.now(),
  exposure = engine.p25bSessionExposure,
  candidateQuestions = null
} = {}) {
  const result = [...items];
  const used = new Set(result.filter((item) => item?.kind === 'question').map((item) => item.id));
  const sourcePool = Array.isArray(candidateQuestions) ? candidateQuestions : engine.content.questions;

  for (let index = 0; index < result.length; index += 1) {
    const item = result[index];
    if (item?.kind !== 'question') continue;
    const original = engine.content.questionById.get(item.id);
    if (!original) continue;
    const signal = signalFor(engine, original.id, exposure);
    if (!isHardRepeat(signal)) continue;

    const originalConcepts = new Set(original.conceptIds || []);
    const originalChapters = questionChapterIds(engine, original);
    const candidates = stableShuffle(
      sourcePool.filter((candidate) =>
        candidate.type === original.type &&
        !used.has(candidate.id) &&
        sharesChapter(engine, candidate, originalChapters)
      ),
      `${seed}-p25b-${index}-${original.type}`
    )
      .map((candidate) => ({
        candidate,
        signal: signalFor(engine, candidate.id, exposure)
      }))
      .filter((row) => !isHardRepeat(row.signal))
      .map((row) => ({
        ...row,
        score: alternativeScore(engine, row.candidate, originalConcepts, row.signal)
      }))
      .sort((a, b) => b.score - a.score);

    const replacement = candidates[0]?.candidate;
    if (!replacement) continue;
    used.delete(original.id);
    used.add(replacement.id);
    result[index] = engine.prepareQuestionItem(replacement, `${seed}-p25b-replacement-${index}`);
  }
  return result;
}

export function installQuestionRepetitionPatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousInit = StudyEngine.prototype.init;
  StudyEngine.prototype.init = async function p25bInit(...args) {
    const result = await previousInit.apply(this, args);
    const sessions = await db.getAll('sessions');
    this.p25bSessionExposure = buildRecentSessionExposure(sessions);
    return result;
  };

  const previousSelectRecommended = StudyEngine.prototype.selectRecommended;
  StudyEngine.prototype.selectRecommended = function p25bSelectRecommended(options = {}) {
    const items = previousSelectRecommended.call(this, options);
    return applyQuestionRepetitionGuard(this, items, {
      seed: options.seed ?? Date.now(),
      exposure: this.p25bSessionExposure
    });
  };

  const previousCreateSession = StudyEngine.prototype.createSession;
  StudyEngine.prototype.createSession = async function p25bCreateSession(config) {
    const session = await previousCreateSession.call(this, config);
    if (session) this.p25bSessionExposure = mergeSessionExposure(this.p25bSessionExposure, session);
    return session;
  };

  const previousCreateScopedSession = StudyEngine.prototype.createScopedSession;
  StudyEngine.prototype.createScopedSession = async function p25bCreateScopedSession(options = {}) {
    const before = copyExposure(this.p25bSessionExposure);
    const session = await previousCreateScopedSession.call(this, options);
    if (!session || !session.items?.some((item) => item.kind === 'question')) return session;
    const scope = { chapterId: options.chapterId || null, sectionId: options.sectionId || null };
    const scopedQuestions = this.content.questionsForScope(scope);
    session.items = applyQuestionRepetitionGuard(this, session.items, {
      seed: `${session.id}-p25b-scoped`,
      exposure: before,
      candidateQuestions: scopedQuestions
    });
    await this.saveSession(session);
    this.p25bSessionExposure = mergeSessionExposure(before, session);
    return session;
  };
}
