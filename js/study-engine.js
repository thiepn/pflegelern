import * as db from './storage.js';
import { CardState, Rating, createFsrsState, isDue, scheduleReview } from './fsrs.js';
import { addDays, clamp, dayKey, stableShuffle, uid } from './util.js';

const IMPORTANCE_WEIGHT = { core: 1, important: 0.68, detail: 0.36 };
const AUTO_GRADABLE = new Set(['single_choice', 'multiple_choice', 'ordering', 'matching']);

export class StudyEngine {
  constructor(content) {
    this.content = content;
    this.cardStates = new Map();
    this.conceptStates = new Map();
    this.bookmarks = new Map();
    this.mistakes = new Map();
    this.history = new Map();
    this.questionHistory = new Map();
  }

  async init() {
    const [cardStates, conceptStates, bookmarks, mistakes, history, questionHistory] = await Promise.all([
      db.getAll('cardState'), db.getAll('conceptState'), db.getAll('bookmarks'), db.getAll('mistakes'), db.getAll('history'), db.getAll('questionHistory')
    ]);
    this.cardStates = new Map(cardStates.map((x) => [x.cardId, x]));
    this.conceptStates = new Map(conceptStates.map((x) => [x.conceptId, x]));
    this.bookmarks = new Map(bookmarks.map((x) => [x.id, x]));
    this.mistakes = new Map(mistakes.map((x) => [x.id, x]));
    this.history = new Map(history.map((x) => [x.date, x]));
    this.questionHistory = new Map(questionHistory.map((x) => [x.questionId, x]));
  }

  cardState(cardId) {
    return { ...createFsrsState(cardId), ...(this.cardStates.get(cardId) || {}) };
  }

  conceptState(conceptId) {
    return {
      conceptId,
      flashCorrect: 0,
      flashWrong: 0,
      flashHard: 0,
      practiceCorrect: 0,
      practiceWrong: 0,
      examCorrect: 0,
      examWrong: 0,
      extraPractice: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      updatedAt: null,
      ...(this.conceptStates.get(conceptId) || {})
    };
  }

  visibleCardStatus(cardId) {
    const state = this.cardStates.get(cardId);
    if (!state || !state.reps) return 'new';
    const concept = this.content.cardById.get(cardId)?.conceptId;
    const cs = concept ? this.conceptState(concept) : null;
    const recentFailure = cs?.lastFailureAt && Date.now() - new Date(cs.lastFailureAt).getTime() < 3 * 86_400_000;
    const recentEarlyHard = state.lastExtraRating === Rating.HARD && state.lastExtraPracticeAt && Date.now() - new Date(state.lastExtraPracticeAt).getTime() < 3 * 86_400_000;
    if (state.state === CardState.REVIEW && state.lastRating === Rating.GOOD && state.stability >= 5 && !recentFailure && !recentEarlyHard) return 'safe';
    return 'uncertain';
  }

  scopeStats(scope = {}) {
    const cards = this.content.cardsForScope(scope);
    let safe = 0, uncertain = 0, fresh = 0, due = 0;
    const now = new Date();
    for (const card of cards) {
      const status = this.visibleCardStatus(card.id);
      if (status === 'safe') safe += 1;
      else if (status === 'uncertain') uncertain += 1;
      else fresh += 1;
      const state = this.cardStates.get(card.id);
      if (state && isDue(state, now)) due += 1;
    }
    return { total: cards.length, safe, uncertain, new: fresh, due, safeRatio: cards.length ? safe / cards.length : 0 };
  }

