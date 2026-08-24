import * as db from './storage.js';
import { StudyEngine } from './study-engine.js';
import { isDue } from './fsrs.js';
import { clamp, stableShuffle } from './util.js';
import {
  EXAM_PLAN_SETTING_KEY, canIntroduceNew, examPlanContext, localDayKey,
  normalizeExamPlan, scopeLabel
} from './p16-exam-plan-core.js';

const IMPORTANCE = { core: 1, important: 0.68, detail: 0.36 };
const PATCH_FLAG = Symbol.for('pflegelern.p16.examPlanPatched');
let activePlan = null;
let chapterList = [];
let uiStarted = false;

function validChapterIds(engine) {
  return new Set((engine?.content?.chapters || []).map((c) => c.id));
}

function currentPlan(engine) {
  return normalizeExamPlan(activePlan, validChapterIds(engine));
}

function currentContext(engine, now = new Date()) {
  const plan = currentPlan(engine);
  return examPlanContext(plan, now);
}

function scopeSets(engine, plan) {
  const all = !plan || plan.scopeType !== 'chapters';
  const chapterIds = all ? new Set(engine.content.chapters.map((c) => c.id)) : new Set(plan.chapterIds);
  const cardIds = new Set();
  const conceptIds = new Set();
  for (const chapterId of chapterIds) {
    for (const card of engine.content.cardsByChapter.get(chapterId) || []) {
      cardIds.add(card.id);
      conceptIds.add(card.conceptId);
    }
  }
  return { chapterIds, cardIds, conceptIds };
}

function questionInScope(q, sets) {
  return (q?.conceptIds || []).some((id) => sets.conceptIds.has(id));
}

function cardImportance(engine, card) {
  return engine.content.conceptById.get(card?.conceptId)?.importance || 'detail';
}

function candidateScore(engine, card, ctx, now) {
  const state = engine.cardStates.get(card.id);
  const due = Boolean(state?.reps && isDue(state, now));
  const weakness = engine.weaknessScore(card.conceptId);
  const importance = IMPORTANCE[cardImportance(engine, card)] || 0.36;
  const reviewed = Boolean(state?.reps);
  return (due ? 4 : 0) + weakness * 2.5 + importance * 1.7 + (reviewed ? 0.35 : 0) + ctx.policy.scopeBoost;
}

function eligibleReplacement(engine, card, ctx, now) {
  const state = engine.cardStates.get(card.id);
  const isNew = !state?.reps;
  if (!isNew) return true;
  return canIntroduceNew(cardImportance(engine, card), ctx.phase);
}

function adaptRecommendedSelection(engine, items, seed) {
  const ctx = currentContext(engine);
  if (!ctx.active) return items;
  const sets = scopeSets(engine, ctx.plan);
  const now = new Date();
  const result = items.map((item) => ({ ...item, variant: item.variant ? { ...item.variant } : item.variant }));
  const selectedCardIds = new Set(result.filter((x) => x.kind === 'card').map((x) => x.id));
  const replaceable = [];

  for (let i = 0; i < result.length; i += 1) {
    const item = result[i];
    if (item.kind !== 'card') continue;
    const card = engine.content.cardById.get(item.id);
    if (!card) continue;
    const state = engine.cardStates.get(card.id);
    const due = Boolean(state?.reps && isDue(state, now));
    const inScope = sets.cardIds.has(card.id);
    const disallowedNew = !state?.reps && !canIntroduceNew(cardImportance(engine, card), ctx.phase);
    if (disallowedNew || (!inScope && !due)) {
      replaceable.push({ index: i, score: candidateScore(engine, card, ctx, now), disallowedNew });
    }
  }

  const pool = stableShuffle(
    engine.content.cards.filter((card) => sets.cardIds.has(card.id) && !selectedCardIds.has(card.id) && eligibleReplacement(engine, card, ctx, now)),
    `${seed}-p16-pool`
  ).sort((a, b) => candidateScore(engine, b, ctx, now) - candidateScore(engine, a, ctx, now));

  replaceable.sort((a, b) => Number(b.disallowedNew) - Number(a.disallowedNew) || a.score - b.score);
  const desired = Math.max(
    replaceable.filter((x) => x.disallowedNew).length,
    Math.ceil(replaceable.length * ctx.policy.replacementShare)
  );
  let used = 0;
  for (const slot of replaceable) {
    if (used >= desired || !pool.length) break;
    const replacement = pool.shift();
    const old = result[slot.index];
    selectedCardIds.delete(old.id);
    selectedCardIds.add(replacement.id);
    result[slot.index] = { kind: 'card', id: replacement.id, examPlanPriority: true };
    used += 1;
  }

  // Near the exam, never keep disallowed unseen material just to preserve a numeric workload target.
  return result.filter((item) => {
    if (item.kind !== 'card') return true;
    const card = engine.content.cardById.get(item.id);
    const state = engine.cardStates.get(item.id);
    return state?.reps || canIntroduceNew(cardImportance(engine, card), ctx.phase);
  });
}

