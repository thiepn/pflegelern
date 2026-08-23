import { ContentRepository } from './content.js';
import { StudyEngine, splitPair } from './study-engine.js';
import { Rating } from './fsrs.js';
import * as storage from './storage.js';
import {
  arraysEqualAsSets, debounce, escapeHtml, formatDate, formatDateTime, formatMinutes,
  normalizeText, percent, uid
} from './util.js';

const APP_VERSION = '1.0.0-rc.1';
const main = document.getElementById('main');
const shell = document.getElementById('app-shell');
const offlineIndicator = document.getElementById('offline-indicator');
const restoreInput = document.getElementById('restore-input');
const toastRegion = document.getElementById('toast-region');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmActionButton = document.getElementById('confirm-action');

let content;
let engine;
let activeSession = null;
let activeExam = null;
let rendering = false;
let pendingRender = false;

init().catch(showFatalError);

async function init() {
  applyTheme(localStorage.getItem('pflege-theme') || 'system');
  content = await ContentRepository.load();
  engine = new StudyEngine(content);
  await engine.init();
  bindGlobalEvents();
  updateOnlineState();
  registerServiceWorker();
  if (!localStorage.getItem('pflege-onboarded') && route().view !== 'welcome') {
    replaceRoute({ view: 'welcome' });
  } else {
    await renderRoute();
  }
}

function bindGlobalEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('popstate', () => renderRoute());
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);
  restoreInput.addEventListener('change', restoreBackupFile);
}

function route() {
  const params = new URLSearchParams(location.search);
  return { view: params.get('view') || 'today', params };
}

