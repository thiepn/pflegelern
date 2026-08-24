import * as db from './storage.js';
import { StudyEngine } from './study-engine.js';
import { uid } from './util.js';
import { EXAM_PLAN_SETTING_KEY, examPlanContext, normalizeExamPlan } from './p16-exam-plan-core.js';
import {
  buildExamBlueprint, isExamAnswered, normalizeExamConfig, objectiveQuestionType, summarizeBreakdown
} from './p20-exam-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p20.mockExamV2Patched');

function questionChapter(engine, question) {
  for (const conceptId of question?.conceptIds || []) {
    const chapter = engine.content.conceptChapter(conceptId);
    if (chapter) return chapter;
  }
  return null;
}

function questionInChapters(engine, question, chapterIds) {
  const selected = chapterIds instanceof Set ? chapterIds : new Set(chapterIds || []);
  if (!selected.size) return true;
  return (question?.conceptIds || []).some((id) => {
    const chapter = engine.content.conceptChapter(id);
    return chapter && selected.has(chapter.id);
  });
}

async function p16PlannedChapterIds(engine, options) {
  if (options.chapterId || options.sectionId || options.chapterIds?.length) return [];
  if (!['quick', 'full'].includes(options.mode || 'quick')) return [];
  try {
    const raw = await db.getSetting(EXAM_PLAN_SETTING_KEY, null);
    const valid = new Set(engine.content.chapters.map((c) => c.id));
    const plan = normalizeExamPlan(raw, valid);
    const ctx = examPlanContext(plan, new Date());
    return ctx.active && plan?.scopeType === 'chapters' ? [...plan.chapterIds] : [];
  } catch {
    return [];
  }
}

function candidateMeta(engine, question) {
  const chapter = questionChapter(engine, question);
  const history = engine.questionHistory.get(question.id);
  const weakness = (question.conceptIds || []).length
    ? Math.max(0, ...(question.conceptIds || []).map((id) => engine.weaknessScore(id)))
    : 0;
  return {
    id: question.id,
    type: question.type,
    chapterId: chapter?.id || null,
    conceptIds: question.conceptIds || [],
    lastExamSeenAt: history?.lastExamSeenAt || null,
    weakness
  };
}

function breakdownByType(engine, attempt) {
  const rows = new Map();
  for (const result of attempt.results || []) {
    const q = engine.content.questionById.get(result.id);
    if (!q) continue;
    const row = rows.get(q.type) || { id: q.type, label: questionTypeLabel(q.type), correct: 0, total: 0 };
    row.total += 1;
    if (result.correct) row.correct += 1;
    rows.set(q.type, row);
  }
  return summarizeBreakdown([...rows.values()]);
}

