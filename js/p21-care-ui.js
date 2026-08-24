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
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  for (const meta of metas) {
    const media = meta.getAttribute('media') || '';
    meta.content = media.includes('dark') ? '#073f45' : '#0a5f65';
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
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18H6a4 4 0 0 1-.7-7.94A6 6 0 0 1 16.7 8.2 4.5 4.5 0 0 1 18 17h-1"/><path d="M12 18V9"/><path d="m8.5 12.5 3.5-3.5 3.5 3.5"/></svg>`;
}

function restoreIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18H6a4 4 0 0 1-.7-7.94A6 6 0 0 1 16.7 8.2 4.5 4.5 0 0 1 18 17h-1"/><path d="M12 9v9"/><path d="m8.5 14.5 3.5 3.5 3.5-3.5"/></svg>`;
}

function dataCard(button, kind) {
  const card = document.createElement('div');
  const backup = kind === 'backup';
  card.className = `care-data-card care-data-card--${kind}`;
  card.innerHTML = `
    <div class="care-data-card-icon">${backup ? backupIcon() : restoreIcon()}</div>
    <div class="care-data-card-copy">
      <strong>${backup ? 'Fortschritt sichern' : 'Fortschritt wiederherstellen'}</strong>
      <span>${backup
        ? 'Erstellt eine Sicherungsdatei mit deinem aktuellen Lernstand.'
        : 'Lädt einen zuvor gesicherten Lernstand aus einer Sicherungsdatei zurück.'}</span>
      <small>Lokal · nur auf deinem Gerät</small>
    </div>`;
  card.append(button);
  return card;
}

function decorateDataActions(main) {
  const actions = main.querySelector('.data-actions');
  if (!actions || actions.dataset.p21Decorated === 'true') return;
  const backup = actions.querySelector('[data-action="backup"]');
  const restore = actions.querySelector('[data-action="restore"]');
  if (!backup || !restore) return;
  actions.dataset.p21Decorated = 'true';
  const backupCard = dataCard(backup, 'backup');
  const restoreCard = dataCard(restore, 'restore');
  actions.replaceChildren(backupCard, restoreCard);
}

function decorateThemeControls(main) {
  for (const button of main.querySelectorAll('[data-action="set-theme"]')) {
    button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
  }
}

function decorateContent() {
  queued = false;
  const main = document.getElementById('main');
  if (!main) return;
  document.body.classList.add('p21-care-ui');
  document.body.dataset.p21View = currentView();
  decorateNavigation();
  decorateDataActions(main);
  decorateThemeControls(main);
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
  updateThemeColors();
  decorateNavigation();
  const main = document.getElementById('main');
  if (main) new MutationObserver(queueDecorate).observe(main, { childList: true, subtree: true });
  window.addEventListener('popstate', queueDecorate);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action="set-theme"]')) setTimeout(queueDecorate, 0);
  });
  queueDecorate();
}