function plannedQuestionSelection(engine, limit, preferredConcepts, seed) {
  const ctx = currentContext(engine);
  if (!ctx.active) return null;
  const sets = scopeSets(engine, ctx.plan);
  const preferred = new Set(preferredConcepts || []);
  const now = Date.now();
  const shuffled = stableShuffle(engine.content.questions, `${seed}-p16-q`);
  const scored = shuffled.map((q) => {
    const ids = q.conceptIds || [];
    const overlap = ids.some((id) => preferred.has(id)) ? 1 : 0;
    const weakness = ids.length ? Math.max(0, ...ids.map((id) => engine.weaknessScore(id))) : 0;
    const scoped = questionInScope(q, sets) ? 1 : 0;
    const history = engine.questionHistory.get(q.id);
    const ageDays = history?.lastSeenAt ? Math.max(0, (now - new Date(history.lastSeenAt).getTime()) / 86_400_000) : Infinity;
    const recentPenalty = ageDays < 1 ? 0.25 : ageDays < 3 ? 0.10 : 0;
    const application = q.type === 'clinical_case' ? 1 : q.type === 'short_answer' ? 0.65 : 0;
    const latePhase = ['final_week', 'final_days', 'final_day'].includes(ctx.phase) ? 1 : 0;
    const score = overlap * 0.35 + weakness * 0.38 + scoped * ctx.policy.questionScopeBoost + application * 0.16 * latePhase - recentPenalty;
    return { q, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.q);
}

export async function installExamPlanPatches() {
  try { activePlan = await db.getSetting(EXAM_PLAN_SETTING_KEY, null); } catch { activePlan = null; }
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const originalPriority = StudyEngine.prototype.priorityForCard;
  StudyEngine.prototype.priorityForCard = function p16Priority(card, now = new Date()) {
    const base = originalPriority.call(this, card, now);
    const ctx = currentContext(this, now);
    if (!ctx.active) return base;
    const sets = scopeSets(this, ctx.plan);
    if (!sets.cardIds.has(card.id)) return base;
    const importance = IMPORTANCE[cardImportance(this, card)] || 0.36;
    const weakness = this.weaknessScore(card.conceptId);
    return base + ctx.policy.scopeBoost * (0.6 + importance * 0.25 + weakness * 0.15);
  };

  const originalRecommended = StudyEngine.prototype.selectRecommended;
  StudyEngine.prototype.selectRecommended = function p16Recommended(options = {}) {
    const items = originalRecommended.call(this, options);
    return adaptRecommendedSelection(this, items, options.seed ?? Date.now());
  };

  const originalQuestions = StudyEngine.prototype.selectPracticeQuestions;
  StudyEngine.prototype.selectPracticeQuestions = function p16Questions(limit = 3, preferredConcepts = [], seed = Date.now()) {
    return plannedQuestionSelection(this, limit, preferredConcepts, seed) || originalQuestions.call(this, limit, preferredConcepts, seed);
  };

  const originalPreview = StudyEngine.prototype.recommendedPreview;
  StudyEngine.prototype.recommendedPreview = function p16Preview() {
    const preview = originalPreview.call(this);
    const ctx = currentContext(this);
    if (ctx.active || ctx.expired) {
      preview.examPlan = { examDate: ctx.plan?.examDate, daysLeft: ctx.daysLeft, phase: ctx.phase, label: ctx.policy.label };
    }
    return preview;
  };

  const originalCreateExam = StudyEngine.prototype.createExam;
  StudyEngine.prototype.createExam = async function p16CreateExam(options = {}) {
    const ctx = currentContext(this);
    const shouldScope = ctx.active && ctx.plan.scopeType === 'chapters' && !options.chapterId && !options.sectionId && ['quick', 'full'].includes(options.mode || 'quick');
    if (!shouldScope) return originalCreateExam.call(this, options);
    const sets = scopeSets(this, ctx.plan);
    const originalBank = this.content.questions;
    this.content.questions = originalBank.filter((q) => questionInScope(q, sets));
    try { return await originalCreateExam.call(this, options); }
    finally { this.content.questions = originalBank; }
  };
}

function planSummaryHtml(ctx) {
  if (!ctx.plan) return '';
  const days = ctx.daysLeft;
  const when = days === 0 ? 'Heute' : days === 1 ? 'Morgen' : days > 1 ? `In ${days} Tagen` : 'Datum vorbei';
  return `<div class="p16-plan-summary">
    <div><span class="p16-plan-kicker">Prüfungsplan</span><strong>${when}</strong><span>${escapeText(ctx.policy.label)}</span></div>
    <div class="p16-plan-scope">${escapeText(scopeLabel(ctx.plan, chapterList))}</div>
  </div>`;
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
}

function examPlanSection() {
  const ctx = examPlanContext(normalizeExamPlan(activePlan, new Set(chapterList.map((c) => c.id))));
  if (ctx.plan) {
    return `<section class="section p16-exam-plan" data-p16-plan-section>
      <div class="section-header"><h2>Prüfung vorbereiten</h2><button class="button button-text" data-p16-action="edit">Ändern</button></div>
      ${planSummaryHtml(ctx)}
      <p class="small muted p16-plan-description">${escapeText(ctx.policy.description)}</p>
      ${ctx.expired ? '<p class="small" style="color:var(--warning)">Das Prüfungsdatum liegt in der Vergangenheit.</p>' : ''}
    </section>`;
  }
  return `<section class="section p16-exam-plan" data-p16-plan-section>
    <div class="list-row p16-plan-cta"><span class="list-row-main"><span class="list-row-title">Prüfung vorbereiten</span><span class="list-row-subtitle">Datum und Prüfungsstoff festlegen; PflegeLern priorisiert den Stoff automatisch.</span></span><button class="button button-secondary" data-p16-action="edit">Einrichten</button></div>
  </section>`;
}

function editorHtml() {
  const valid = new Set(chapterList.map((c) => c.id));
  const plan = normalizeExamPlan(activePlan, valid);
  const today = localDayKey(new Date());
  const examDate = plan?.examDate || '';
  const scopeType = plan?.scopeType || 'all';
  const selected = new Set(plan?.chapterIds || []);
  return `<section class="section p16-exam-plan" data-p16-plan-section>
    <div class="section-header"><h2>Prüfung vorbereiten</h2></div>
    <form data-p16-plan-form>
      <div class="field"><label for="p16-exam-date">Prüfungsdatum</label><input id="p16-exam-date" name="examDate" type="date" min="${today}" value="${escapeText(examDate)}" required></div>
      <fieldset class="p16-scope-fieldset"><legend>Prüfungsstoff</legend>
        <label class="p16-radio"><input type="radio" name="scopeType" value="all" ${scopeType === 'all' ? 'checked' : ''}> Gesamtes Buch</label>
        <label class="p16-radio"><input type="radio" name="scopeType" value="chapters" ${scopeType === 'chapters' ? 'checked' : ''}> Ausgewählte Kapitel</label>
      </fieldset>
      <div class="p16-chapter-picker" data-p16-chapters ${scopeType === 'chapters' ? '' : 'hidden'}>
        ${chapterList.map((c) => `<label><input type="checkbox" name="chapterId" value="${escapeText(c.id)}" ${selected.has(c.id) ? 'checked' : ''}><span>${escapeText(c.number)}. ${escapeText(c.title)}</span></label>`).join('')}
      </div>
      <p class="small p16-form-status" data-p16-status aria-live="polite"></p>
      <div class="button-row p16-plan-actions"><button type="button" class="button" data-p16-action="save">Plan speichern</button><button type="button" class="button button-secondary" data-p16-action="cancel">Abbrechen</button>${plan ? '<button type="button" class="button button-text p16-delete" data-p16-action="clear">Plan löschen</button>' : ''}</div>
    </form>
  </section>`;
}

function renderPlanSection(editor = false) {
  const current = document.querySelector('[data-p16-plan-section]');
  if (!current) return;
  const holder = document.createElement('div');
  holder.innerHTML = editor ? editorHtml() : examPlanSection();
  current.replaceWith(holder.firstElementChild);
}

function decorateExamPage(main) {
  const page = main.querySelector('.page');
  const header = page?.querySelector('.page-header');
  if (!page || !header || header.querySelector('h1')?.textContent.trim() !== 'Prüfung' || page.querySelector('[data-p16-plan-section]')) return;
  const holder = document.createElement('div');
  holder.innerHTML = examPlanSection();
  header.insertAdjacentElement('afterend', holder.firstElementChild);
  const ctx = examPlanContext(normalizeExamPlan(activePlan, new Set(chapterList.map((c) => c.id))));
  if (ctx.active) {
    const intro = header.querySelector('p.muted');
    if (intro && !intro.dataset.p16Scoped) {
      intro.dataset.p16Scoped = 'true';
      intro.insertAdjacentText('beforeend', ctx.plan.scopeType === 'chapters' ? ' Schnelltest und Prüfung berücksichtigen deinen aktiven Prüfungsstoff.' : ' Dein Prüfungsplan wird bei der Auswahl berücksichtigt.');
    }
  }
}

function decorateToday(main) {
  const page = main.querySelector('.page');
  const header = page?.querySelector('.page-header');
  if (!page || !header || header.querySelector('h1')?.textContent.trim() !== 'Heute' || page.querySelector('[data-p16-today-plan]')) return;
  const ctx = examPlanContext(normalizeExamPlan(activePlan, new Set(chapterList.map((c) => c.id))));
  if (!ctx.active) return;
  const div = document.createElement('div');
  div.dataset.p16TodayPlan = 'true';
  div.className = 'p16-today-plan';
  const when = ctx.daysLeft === 0 ? 'Prüfung heute' : ctx.daysLeft === 1 ? 'Prüfung morgen' : `Prüfung in ${ctx.daysLeft} Tagen`;
  div.innerHTML = `<span><strong>${escapeText(when)}</strong><small>${escapeText(ctx.policy.label)}</small></span><a href="?view=exam" data-spa>Plan</a>`;
  header.insertAdjacentElement('afterend', div);
}

function decorate() {
  const main = document.getElementById('main');
  if (!main) return;
  decorateExamPage(main);
  decorateToday(main);
}

async function saveFromForm() {
  const form = document.querySelector('[data-p16-plan-form]');
  if (!form) return;
  const status = form.querySelector('[data-p16-status]');
  const examDate = form.elements.examDate?.value || '';
  const scopeType = form.querySelector('input[name="scopeType"]:checked')?.value || 'all';
  const chapterIds = [...form.querySelectorAll('input[name="chapterId"]:checked')].map((x) => x.value);
  const days = examPlanContext({ examDate, scopeType, chapterIds }).daysLeft;
  if (!examDate || days === null || days < 0) {
    if (status) status.textContent = 'Bitte ein heutiges oder zukünftiges Prüfungsdatum wählen.';
    return;
  }
  if (scopeType === 'chapters' && !chapterIds.length) {
    if (status) status.textContent = 'Bitte mindestens ein Kapitel auswählen.';
    return;
  }
  const existing = normalizeExamPlan(activePlan, new Set(chapterList.map((c) => c.id)));
  const next = normalizeExamPlan({
    examDate, scopeType, chapterIds,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, new Set(chapterList.map((c) => c.id)));
  if (!next) {
    if (status) status.textContent = 'Der Prüfungsplan konnte nicht gespeichert werden.';
    return;
  }
  await db.setSetting(EXAM_PLAN_SETTING_KEY, next);
  activePlan = next;
  renderPlanSection(false);
}

export async function initExamPlanUi() {
  if (uiStarted || typeof document === 'undefined') return;
  uiStarted = true;
  try {
    const response = await fetch('./data/chapters.json');
    if (response.ok) chapterList = await response.json();
  } catch { chapterList = []; }

  const main = document.getElementById('main');
  if (main) {
    decorate();
    new MutationObserver(decorate).observe(main, { childList: true, subtree: true });
  }

  document.addEventListener('change', (event) => {
    const radio = event.target.closest?.('input[name="scopeType"]');
    if (!radio) return;
    const picker = document.querySelector('[data-p16-chapters]');
    if (picker) picker.hidden = radio.value !== 'chapters';
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-p16-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.p16Action;
    if (action === 'edit') renderPlanSection(true);
    else if (action === 'cancel') renderPlanSection(false);
    else if (action === 'save') await saveFromForm();
    else if (action === 'clear') {
      await db.remove('settings', EXAM_PLAN_SETTING_KEY);
      activePlan = null;
      renderPlanSection(false);
    }
  });
}

export function getActiveExamPlan() { return activePlan; }
