import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';
const FROZEN_SHA = '40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  await page.addInitScript(() => {
    localStorage.setItem('pflege-onboarded', '1');
    localStorage.setItem('pflege-theme', 'light');
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor({ state: 'visible' });
  return errors;
}

test('P26G published certification, bank and offline cache agree', async ({ request }) => {
  const [manifestRes, certRes, questionsRes, swRes] = await Promise.all([
    request.get(`${BASE}data/manifest.json`),
    request.get(`${BASE}reports/P26G_FINAL_QUESTION_CERTIFICATION.json`),
    request.get(`${BASE}data/questions.json`),
    request.get(`${BASE}service-worker.js`),
  ]);
  for (const response of [manifestRes, certRes, questionsRes, swRes]) expect(response.ok()).toBeTruthy();

  const manifest = await manifestRes.json();
  const cert = await certRes.json();
  const questions = await questionsRes.json();
  const sw = await swRes.text();

  expect(manifest.phase).toBe('P26G');
  expect(manifest.version).toBe('1.1.0-dev.26g');
  expect(manifest.status).toBe('p26g-final-1299-question-certification');
  expect(cert.status).toBe('PASS');
  expect(cert.freeze.state).toBe('CERTIFIED_FROZEN');
  expect(cert.freeze.questionBankSha256).toBe(FROZEN_SHA);
  expect(cert.bank.questions).toBe(1299);
  expect(questions).toHaveLength(1299);
  expect(sw).toContain('pflegelern-p26g-v1.1.0-dev26g');
  expect(sw).toContain("'./data/questions.json'");
  expect(sw).toContain("'./js/p25b-repetition.js'");
  expect(sw).toContain("'./js/p25c-input-reliability.js'");
  expect(sw).toContain("'./js/p25d-question-quality.js'");
});

for (const profile of [
  { name: 'desktop', viewport: { width: 1280, height: 900 }, hasTouch: false },
  { name: 'mobile-touch', viewport: { width: 375, height: 812 }, hasTouch: true },
]) {
  test.describe(profile.name, () => {
    test.use({ viewport: profile.viewport, hasTouch: profile.hasTouch });

    test('final runtime loads all certified question systems without console errors', async ({ page }) => {
      const errors = await openApp(page);
      const state = await page.evaluate(() => {
        const engine = globalThis.__PFLEGE_P20_ENGINE__;
        if (!engine) throw new Error('StudyEngine unavailable');
        const types = [...new Set(engine.content.questions.map((q) => q.type))].sort();
        const preview = engine.selectRecommended({ target: 22, seed: 'p26g-final-runtime' });
        return {
          questionCount: engine.content.questions.length,
          types,
          previewCount: preview.length,
          questionItems: preview.filter((item) => item.kind === 'question').length,
          hasQuality: typeof engine.p25dQuestionQuality === 'function',
          hasRepetitionExposure: engine.p25bSessionExposure instanceof Map,
        };
      });
      expect(state.questionCount).toBe(1299);
      expect(state.types).toEqual(['clinical_case', 'matching', 'multiple_choice', 'ordering', 'short_answer', 'single_choice']);
      expect(state.previewCount).toBeGreaterThan(0);
      expect(state.questionItems).toBeGreaterThanOrEqual(4);
      expect(state.hasQuality).toBe(true);
      expect(state.hasRepetitionExposure).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
