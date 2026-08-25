import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';

async function openApp(page, { view = 'today', theme = 'light' } = {}) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem('pflege-onboarded', '1');
    localStorage.setItem('pflege-theme', selectedTheme);
  }, { selectedTheme: theme });
  await page.goto(`${BASE}?view=${view}`, { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.body.dataset.p24BrowserReady === 'true');
  return errors;
}

for (const width of [320, 375, 768, 912, 959, 1024, 1440]) {
  test(`responsive shell is stable at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = await openApp(page);

    const state = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar');
      const bottom = document.querySelector('.bottom-nav');
      const header = document.querySelector('.mobile-header');
      const main = document.querySelector('.main-content');
      const active = document.querySelector('.bottom-nav-link.active');
      const h1 = document.querySelector('h1');
      const links = [...document.querySelectorAll('.bottom-nav-link')];
      const linkBoxes = links.map((x) => x.getBoundingClientRect());
      const headerBox = header?.getBoundingClientRect();
      const h1Box = h1?.getBoundingClientRect();
      return {
        sidebarDisplay: getComputedStyle(sidebar).display,
        bottomDisplay: getComputedStyle(bottom).display,
        bottomColumns: getComputedStyle(bottom).gridTemplateColumns,
        mainMarginLeft: getComputedStyle(main).marginLeft,
        backdrop: getComputedStyle(header).backdropFilter || getComputedStyle(header).webkitBackdropFilter || 'none',
        activePosition: active ? getComputedStyle(active).position : null,
        linkCount: links.length,
        linkY: linkBoxes.map((b) => Math.round(b.y)),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        headerGap: headerBox && h1Box ? Math.round(h1Box.top - headerBox.bottom) : null
      };
    });

    expect(errors).toEqual([]);
    expect(state.pageOverflow).toBeLessThanOrEqual(1);

    if (width <= 959) {
      expect(state.sidebarDisplay).toBe('none');
      expect(state.bottomDisplay).toBe('grid');
      expect(state.linkCount).toBe(5);
      expect(state.bottomColumns.trim().split(/\s+/)).toHaveLength(5);
      expect(new Set(state.linkY).size).toBe(1);
      expect(state.mainMarginLeft).toBe('0px');
      expect(state.backdrop).toBe('none');
      expect(state.activePosition).toBe('relative');
      expect(state.headerGap).toBeGreaterThanOrEqual(12);
      expect(state.headerGap).toBeLessThan(60);
    } else {
      expect(state.sidebarDisplay).not.toBe('none');
      expect(state.bottomDisplay).toBe('none');
      expect(Number.parseFloat(state.mainMarginLeft)).toBeGreaterThanOrEqual(200);
    }
    await context.close();
  });
}

test('theme switching and settings metadata stay synchronized', async ({ page }) => {
  const errors = await openApp(page, { view: 'settings', theme: 'light' });
  await expect(page.locator('.info-table tr', { hasText: 'App' })).toContainText('PflegeLern 1.1.0-dev.24');
  await page.locator('[data-action="set-theme"][data-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pflege-theme'))).toBe('dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(21, 25, 28)');
  await expect(page.locator('.info-table tr', { hasText: 'App' })).toContainText('PflegeLern 1.1.0-dev.24');

  await page.locator('[data-action="set-theme"][data-theme="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pflege-theme'))).toBe('light');
  expect(errors).toEqual([]);
});

test('older backups replace newer learning stores instead of leaving hybrid data', async ({ page }) => {
  const errors = await openApp(page);
  const remaining = await page.evaluate(async () => {
    const storage = await import(new URL('./js/storage.js', location.href).href);
    await storage.put('questionHistory', { questionId: 'stale-question', correct: 1, incorrect: 0 });
    await storage.put('examAttempts', { id: 'stale-exam', questions: [], completed: true });
    await storage.importBackup({
      app: 'pflegelern',
      backupVersion: 1,
      contentVersion: 'legacy',
      stores: { cardState: [] }
    });
    return {
      questionHistory: (await storage.getAll('questionHistory')).length,
      examAttempts: (await storage.getAll('examAttempts')).length
    };
  });
  expect(remaining).toEqual({ questionHistory: 0, examAttempts: 0 });
  expect(errors).toEqual([]);
});

test('PWA manifest matches the P23/P24 blue-gray identity', async ({ request }) => {
  const response = await request.get(`${BASE}manifest.webmanifest`);
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.background_color).toBe('#e9edef');
  expect(manifest.theme_color).toBe('#28658f');
});

test('service-worker activation preserves unrelated origin caches', async ({ page }) => {
  const errors = await openApp(page);
  const keys = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    for (const key of await caches.keys()) if (key.startsWith('pflegelern-')) await caches.delete(key);
    await (await caches.open('unrelated-app-cache')).put('/unrelated-sentinel', new Response('keep'));

    const registration = await navigator.serviceWorker.register(`./service-worker.js?qa=${Date.now()}`);
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker && worker.state !== 'activated') {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('service worker activation timeout')), 10000);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await caches.keys();
    await caches.delete('unrelated-app-cache');
    return result;
  });
  expect(keys).toContain('unrelated-app-cache');
  expect(errors).toEqual([]);
});
