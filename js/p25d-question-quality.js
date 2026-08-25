import { StudyEngine } from './study-engine.js';
import { mergeSessionExposure } from './p25b-repetition-core.js';
import {
  assessQuestionQuality,
  balancedSingleChoiceOrder,
  qualityWeight,
  summarizeQuestionQuality
} from './p25d-question-quality-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p25d.questionQualityPatched');
const OBJECTIVE_TYPES = new Set(['single_choice', 'multiple_choice', 'ordering', 'matching']);

function copyExposure(exposure) {
  return new Map([...(exposure instanceof Map ? exposure : new Map())].map(([id, row]) => [id, { ...row }]));
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

function sameScope(engine, question, options = {}) {
  if (options.sectionId) return engine.content.questionsForScope({ sectionId: options.sectionId }).some((q) => q.id === question.id);
  if (options.chapterId) return engine.content.questionsForScope({ chapterId: options.chapterId }).some((q) => q.id === question.id);
  const chapterIds = options.chapterIds || [];
  if (!chapterIds.length) return true;
  const selected = new Set(chapterIds);
  return (question.conceptIds || []).some((id) => selected.has(engine.content.conceptChapter(id)?.id));
}

function replacementScore(engine, candidate, original) {
  const quality = qualityWeight(candidate);
  const originalConcepts = new Set(original?.conceptIds || []);
  const ids = candidate?.conceptIds || [];
  const overlap = ids.some((id) => originalConcepts.has(id)) ? 1 : 0;
  const weakness = ids.length ? Math.max(0, ...ids.map((id) => engine.weaknessScore(id))) : 0;
  const attempts = engine.questionHistory.get(candidate.id)?.attempts || 0;
  return quality * 1.8 + overlap * 0.55 + weakness * 0.20 + (attempts ? 0 : 0.12);
}

export function applyQuestionQualityGuard(engine, items = [], {
  seed = Date.now(),
  candidateQuestions = null
} = {}) {
  const result = [...items];
  const used = new Set(result.filter((item) => item?.kind === 'question').map((item) => item.id));
  const sourcePool = Array.isArray(candidateQuestions) ? candidateQuestions : engine.content.questions;
  let replacements = 0;
  let retainedWeak = 0;

  for (let index = 0; index < result.length; index += 1) {
    const item = result[index];
    if (item?.kind !== 'question') continue;
    const original = engine.content.questionById.get(item.id);
    if (!original) continue;
    const quality = assessQuestionQuality(original);
    if (quality.selectable) continue;

    const chapters = questionChapterIds(engine, original);
    const alternatives = sourcePool
      .filter((candidate) =>
        candidate.id !== original.id &&
        candidate.type === original.type &&
        !used.has(candidate.id) &&
        sharesChapter(engine, candidate, chapters) &&
        assessQuestionQuality(candidate).selectable
      )
      .map((candidate) => ({ candidate, score: replacementScore(engine, candidate, original) }))
      .sort((a, b) => b.score - a.score || String(a.candidate.id).localeCompare(String(b.candidate.id)));

    const replacement = alternatives[0]?.candidate;
    if (!replacement) {
      retainedWeak += 1;
      continue;
    }
    used.delete(original.id);
    used.add(replacement.id);
    result[index] = engine.prepareQuestionItem(replacement, `${seed}-p25d-${index}-${replacement.id}`);
    replacements += 1;
  }

  return { items: result, replacements, retainedWeak };
}

export function installQuestionQualityPatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousPrepare = StudyEngine.prototype.prepareQuestionItem;
  StudyEngine.prototype.prepareQuestionItem = function p25dPrepareQuestionItem(question, seed = Date.now()) {
    const item = previousPrepare.call(this, question, seed);
    if (question?.type === 'single_choice') {
      item.variant ||= {};
      item.variant.optionOrder = balancedSingleChoiceOrder(question, seed);
      item.variant.p25dBalanced = true;
    }
    const quality = assessQuestionQuality(question);
    item.variant ||= {};
    item.variant.p25dQuality = { score: quality.score, tier: quality.tier };
    return item;
  };

  const previousSelectRecommended = StudyEngine.prototype.selectRecommended;
  StudyEngine.prototype.selectRecommended = function p25dSelectRecommended(options = {}) {
    const items = previousSelectRecommended.call(this, options);
    return applyQuestionQualityGuard(this, items, { seed: options.seed ?? Date.now() }).items;
  };

  const previousCreateScopedSession = StudyEngine.prototype.createScopedSession;
  StudyEngine.prototype.createScopedSession = async function p25dCreateScopedSession(options = {}) {
    const exposureBefore = copyExposure(this.p25bSessionExposure);
    const session = await previousCreateScopedSession.call(this, options);
    if (!session || !session.items?.some((item) => item.kind === 'question')) return session;
    const candidateQuestions = this.content.questionsForScope({
      chapterId: options.chapterId || null,
      sectionId: options.sectionId || null
    });
    const guarded = applyQuestionQualityGuard(this, session.items, {
      seed: `${session.id}-p25d-scoped`,
      candidateQuestions
    });
    if (guarded.replacements) {
      session.items = guarded.items;
      session.p25d = { replacements: guarded.replacements, retainedWeak: guarded.retainedWeak };
      await this.saveSession(session);
      if (this.p25bSessionExposure instanceof Map) this.p25bSessionExposure = mergeSessionExposure(exposureBefore, session);
    }
    return session;
  };

  const previousCreateExam = StudyEngine.prototype.createExam;
  StudyEngine.prototype.createExam = async function p25dCreateExam(options = {}) {
    const attempt = await previousCreateExam.call(this, options);
    if (!attempt?.questions?.length) return attempt;
    const pool = this.content.questions.filter((question) => OBJECTIVE_TYPES.has(question.type) && sameScope(this, question, {
      sectionId: attempt.sectionId || options.sectionId || null,
      chapterId: attempt.chapterId || options.chapterId || null,
      chapterIds: attempt.p20?.chapterIds || options.chapterIds || []
    }));
    const guarded = applyQuestionQualityGuard(this, attempt.questions, {
      seed: `${attempt.id}-p25d-exam`,
      candidateQuestions: pool
    });
    if (guarded.replacements) {
      attempt.questions = guarded.items;
      attempt.count = guarded.items.length;
      attempt.p20 ||= {};
      attempt.p20.actualCount = guarded.items.length;
      await this.saveExam(attempt);
    }
    attempt.p25d = {
      version: 1,
      replacements: guarded.replacements,
      retainedWeak: guarded.retainedWeak
    };
    await this.saveExam(attempt);
    return attempt;
  };

  StudyEngine.prototype.p25dQuestionQuality = function p25dQuestionQuality(questionOrId) {
    const question = typeof questionOrId === 'string' ? this.content.questionById.get(questionOrId) : questionOrId;
    return assessQuestionQuality(question || {});
  };

  StudyEngine.prototype.p25dQuestionQualitySummary = function p25dQuestionQualitySummary() {
    return summarizeQuestionQuality(this.content.questions);
  };
}
