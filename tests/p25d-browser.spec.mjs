import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';

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

test('P25D runtime audits the complete bank without changing it', async ({ page }) => {
  const errors = await openApp(page);
  const summary = await page.evaluate(() => {
    const engine = globalThis.__PFLEGE_P20_ENGINE__;
    return {
      count: engine.content.questions.length,
      quality: engine.p25dQuestionQualitySummary(),
      hasRuntime: typeof engine.p25dQuestionQuality === 'function'
    };
  });
  expect(summary.count).toBe(1299);
  expect(summary.quality.total).toBe(1299);
  expect(summary.hasRuntime).toBe(true);
  expect(errors).toEqual([]);
});

test('recommended study exposes only selectable answer-choice questions when alternatives exist', async ({ page }) => {
  const errors = await openApp(page);
  const audit = await page.evaluate(() => {
    const engine = globalThis.__PFLEGE_P20_ENGINE__;
    const items = engine.selectRecommended({ target: 30, seed: 'p25d-browser-recommended' });
    const optionRows = items
      .filter((item) => item.kind === 'question')
      .map((item) => ({ id: item.id, q: engine.content.questionById.get(item.id) }))
      .filter((row) => ['single_choice', 'multiple_choice'].includes(row.q?.type))
      .map((row) => ({ id: row.id, quality: engine.p25dQuestionQuality(row.q) }));
    return { optionRows, items: items.length };
  });
  expect(audit.items).toBeGreaterThan(0);
  for (const row of audit.optionRows) expect(row.quality.selectable, row.id).toBe(true);
  expect(errors).toEqual([]);
});

test('single-choice correct positions are distributed across screen slots and vary by session seed', async ({ page }) => {
  const errors = await openApp(page);
  const result = await page.evaluate(() => {
    const engine = globalThis.__PFLEGE_P20_ENGINE__;
    const questions = engine.content.questions.filter((q) => q.type === 'single_choice' && q.options?.length === 4 && q.correct?.length === 1).slice(0, 200);
    const counts = [0, 0, 0, 0];
    for (const q of questions) {
      const item = engine.prepareQuestionItem(q, 'p25d-browser-slot-audit');
      const index = item.variant.optionOrder.indexOf(q.correct[0]);
      counts[index] += 1;
      if (!item.variant.p25dBalanced) throw new Error(`P25D balance metadata missing for ${q.id}`);
    }
    const q = questions[0];
    const positions = q ? Array.from({ length: 10 }, (_, i) => engine.prepareQuestionItem(q, `p25d-seed-${i}`).variant.optionOrder.indexOf(q.correct[0])) : [];
    return { counts, positions, total: questions.length };
  });
  expect(result.total).toBeGreaterThan(50);
  expect(Math.min(...result.counts)).toBeGreaterThan(0);
  expect(Math.max(...result.counts) - Math.min(...result.counts)).toBeLessThanOrEqual(Math.max(12, result.total * 0.18));
  expect(new Set(result.positions).size).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});