  conceptMastery(conceptId) {
    const cs = this.conceptStates.get(conceptId);
    const cards = this.content.cardsByConcept.get(conceptId) || [];
    const cardScores = cards.map((card) => ({ safe: 1, uncertain: .42, new: 0 })[this.visibleCardStatus(card.id)] ?? 0);
    const flashBase = cardScores.length ? cardScores.reduce((a, b) => a + b, 0) / cardScores.length : 0;
    if (!cs) return flashBase;

    const practiceAttempts = cs.practiceCorrect + cs.practiceWrong;
    const examAttempts = cs.examCorrect + cs.examWrong;
    const practice = practiceAttempts ? cs.practiceCorrect / practiceAttempts : null;
    const exam = examAttempts ? cs.examCorrect / examAttempts : null;
    const parts = [{ value: flashBase, weight: .5 }];
    if (practice !== null) parts.push({ value: practice, weight: .25 });
    if (exam !== null) parts.push({ value: exam, weight: .25 });
    const weight = parts.reduce((sum, p) => sum + p.weight, 0);
    return clamp(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / weight, 0, 1);
  }

  weaknessScore(conceptId) {
    const cs = this.conceptStates.get(conceptId);
    if (!cs) return 0;
    const wrong = cs.flashWrong + cs.flashHard * 0.35 + cs.practiceWrong * 1.25 + cs.examWrong * 1.5;
    const right = cs.flashCorrect + cs.practiceCorrect + cs.examCorrect * 1.2;
    if (!wrong && right) return Math.max(0, .25 - Math.min(.25, right * .04));
    let score = wrong / (wrong + right + 1);
    if (cs.lastFailureAt) {
      const days = Math.max(0, (Date.now() - new Date(cs.lastFailureAt).getTime()) / 86_400_000);
      score += .25 * Math.exp(-days / 10);
    }
    return clamp(score, 0, 1);
  }

  hasWeaknessEvidence() {
    return [...this.conceptStates.values()].some((cs) =>
      (cs.flashWrong || 0) + (cs.flashHard || 0) + (cs.practiceWrong || 0) + (cs.examWrong || 0) > 0 || Boolean(cs.lastFailureAt)
    );
  }

  chapterProgress() {
    return this.content.chapters.map((chapter) => {
      const stats = this.scopeStats({ chapterId: chapter.id });
      const concepts = new Set((this.content.cardsByChapter.get(chapter.id) || []).map((card) => card.conceptId));
      const mastery = concepts.size ? [...concepts].reduce((sum, id) => sum + this.conceptMastery(id), 0) / concepts.size : 0;
      return { ...chapter, ...stats, mastery };
    });
  }

  weakestChapters(limit = 5) {
    return this.chapterProgress()
      .filter((x) => x.total > 0 && x.new < x.total)
      .sort((a, b) => a.mastery - b.mastery || b.uncertain - a.uncertain)
      .slice(0, limit);
  }

  priorityForCard(card, now = new Date()) {
    const state = this.cardStates.get(card.id);
    const concept = this.content.conceptById.get(card.conceptId);
    const importance = IMPORTANCE_WEIGHT[concept?.importance] ?? .5;
    const weakness = this.weaknessScore(card.conceptId);
    let urgency = 0;
    if (state?.due) {
      const overdueDays = Math.max(0, (now.getTime() - new Date(state.due).getTime()) / 86_400_000);
      urgency = isDue(state, now) ? clamp(.55 + overdueDays / 12, .55, 1) : 0;
    }
    return urgency * .4 + weakness * .35 + importance * .25;
  }

  recommendedPreview() {
    const selection = this.selectRecommended({ target: 22, seed: dayKey(new Date()) });
    const cards = selection.filter((x) => x.kind === 'card');
    const questions = selection.filter((x) => x.kind === 'question');
    const reviews = cards.filter((x) => this.cardStates.has(x.id)).length;
    const newCards = cards.length - reviews;
    return {
      items: selection,
      reviews,
      newCards,
      questions: questions.length,
      total: selection.length,
      minutes: estimateMinutes(selection, this.content)
    };
  }

  quickPreview() {
    const items = this.selectRecommended({ target: 8, quick: true, seed: `${dayKey(new Date())}-quick` });
    return { items, total: items.length, minutes: estimateMinutes(items, this.content) };
  }

