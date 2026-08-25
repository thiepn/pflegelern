let started = false;
let queued = false;

function currentView() {
  return new URLSearchParams(location.search).get('view') || 'today';
}

function ensureStylesheet() {
  if (document.querySelector('link[data-p21-care-theme]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/p21-care-theme.css';
  link.dataset.p21CareTheme = 'true';
  document.head.append(link);
}

function updateThemeColors() {
  const dark = document.documentElement.dataset.theme === 'dark';
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.content = dark ? '#15191c' : '#e9edef';
  }
}

function settingsIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.08-1l2-1.5-2-3.5-2.4 1A7 7 0 0 0 15 6l-.3-2.5h-4L10.4 6A7 7 0 0 0 8.9 7L6.5 6l-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.5 1l.3 2.5h4L15 18a7 7 0 0 0 1.5-1l2.4 1 2-3.5-2-1.5c.05-.33.08-.66.08-1Z"/></svg>`;
}

function decorateNavigation() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  let settings = nav.querySelector('[data-p21-settings-tab]');
  if (!settings) {
    settings = document.createElement('a');
    settings.href = '?view=settings';
    settings.dataset.route = 'settings';
    settings.dataset.p21SettingsTab = 'true';
    settings.className = 'bottom-nav-link';
    settings.setAttribute('aria-label', 'Einstellungen');
    settings.innerHTML = `${settingsIcon()}<span>Einstellungen</span>`;
    nav.append(settings);
  }
  settings.classList.toggle('active', currentView() === 'settings');
}

function backupIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14V8l-3-3H5z"/><path d="M8 5v5h8V5M8 19v-5h8v5"/></svg>`;
}

function restoreIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/><path d="M12 8v4l3 2"/></svg>`;
}

function dataRow(button, kind) {
  const row = document.createElement('div');
  const backup = kind === 'backup';
  row.className = `care-data-card care-data-card--${kind}`;
  row.innerHTML = `
    <div class="care-data-card-icon">${backup ? backupIcon() : restoreIcon()}</div>
    <div class="care-data-card-copy">
      <strong>${backup ? 'Fortschritt sichern' : 'Fortschritt wiederherstellen'}</strong>
      <span>${backup
        ? 'Lernstand als JSON-Datei auf diesem Gerät speichern.'
        : 'Eine zuvor gespeicherte JSON-Sicherung einlesen.'}</span>
      <small>Lokale Datei · keine Cloud-Synchronisierung</small>
    </div>`;
  button.classList.remove('button-secondary');
  if (!backup) button.classList.add('button-secondary');
  button.textContent = backup ? 'Sicherung erstellen' : 'Datei auswählen';
  row.append(button);
  return row;
}

function decorateDataActions(main) {
  const actions = main.querySelector('.data-actions');
  if (!actions || actions.dataset.p23Decorated === 'true') return;
  const backup = actions.querySelector('[data-action="backup"]');
  const restore = actions.querySelector('[data-action="restore"]');
  if (!backup || !restore) return;
  actions.dataset.p23Decorated = 'true';
  actions.replaceChildren(dataRow(backup, 'backup'), dataRow(restore, 'restore'));
}

function decorateThemeControls(main) {
  main.querySelector('[data-action="set-theme"][data-theme="system"]')?.remove();
  for (const button of main.querySelectorAll('[data-action="set-theme"]')) {
    button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
  }
}

function appendSubtitle(header, text) {
  if (!header || header.querySelector('.care-page-subtitle')) return;
  const subtitle = document.createElement('p');
  subtitle.className = 'care-page-subtitle';
  subtitle.textContent = text;
  header.append(subtitle);
}

function decorateToday(main) {
  if (currentView() !== 'today') return;
  const page = main.querySelector('.page');
  if (!page || page.dataset.p23Dashboard === 'true') return;
  page.dataset.p23Dashboard = 'true';
  page.classList.add('care-dashboard');
  appendSubtitle(page.querySelector('.page-header'), 'Lernstand, Wiederholungen und nächste Aufgaben.');

  const sections = [...page.querySelectorAll(':scope > .section')];
  if (sections.length >= 2) {
    sections[0].classList.add('dashboard-progress');
    sections[1].classList.add('dashboard-weakness');
    const grid = document.createElement('div');
    grid.className = 'care-dashboard-grid';
    page.insertBefore(grid, sections[0]);
    grid.append(sections[0], sections[1]);
  }
}

function decorateLearn(main) {
  if (currentView() !== 'learn') return;
  appendSubtitle(main.querySelector('.page-header'), 'Kapitel, Wiederholungen und gezieltes Training.');
}

function decorateExam(main) {
  if (currentView() !== 'exam') return;
  appendSubtitle(main.querySelector('.page-header'), 'Prüfungen konfigurieren, durchführen und auswerten.');
}

function decorateProgress(main) {
  if (currentView() !== 'progress') return;
  appendSubtitle(main.querySelector('.page-header'), 'Was sicher sitzt, was fällig ist und wo noch Lücken bestehen.');
}

function decorateSettings(main) {
  if (currentView() !== 'settings') return;
  const page = main.querySelector('.page');
  if (!page) return;
  page.classList.add('care-settings');
  appendSubtitle(page.querySelector('.page-header'), 'Darstellung, Sicherungen und technische Informationen.');
}

function decorateContent() {
  queued = false;
  const main = document.getElementById('main');
  if (!main) return;
  document.body.classList.add('p23-editorial-ui');
  document.body.dataset.p21View = currentView();
  decorateNavigation();
  decorateDataActions(main);
  decorateThemeControls(main);
  decorateToday(main);
  decorateLearn(main);
  decorateExam(main);
  decorateProgress(main);
  decorateSettings(main);
  updateThemeColors();
}

function queueDecorate() {
  if (queued) return;
  queued = true;
  queueMicrotask(decorateContent);
}

export function initCareThemeUi() {
  if (started || typeof document === 'undefined') return;
  started = true;
  ensureStylesheet();
  decorateNavigation();
  const main = document.getElementById('main');
  if (main) new MutationObserver(queueDecorate).observe(main, { childList: true, subtree: true });
  window.addEventListener('popstate', queueDecorate);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action="set-theme"]')) setTimeout(queueDecorate, 0);
  });
  queueDecorate();
}