function routeUrl(values = {}) {
  const url = new URL(location.href);
  url.search = '';
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function navigate(values, { replace = false } = {}) {
  const target = routeUrl(values);
  if (replace) history.replaceState({}, '', target); else history.pushState({}, '', target);
  renderRoute();
}

function replaceRoute(values) { navigate(values, { replace: true }); }

async function renderRoute() {
  if (!engine) return;
  if (rendering) { pendingRender = true; return; }
  rendering = true;
  try {
    const { view, params } = route();
    activeSession = null;
    activeExam = null;
    const focus = ['study', 'exam-run', 'welcome'].includes(view);
    document.body.classList.toggle('focus-mode', focus);
    updateActiveNavigation(view);

    switch (view) {
      case 'welcome': await renderWelcome(); break;
      case 'today': await renderToday(); break;
      case 'learn': await renderLearn(); break;
      case 'topic': await renderTopic(params); break;
      case 'search': await renderSearch(params); break;
      case 'study': await renderStudy(params); break;
      case 'exam': await renderExamHome(); break;
      case 'exam-run': await renderExamRun(params); break;
      case 'exam-result': await renderExamResult(params); break;
      case 'progress': await renderProgress(); break;
      case 'settings': await renderSettings(); break;
      default: replaceRoute({ view: 'today' }); return;
    }
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (error) {
    console.error(error);
    main.innerHTML = errorState('Diese Ansicht konnte nicht geladen werden.', error.message, 'Erneut versuchen');
  } finally {
    rendering = false;
    if (pendingRender) { pendingRender = false; queueMicrotask(() => renderRoute()); }
  }
}

async function renderWelcome() {
  main.innerHTML = `
    <div class="page" style="max-width:560px;padding-top:min(14vh,120px)">
      <div class="brand-mark" style="width:48px;height:48px;margin-bottom:24px" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7.5 5.5h9A2.5 2.5 0 0 1 19 8v10.5H8A3 3 0 0 1 5 15.5V8a2.5 2.5 0 0 1 2.5-2.5Z"/><path d="M8 18.5a3 3 0 0 1 0-6h11"/><path d="M12 8v4M10 10h4"/></svg>
      </div>
      <h1>PflegeLern</h1>
      <p class="muted" style="font-size:1.08rem;max-width:480px">Mit Flashcards, gezielten Wiederholungen und Prüfungsfragen aus deinem Lehrbuch lernen – ohne komplizierte Einstellungen.</p>
      <div class="primary-action-wrap" style="margin-top:30px">
        <button class="button button-block" data-action="finish-welcome">Los geht's</button>
      </div>
      <p class="tiny subtle" style="margin-top:28px">Die Inhalte folgen dem verwendeten Lehrbuchstand von 2015.</p>
    </div>`;
}

async function renderToday() {
  const open = await engine.findOpenSession();
  const preview = engine.recommendedPreview();
  const overall = engine.scopeStats();
  const weak = engine.weakestChapters(1)[0];
  const learned = overall.safe + overall.uncertain;

  let primary;
  if (open) {
    const done = Math.min(open.currentIndex, open.items.length);
    primary = `
      <div class="hero-action">
        <p class="page-kicker">Offene Lernrunde</p>
        <h2 class="hero-title">Weitermachen?</h2>
        <div class="hero-meta"><span><strong>${done}</strong> von ${open.items.length} Aufgaben geschafft</span></div>
        <div class="primary-action-wrap"><button class="button button-block" data-action="continue-open" data-session-id="${escapeHtml(open.id)}">Weitermachen</button></div>
        <button class="button button-text" data-action="start-recommended">Neue Runde starten</button>
      </div>`;
  } else {
    const meta = [
      preview.reviews ? `<span><strong>${preview.reviews}</strong> Wiederholungen</span>` : '',
      preview.newCards ? `<span><strong>${preview.newCards}</strong> neue Karten</span>` : '',
      preview.questions ? `<span><strong>${preview.questions}</strong> Übungsfragen</span>` : ''
    ].filter(Boolean).join('');
    primary = `
      <div class="hero-action">
        <p class="page-kicker">Empfehlung für heute</p>
        <h2 class="hero-title">Bereit zum Lernen?</h2>
        <div class="hero-meta">${meta || '<span>Eine kurze Wiederholungsrunde</span>'}<span>${formatMinutes(preview.minutes)}</span></div>
        <div class="primary-action-wrap"><button class="button button-block" data-action="start-recommended">Lernen starten</button></div>
        <button class="button button-text" data-action="start-quick">5-Minuten-Runde</button>
      </div>`;
  }

  main.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Heute</h1></div>
      ${primary}
      <section class="section">
        <div class="section-header"><h2>Fortschritt</h2><a href="?view=progress" data-spa>Mehr ansehen</a></div>
        <div class="metric-line"><span class="metric-big">${Math.round(overall.safeRatio * 100)}%</span><span class="metric-label">sicher gelernt</span></div>
        <div class="progress-track" style="margin-top:14px"><div class="progress-fill" style="width:${Math.round(overall.safeRatio * 100)}%"></div></div>
        <p class="small muted" style="margin-top:10px">${learned ? `${learned} Karten bereits bearbeitet` : 'Noch keine Karten bearbeitet'}</p>
      </section>
      ${weak ? `
      <section class="section">
        <div class="section-header"><h2>Gerade noch unsicher</h2></div>
        <a class="list-row" href="?view=topic&type=chapter&id=${encodeURIComponent(weak.id)}" data-spa>
          <span class="list-row-main"><span class="list-row-title">${escapeHtml(weak.title)}</span><span class="list-row-subtitle">${Math.round(weak.mastery * 100)} % Wissensstand</span></span>
          <span class="list-row-meta">Üben</span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
        </a>
      </section>` : ''}
    </div>`;
}

async function renderLearn() {
  const progress = engine.chapterProgress();
  const bookmarkCount = engine.bookmarks.size;
  main.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div class="section-header" style="align-items:center">
          <h1 style="margin:0">Lernen</h1>
          <a class="icon-button" href="?view=search" data-spa aria-label="Suchen" title="Suchen">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
          </a>
        </div>
      </div>
      <div class="primary-action-wrap"><button class="button button-block" data-action="start-scoped" data-mode="automatic">Automatisch weiterlernen</button></div>
      <section class="section">
        <h2>Schnellzugriff</h2>
        <div class="quick-actions">
          <button class="quick-action" data-action="start-scoped" data-mode="weak" data-unlimited="true"><strong>Meine Schwächen</strong><span>Unsichere Inhalte gezielt üben</span></button>
          <button class="quick-action" data-action="start-scoped" data-mode="new" data-unlimited="true"><strong>Neue Karten</strong><span>Ohne Tageslimit weiterlernen</span></button>
          <button class="quick-action" data-action="start-scoped" data-mode="all" data-unlimited="true"><strong>Alle Karten</strong><span>Frei durch den gesamten Lernstoff</span></button>
        </div>
        ${bookmarkCount ? `<button class="button button-text" data-action="start-bookmarks" style="margin-top:8px">Gespeicherte Karten (${bookmarkCount}) →</button>` : ''}
      </section>
      <section class="section">
        <div class="section-header"><h2>Themen</h2><span class="small subtle">${progress.length} Kapitel</span></div>
        <ul class="list">
          ${progress.map((chapter) => `
            <li><a class="list-row" href="?view=topic&type=chapter&id=${encodeURIComponent(chapter.id)}" data-spa>
              <span class="list-row-main"><span class="list-row-title">${escapeHtml(chapter.number)}. ${escapeHtml(chapter.title)}</span><span class="list-row-subtitle">${chapter.total} Karten</span></span>
              <span class="list-row-meta">${Math.round(chapter.safeRatio * 100)} %</span>
              <svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
            </a></li>`).join('')}
        </ul>
      </section>
    </div>`;
}

async function renderTopic(params) {
  const type = params.get('type') || 'chapter';
  const id = params.get('id');
  const isChapter = type === 'chapter';
  const topic = isChapter ? content.chapterById.get(id) : content.sectionById.get(id);
  if (!topic) { main.innerHTML = errorState('Thema nicht gefunden.', 'Der gewählte Bereich ist in dieser Inhaltsversion nicht vorhanden.'); return; }
  const scope = isChapter ? { chapterId: id } : { sectionId: id };
  const stats = engine.scopeStats(scope);
  const parentChapter = !isChapter ? content.chapterById.get(topic.chapterId) : null;
  const parentSection = !isChapter ? content.sectionParent(id) : null;
  const sections = isChapter ? content.directSections({ chapterId: id }) : content.directSections({ sectionId: id });
  const subtitle = isChapter ? `Kapitel ${topic.number}` : `${topic.number}${parentChapter ? ` · ${parentChapter.title}` : ''}`;
  const backHref = isChapter ? '?view=learn' : parentSection
    ? `?view=topic&type=section&id=${encodeURIComponent(parentSection.id)}`
    : `?view=topic&type=chapter&id=${encodeURIComponent(topic.chapterId)}`;
  const backLabel = isChapter ? 'Lernen' : parentSection ? parentSection.title : 'Kapitel';
  const examQuestions = content.questionsForScope(scope).filter((q) => ['single_choice','multiple_choice','ordering','matching'].includes(q.type));

  main.innerHTML = `
    <div class="page">
      <a class="secondary-link" href="${backHref}" data-spa>← ${escapeHtml(backLabel)}</a>
      <div class="page-header" style="margin-top:18px">
        <p class="page-kicker">${escapeHtml(subtitle)}</p>
        <h1>${escapeHtml(topic.title)}</h1>
        <div class="metric-line"><span class="metric-big" style="font-size:2.1rem">${Math.round(stats.safeRatio * 100)}%</span><span class="metric-label">sicher</span></div>
        <div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="width:${Math.round(stats.safeRatio * 100)}%"></div></div>
        <p class="small muted" style="margin-top:10px">${stats.safe} sicher · ${stats.uncertain} unsicher · ${stats.new} neu</p>
      </div>
      <div class="primary-action-wrap">
        <button class="button button-block" data-action="start-scoped" data-mode="automatic" data-${isChapter ? 'chapter' : 'section'}-id="${escapeHtml(id)}">Weiterlernen</button>
      </div>
      <div class="button-row" style="margin-top:10px">
        <button class="button button-secondary" data-action="start-scoped" data-mode="all" data-unlimited="true" data-${isChapter ? 'chapter' : 'section'}-id="${escapeHtml(id)}">Alle Karten</button>
        <button class="button button-secondary" data-action="start-scoped" data-mode="new" data-unlimited="true" data-${isChapter ? 'chapter' : 'section'}-id="${escapeHtml(id)}">Nur neue</button>
        <button class="button button-secondary" data-action="start-topic-exam" data-chapter-id="${escapeHtml(isChapter ? id : topic.chapterId)}" ${isChapter ? '' : `data-section-id="${escapeHtml(id)}"`} ${examQuestions.length ? '' : 'disabled title="Für diesen Bereich sind noch keine automatisch bewertbaren Prüfungsfragen vorhanden."'}>Prüfung starten</button>
      </div>
      ${sections.length ? `
      <section class="section">
        <div class="section-header"><h2>${isChapter ? 'Abschnitte' : 'Unterabschnitte'}</h2><span class="small subtle">${sections.length}</span></div>
        <ul class="list">
          ${sections.map((section) => {
            const s = engine.scopeStats({ sectionId: section.id });
            return `<li><a class="list-row" href="?view=topic&type=section&id=${encodeURIComponent(section.id)}" data-spa>
              <span class="list-row-main"><span class="list-row-title">${escapeHtml(section.number)} ${escapeHtml(section.title)}</span><span class="list-row-subtitle">${s.total} Karten</span></span>
              <span class="list-row-meta">${Math.round(s.safeRatio * 100)} %</span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
            </a></li>`;
          }).join('')}
        </ul>
      </section>` : ''}
    </div>`;
}


async function renderSearch(params) {
  const q = params.get('q') || '';
  main.innerHTML = `
    <div class="page">
      <a class="secondary-link" href="?view=learn" data-spa>← Lernen</a>
      <div class="page-header" style="margin-top:18px"><h1>Suche</h1></div>
      <div class="search-field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
        <input id="search-input" data-search-input type="search" autocomplete="off" placeholder="Thema oder Begriff suchen" value="${escapeHtml(q)}" aria-label="Lernstoff durchsuchen">
      </div>
      <div id="search-results" style="margin-top:26px">${searchResultsHtml(q)}</div>
    </div>`;
  queueMicrotask(() => document.getElementById('search-input')?.focus());
}

function searchResultsHtml(query) {
  if (!query.trim()) return '<p class="muted">Suche nach Kapitel, Abschnitt, Begriff oder Kartenfrage.</p>';
  const results = content.search(query);
  const hasAny = Object.values(results).some((x) => x.length);
  if (!hasAny) return `<div class="empty-state"><h2>Nichts gefunden</h2><p>Versuche einen anderen oder kürzeren Begriff.</p></div>`;
  let html = '';
  if (results.chapters.length) html += resultSection('Kapitel', results.chapters.map((x) => topicResult(x, 'chapter')));
  if (results.sections.length) html += resultSection('Abschnitte', results.sections.map((x) => topicResult(x, 'section')));
  if (results.concepts.length) html += resultSection('Begriffe', results.concepts.map(conceptResult));
  if (results.cards.length) html += resultSection('Karten', results.cards.map(cardResult));
  return html;
}

function resultSection(title, rows) {
  return `<section class="section" style="margin-top:28px"><h2>${escapeHtml(title)}</h2><ul class="list">${rows.join('')}</ul></section>`;
}

function topicResult(item, type) {
  return `<li><a class="list-row" href="?view=topic&type=${type}&id=${encodeURIComponent(item.id)}" data-spa>
    <span class="list-row-main"><span class="list-row-title">${escapeHtml(item.number ? `${item.number} ${item.title}` : item.title)}</span></span>
    <svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></a></li>`;
}

function conceptResult(concept) {
  const section = content.sectionById.get(concept.sectionId);
  const chapter = section ? content.chapterById.get(section.chapterId) : null;
  const href = section ? `?view=topic&type=section&id=${encodeURIComponent(section.id)}` : `?view=topic&type=chapter&id=${encodeURIComponent(chapter?.id || '')}`;
  return `<li><a class="list-row" href="${href}" data-spa>
    <span class="list-row-main"><span class="list-row-title">${escapeHtml(concept.title)}</span><span class="list-row-subtitle">${escapeHtml(section?.title || chapter?.title || '')}</span></span>
    <svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></a></li>`;
}

function cardResult(card) {
  const { chapter, section } = content.cardContext(card);
  return `<li><div class="list-row">
    <span class="list-row-main"><span class="list-row-title">${escapeHtml(card.front)}</span><span class="list-row-subtitle">${escapeHtml(section?.title || chapter?.title || '')}</span></span>
    <button class="button button-text" data-action="start-single-card" data-card-id="${escapeHtml(card.id)}">Lernen</button>
  </div></li>`;
}

async function renderStudy(params) {
  const id = params.get('session');
  const session = await engine.getSession(id);
  if (!session) { main.innerHTML = errorState('Lernrunde nicht gefunden.', 'Möglicherweise wurde sie bereits entfernt.'); return; }
  activeSession = session;
  if (!session.completed && !session.lastActiveAt) { engine.resumeSession(session); await engine.saveSession(session); }
  if (session.completed) { renderSessionCompletion(session); return; }

  await engine.ensureUnlimitedQueue(session);
  if (session.currentIndex >= session.items.length) {
    await finishSession(session);
    renderSessionCompletion(session);
    return;
  }

  const item = session.items[session.currentIndex];
  if (!item) {
    await finishSession(session);
    renderSessionCompletion(session);
    return;
  }
  if (item.kind === 'card') renderStudyCard(session, item);
  else renderStudyQuestion(session, item);
}

function studyTopbar(session, { bookmarkCard = null } = {}) {
  const unlimited = Boolean(session.options?.unlimited);
  const countText = unlimited ? `${session.stats.cards || 0} gelernt` : `${session.currentIndex + 1} / ${session.items.length}`;
  const progress = unlimited ? null : Math.round(session.currentIndex / Math.max(1, session.items.length) * 100);
  return `
    <div class="study-topbar">
      <div class="study-topbar-left"><button class="button button-text" data-action="exit-study">← Beenden</button></div>
      <div class="study-counter">${countText}</div>
      <div class="study-topbar-right">
        ${bookmarkCard ? `<button class="icon-button" data-action="toggle-bookmark" data-card-id="${escapeHtml(bookmarkCard.id)}" aria-label="${engine.isBookmarked(bookmarkCard.id) ? 'Lesezeichen entfernen' : 'Karte speichern'}" title="Karte speichern">
          <svg viewBox="0 0 24 24" ${engine.isBookmarked(bookmarkCard.id) ? 'style="fill:currentColor"' : ''}><path d="M7 4.5h10v15l-5-3.2L7 19.5z"/></svg></button>
          <button class="icon-button" data-action="report-card" data-card-id="${escapeHtml(bookmarkCard.id)}" aria-label="Problem melden" title="Problem melden"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>` : '<span style="width:88px"></span>'}
      </div>
    </div>
    ${progress !== null ? `<div class="study-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>` : ''}`;
}

function renderStudyCard(session, item) {
  const card = content.cardById.get(item.id);
  if (!card) { advanceBrokenItem(session); return; }
  const response = getStudyResponse(session);
  const revealed = Boolean(response.revealed);
  const topic = content.topicLabelForCard(card);
  main.innerHTML = `
    <div class="study-page">
      ${studyTopbar(session, { bookmarkCard: card })}
      <article class="flashcard">
        <div class="card-topic">${escapeHtml(topic)}</div>
        <div class="card-question">${formatText(card.front)}</div>
        ${revealed ? `<div class="card-divider"></div><div class="card-answer">${formatText(card.back)}</div>` : ''}
        <div class="card-actions">
          ${revealed ? `
            <div class="rating-grid" role="group" aria-label="Wie gut konntest du dich erinnern?">
              <button class="rating-button again" data-action="rate-card" data-rating="1">Nicht gewusst</button>
              <button class="rating-button hard" data-action="rate-card" data-rating="2">Unsicher</button>
              <button class="rating-button good" data-action="rate-card" data-rating="3">Gewusst</button>
            </div>
            <p class="tiny subtle" style="text-align:center;margin:12px 0 0">1 · 2 · 3 auf der Tastatur</p>` : `<button class="button button-block" data-action="reveal-card">Antwort anzeigen</button>`}
        </div>
      </article>
    </div>`;
}

function renderStudyQuestion(session, item) {
  const q = content.questionById.get(item.id);
  if (!q) { advanceBrokenItem(session); return; }
  const response = getStudyResponse(session);
  main.innerHTML = `
    <div class="study-page">
      ${studyTopbar(session)}
      <div class="question-shell">
        <div class="question-type">${questionTypeLabel(q.type)}</div>
        <div class="question-prompt">${formatText(q.prompt)}</div>
        ${studyQuestionBody(q, item, response)}
      </div>
    </div>`;
}

function studyQuestionBody(q, item, response) {
  const checked = Boolean(response.checked);
  let body = '';
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const order = item.variant?.optionOrder || (q.options || []).map((x) => x.id);
    const selected = response.selected || [];
    body = `<div class="answer-options">${order.map((id) => {
      const option = q.options.find((x) => x.id === id);
      if (!option) return '';
      const isCorrect = (q.correct || []).includes(id);
      const isSelected = selected.includes(id);
      const feedbackClass = checked ? (isCorrect ? ' correct' : isSelected ? ' incorrect' : '') : '';
      return `<label class="answer-option${feedbackClass}"><input data-study-option type="${q.type === 'single_choice' ? 'radio' : 'checkbox'}" name="study-answer" value="${escapeHtml(id)}" ${isSelected ? 'checked' : ''} ${checked ? 'disabled' : ''}><span>${escapeHtml(option.text)}</span></label>`;
    }).join('')}</div>`;
  } else if (q.type === 'ordering') {
    const order = response.order || item.variant?.order || (q.options || []).map((x) => x.id);
    body = `<div class="ordering-list">${order.map((id, index) => {
      const option = q.options.find((x) => x.id === id);
      return `<div class="ordering-item"><span class="ordering-number">${index + 1}</span><span>${escapeHtml(option?.text || '')}</span><span class="order-buttons"><button data-action="move-order" data-index="${index}" data-direction="-1" ${checked || index === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button><button data-action="move-order" data-index="${index}" data-direction="1" ${checked || index === order.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button></span></div>`;
    }).join('')}</div>`;
  } else if (q.type === 'matching') {
    const pairs = item.variant?.matchingPairs || (q.options || []).map((x) => splitPair(x.text)).filter(Boolean);
    const rights = item.variant?.rightOrder || pairs.map((x) => x.right);
    const matches = response.matches || {};
    body = `<div class="matching-grid">${pairs.map((pair) => `<label class="matching-row"><span>${escapeHtml(pair.left)}</span><select data-study-match data-left="${escapeHtml(pair.left)}" ${checked ? 'disabled' : ''}><option value="">Zuordnen …</option>${rights.map((right) => `<option value="${escapeHtml(right)}" ${matches[pair.left] === right ? 'selected' : ''}>${escapeHtml(right)}</option>`).join('')}</select></label>`).join('')}</div>`;
  } else {
    body = `<div class="field"><label for="study-text-answer">Deine Antwort <span class="subtle">(optional)</span></label><textarea id="study-text-answer" data-study-text ${checked ? 'disabled' : ''} placeholder="Du kannst auch nur im Kopf antworten.">${escapeHtml(response.text || '')}</textarea></div>`;
  }

  if (!checked) {
    const label = ['short_answer', 'clinical_case'].includes(q.type) ? 'Antwort anzeigen' : 'Antwort prüfen';
    return `${body}<div class="question-actions"><button class="button button-block" data-action="check-question">${label}</button></div>`;
  }

  if (['short_answer', 'clinical_case'].includes(q.type) && response.selfCorrect === undefined) {
    const expected = q.correctText || q.explanation || 'Siehe Erklärung.';
    return `${body}<div class="question-feedback"><h3>Musterantwort</h3><p>${formatText(expected)}</p>${q.explanation && q.explanation !== expected ? `<p class="small">${formatText(q.explanation)}</p>` : ''}</div>
      <div class="button-row question-actions"><button class="button button-secondary" data-action="self-grade" data-correct="false">Nicht richtig</button><button class="button" data-action="self-grade" data-correct="true">Richtig</button></div>`;
  }

  const correct = Boolean(response.correct ?? response.selfCorrect);
  return `${body}<div class="question-feedback ${correct ? '' : 'incorrect'}"><h3>${correct ? 'Richtig.' : 'Nicht ganz.'}</h3>${q.explanation ? `<p>${formatText(q.explanation)}</p>` : ''}</div><div class="question-actions"><button class="button button-block" data-action="next-question">Weiter</button></div>`;
}

function renderSessionCompletion(session) {
  const s = session.stats || {};
  const isRecommended = ['recommended', 'quick', 'automatic'].includes(session.type) && session.source === 'recommended';
  const totalAnswers = (s.cards || 0) + (s.questions || 0);
  main.innerHTML = `
    <div class="study-page">
      <div class="completion">
        <div class="completion-icon"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></div>
        <h1>${isRecommended ? 'Für heute geschafft' : 'Lernrunde geschafft'}</h1>
        <p class="muted">${isRecommended ? 'Alles Wichtige für diese Runde ist erledigt.' : 'Dein Fortschritt wurde gespeichert.'}</p>
        <div class="session-summary">
          <div><strong>${totalAnswers}</strong><span>Aufgaben</span></div>
          <div><strong>${s.correct || 0}</strong><span>gewusst</span></div>
          <div><strong>${s.newCards || 0}</strong><span>neu gelernt</span></div>
        </div>
        <div class="primary-action-wrap" style="margin:0 auto">
          <button class="button button-block" data-action="continue-after-completion" data-session-id="${escapeHtml(session.id)}">Weiterlernen</button>
          <button class="button button-text" data-action="finish-session-home">Fertig</button>
        </div>
      </div>
    </div>`;
}

async function renderExamHome() {
  const chapters = content.chapters.filter((c) => content.questionsForScope({ chapterId: c.id }).some((q) => ['single_choice','multiple_choice','ordering','matching'].includes(q.type)));
  const openExam = await engine.findOpenExam();
  const hasWeakness = engine.hasWeaknessEvidence();
  main.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Prüfung</h1><p class="muted">Teste dich ohne sofortige Hinweise. Die Lösungen siehst du erst am Ende.</p></div>
      ${openExam ? `<section class="section section-priority"><div class="list-row"><span class="list-row-main"><span class="list-row-title">Offene Prüfung</span><span class="list-row-subtitle">${openExam.currentIndex + 1} von ${openExam.questions.length} Fragen</span></span><button class="button" data-action="continue-exam" data-exam-id="${escapeHtml(openExam.id)}">Fortsetzen</button></div></section>` : ''}
      <section>
        <div class="list">
          <div class="list-row"><span class="list-row-main"><span class="list-row-title">Schnelltest</span><span class="list-row-subtitle">10 Fragen · ca. 5–8 Minuten</span></span><button class="button button-secondary" data-action="start-exam" data-mode="quick" data-count="10">Starten</button></div>
          <div class="list-row"><span class="list-row-main"><span class="list-row-title">Prüfung</span><span class="list-row-subtitle">30 gemischte Fragen</span></span><button class="button button-secondary" data-action="start-exam" data-mode="full" data-count="30">Starten</button></div>
          <div class="list-row"><span class="list-row-main"><span class="list-row-title">Meine Schwächen</span><span class="list-row-subtitle">${hasWeakness ? '20 Fragen aus schwierigen Bereichen' : 'Wird nach ersten Lern- oder Prüfungsfehlern verfügbar'}</span></span><button class="button button-secondary" data-action="start-exam" data-mode="weak" data-count="20" data-weakness="true" ${hasWeakness ? '' : 'disabled'}>Starten</button></div>
        </div>
      </section>
      <section class="section">
        <h2>Thema prüfen</h2>
        <div class="field"><label for="exam-topic-select">Kapitel</label><select id="exam-topic-select"><option value="">Kapitel auswählen …</option>${chapters.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.number)}. ${escapeHtml(c.title)}</option>`).join('')}</select></div>
        <button class="button button-secondary" data-action="start-topic-exam">10 Fragen starten</button>
      </section>
      <section class="section"><div class="notice notice-warning"><strong>Lehrbuchstand 2015:</strong> Die Prüfungsfragen geben den zertifizierten Inhalt der verwendeten Ausgabe wieder und sind keine Aktualisierung auf heutige Leitlinien.</div></section>
    </div>`;
}


async function renderExamRun(params) {
  const id = params.get('exam');
  const attempt = await engine.getExam(id);
  if (!attempt) { main.innerHTML = errorState('Prüfung nicht gefunden.', 'Die gespeicherte Prüfung ist nicht mehr verfügbar.'); return; }
  activeExam = attempt;
  if (attempt.completed) { navigate({ view: 'exam-result', exam: attempt.id }, { replace: true }); return; }
  const item = attempt.questions[attempt.currentIndex];
  const q = content.questionById.get(item.id);
  if (!q) { main.innerHTML = errorState('Frage nicht gefunden.', 'Diese Prüfungsfrage fehlt in der Inhaltsversion.'); return; }
  const answer = attempt.answers[q.id] || {};
  const marked = attempt.markedForReview.includes(q.id);

  main.innerHTML = `
    <div class="study-page">
      <div class="exam-topbar">
        <button class="button button-text" data-action="exit-exam">← Beenden</button>
        <span class="study-counter">${attempt.currentIndex + 1} / ${attempt.questions.length}</span>
        <button class="button button-text" data-action="toggle-exam-mark">${marked ? '★ Gemerkt' : '☆ Merken'}</button>
      </div>
      <div class="study-progress"><span style="width:${Math.round(attempt.currentIndex / Math.max(1, attempt.questions.length) * 100)}%"></span></div>
      <div class="question-shell">
        <div class="question-type">${questionTypeLabel(q.type)}</div>
        <div class="question-prompt">${formatText(q.prompt)}</div>
        ${examQuestionBody(q, item, answer)}
        <div class="exam-nav">
          <button class="button button-secondary" data-action="exam-prev" ${attempt.currentIndex === 0 ? 'disabled' : ''}>Zurück</button>
          ${attempt.currentIndex === attempt.questions.length - 1 ? '<button class="button" data-action="exam-submit">Prüfung abgeben</button>' : '<button class="button" data-action="exam-next">Weiter</button>'}
        </div>
      </div>
    </div>`;
}

function examQuestionBody(q, item, answer) {
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const order = item.variant?.optionOrder || q.options.map((x) => x.id);
    const selected = answer.selected || [];
    return `<div class="answer-options">${order.map((id) => {
      const opt = q.options.find((x) => x.id === id);
      return `<label class="answer-option"><input data-exam-option type="${q.type === 'single_choice' ? 'radio' : 'checkbox'}" name="exam-answer" value="${escapeHtml(id)}" ${selected.includes(id) ? 'checked' : ''}><span>${escapeHtml(opt?.text || '')}</span></label>`;
    }).join('')}</div>`;
  }
  if (q.type === 'ordering') {
    const order = answer.order || item.variant?.order || q.options.map((x) => x.id);
    return `<div class="ordering-list">${order.map((id, index) => {
      const option = q.options.find((x) => x.id === id);
      return `<div class="ordering-item"><span class="ordering-number">${index + 1}</span><span>${escapeHtml(option?.text || '')}</span><span class="order-buttons"><button data-action="move-exam-order" data-index="${index}" data-direction="-1" aria-label="Nach oben" ${index === 0 ? 'disabled' : ''}>↑</button><button data-action="move-exam-order" data-index="${index}" data-direction="1" aria-label="Nach unten" ${index === order.length - 1 ? 'disabled' : ''}>↓</button></span></div>`;
    }).join('')}</div>`;
  }
  if (q.type === 'matching') {
    const pairs = item.variant?.matchingPairs || q.options.map((x) => splitPair(x.text)).filter(Boolean);
    const rights = item.variant?.rightOrder || pairs.map((x) => x.right);
    return `<div class="matching-grid">${pairs.map((pair) => `<label class="matching-row"><span>${escapeHtml(pair.left)}</span><select data-exam-match data-left="${escapeHtml(pair.left)}"><option value="">Zuordnen …</option>${rights.map((right) => `<option value="${escapeHtml(right)}" ${answer.matches?.[pair.left] === right ? 'selected' : ''}>${escapeHtml(right)}</option>`).join('')}</select></label>`).join('')}</div>`;
  }
  return '';
}

async function renderExamResult(params) {
  let attempt = await engine.getExam(params.get('exam'));
  if (!attempt) { main.innerHTML = errorState('Ergebnis nicht gefunden.', 'Die Prüfung ist nicht mehr gespeichert.'); return; }
  if (!attempt.completed || !attempt.processed) attempt = await engine.finalizeExam(attempt);
  activeExam = attempt;
  const perf = engine.examTopicPerformance(attempt);
  const weak = perf.filter((x) => x.correct < x.total).sort((a,b) => a.ratio - b.ratio).slice(0, 3);
  const weakIds = new Set(weak.map((x) => x.chapter.id));
  const strong = perf.filter((x) => !weakIds.has(x.chapter.id) && x.ratio >= 0.75).sort((a,b)=>b.ratio-a.ratio).slice(0,3);
  const wrong = (attempt.results || []).filter((x) => !x.correct);

  main.innerHTML = `
    <div class="page">
      <div class="page-header"><p class="page-kicker">Prüfung beendet</p><h1>${attempt.score} von ${attempt.maxScore}</h1><div class="exam-score">${attempt.percentage}%</div></div>
      <div class="primary-action-wrap">${wrong.length ? `<button class="button button-block" data-action="practice-exam-errors" data-exam-id="${escapeHtml(attempt.id)}">Fehler gezielt üben</button>` : '<a class="button button-block" href="?view=exam" data-spa>Noch eine Prüfung</a>'}</div>
      <section class="section">
        <div class="section-header"><h2>Noch üben</h2></div>
        ${weak.length ? `<ul class="list">${weak.map((x) => `<li class="list-row"><span class="list-row-main"><span class="list-row-title">${escapeHtml(x.chapter.title)}</span></span><span class="list-row-meta">${Math.round(x.ratio*100)} %</span></li>`).join('')}</ul>` : '<p class="muted">Keine eindeutigen Schwachstellen in diesem Test.</p>'}
      </section>
      ${strong.length ? `<section class="section"><div class="section-header"><h2>Stark</h2></div><ul class="list">${strong.map((x) => `<li class="list-row"><span class="list-row-main"><span class="list-row-title">${escapeHtml(x.chapter.title)}</span></span><span class="list-row-meta">${Math.round(x.ratio*100)} %</span></li>`).join('')}</ul></section>` : ''}
      <section class="section" id="mistakes">
        <div class="section-header"><h2>Fehler ansehen</h2><span class="small subtle">${wrong.length}</span></div>
        ${wrong.length ? wrong.map((r) => examReviewHtml(attempt, r.id)).join('') : '<p class="muted">Keine Fehler in dieser Prüfung.</p>'}
      </section>
      <div style="margin-top:30px"><a class="secondary-link" href="?view=exam" data-spa>Zurück zu Prüfung</a></div>
    </div>`;
}


function examReviewHtml(attempt, questionId) {
  const q = content.questionById.get(questionId);
  const item = attempt.questions.find((x) => x.id === questionId);
  const answer = attempt.answers[questionId] || {};
  return `<div class="exam-review-item"><h3>${escapeHtml(q?.prompt || questionId)}</h3><p class="exam-answer-line"><strong>Deine Antwort:</strong> ${escapeHtml(formatAnswer(q, answer, item?.variant || {}))}</p><p class="exam-answer-line"><strong>Richtig:</strong> ${escapeHtml(formatCorrectAnswer(q, item?.variant || {}))}</p>${q?.explanation ? `<p class="small muted" style="margin-top:8px">${escapeHtml(q.explanation)}</p>` : ''}</div>`;
}

async function renderProgress() {
  const overall = engine.scopeStats();
  const chapters = engine.chapterProgress();
  const weak = engine.weakestChapters(5);
  const mistakes = engine.recentMistakes(5);
  const history = engine.historyLastDays(7);
  const weekCards = history.reduce((sum, x) => sum + (x.cardsReviewed || 0), 0);
  const weekQuestions = history.reduce((sum, x) => sum + (x.questionsAnswered || 0), 0);

  main.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Fortschritt</h1></div>
      <div class="metric-line"><span class="metric-big">${Math.round(overall.safeRatio * 100)}%</span><span class="metric-label">sicher gelernt</span></div>
      <div class="progress-track" style="margin-top:15px"><div class="progress-fill" style="width:${Math.round(overall.safeRatio*100)}%"></div></div>
      <p class="small muted" style="margin-top:12px"><span class="status-dot safe"></span>${overall.safe} sicher &nbsp; <span class="status-dot uncertain"></span>${overall.uncertain} unsicher &nbsp; <span class="status-dot new"></span>${overall.new} neu</p>
      ${weak.length ? `<section class="section"><div class="section-header"><h2>Meine Schwächen</h2><button class="button button-text" data-action="practice-weakness">Üben →</button></div><ul class="list">${weak.map((x) => `<li><a class="list-row" href="?view=topic&type=chapter&id=${encodeURIComponent(x.id)}" data-spa><span class="list-row-main"><span class="list-row-title">${escapeHtml(x.title)}</span></span><span class="list-row-meta">${Math.round(x.mastery*100)} %</span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></a></li>`).join('')}</ul></section>` : ''}
      <section class="section"><div class="section-header"><h2>Letzte 7 Tage</h2></div><p class="muted">${weekCards} Karten wiederholt · ${weekQuestions} Übungsfragen beantwortet</p></section>
      ${mistakes.length ? `<section class="section"><div class="section-header"><h2>Letzte Fehler</h2></div><ul class="list">${mistakes.map(mistakeRow).join('')}</ul></section>` : ''}
      <section class="section"><div class="section-header"><h2>Themen</h2></div><ul class="list">${chapters.map((x) => `<li><a class="list-row" href="?view=topic&type=chapter&id=${encodeURIComponent(x.id)}" data-spa><span class="list-row-main"><span class="list-row-title">${escapeHtml(x.number)}. ${escapeHtml(x.title)}</span></span><span class="list-row-meta">${Math.round(x.safeRatio*100)} %</span><svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></a></li>`).join('')}</ul></section>
    </div>`;
}

function mistakeRow(m) {
  if (m.contentType === 'card') {
    const card = content.cardById.get(m.contentId);
    if (!card) return '';
    return `<li><div class="list-row"><span class="list-row-main"><span class="list-row-title">${escapeHtml(card.front)}</span><span class="list-row-subtitle">${escapeHtml(content.topicLabelForCard(card))}</span></span><button class="button button-text" data-action="start-single-card" data-card-id="${escapeHtml(card.id)}">Üben</button></div></li>`;
  }
  const q = content.questionById.get(m.contentId);
  return q ? `<li class="list-row"><span class="list-row-main"><span class="list-row-title">${escapeHtml(q.prompt)}</span><span class="list-row-subtitle">${m.count || 1}× falsch</span></span></li>` : '';
}

async function renderSettings() {
  const theme = localStorage.getItem('pflege-theme') || 'system';
  main.innerHTML = `
    <div class="page">
      <div class="page-header"><h1>Einstellungen</h1></div>
      <section>
        <h2>Darstellung</h2>
        <div class="segmented" aria-label="Darstellung">
          ${['system','light','dark'].map((value) => `<button data-action="set-theme" data-theme="${value}" class="${theme === value ? 'active' : ''}">${({system:'System',light:'Hell',dark:'Dunkel'})[value]}</button>`).join('')}
        </div>
      </section>
      <section class="section">
        <h2>Daten</h2>
        <div class="data-actions">
          <button class="button button-secondary" data-action="backup">Fortschritt sichern</button>
          <button class="button button-secondary" data-action="restore">Fortschritt wiederherstellen</button>
        </div>
      </section>
      <section class="section">
        <h2>Über die App</h2>
        <div class="notice notice-warning" style="margin-bottom:20px"><strong>Wichtig:</strong> Der Lernstoff folgt der zertifizierten 2015-Ausgabe des verwendeten Lehrbuchs. Er ist keine Aktualisierung auf heutige klinische Leitlinien.</div>
        <table class="info-table"><tr><td>App</td><td>PflegeLern ${APP_VERSION}</td></tr><tr><td>Inhaltsbank</td><td>${escapeHtml(content.manifest.version || '0.8.0')}</td></tr><tr><td>Flashcards</td><td>${content.cards.length}</td></tr><tr><td>Prüfungsfragen</td><td>${content.questions.length}</td></tr><tr><td>Lernplanung</td><td>FSRS-6, Zielerinnerung 90 %</td></tr><tr><td>Speicherung</td><td>Lokal auf diesem Gerät</td></tr></table>
      </section>
      <section class="section"><button class="button button-text" style="color:var(--danger)" data-action="reset-progress">Fortschritt zurücksetzen</button></section>
    </div>`;
}

async function handleClick(event) {
  const link = event.target.closest('a[data-spa], a[data-route]');
  if (link && link.origin === location.origin) {
    event.preventDefault();
    const url = new URL(link.href);
    history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    await renderRoute();
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'finish-welcome') {
      localStorage.setItem('pflege-onboarded', '1');
      navigate({ view: 'today' });
    } else if (action === 'start-recommended') {
      const session = await engine.createRecommendedSession();
      if (session) navigate({ view: 'study', session: session.id }); else toast('Momentan ist keine Lernrunde verfügbar.');
    } else if (action === 'start-quick') {
      const session = await engine.createRecommendedSession({ quick: true });
      if (session) navigate({ view: 'study', session: session.id });
    } else if (action === 'continue-open') {
      navigate({ view: 'study', session: button.dataset.sessionId });
    } else if (action === 'start-scoped') {
      await startScoped(button.dataset);
    } else if (action === 'start-bookmarks') {
      const ids = [...engine.bookmarks.values()].filter((x) => x.contentType === 'card').map((x) => x.contentId).filter((id) => content.cardById.has(id));
      if (!ids.length) { toast('Noch keine Karten gespeichert.'); return; }
      const session = await engine.createSession({ type: 'bookmarks', source: 'topic', title: 'Gespeicherte Karten', items: ids.map((id) => ({ kind:'card', id })) });
      navigate({ view: 'study', session: session.id });
    } else if (action === 'start-single-card') {
      const session = await engine.createSingleCardSession(button.dataset.cardId);
      if (session) navigate({ view: 'study', session: session.id });
    } else if (action === 'reveal-card') {
      engine.touchSession(activeSession); const r = getStudyResponse(activeSession); r.revealed = true; await engine.saveSession(activeSession); await renderRoute();
    } else if (action === 'rate-card') {
      await rateActiveCard(Number(button.dataset.rating));
    } else if (action === 'exit-study') {
      if (activeSession) { engine.pauseSession(activeSession); await engine.saveSession(activeSession); }
      navigate(studyExitRoute(activeSession));
    } else if (action === 'toggle-bookmark') {
      const on = await engine.toggleBookmark(button.dataset.cardId); toast(on ? 'Karte gespeichert.' : 'Lesezeichen entfernt.'); await renderRoute();
    } else if (action === 'report-card') {
      showReportDialog(button.dataset.cardId);
    } else if (action === 'move-order') {
      await moveStudyOrder(Number(button.dataset.index), Number(button.dataset.direction));
    } else if (action === 'check-question') {
      await checkStudyQuestion();
    } else if (action === 'self-grade') {
      await selfGradeQuestion(button.dataset.correct === 'true');
    } else if (action === 'next-question') {
      await advanceStudy();
    } else if (action === 'continue-after-completion') {
      await continueAfterCompletion(button.dataset.sessionId);
    } else if (action === 'finish-session-home') {
      navigate({ view: 'today' });
    } else if (action === 'start-exam') {
      await startExamFromButton(button);
    } else if (action === 'continue-exam') {
      navigate({ view: 'exam-run', exam: button.dataset.examId });
    } else if (action === 'start-topic-exam') {
      const sectionId = button.dataset.sectionId || null;
      const chapterId = button.dataset.chapterId || document.getElementById('exam-topic-select')?.value || null;
      if (!sectionId && !chapterId) { toast('Bitte zuerst ein Kapitel auswählen.'); return; }
      const exam = await engine.createExam({ mode: 'topic', count: 10, chapterId, sectionId });
      if (!exam) { toast(`Für ${sectionId ? 'diesen Abschnitt' : 'dieses Kapitel'} sind noch keine automatisch bewertbaren Prüfungsfragen vorhanden.`); return; }
      navigate({ view: 'exam-run', exam: exam.id });
    } else if (action === 'exit-exam') {
      navigate({ view: 'exam' });
    } else if (action === 'exam-prev') {
      activeExam.currentIndex = Math.max(0, activeExam.currentIndex - 1); await engine.saveExam(activeExam); await renderRoute();
    } else if (action === 'exam-next') {
      activeExam.currentIndex = Math.min(activeExam.questions.length - 1, activeExam.currentIndex + 1); await engine.saveExam(activeExam); await renderRoute();
    } else if (action === 'move-exam-order') {
      await moveExamOrder(Number(button.dataset.index), Number(button.dataset.direction));
    } else if (action === 'toggle-exam-mark') {
      const qid = activeExam.questions[activeExam.currentIndex].id;
      const i = activeExam.markedForReview.indexOf(qid);
      if (i >= 0) activeExam.markedForReview.splice(i,1); else activeExam.markedForReview.push(qid);
      await engine.saveExam(activeExam); await renderRoute();
    } else if (action === 'exam-submit') {
      await submitExam();
    } else if (action === 'practice-exam-errors') {
      const attempt = await engine.getExam(button.dataset.examId);
      const session = attempt ? await engine.createExamReviewSession(attempt) : null;
      if (!session) { toast('Für diese Prüfung gibt es keine Fehlerkarten zu üben.'); return; }
      navigate({ view: 'study', session: session.id });
    } else if (action === 'practice-weakness') {
      const session = await engine.createScopedSession({ mode: 'weak', unlimited: true });
      if (!session) { toast('Aktuell sind keine deutlichen Schwächen gespeichert.'); return; }
      navigate({ view: 'study', session: session.id });
    } else if (action === 'set-theme') {
      const theme = button.dataset.theme; localStorage.setItem('pflege-theme', theme); applyTheme(theme); await renderSettings();
    } else if (action === 'backup') {
      await downloadBackup();
    } else if (action === 'restore') {
      restoreInput.value = ''; restoreInput.click();
    } else if (action === 'reset-progress') {
      const ok = await askConfirm('Fortschritt zurücksetzen?', 'Alle Lernstände, Prüfungen, Fehler und Lesezeichen auf diesem Gerät werden gelöscht.', 'Zurücksetzen');
      if (ok) { await storage.resetLearningData(); await engine.init(); toast('Fortschritt wurde zurückgesetzt.'); navigate({ view: 'today' }); }
    } else if (action === 'retry-render') {
      await renderRoute();
    }
  } catch (error) {
    console.error(error);
    toast(error.message || 'Etwas ist schiefgelaufen.');
  }
}

async function handleChange(event) {
  const target = event.target;
  if (target.matches('[data-study-option]') && activeSession) {
    engine.touchSession(activeSession);
    const q = currentStudyQuestion(); if (!q) return;
    const response = getStudyResponse(activeSession);
    if (q.type === 'single_choice') response.selected = [target.value];
    else {
      const checked = [...main.querySelectorAll('[data-study-option]:checked')].map((x) => x.value);
      response.selected = checked;
    }
    await engine.saveSession(activeSession);
  } else if (target.matches('[data-study-match]') && activeSession) {
    engine.touchSession(activeSession);
    const response = getStudyResponse(activeSession); response.matches ||= {}; response.matches[target.dataset.left] = target.value; await engine.saveSession(activeSession);
  } else if (target.matches('[data-exam-option]') && activeExam) {
    const q = currentExamQuestion(); if (!q) return;
    const answer = getExamAnswer(activeExam, q.id);
    if (q.type === 'single_choice') answer.selected = [target.value];
    else answer.selected = [...main.querySelectorAll('[data-exam-option]:checked')].map((x) => x.value);
    await engine.saveExam(activeExam);
  } else if (target.matches('[data-exam-match]') && activeExam) {
    const q = currentExamQuestion(); const answer = getExamAnswer(activeExam, q.id); answer.matches ||= {}; answer.matches[target.dataset.left] = target.value; await engine.saveExam(activeExam);
  }
}

const saveStudyText = debounce(async (target) => {
  if (!activeSession) return;
  engine.touchSession(activeSession); const response = getStudyResponse(activeSession); response.text = target.value; await engine.saveSession(activeSession);
}, 180);

function handleInput(event) {
  const target = event.target;
  if (target.matches('[data-search-input]')) {
    const box = document.getElementById('search-results');
    if (box) box.innerHTML = searchResultsHtml(target.value);
    const url = new URL(location.href); if (target.value) url.searchParams.set('q', target.value); else url.searchParams.delete('q'); history.replaceState({}, '', `${url.pathname}${url.search}`);
  } else if (target.matches('[data-study-text]')) saveStudyText(target);
}

async function handleKeyboard(event) {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if (route().view !== 'study' || !activeSession) return;
  const item = activeSession.items[activeSession.currentIndex];
  if (!item || item.kind !== 'card') return;
  const response = getStudyResponse(activeSession);
  if (!response.revealed && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault(); engine.touchSession(activeSession); response.revealed = true; await engine.saveSession(activeSession); await renderRoute();
  } else if (response.revealed && ['1','2','3'].includes(event.key)) {
    event.preventDefault(); await rateActiveCard(Number(event.key));
  }
}

async function startScoped(dataset) {
  const mode = dataset.mode || 'automatic';
  const session = await engine.createScopedSession({
    mode,
    chapterId: dataset.chapterId || null,
    sectionId: dataset.sectionId || null,
    unlimited: dataset.unlimited === 'true'
  });
  if (!session) {
    const msg = mode === 'new' ? 'In diesem Bereich gibt es keine neuen Karten mehr.' : mode === 'weak' ? 'Hier sind aktuell keine deutlichen Schwächen gespeichert.' : 'Für diese Auswahl sind keine Karten verfügbar.';
    toast(msg); return;
  }
  navigate({ view: 'study', session: session.id });
}

async function rateActiveCard(rating) {
  const session = activeSession;
  if (!session) return;
  const item = session.items[session.currentIndex];
  if (!item || item.kind !== 'card') return;
  engine.touchSession(session);
  const response = getStudyResponse(session);
  if (!response.revealed || response.rated) return;
  const result = await engine.recordCardReview(item.id, rating, { source: session.source });
  response.rated = rating;
  response.earlyPractice = result.earlyPractice;
  session.stats.cards = (session.stats.cards || 0) + 1;
  if (rating === Rating.AGAIN) session.stats.incorrect = (session.stats.incorrect || 0) + 1; else session.stats.correct = (session.stats.correct || 0) + 1;
  if (result.wasNew) session.stats.newCards = (session.stats.newCards || 0) + 1;
  if (rating === Rating.AGAIN) {
    const card = content.cardById.get(item.id);
    await engine.injectReinforcement(session, card ? [card.conceptId] : [], session.currentIndex);
  }
  session.currentIndex += 1;
  await engine.saveSession(session);
  await engine.ensureUnlimitedQueue(session);
  if (session.currentIndex >= session.items.length && !session.options?.unlimited) await finishSession(session);
  await renderRoute();
}

async function moveStudyOrder(index, direction) {
  engine.touchSession(activeSession);
  const item = activeSession.items[activeSession.currentIndex];
  const q = content.questionById.get(item.id);
  const response = getStudyResponse(activeSession);
  response.order ||= [...(item.variant?.order || q.options.map((x) => x.id))];
  const target = index + direction;
  if (target < 0 || target >= response.order.length) return;
  [response.order[index], response.order[target]] = [response.order[target], response.order[index]];
  await engine.saveSession(activeSession); await renderRoute();
}

async function checkStudyQuestion() {
  const session = activeSession; if (!session) return;
  engine.touchSession(session);
  const item = session.items[session.currentIndex];
  const q = content.questionById.get(item.id); if (!q) return;
  const response = getStudyResponse(session);
  if (response.checked) return;
  if ((q.type === 'single_choice' || q.type === 'multiple_choice') && !(response.selected || []).length) { toast('Bitte zuerst eine Antwort auswählen.'); return; }
  if (q.type === 'matching') {
    const pairs = item.variant?.matchingPairs || [];
    if (pairs.some((p) => !response.matches?.[p.left])) { toast('Bitte alle Begriffe zuordnen.'); return; }
  }
  response.checked = true;
  if (!['short_answer','clinical_case'].includes(q.type)) {
    const correct = engine.gradeQuestion(q, response, item.variant || {});
    response.correct = correct;
    await recordStudyQuestionOnce(session, q, response, correct);
    if (!correct) await engine.injectReinforcement(session, q.conceptIds || [], session.currentIndex);
  }
  await engine.saveSession(session); await renderRoute();
}

async function selfGradeQuestion(correct) {
  const session = activeSession; if (session) engine.touchSession(session); const q = currentStudyQuestion(); if (!session || !q) return;
  const response = getStudyResponse(session); response.selfCorrect = correct; response.correct = correct;
  await recordStudyQuestionOnce(session, q, response, correct);
  if (!correct) await engine.injectReinforcement(session, q.conceptIds || [], session.currentIndex);
  await engine.saveSession(session); await renderRoute();
}

async function recordStudyQuestionOnce(session, q, response, correct) {
  if (response.recorded) return;
  response.recorded = true;
  session.stats.questions = (session.stats.questions || 0) + 1;
  if (correct) session.stats.correct = (session.stats.correct || 0) + 1; else session.stats.incorrect = (session.stats.incorrect || 0) + 1;
  await engine.recordQuestionResult(q.id, correct, { source: 'practice' });
}

async function advanceStudy() {
  if (!activeSession) return;
  engine.touchSession(activeSession);
  activeSession.currentIndex += 1;
  await engine.saveSession(activeSession);
  await engine.ensureUnlimitedQueue(activeSession);
  if (activeSession.currentIndex >= activeSession.items.length && !activeSession.options?.unlimited) await finishSession(activeSession);
  await renderRoute();
}

async function finishSession(session) {
  if (!session.completed) { engine.touchSession(session); session.lastActiveAt = null; await engine.completeSession(session); }
  if (!session.minutesRecorded) {
    const minutes = Math.max(1, Math.round((session.activeMs || 0) / 60_000));
    await engine.bumpHistory({ minutes: Math.min(minutes, 360) });
    session.minutesRecorded = true;
    await engine.saveSession(session);
  }
}

function studyExitRoute(session) {
  if (!session) return { view: 'learn' };
  if (session.source === 'recommended') return { view: 'today' };
  if (session.options?.sectionId) return { view: 'topic', type: 'section', id: session.options.sectionId };
  if (session.options?.chapterId) return { view: 'topic', type: 'chapter', id: session.options.chapterId };
  return { view: 'learn' };
}

async function continueAfterCompletion(sessionId) {
  const old = await engine.getSession(sessionId);
  let session;
  if (old?.source === 'recommended') session = await engine.createRecommendedSession({ continuation: true });
  else if (old?.options) session = await engine.createScopedSession({ mode: old.options.mode || 'automatic', chapterId: old.options.chapterId || null, sectionId: old.options.sectionId || null, unlimited: false });
  else session = await engine.createRecommendedSession({ continuation: true });
  if (session) navigate({ view: 'study', session: session.id }); else toast('Keine weiteren Karten in dieser Auswahl.');
}

async function advanceBrokenItem(session) {
  session.currentIndex += 1; await engine.saveSession(session); await renderRoute();
}

async function startExamFromButton(button) {
  const exam = await engine.createExam({ mode: button.dataset.mode, count: Number(button.dataset.count || 10), weakness: button.dataset.weakness === 'true' });
  if (!exam) { toast('Noch keine passenden Prüfungsfragen verfügbar.'); return; }
  navigate({ view: 'exam-run', exam: exam.id });
}

async function moveExamOrder(index, direction) {
  if (!activeExam) return;
  const item = activeExam.questions[activeExam.currentIndex];
  const q = content.questionById.get(item.id);
  const answer = getExamAnswer(activeExam, q.id);
  answer.order ||= [...(item.variant?.order || q.options.map((x) => x.id))];
  const target = index + direction;
  if (target < 0 || target >= answer.order.length) return;
  [answer.order[index], answer.order[target]] = [answer.order[target], answer.order[index]];
  await engine.saveExam(activeExam); await renderRoute();
}

async function submitExam() {
  if (!activeExam) return;
  const unanswered = activeExam.questions.filter((item) => !isExamAnswered(content.questionById.get(item.id), activeExam.answers[item.id], item.variant || {})).length;
  if (unanswered) {
    const ok = await askConfirm('Prüfung trotzdem abgeben?', `Noch ${unanswered} ${unanswered === 1 ? 'Frage ist' : 'Fragen sind'} unbeantwortet.`, 'Abgeben');
    if (!ok) return;
  }
  activeExam.completedAt = new Date().toISOString();
  activeExam = await engine.finalizeExam(activeExam);
  navigate({ view: 'exam-result', exam: activeExam.id });
}

function isExamAnswered(q, answer, variant) {
  if (!q || !answer) return false;
  if (q.type === 'single_choice' || q.type === 'multiple_choice') return Boolean(answer.selected?.length);
  if (q.type === 'ordering') return Boolean(answer.order?.length || variant.order?.length);
  if (q.type === 'matching') {
    const pairs = variant.matchingPairs || [];
    return pairs.length > 0 && pairs.every((p) => answer.matches?.[p.left]);
  }
  return false;
}

function currentStudyQuestion() {
  if (!activeSession) return null;
  const item = activeSession.items[activeSession.currentIndex];
  return item?.kind === 'question' ? content.questionById.get(item.id) : null;
}

function currentExamQuestion() {
  if (!activeExam) return null;
  return content.questionById.get(activeExam.questions[activeExam.currentIndex]?.id);
}

function getStudyResponse(session) {
  const key = String(session.currentIndex);
  session.responses[key] ||= {};
  return session.responses[key];
}

function getExamAnswer(attempt, qid) {
  attempt.answers[qid] ||= {};
  return attempt.answers[qid];
}

function formatAnswer(q, answer, variant) {
  if (!q) return '–';
  if (q.type === 'single_choice' || q.type === 'multiple_choice') return (answer.selected || []).map((id) => q.options.find((x) => x.id === id)?.text || id).join(', ') || 'Keine Antwort';
  if (q.type === 'ordering') return (answer.order || []).map((id) => q.options.find((x) => x.id === id)?.text || id).join(' → ') || 'Keine Antwort';
  if (q.type === 'matching') return Object.entries(answer.matches || {}).map(([l,r]) => `${l} ↔ ${r}`).join('; ') || 'Keine Antwort';
  return answer.text || 'Keine Antwort';
}

function formatCorrectAnswer(q, variant) {
  if (!q) return '–';
  if (q.type === 'single_choice' || q.type === 'multiple_choice') return (q.correct || []).map((id) => q.options.find((x) => x.id === id)?.text || id).join(', ');
  if (q.type === 'ordering') return (q.correct || []).map((id) => q.options.find((x) => x.id === id)?.text || id).join(' → ');
  if (q.type === 'matching') return (variant.matchingPairs || q.options.map((x) => splitPair(x.text)).filter(Boolean)).map((x) => `${x.left} ↔ ${x.right}`).join('; ');
  return q.correctText || q.explanation || '–';
}

function questionTypeLabel(type) {
  return ({ single_choice:'Eine Antwort', multiple_choice:'Mehrere Antworten möglich', ordering:'Reihenfolge', matching:'Zuordnung', short_answer:'Freie Antwort', clinical_case:'Anwendung' })[type] || 'Übungsfrage';
}

function formatText(value) {
  return escapeHtml(value ?? '').replace(/\n/g, '<br>');
}

function updateActiveNavigation(view) {
  const root = view === 'topic' || view === 'search' || view === 'study' ? 'learn' : view === 'exam-run' || view === 'exam-result' ? 'exam' : view;
  document.querySelectorAll('[data-route], .bottom-nav-link').forEach((node) => {
    const target = node.dataset.route || new URL(node.href).searchParams.get('view');
    node.classList.toggle('active', target === root);
    if (target === root) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function updateOnlineState() {
  if (!offlineIndicator) return;
  offlineIndicator.hidden = navigator.onLine;
}

function toast(message, duration = 2600) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; toastRegion.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function askConfirm(title, message, actionLabel = 'Bestätigen') {
  return new Promise((resolve) => {
    confirmTitle.textContent = title; confirmMessage.textContent = message; confirmActionButton.textContent = actionLabel;
    const onClose = () => { confirmDialog.removeEventListener('close', onClose); resolve(confirmDialog.returnValue === 'confirm'); };
    confirmDialog.addEventListener('close', onClose); confirmDialog.showModal();
  });
}

function showReportDialog(cardId) {
  let dialog = document.getElementById('report-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'report-dialog'; dialog.className = 'dialog';
    dialog.innerHTML = `<form method="dialog"><h2>Problem melden</h2><div class="field"><label><input type="radio" name="reason" value="unklar" checked> Frage unklar</label><label><input type="radio" name="reason" value="falsch"> Antwort möglicherweise falsch</label><label><input type="radio" name="reason" value="doppelt"> Doppelte Karte</label><label><input type="radio" name="reason" value="sonstiges"> Sonstiges</label></div><div class="dialog-actions"><button value="cancel" class="button button-secondary">Abbrechen</button><button value="send" class="button">Speichern</button></div></form>`;
    document.body.appendChild(dialog);
  }
  dialog.dataset.cardId = cardId;
  const onClose = async () => {
    dialog.removeEventListener('close', onClose);
    if (dialog.returnValue === 'send') {
      const reason = dialog.querySelector('input[name="reason"]:checked')?.value || 'sonstiges';
      await engine.reportCard(dialog.dataset.cardId, reason); toast('Hinweis wurde lokal gespeichert.');
    }
  };
  dialog.addEventListener('close', onClose); dialog.showModal();
}

async function downloadBackup() {
  const backup = await storage.exportBackup(content.manifest.version || '0.8.0');
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `pflegelern-sicherung-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('Sicherung erstellt.');
}

async function restoreBackupFile() {
  const file = restoreInput.files?.[0]; if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const ok = await askConfirm('Sicherung wiederherstellen?', 'Der aktuelle lokale Lernstand wird durch die Sicherung ersetzt.', 'Wiederherstellen');
    if (!ok) return;
    await storage.importBackup(backup); await engine.init(); toast('Sicherung wurde wiederhergestellt.'); navigate({ view: 'today' });
  } catch (error) { console.error(error); toast(error.message || 'Sicherung konnte nicht gelesen werden.'); }
}

function errorState(title, message, button = null) {
  return `<div class="page"><div class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message || '')}</p>${button ? `<button class="button button-secondary" data-action="retry-render">${escapeHtml(button)}</button>` : '<a class="secondary-link" href="?view=today" data-spa>Zurück zu Heute</a>'}</div></div>`;
}

function showFatalError(error) {
  console.error(error);
  main.innerHTML = `<div class="page"><div class="empty-state"><h2>Die App konnte nicht gestartet werden.</h2><p>Dein bisheriger lokaler Fortschritt wurde nicht verändert.</p><pre style="white-space:pre-wrap;text-align:left;color:var(--text-secondary);font-size:.8rem">${escapeHtml(error?.message || String(error))}</pre><button class="button button-secondary" onclick="location.reload()">Erneut versuchen</button></div></div>`;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try { await navigator.serviceWorker.register('./service-worker.js'); } catch (error) { console.warn('Service Worker konnte nicht registriert werden:', error); }
}
