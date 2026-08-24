let started = false;
let timerId = null;
let decorationQueued = false;

function engine() {
  return globalThis.__PFLEGE_P20_ENGINE__ || null;
}

function view() {
  return new URLSearchParams(location.search).get('view') || 'today';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
}

function questionCountForChapter(e, chapterId) {
  return e.content.questionsForScope({ chapterId }).filter((q) => ['single_choice','multiple_choice','ordering','matching'].includes(q.type)).length;
}

function eligibleChapters(e) {
  return e.content.chapters
    .map((chapter) => ({ chapter, count: questionCountForChapter(e, chapter.id) }))
    .filter((row) => row.count > 0);
}

function navigate(values) {
  const url = new URL(location.href);
  url.search = '';
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, value);
  history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function ensureStylesheet() {
  if (document.querySelector('link[data-p20-exam-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/p20-exam.css';
  link.dataset.p20ExamCss = 'true';
  document.head.append(link);
}

function p20ConfigHtml(e, openExam) {
  const chapters = eligibleChapters(e);
  return `
    ${openExam ? `<section class="section section-priority p20-open-exam">
      <div class="list-row"><span class="list-row-main"><span class="list-row-title">Offene Prüfung</span><span class="list-row-subtitle">${Math.min(openExam.currentIndex + 1, openExam.questions.length)} von ${openExam.questions.length} Fragen</span></span>
      <button class="button" data-p20-action="continue" data-exam-id="${escapeHtml(openExam.id)}">Fortsetzen</button></div>
    </section>` : ''}
    <section class="section p20-exam-builder" data-p20-builder>
      <div class="section-header"><div><p class="page-kicker">Mock Exam System v2</p><h2>Prüfung zusammenstellen</h2></div></div>
      <div class="p20-presets" aria-label="Prüfungsvorlagen">
        <button class="button button-secondary" data-p20-action="preset" data-count="10" data-timer="false">Schnelltest · 10</button>
        <button class="button button-secondary" data-p20-action="preset" data-count="30" data-timer="false">Prüfung · 30</button>
        <button class="button button-secondary" data-p20-action="preset" data-count="60" data-timer="true" data-duration="75">Simulation · 60</button>
      </div>
      <div class="p20-config-grid">
        <div class="field">
          <label for="p20-count">Fragen</label>
          <input id="p20-count" type="number" min="5" max="100" step="5" value="30">
        </div>
        <div class="field">
          <label for="p20-scope">Prüfungsstoff</label>
          <select id="p20-scope">
            <option value="all">Gesamter Stoff</option>
            <option value="weak">Meine Schwächen</option>
            <option value="chapters">Kapitel auswählen</option>
          </select>
        </div>
      </div>
      <div class="p20-timer-row">
        <label class="p20-check"><input id="p20-timer-enabled" type="checkbox"><span>Timer verwenden</span></label>
        <div class="field p20-duration" data-p20-duration hidden>
          <label for="p20-duration">Minuten</label>
          <input id="p20-duration" type="number" min="5" max="180" step="5" value="45">
        </div>
      </div>
      <div class="p20-chapter-picker" data-p20-chapters hidden>
        <div class="p20-chapter-toolbar"><span class="small muted">Mehrere Kapitel möglich</span><button class="button button-text" data-p20-action="select-all-chapters">Alle wählen</button></div>
        ${chapters.map(({ chapter, count }) => `<label><input type="checkbox" data-p20-chapter value="${escapeHtml(chapter.id)}"><span><strong>${escapeHtml(chapter.number)}. ${escapeHtml(chapter.title)}</strong><small>${count} Fragen</small></span></label>`).join('')}
      </div>
      <p class="small muted p20-builder-note">Fragen werden nach Fragetyp, Kapitel, Wiederholungsabstand und – bei Schwächen – deinem bisherigen Fehlerprofil gemischt. Lösungen erscheinen erst nach Abgabe.</p>
      <div class="primary-action-wrap"><button class="button button-block" data-p20-action="start-custom">Prüfung starten</button></div>
      <p class="small p20-status" data-p20-status aria-live="polite"></p>
    </section>`;
}

async function decorateExamHome(main, e) {
  const page = main.querySelector('.page');
  const header = page?.querySelector('.page-header');
  if (!page || !header || header.querySelector('h1')?.textContent.trim() !== 'Prüfung') return;
  if (page.querySelector('[data-p20-builder]')) return;

  const sections = [...page.children].filter((x) => x.tagName === 'SECTION');
  for (const section of sections) {
    if (section.matches('[data-p16-plan-section]')) continue;
    const heading = section.querySelector('h2')?.textContent.trim() || '';
    const isLegacyModes = !heading && section.querySelector('[data-action="start-exam"]');
    const isLegacyTopic = heading === 'Thema prüfen';
    if (isLegacyModes || isLegacyTopic) section.hidden = true;
  }

  const openExam = await e.findOpenExam();
  const holder = document.createElement('div');
  holder.innerHTML = p20ConfigHtml(e, openExam);
  const warning = sections.find((section) => section.querySelector('.notice-warning'));
  const nodes = [...holder.children];
  for (const node of nodes) page.insertBefore(node, warning || null);
}

function overviewSignature(attempt, rows) {
  return [
    attempt?.id || '',
    Number(attempt?.currentIndex || 0),
    rows.map((row) => `${row.answered ? 1 : 0}${row.flagged ? 1 : 0}`).join('')
  ].join(':');
}

function overviewHtml(rows, signature) {
  const answered = rows.filter((x) => x.answered).length;
  const flagged = rows.filter((x) => x.flagged).length;
  return `<aside class="p20-overview" data-p20-overview data-signature="${escapeHtml(signature)}">
    <div class="p20-overview-header"><strong>Fragenübersicht</strong><span>${answered}/${rows.length} beantwortet · ${flagged} markiert</span></div>
    <div class="p20-question-grid">${rows.map((row) => `<button type="button" class="p20-q ${row.answered ? 'answered' : ''} ${row.flagged ? 'flagged' : ''} ${row.current ? 'current' : ''}" data-p20-action="goto-question" data-index="${row.index}" aria-label="Frage ${row.index + 1}${row.answered ? ', beantwortet' : ', unbeantwortet'}${row.flagged ? ', markiert' : ''}">${row.index + 1}${row.flagged ? '<span aria-hidden="true">★</span>' : ''}</button>`).join('')}</div>
  </aside>`;
}

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

async function updateTimer(e, attempt) {
  const node = document.querySelector('[data-p20-timer]');
  if (!node || !attempt?.p20?.timerEnabled || !attempt.p20.deadlineAt) return;
  const remaining = Math.ceil((new Date(attempt.p20.deadlineAt).getTime() - Date.now()) / 1000);
  node.textContent = formatClock(remaining);
  node.classList.toggle('urgent', remaining <= 300);
  if (remaining > 0) return;
  stopTimer();
  const fresh = await e.getExam(attempt.id);
  if (!fresh || fresh.completed) return;
  fresh.p20 ||= {};
  fresh.p20.timeExpired = true;
  fresh.completedAt = new Date().toISOString();
  await e.finalizeExam(fresh);
  navigate({ view: 'exam-result', exam: fresh.id });
}

async function decorateExamRun(main, e) {
  const examId = new URLSearchParams(location.search).get('exam');
  if (!examId) return;
  const attempt = await e.getExam(examId);
  if (!attempt || attempt.completed || attempt.p20?.version !== 2) return;
  const studyPage = main.querySelector('.study-page');
  const topbar = studyPage?.querySelector('.exam-topbar');
  const shell = studyPage?.querySelector('.question-shell');
  if (!studyPage || !topbar || !shell) return;
  studyPage.dataset.p20ExamV2 = 'true';

  if (attempt.p20?.timerEnabled && !topbar.querySelector('[data-p20-timer]')) {
    const timer = document.createElement('span');
    timer.className = 'p20-timer';
    timer.dataset.p20Timer = 'true';
    timer.setAttribute('aria-live', 'polite');
    topbar.insertBefore(timer, topbar.children[1] || null);
  }

  const rows = e.p20ExamOverview(attempt);
  const signature = overviewSignature(attempt, rows);
  const old = studyPage.querySelector('[data-p20-overview]');
  if (old?.dataset.signature !== signature) {
    old?.remove();
    const holder = document.createElement('div');
    holder.innerHTML = overviewHtml(rows, signature);
    shell.insertAdjacentElement('afterend', holder.firstElementChild);
  }

  if (attempt.p20?.timerEnabled) {
    await updateTimer(e, attempt);
    if (!timerId) timerId = setInterval(() => updateTimer(e, attempt).catch(console.error), 1000);
  } else {
    stopTimer();
  }
}

function typeBreakdownHtml(rows) {
  if (!rows?.length) return '';
  return `<section class="section p20-result-section" data-p20-result-types>
    <div class="section-header"><h2>Nach Fragetyp</h2></div>
    <ul class="list">${rows.map((row) => `<li class="list-row"><span class="list-row-main"><span class="list-row-title">${escapeHtml(row.label)}</span><span class="list-row-subtitle">${row.correct} von ${row.total} richtig</span></span><span class="list-row-meta">${row.percentage}%</span></li>`).join('')}</ul>
  </section>`;
}

function chapterBreakdownHtml(rows) {
  if (!rows?.length) return '';
  return `<section class="section p20-result-section" data-p20-result-chapters>
    <div class="section-header"><h2>Nach Themen</h2></div>
    <ul class="list">${rows.map((row) => `<li class="list-row"><span class="list-row-main"><span class="list-row-title">${escapeHtml(row.number ? `${row.number}. ${row.label}` : row.label)}</span><span class="list-row-subtitle">${escapeHtml(row.tier?.label || '')} · ${row.correct} von ${row.total}</span></span><span class="list-row-meta">${row.percentage}%</span></li>`).join('')}</ul>
  </section>`;
}

async function decorateExamResult(main, e) {
  const examId = new URLSearchParams(location.search).get('exam');
  if (!examId) return;
  let attempt = await e.getExam(examId);
  if (!attempt) return;
  if (!attempt.completed || !attempt.processed || !attempt.p20?.finalizedAt) attempt = await e.finalizeExam(attempt);
  const page = main.querySelector('.page');
  const header = page?.querySelector('.page-header');
  if (!page || !header || page.querySelector('[data-p20-result-summary]')) return;

  const summary = document.createElement('section');
  summary.className = `section p20-result-summary ${attempt.p20.passed ? 'passed' : 'not-passed'}`;
  summary.dataset.p20ResultSummary = 'true';
  const duration = Math.max(0, Number(attempt.p20.durationSeconds || 0));
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  summary.innerHTML = `<div class="p20-result-status"><strong>${attempt.p20.passed ? 'Trainingsziel erreicht' : 'Trainingsziel noch nicht erreicht'}</strong><span>Trainingsgrenze ${attempt.p20.passThreshold}%</span></div>
    <div class="p20-result-metrics">
      <div><strong>${attempt.p20.answeredCount}</strong><span>beantwortet</span></div>
      <div><strong>${attempt.p20.unansweredCount}</strong><span>offen</span></div>
      <div><strong>${attempt.p20.flaggedCount}</strong><span>markiert</span></div>
      <div><strong>${minutes}:${String(seconds).padStart(2, '0')}</strong><span>Zeit</span></div>
    </div>
    ${attempt.p20.timeExpired ? '<p class="small p20-time-expired">Zeit abgelaufen – die bis dahin gespeicherten Antworten wurden gewertet.</p>' : ''}`;
  header.insertAdjacentElement('afterend', summary);

  const remediationButton = page.querySelector('[data-action="practice-exam-errors"]');
  if (remediationButton) remediationButton.textContent = 'Fehler gezielt lernen';

  const mistakes = page.querySelector('#mistakes');
  const holder = document.createElement('div');
  holder.innerHTML = `${typeBreakdownHtml(attempt.p20.typeBreakdown)}${chapterBreakdownHtml(attempt.p20.chapterBreakdown)}`;
  for (const child of [...holder.children]) page.insertBefore(child, mistakes || null);
}

async function decorate() {
  decorationQueued = false;
  const e = engine();
  const main = document.getElementById('main');
  if (!e || !main) return;
  ensureStylesheet();
  const current = view();
  if (current !== 'exam-run') stopTimer();
  if (current === 'exam') await decorateExamHome(main, e);
  else if (current === 'exam-run') await decorateExamRun(main, e);
  else if (current === 'exam-result') await decorateExamResult(main, e);
}

function queueDecorate() {
  if (decorationQueued) return;
  decorationQueued = true;
  queueMicrotask(() => decorate().catch(console.error));
}

async function startConfiguredExam(source) {
  const e = engine();
  if (!e) return;
  const status = document.querySelector('[data-p20-status]');
  const count = Number(source?.dataset?.count || document.getElementById('p20-count')?.value || 30);
  const presetTimer = source?.dataset?.timer;
  const timerEnabled = presetTimer !== undefined ? presetTimer === 'true' : Boolean(document.getElementById('p20-timer-enabled')?.checked);
  const durationMinutes = Number(source?.dataset?.duration || document.getElementById('p20-duration')?.value || 45);
  const scope = source?.dataset?.scope || document.getElementById('p20-scope')?.value || 'all';
  const chapterIds = scope === 'chapters'
    ? [...document.querySelectorAll('[data-p20-chapter]:checked')].map((x) => x.value)
    : [];
  if (scope === 'chapters' && !chapterIds.length) {
    if (status) status.textContent = 'Bitte mindestens ein Kapitel auswählen.';
    return;
  }
  const attempt = await e.createExam({
    mode: scope === 'weak' ? 'weak' : (count <= 10 ? 'quick' : 'full'),
    count,
    weakness: scope === 'weak',
    chapterIds,
    timerEnabled,
    durationMinutes
  });
  if (!attempt) {
    if (status) status.textContent = scope === 'weak' ? 'Noch keine gespeicherten Schwächen für eine gezielte Prüfung.' : 'Für diese Auswahl sind keine passenden Prüfungsfragen verfügbar.';
    return;
  }
  navigate({ view: 'exam-run', exam: attempt.id });
}

async function handleClick(event) {
  const button = event.target.closest('[data-p20-action]');
  if (!button) return;
  event.preventDefault();
  const e = engine();
  if (!e) return;
  const action = button.dataset.p20Action;
  if (action === 'continue') {
    navigate({ view: 'exam-run', exam: button.dataset.examId });
  } else if (action === 'preset') {
    await startConfiguredExam(button);
  } else if (action === 'start-custom') {
    await startConfiguredExam();
  } else if (action === 'select-all-chapters') {
    document.querySelectorAll('[data-p20-chapter]').forEach((x) => { x.checked = true; });
  } else if (action === 'goto-question') {
    const examId = new URLSearchParams(location.search).get('exam');
    const attempt = await e.getExam(examId);
    if (!attempt || attempt.completed) return;
    attempt.currentIndex = Math.max(0, Math.min(attempt.questions.length - 1, Number(button.dataset.index || 0)));
    await e.saveExam(attempt);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

function handleExamSubmitCapture(event) {
  const button = event.target.closest?.('[data-action="exam-submit"]');
  if (!button || view() !== 'exam-run' || !document.querySelector('[data-p20-exam-v2]')) return;
  const e = engine();
  const examId = new URLSearchParams(location.search).get('exam');
  if (!e || !examId) return;

  // P20 owns submission for v2 attempts so unanswered status uses actual learner input
  // (especially ordering questions) rather than the legacy pre-shuffled variant.
  event.preventDefault();
  event.stopImmediatePropagation();
  void (async () => {
    const attempt = await e.getExam(examId);
    if (!attempt || attempt.completed) return;
    if (attempt.p20?.version !== 2) {
      // P20 creates all new attempts; legacy open attempts remain rare but should not be destroyed.
      return;
    }
    const unanswered = e.p20ExamOverview(attempt).filter((row) => !row.answered).length;
    if (unanswered) {
      const ok = window.confirm(`Noch ${unanswered} ${unanswered === 1 ? 'Frage ist' : 'Fragen sind'} unbeantwortet. Prüfung trotzdem abgeben?`);
      if (!ok) return;
    }
    attempt.completedAt = new Date().toISOString();
    await e.finalizeExam(attempt);
    navigate({ view: 'exam-result', exam: attempt.id });
  })().catch(console.error);
}

function handleChange(event) {
  if (event.target?.id === 'p20-scope') {
    const picker = document.querySelector('[data-p20-chapters]');
    if (picker) picker.hidden = event.target.value !== 'chapters';
  } else if (event.target?.id === 'p20-timer-enabled') {
    const duration = document.querySelector('[data-p20-duration]');
    if (duration) duration.hidden = !event.target.checked;
  }
  if (view() === 'exam-run' && event.target?.matches?.('[data-exam-option], [data-exam-match]')) setTimeout(queueDecorate, 0);
}

export function initMockExamUi() {
  if (started || typeof document === 'undefined') return;
  started = true;
  ensureStylesheet();
  document.addEventListener('click', handleExamSubmitCapture, true);
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  const main = document.getElementById('main');
  if (main) new MutationObserver(queueDecorate).observe(main, { childList: true, subtree: true });
  window.addEventListener('popstate', queueDecorate);
  queueDecorate();
}