  selectRecommended({ target = 22, quick = false, seed = Date.now() } = {}) {
    const now = new Date();
    const all = this.content.cards;
    const due = [];
    const newCards = [];
    const weak = [];

    for (const card of all) {
      const state = this.cardStates.get(card.id);
      if (!state || !state.reps) newCards.push(card);
      else if (isDue(state, now)) due.push(card);
      else if (this.weaknessScore(card.conceptId) >= .48) weak.push(card);
    }

    due.sort((a, b) => this.priorityForCard(b, now) - this.priorityForCard(a, now));
    weak.sort((a, b) => this.priorityForCard(b, now) - this.priorityForCard(a, now));
    newCards.sort((a, b) => {
      const ca = this.content.conceptById.get(a.conceptId);
      const cb = this.content.conceptById.get(b.conceptId);
      return (IMPORTANCE_WEIGHT[cb?.importance] || 0) - (IMPORTANCE_WEIGHT[ca?.importance] || 0);
    });

    const selected = [];
    const usedConcepts = new Set();
    const pushCards = (source, count) => {
      for (const card of source) {
        if (selected.length >= target || count <= 0) break;
        if (usedConcepts.has(card.conceptId)) continue;
        selected.push({ kind: 'card', id: card.id });
        usedConcepts.add(card.conceptId);
        count -= 1;
      }
    };

    const dueTarget = quick ? Math.min(5, target) : Math.min(Math.max(8, Math.round(target * .58)), target);
    pushCards(due, dueTarget);
    pushCards(weak.filter((c) => !usedConcepts.has(c.conceptId)), quick ? 2 : 4);

    const backlog = due.length;
    let newTarget = quick ? (backlog ? 1 : 3) : backlog >= 30 ? 2 : backlog >= 15 ? 4 : backlog >= 6 ? 7 : 11;
    pushCards(shuffleByImportance(newCards, this.content, seed), newTarget);

    const questionTarget = quick ? 1 : 3;
    const questions = this.selectPracticeQuestions(questionTarget, [...usedConcepts], seed);
    for (const q of questions) selected.push(this.prepareQuestionItem(q, seed));

    if (selected.length < Math.min(target, 12)) {
      const fallback = stableShuffle([...due, ...weak, ...newCards], `${seed}-fallback`);
      pushCards(fallback, target - selected.length);
    }

    return interleaveItems(selected, this.content, seed).slice(0, target);
  }

  selectPracticeQuestions(limit = 3, preferredConcepts = [], seed = Date.now()) {
    const preferred = new Set(preferredConcepts);
    const scored = this.content.questions.map((q) => {
      const ids = q.conceptIds || [];
      const overlap = ids.some((id) => preferred.has(id)) ? 1 : 0;
      const weakness = ids.length ? Math.max(...ids.map((id) => this.weaknessScore(id))) : 0;
      return { q, score: overlap * .55 + weakness * .45 };
    });
    const top = scored.sort((a, b) => b.score - a.score).slice(0, Math.max(limit * 5, 15)).map((x) => x.q);
    return stableShuffle(top, `${seed}-q`).slice(0, limit);
  }

  prepareQuestionItem(question, seed = Date.now()) {
    const options = question.options || [];
    const optionIds = options.map((x) => x.id);
    const item = { kind: 'question', id: question.id, variant: {} };
    if (question.type === 'single_choice' || question.type === 'multiple_choice') {
      item.variant.optionOrder = stableShuffle(optionIds, `${seed}-${question.id}`);
    } else if (question.type === 'ordering') {
      item.variant.order = stableShuffle(optionIds, `${seed}-${question.id}-order`);
    } else if (question.type === 'matching') {
      const pairs = options.map((x) => splitPair(x.text)).filter(Boolean);
      item.variant.matchingPairs = pairs;
      item.variant.rightOrder = stableShuffle(pairs.map((x) => x.right), `${seed}-${question.id}-match`);
    }
    return item;
  }

