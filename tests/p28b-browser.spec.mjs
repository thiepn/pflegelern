import { test, expect } from '@playwright/test';

const BASE = `${(process.env.PFLEGELERN_BASE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '')}/`;

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
  test(`P28B route ${view} renders without runtime errors`, async ({ page }) => {
    await onboard(page);
    const errors = await collectErrors(page);
    await page.goto(`${BASE}?view=${view}`, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toContainText(heading);
    await expect(page.locator('#main')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('P28B identity, repaired bank and adjudication report are live', async ({ page, request }) => {
  await onboard(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const runtime = await page.evaluate(() => ({
    count: globalThis.__PFLEGE_P20_ENGINE__?.content?.questions?.length,
    types: [...new Set(globalThis.__PFLEGE_P20_ENGINE__?.content?.questions?.map((q) => q.type) || [])].sort(),
    pulseCase: globalThis.__PFLEGE_P20_ENGINE__?.content?.questions?.find((q) => q.id === 'q-case-pulse-01'),
    freshAir: globalThis.__PFLEGE_P20_ENGINE__?.content?.questions?.find((q) => q.id === 'q-p12-0138'),
    retina: globalThis.__PFLEGE_P20_ENGINE__?.content?.questions?.find((q) => q.id === 'q-p12-0525'),
  }));
  expect(runtime.count).toBe(1299);
  expect(runtime.types).toEqual(['clinical_case', 'matching', 'multiple_choice', 'ordering', 'short_answer', 'single_choice']);
  expect(runtime.pulseCase.options.find((o) => o.id === 'a').text).toBe('Arzt informieren');
  expect(runtime.freshAir.options.find((o) => o.id === 'b').text).toBe('Fenster geschlossen halten, damit kein Wirkstoff nach außen gelangt.');
  expect(runtime.retina.prompt).toContain('Symptomkombination');
  const manifest = await (await request.get(`${BASE}data/manifest.json`)).json();
  const report = await (await request.get(`${BASE}reports/P28B_ADJUDICATION.json`)).json();
  const sw = await (await request.get(`${BASE}service-worker.js`)).text();
  expect(manifest.phase).toBe('P28B');
  expect(manifest.version).toBe('1.1.1-dev.28b');
  expect(manifest.status).toBe('development');
  expect(report.status).toBe('PASS');
  expect(report.scope.questionsAdjudicated).toBe(44);
  expect(report.scope.questionsRepaired).toBe(12);
  expect(report.scope.questionsRetained).toBe(32);
  expect(report.scope.unresolved).toBe(0);
  expect(report.questionBank.p28bSha256).toBe('97d27b764223443ac72708524774d3003ff07a44394bdea175ebbd37fb11f708');
  expect(sw).toContain("const CACHE = 'pflegelern-p28b-v1.1.1-dev28b';");
});
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`P28B no horizontal page overflow at ${width}px`, async ({ page }) => {
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
test('P28B PWA survives offline navigation reload after cache installation', async ({ page, context }) => {
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
