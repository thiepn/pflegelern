const APP_VERSION = '1.1.0-dev.24';
let started = false;
let queued = false;

function currentView() {
  return new URLSearchParams(location.search).get('view') || 'today';
}

function ensureStylesheet() {
  if (document.querySelector('link[data-p24-regression]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/p24-regression.css';
  link.dataset.p24Regression = 'true';
  document.head.append(link);
}

function decorateVersion(main) {
  if (currentView() !== 'settings') return;
  const rows = [...main.querySelectorAll('.info-table tr')];
  const appRow = rows.find((row) => row.cells?.[0]?.textContent?.trim() === 'App');
  if (appRow?.cells?.[1]) appRow.cells[1].textContent = `PflegeLern ${APP_VERSION}`;
}

function decorate() {
  queued = false;
  const main = document.getElementById('main');
  if (!main) return;
  decorateVersion(main);
  document.body.dataset.p24BrowserReady = 'true';
}

function queueDecorate() {
  if (queued) return;
  queued = true;
  queueMicrotask(decorate);
}

export function initP24RegressionUi() {
  if (started || typeof document === 'undefined') return;
  started = true;
  ensureStylesheet();
  const main = document.getElementById('main');
  if (main) new MutationObserver(queueDecorate).observe(main, { childList: true, subtree: true });
  window.addEventListener('popstate', queueDecorate);
  queueDecorate();
}

export { APP_VERSION };