  async createRecommendedSession({ quick = false, continuation = false } = {}) {
    const items = quick ? this.quickPreview().items : this.selectRecommended({ target: continuation ? 28 : 22, seed: `${Date.now()}-${continuation}` });
    return this.createSession({
      type: quick ? 'quick' : continuation ? 'automatic' : 'recommended',
      items,
      source: 'recommended',
      title: quick ? '5-Minuten-Runde' : continuation ? 'Weiterlernen' : 'Heute'
    });
  }

  async createScopedSession({ mode = 'topic', chapterId = null, sectionId = null, unlimited = false } = {}) {
    const scope = { chapterId, sectionId };
    let cards = this.content.cardsForScope(scope);
    const now = new Date();
    if (mode === 'new') cards = cards.filter((c) => !this.cardStates.get(c.id)?.reps);
    if (mode === 'review') cards = cards.filter((c) => this.cardStates.get(c.id)?.reps);
    if (mode === 'weak') cards = cards.filter((c) => this.weaknessScore(c.conceptId) >= .35 || this.visibleCardStatus(c.id) === 'uncertain');
    if (mode === 'automatic') {
      const due = cards.filter((c) => isDue(this.cardStates.get(c.id), now));
      const weak = cards.filter((c) => this.weaknessScore(c.conceptId) >= .4);
      const fresh = cards.filter((c) => !this.cardStates.get(c.id)?.reps);
      cards = [...due.sort((a,b)=>this.priorityForCard(b)-this.priorityForCard(a)), ...weak, ...shuffleByImportance(fresh, this.content, `${Date.now()}-fresh`)];
    }

    cards = uniqueBy(cards, (x) => x.id);
    if (!cards.length) return null;
    const seed = `${Date.now()}-${mode}-${chapterId || sectionId || 'all'}`;
    const ordered = mode === 'automatic' ? cards : stableShuffle(cards, seed);
    const maxInitial = unlimited ? Math.min(100, ordered.length) : Math.min(30, ordered.length);
    const items = ordered.slice(0, maxInitial).map((card) => ({ kind: 'card', id: card.id }));
    if (!unlimited && mode === 'automatic') {
      const q = this.content.questionsForScope(scope);
      const add = stableShuffle(q, `${seed}-q`).slice(0, 3).map((question) => this.prepareQuestionItem(question, seed));
      items.push(...add);
    }
    return this.createSession({
      type: unlimited ? 'unlimited' : mode,
      items: interleaveItems(items, this.content, seed),
      source: unlimited ? 'unlimited' : 'topic',
      title: sessionTitle(mode, chapterId, sectionId, this.content),
      options: { mode, chapterId, sectionId, unlimited, poolIds: ordered.map((c) => c.id), poolCursor: maxInitial }
    });
  }

  async createSingleCardSession(cardId) {
    if (!this.content.cardById.has(cardId)) return null;
    return this.createSession({ type: 'single', items: [{ kind: 'card', id: cardId }], source: 'topic', title: 'Karte lernen' });
  }

  async createSession({ type, items, source, title, options = {} }) {
    if (!items?.length) return null;
    const prior = (await db.getAll('sessions')).filter((x) => !x.completed);
    for (const previous of prior) {
      previous.completed = true;
      previous.abandoned = true;
      previous.completedAt = new Date().toISOString();
      await db.put('sessions', previous);
    }
    const now = new Date().toISOString();
    const session = {
      id: uid('session'), type, source, title, items, options,
      currentIndex: 0, completed: false, createdAt: now, startedAt: now, completedAt: null,
      activeMs: 0, lastActiveAt: now,
      responses: {}, stats: { cards: 0, questions: 0, correct: 0, incorrect: 0, newCards: 0 },
      ui: {}
    };
    await db.put('sessions', session);
    return session;
  }

  async getSession(id) { return db.get('sessions', id); }

  async findOpenSession() {
    const sessions = (await db.getAll('sessions')).filter((x) => !x.completed);
    return sessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
  }

  async saveSession(session) {
    await db.put('sessions', session);
    return session;
  }

  resumeSession(session) {
    if (!session) return session;
    session.lastActiveAt = new Date().toISOString();
    return session;
  }