function breakdownByChapter(engine, attempt) {
  const rows = new Map();
  for (const result of attempt.results || []) {
    const q = engine.content.questionById.get(result.id);
    const chapter = questionChapter(engine, q);
    if (!chapter) continue;
    const row = rows.get(chapter.id) || { id: chapter.id, label: chapter.title, number: chapter.number, correct: 0, total: 0 };
    row.total += 1;
    if (result.correct) row.correct += 1;
    rows.set(chapter.id, row);
  }
  return summarizeBreakdown([...rows.values()]).sort((a, b) => a.ratio - b.ratio || String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
}

function questionTypeLabel(type) {
  return ({
    single_choice: 'Einfachauswahl',
    multiple_choice: 'Mehrfachauswahl',
    ordering: 'Reihenfolge',
    matching: 'Zuordnung'
  })[type] || type;
}

function deadlineFor(startedAt, durationMinutes) {
  if (!durationMinutes) return null;
  return new Date(new Date(startedAt).getTime() + durationMinutes * 60_000).toISOString();
}

export function installMockExamPatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousInit = StudyEngine.prototype.init;
  StudyEngine.prototype.init = async function p20Init(...args) {
    const result = await previousInit.apply(this, args);
    globalThis.__PFLEGE_P20_ENGINE__ = this;
    return result;
  };

  StudyEngine.prototype.createExam = async function p20CreateExam(options = {}) {
    const plannedChapterIds = await p16PlannedChapterIds(this, options);
    const chapterIds = options.chapterIds?.length ? options.chapterIds : plannedChapterIds;
    const scope = options.sectionId ? { sectionId: options.sectionId } : options.chapterId ? { chapterId: options.chapterId } : {};
    let questions = this.content.questionsForScope(scope).filter((q) => objectiveQuestionType(q.type));
    if (chapterIds?.length) questions = questions.filter((q) => questionInChapters(this, q, chapterIds));
    if ((options.weakness || options.mode === 'weak') && !this.hasWeaknessEvidence()) return null;
    if (!questions.length) return null;

    const configInput = {
      ...options,
      weakness: options.weakness || options.mode === 'weak',
      chapterIds: chapterIds?.length ? chapterIds : (options.chapterId ? [options.chapterId] : [])
    };
    const config = normalizeExamConfig(configInput, questions.length);
    const seed = `${Date.now()}-${config.mode}-${config.chapterIds.join(',')}-${config.count}`;
    const built = buildExamBlueprint(questions.map((q) => candidateMeta(this, q)), config, seed, new Date());
    if (!built.selected.length) return null;

    const selectedQuestions = built.selected.map((meta) => this.content.questionById.get(meta.id)).filter(Boolean);
    const startedAt = new Date().toISOString();
    const attempt = {
      id: uid('exam'),
      mode: config.mode,
      chapterId: options.chapterId || null,
      sectionId: options.sectionId || null,
      count: selectedQuestions.length,
      startedAt,
      completedAt: null,
      completed: false,
      processed: false,
      currentIndex: 0,
      markedForReview: [],
      answers: {},
      processedQuestionIds: [],
      questions: selectedQuestions.map((q, index) => this.prepareQuestionItem(q, `${startedAt}-p20-${index}`)),
      p20: {
        version: 2,
        configuredCount: config.requestedCount,
        actualCount: selectedQuestions.length,
        timerEnabled: config.timerEnabled,
        durationMinutes: config.durationMinutes,
        deadlineAt: config.timerEnabled ? deadlineFor(startedAt, config.durationMinutes) : null,
        passThreshold: config.passThreshold,
        weakness: config.weakness,
        chapterIds: config.chapterIds,
        blueprint: built.blueprint,
        createdAt: startedAt,
        timeExpired: false
      }
    };
    await db.put('examAttempts', attempt);
    return attempt;
  };

  const previousFinalize = StudyEngine.prototype.finalizeExam;
  StudyEngine.prototype.finalizeExam = async function p20FinalizeExam(attempt) {
    const finalized = await previousFinalize.call(this, attempt);
    const answeredCount = finalized.questions.filter((item) => {
      const q = this.content.questionById.get(item.id);
      return isExamAnswered(q, finalized.answers?.[item.id]);
    }).length;
    const completedAt = new Date(finalized.completedAt || Date.now()).getTime();
    const startedAt = new Date(finalized.startedAt || completedAt).getTime();
    const durationSeconds = Math.max(0, Math.round((completedAt - startedAt) / 1000));
    finalized.p20 = {
      version: 2,
      configuredCount: finalized.p20?.configuredCount ?? finalized.count,
      actualCount: finalized.questions.length,
      timerEnabled: Boolean(finalized.p20?.timerEnabled),
      durationMinutes: finalized.p20?.durationMinutes ?? null,
      deadlineAt: finalized.p20?.deadlineAt ?? null,
      passThreshold: Number(finalized.p20?.passThreshold || 60),
      weakness: Boolean(finalized.p20?.weakness || finalized.mode === 'weak'),
      chapterIds: finalized.p20?.chapterIds || (finalized.chapterId ? [finalized.chapterId] : []),
      blueprint: finalized.p20?.blueprint || null,
      createdAt: finalized.p20?.createdAt || finalized.startedAt,
      timeExpired: Boolean(finalized.p20?.timeExpired),
      answeredCount,
      unansweredCount: Math.max(0, finalized.questions.length - answeredCount),
      flaggedCount: finalized.markedForReview?.length || 0,
      durationSeconds,
      passed: Number(finalized.percentage || 0) >= Number(finalized.p20?.passThreshold || 60),
      typeBreakdown: breakdownByType(this, finalized),
      chapterBreakdown: breakdownByChapter(this, finalized),
      finalizedAt: new Date().toISOString()
    };
    await this.saveExam(finalized);
    return finalized;
  };

  StudyEngine.prototype.p20ExamOverview = function p20ExamOverview(attempt) {
    const marked = new Set(attempt?.markedForReview || []);
    return (attempt?.questions || []).map((item, index) => {
      const q = this.content.questionById.get(item.id);
      return {
        index,
        id: item.id,
        answered: isExamAnswered(q, attempt?.answers?.[item.id]),
        flagged: marked.has(item.id),
        current: index === Number(attempt?.currentIndex || 0)
      };
    });
  };

  StudyEngine.prototype.p20ExamBreakdown = function p20ExamBreakdown(attempt) {
    return {
      types: attempt?.p20?.typeBreakdown || breakdownByType(this, attempt || {}),
      chapters: attempt?.p20?.chapterBreakdown || breakdownByChapter(this, attempt || {})
    };
  };
}
