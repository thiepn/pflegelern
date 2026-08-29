import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';

async function onboard(page) {
  await page.addInitScript(() => {
    localStorage.setItem('pflege-onboarded', '1');
    localStorage.setItem('pflege-theme', 'light');
  });
}

async function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}

const ROUTES = [
  ['today', 'Heute'],
  ['learn', 'Lernen'],
  ['exam', 'Prüfung'],
  ['progress', 'Fortschritt'],
  ['settings', 'Einstellungen'],
];

for (const [view, heading] of ROUTES) {
  test(`core route ${view} renders without runtime errors`, async ({ page }) => {
    await onboard(page);
    const errors = await collectErrors(page);
    await page.goto(`${BASE}?view=${view}`, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toContainText(heading);
    await expect(page.locator('#main')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('frozen P26G bank and P27B release-candidate metadata are present in the published runtime', async ({ page, request }) => {
  await onboard(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const runtime = await page.evaluate(() => ({
    count: globalThis.__PFLEGE_P20_ENGINE__?.content?.questions?.length,
    types: [...new Set(globalThis.__PFLEGE_P20_ENGINE__?.content?.questions?.map((q) => q.type) || [])].sort(),
  }));
  expect(runtime.count).toBe(1299);
  expect(runtime.types).toEqual(['clinical_case', 'matching', 'multiple_choice', 'ordering', 'short_answer', 'single_choice']);

  const manifest = await (await request.get(`${BASE}data/manifest.json`)).json();
  const report = await (await request.get(`${BASE}reports/P27B_RELEASE_TRUTH_VALIDATION.json`)).json();
  const sw = await (await request.get(`${BASE}service-worker.js`)).text();
  expect(manifest.phase).toBe('P27B');
  expect(manifest.version).toBe('1.1.0-rc.1');
  expect(manifest.status).toBe('release-candidate');
  expect(report.certifiedQuestionBank.intact).toBe(true);
  expect(report.summary.actionableFindings).toBe(0);
  expect(report.summary.releaseTruthReady).toBe(true);
  expect(sw).toContain('pflegelern-p27b-v1.1.0-rc1');
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`no horizontal page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await onboard(page);
    const errors = await collectErrors(page);
    for (const [view] of ROUTES) {
      await page.goto(`${BASE}?view=${view}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth - document.body.clientWidth,
        html: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.body, `${view} body overflow at ${width}`).toBeLessThanOrEqual(1);
      expect(overflow.html, `${view} html overflow at ${width}`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}

test('PWA survives an offline navigation reload after cache installation', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await onboard(page);
  const errors = await collectErrors(page);
  await page.goto(`${BASE}?view=today`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker unsupported');
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await expect(page.locator('h1').first()).toContainText('Heute');
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(page.locator('#offline-indicator')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  expect(errors).toEqual([]);
});