  touchSession(session, maxSliceMs = 90_000) {
    if (!session) return session;
    const now = Date.now();
    const last = session.lastActiveAt ? new Date(session.lastActiveAt).getTime() : now;
    const elapsed = Number.isFinite(last) ? Math.max(0, Math.min(maxSliceMs, now - last)) : 0;
    session.activeMs = (session.activeMs || 0) + elapsed;
    session.lastActiveAt = new Date(now).toISOString();
    return session;
  }

  pauseSession(session) {
    this.touchSession(session);
    session.lastActiveAt = null;
    return session;
  }

  async completeSession(session) {
    session.completed = true;
    session.completedAt = new Date().toISOString();
    session.ui = {};
    await this.saveSession(session);
    return session;
  }

  async ensureUnlimitedQueue(session) {
    if (!session?.options?.unlimited) return session;
    if (session.currentIndex < session.items.length - 5) return session;
    const pool = session.options.poolIds || [];
    let cursor = session.options.poolCursor || 0;
    if (cursor < pool.length) {
      const nextIds = pool.slice(cursor, cursor + 80);
      session.items.push(...nextIds.map((id) => ({ kind: 'card', id })));
      session.options.poolCursor = cursor + nextIds.length;
    } else if (session.options.mode === 'all' || session.options.mode === 'review' || session.options.mode === 'weak') {
      const reshuffled = stableShuffle(pool, `${session.id}-${session.items.length}`).slice(0, Math.min(100, pool.length));
      session.items.push(...reshuffled.map((id) => ({ kind: 'card', id })));
    }
    await this.saveSession(session);
    return session;
  }

  async recordCardReview(cardId, rating, { source = 'recommended' } = {}) {
    const now = new Date();
    const oldState = this.cardState(cardId);
    const wasNew = !oldState.reps;
    const dueAt = oldState.due ? new Date(oldState.due) : null;
    const early = source === 'unlimited' && oldState.reps && dueAt && dueAt.getTime() - now.getTime() > 12 * 60 * 60 * 1000;
    let nextState = oldState;

    if (early && rating !== Rating.AGAIN) {
      nextState = { ...oldState, extraPracticeCount: (oldState.extraPracticeCount || 0) + 1, lastExtraRating: rating, updatedAt: now.toISOString(), lastExtraPracticeAt: now.toISOString() };
    } else {
      nextState = scheduleReview(oldState, rating, now);
    }
    this.cardStates.set(cardId, nextState);
    await db.put('cardState', nextState);

    const card = this.content.cardById.get(cardId);
    if (card) {
      const cs = this.conceptState(card.conceptId);
      const correct = rating !== Rating.AGAIN;
      if (correct) cs.flashCorrect += 1; else cs.flashWrong += 1;
      if (rating === Rating.HARD) cs.flashHard += 1;
      if (early && correct) cs.extraPractice += 1;
      if (correct) cs.lastSuccessAt = now.toISOString(); else cs.lastFailureAt = now.toISOString();
      cs.updatedAt = now.toISOString();
      this.conceptStates.set(card.conceptId, cs);
      await db.put('conceptState', cs);
      if (!correct) await this.addMistake('card', cardId, [card.conceptId]);
    }
    await this.bumpHistory({ cardsReviewed: 1, newCards: wasNew ? 1 : 0, correct: rating === Rating.AGAIN ? 0 : 1, incorrect: rating === Rating.AGAIN ? 1 : 0 });
    return { state: nextState, earlyPractice: early && rating !== Rating.AGAIN, wasNew };
  }

  async recordQuestionResult(questionId, correct, { source = 'practice' } = {}) {
    const question = this.content.questionById.get(questionId);
    if (!question) return;
    const now = new Date().toISOString();
    for (const conceptId of question.conceptIds || []) {
      const cs = this.conceptState(conceptId);
      if (source === 'exam') {
        if (correct) cs.examCorrect += 1; else cs.examWrong += 1;
      } else {
        if (correct) cs.practiceCorrect += 1; else cs.practiceWrong += 1;
      }
      if (correct) cs.lastSuccessAt = now; else cs.lastFailureAt = now;
      cs.updatedAt = now;
      this.conceptStates.set(conceptId, cs);
      await db.put('conceptState', cs);
    }
    if (!correct) await this.addMistake('question', questionId, question.conceptIds || []);
    const qh = this.questionHistory.get(questionId) || { questionId, attempts: 0, correct: 0, incorrect: 0, lastSeenAt: null, lastExamSeenAt: null };
    qh.attempts += 1;
    if (correct) qh.correct += 1; else qh.incorrect += 1;
    qh.lastSeenAt = now;
    if (source === 'exam') qh.lastExamSeenAt = now;
    this.questionHistory.set(questionId, qh);
    await db.put('questionHistory', qh);
    await this.bumpHistory({ questionsAnswered: 1, correct: correct ? 1 : 0, incorrect: correct ? 0 : 1 });
  }

  async addMistake(contentType, contentId, conceptIds) {
    const existing = [...this.mistakes.values()].find((m) => m.contentType === contentType && m.contentId === contentId && !m.resolved);
    const item = existing || { id: uid('mistake'), contentType, contentId, conceptIds, count: 0, createdAt: new Date().toISOString(), resolved: false };
    item.count = (item.count || 0) + 1;
    item.occurredAt = new Date().toISOString();
    this.mistakes.set(item.id, item);
    await db.put('mistakes', item);
  }

  async bumpHistory(delta) {
    const date = dayKey(new Date());
    const h = this.history.get(date) || { date, cardsReviewed: 0, newCards: 0, questionsAnswered: 0, correct: 0, incorrect: 0, minutes: 0 };
    for (const [key, value] of Object.entries(delta)) h[key] = (h[key] || 0) + value;
    h.updatedAt = new Date().toISOString();
    this.history.set(date, h);
    await db.put('history', h);
  }

  async toggleBookmark(cardId) {
    const id = `card:${cardId}`;
    if (this.bookmarks.has(id)) {
      this.bookmarks.delete(id);
      await db.remove('bookmarks', id);
      return false;
    }
    const item = { id, contentType: 'card', contentId: cardId, createdAt: new Date().toISOString() };
    this.bookmarks.set(id, item);
    await db.put('bookmarks', item);
    return true;
  }

  isBookmarked(cardId) { return this.bookmarks.has(`card:${cardId}`); }

  async reportCard(cardId, reason) {
    const item = { id: uid('report'), contentType: 'card', contentId: cardId, reason, createdAt: new Date().toISOString(), resolved: false };
    await db.put('reports', item);
    return item;
  }

  async injectReinforcement(session, conceptIds, afterIndex = session.currentIndex) {
    const candidates = conceptIds.flatMap((id) => this.content.cardsByConcept.get(id) || []);
    const existingNext = new Set(session.items.slice(afterIndex, afterIndex + 8).filter((x) => x.kind === 'card').map((x) => x.id));
    const card = candidates.find((x) => !existingNext.has(x.id));
    if (!card) return session;
    const offset = 5 + Math.floor(Math.random() * 4);
    const index = Math.min(session.items.length, afterIndex + offset);
    session.items.splice(index, 0, { kind: 'card', id: card.id, reinforcement: true });
    await this.saveSession(session);
    return session;
  }

  async createExam({ mode = 'quick', count = 10, chapterId = null, sectionId = null, weakness = false } = {}) {
    const scope = sectionId ? { sectionId } : chapterId ? { chapterId } : {};
    let questions = this.content.questionsForScope(scope).filter((q) => AUTO_GRADABLE.has(q.type));
    if (weakness && !this.hasWeaknessEvidence()) return null;

    const seed = `${Date.now()}-${mode}-${chapterId || ''}-${sectionId || ''}`;
    const shuffled = stableShuffle(questions, seed);
    const recency = (q) => {
      const stamp = this.questionHistory.get(q.id)?.lastExamSeenAt;
      return stamp ? new Date(stamp).getTime() : 0;
    };
    if (weakness) {
      questions = shuffled.sort((a, b) => {
        const wa = Math.max(0, ...(a.conceptIds || []).map((id) => this.weaknessScore(id)));
        const wb = Math.max(0, ...(b.conceptIds || []).map((id) => this.weaknessScore(id)));
        return wb - wa || recency(a) - recency(b);
      });
    } else {
      // Prefer questions not seen in recent exams, while preserving seeded variety.
      questions = shuffled.sort((a, b) => recency(a) - recency(b));
    }
    if (!questions.length) return null;
    const selected = questions.slice(0, Math.min(count, questions.length));
    const now = new Date().toISOString();
    const attempt = {
      id: uid('exam'), mode, chapterId, sectionId, count: selected.length, startedAt: now, completedAt: null, completed: false, processed: false,
      currentIndex: 0, markedForReview: [], answers: {}, processedQuestionIds: [],
      questions: selected.map((q, index) => this.prepareQuestionItem(q, `${now}-${index}`))
    };
    await db.put('examAttempts', attempt);
    return attempt;
  }

  async findOpenExam() {
    const attempts = (await db.getAll('examAttempts')).filter((x) => !x.completed && Array.isArray(x.questions) && x.questions.length);
    return attempts.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
  }

  async getExam(id) { return db.get('examAttempts', id); }
  async saveExam(attempt) { await db.put('examAttempts', attempt); return attempt; }

  gradeQuestion(question, answer, variant = {}) {
    if (!question) return false;
    if (question.type === 'single_choice' || question.type === 'multiple_choice') {
      const expected = [...(question.correct || [])].sort();
      const actual = [...(answer?.selected || [])].sort();
      return expected.length === actual.length && expected.every((x, i) => x === actual[i]);
    }
    if (question.type === 'ordering') {
      const expected = question.correct || [];
      const actual = answer?.order || [];
      return expected.length === actual.length && expected.every((x, i) => x === actual[i]);
    }
    if (question.type === 'matching') {
      const pairs = variant.matchingPairs || (question.options || []).map((x) => splitPair(x.text)).filter(Boolean);
      return pairs.every((pair) => answer?.matches?.[pair.left] === pair.right);
    }
    return Boolean(answer?.selfCorrect);
  }

  async finalizeExam(attempt) {
    if (attempt.completed && attempt.processed) return attempt;
    const processed = new Set(attempt.processedQuestionIds || []);
    let correctCount = 0;
    const results = [];
    for (const item of attempt.questions) {
      const q = this.content.questionById.get(item.id);
      const answer = attempt.answers[item.id] || null;
      const correct = this.gradeQuestion(q, answer, item.variant || {});
      if (correct) correctCount += 1;
      results.push({ id: item.id, correct });
      if (!processed.has(item.id)) {
        await this.recordQuestionResult(item.id, correct, { source: 'exam' });
        processed.add(item.id);
        attempt.processedQuestionIds = [...processed];
        await this.saveExam(attempt);
      }
    }
    attempt.completed = true;
    attempt.processed = true;
    attempt.completedAt = attempt.completedAt || new Date().toISOString();
    attempt.score = correctCount;
    attempt.maxScore = attempt.questions.length;
    attempt.percentage = attempt.maxScore ? Math.round(correctCount / attempt.maxScore * 100) : 0;
    attempt.results = results;
    await this.saveExam(attempt);
    return attempt;
  }

  examTopicPerformance(attempt) {
    const stats = new Map();
    for (const result of attempt.results || []) {
      const q = this.content.questionById.get(result.id);
      const chapter = q?.conceptIds?.map((id) => this.content.conceptChapter(id)).find(Boolean);
      if (!chapter) continue;
      if (!stats.has(chapter.id)) stats.set(chapter.id, { chapter, correct: 0, total: 0 });
      const row = stats.get(chapter.id);
      row.total += 1;
      if (result.correct) row.correct += 1;
    }
    return [...stats.values()].map((x) => ({ ...x, ratio: x.total ? x.correct / x.total : 0 })).sort((a, b) => a.ratio - b.ratio);
  }

  examWeakConceptIds(attempt) {
    const ids = new Set();
    for (const result of attempt?.results || []) {
      if (result.correct) continue;
      const q = this.content.questionById.get(result.id);
      for (const id of q?.conceptIds || []) ids.add(id);
    }
    return [...ids];
  }

  async createExamReviewSession(attempt) {
    const conceptIds = this.examWeakConceptIds(attempt);
    const cards = uniqueBy(conceptIds.flatMap((id) => this.content.cardsByConcept.get(id) || []), (card) => card.id);
    if (!cards.length) return null;
    const items = interleaveItems(cards.slice(0, 40).map((card) => ({ kind: 'card', id: card.id })), this.content, `${attempt.id}-review`);
    return this.createSession({ type: 'exam-review', items, source: 'topic', title: 'Fehler aus der Prüfung', options: { examId: attempt.id } });
  }

  recentMistakes(limit = 8) {
    return [...this.mistakes.values()].filter((x) => !x.resolved).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, limit);
  }

  historyLastDays(days = 7) {
    const rows = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = addDays(new Date(), -i);
      const key = dayKey(date);
      rows.push(this.history.get(key) || { date: key, cardsReviewed: 0, newCards: 0, questionsAnswered: 0, correct: 0, incorrect: 0, minutes: 0 });
    }
    return rows;
  }
}

function estimateMinutes(items, content) {
  let seconds = 0;
  for (const item of items) {
    if (item.kind === 'card') {
      const card = content.cardById.get(item.id);
      seconds += card?.type === 'enumeration' || card?.type === 'summary' ? 34 : 25;
    } else {
      const q = content.questionById.get(item.id);
      seconds += q?.type === 'clinical_case' ? 65 : q?.type === 'ordering' || q?.type === 'matching' ? 55 : 42;
    }
  }
  return Math.max(1, Math.round(seconds / 60));
}

function shuffleByImportance(cards, content, seed) {
  const tiers = ['core', 'important', 'detail'];
  const result = [];
  for (const tier of tiers) {
    const group = cards.filter((card) => content.conceptById.get(card.conceptId)?.importance === tier);
    result.push(...stableShuffle(group, `${seed}-${tier}`));
  }
  const known = new Set(result.map((card) => card.id));
  result.push(...stableShuffle(cards.filter((card) => !known.has(card.id)), `${seed}-other`));
  return result;
}

function interleaveItems(items, content, seed) {
  const shuffled = stableShuffle(items, seed);
  const result = [];
  const pending = [...shuffled];
  while (pending.length) {
    const recentConcepts = new Set(result.slice(-3).flatMap((item) => itemConceptIds(item, content)));
    let index = pending.findIndex((item) => itemConceptIds(item, content).every((id) => !recentConcepts.has(id)));
    if (index < 0) index = 0;
    result.push(pending.splice(index, 1)[0]);
  }
  return result;
}

function itemConceptIds(item, content) {
  if (item.kind === 'card') {
    const id = content.cardById.get(item.id)?.conceptId;
    return id ? [id] : [];
  }
  if (item.kind === 'question') return content.questionById.get(item.id)?.conceptIds || [];
  return [];
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitPair(text) {
  const parts = String(text).split('↔');
  if (parts.length !== 2) return null;
  return { left: parts[0].trim(), right: parts[1].trim() };
}

function sessionTitle(mode, chapterId, sectionId, content) {
  if (sectionId) return content.sectionById.get(sectionId)?.title || 'Thema';
  if (chapterId) return content.chapterById.get(chapterId)?.title || 'Kapitel';
  return ({ all: 'Alle Karten', new: 'Neue Karten', review: 'Wiederholen', weak: 'Meine Schwächen', automatic: 'Automatisch weiterlernen' })[mode] || 'Lernen';
}

export { AUTO_GRADABLE, splitPair };
