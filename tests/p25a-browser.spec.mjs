import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';

async function openApp(page, view = 'today') {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem('pflege-onboarded', '1');
    localStorage.setItem('pflege-theme', 'light');
  });
  await page.goto(`${BASE}?view=${view}`, { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor({ state: 'visible' });
  return errors;
}

async function createQuestionSession(page, type) {
  return page.evaluate(async (questionType) => {
    const { ContentRepository } = await import(new URL('./js/content.js', location.href).href);
    const { StudyEngine } = await import(new URL('./js/study-engine.js', location.href).href);
    const content = await ContentRepository.load();
    const engine = new StudyEngine(content);
    await engine.init();
    const question = content.questions.find((q) => q.certification === 'p25a-source-derived-v1' && q.type === questionType);
    if (!question) throw new Error(`No generated ${questionType} question found`);
    const item = engine.prepareQuestionItem(question, `p25a-browser-${questionType}`);
    const session = await engine.createSession({
      type: 'topic',
      source: 'topic',
      title: 'P25A Browser QA',
      items: [item],
      options: { mode: 'all' }
    });
    return { sessionId: session.id, question, variant: item.variant };
  }, type);
}

test('question bank is materially rebalanced while preserving the certified baseline', async ({ request }) => {
  const [questionsResponse, reportResponse] = await Promise.all([
    request.get(`${BASE}data/questions.json`),
    request.get(`${BASE}P25A_QUESTION_VARIETY_REPORT.json`)
  ]);
  expect(questionsResponse.ok()).toBeTruthy();
  expect(reportResponse.ok()).toBeTruthy();
  const questions = await questionsResponse.json();
  const report = await reportResponse.json();
  const counts = questions.reduce((acc, q) => {
    acc[q.type] = (acc[q.type] || 0) + 1;
    return acc;
  }, {});

  expect(questions).toHaveLength(1299);
  expect(report.legacyPreservation.preservedExactly).toBe(true);
  expect(report.baselineQuestions).toBe(954);
  expect(counts.single_choice).toBe(699);
  expect(counts.short_answer).toBe(321);
  expect(counts.matching).toBe(39);
  expect(report.singleChoiceShare.after).toBeLessThanOrEqual(0.56);
});

test('fresh adaptive learning deliberately mixes question interaction types', async ({ page }) => {
  const errors = await openApp(page);
  const mix = await page.evaluate(async () => {
    const { ContentRepository } = await import(new URL('./js/content.js', location.href).href);
    const { StudyEngine } = await import(new URL('./js/study-engine.js', location.href).href);
    const content = await ContentRepository.load();
    const engine = new StudyEngine(content);
    await engine.init();
    const items = engine.selectRecommended({ target: 22, seed: 'p25a-browser-mix' });
    const types = items
      .filter((item) => item.kind === 'question')
      .map((item) => content.questionById.get(item.id)?.type)
      .filter(Boolean);
    return { types, unique: [...new Set(types)] };
  });
  expect(mix.types.length).toBeGreaterThanOrEqual(4);
  expect(mix.unique.length).toBeGreaterThanOrEqual(3);
  expect(mix.types.filter((type) => type === 'single_choice').length).toBeLessThan(mix.types.length);
  expect(errors).toEqual([]);
});

test('generated Short Answer can be typed, persisted and self-graded through the real study UI', async ({ page }) => {
  const errors = await openApp(page);
  const created = await createQuestionSession(page, 'short_answer');
  await page.goto(`${BASE}?view=study&session=${encodeURIComponent(created.sessionId)}`, { waitUntil: 'networkidle' });

  const textarea = page.locator('[data-study-text]');
  await expect(textarea).toBeVisible();
  await expect(textarea).toBeEnabled();
  await textarea.fill('Meine eigene Testantwort');
  await expect(textarea).toHaveValue('Meine eigene Testantwort');
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: 'Antwort anzeigen' }).click();
  await expect(page.getByRole('heading', { name: 'Musterantwort' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nicht richtig' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Richtig' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('generated Matching can be completed and graded through all real select controls', async ({ page }) => {
  const errors = await openApp(page);
  const created = await createQuestionSession(page, 'matching');
  await page.goto(`${BASE}?view=study&session=${encodeURIComponent(created.sessionId)}`, { waitUntil: 'networkidle' });

  const pairs = created.variant.matchingPairs || created.question.options.map((option) => {
    const [left, right] = String(option.text).split('↔').map((part) => part.trim());
    return { left, right };
  });
  const selects = page.locator('[data-study-match]');
  await expect(selects).toHaveCount(pairs.length);
  for (let index = 0; index < pairs.length; index += 1) {
    const select = selects.nth(index);
    await expect(select).toBeEnabled();
    await select.selectOption({ label: pairs[index].right });
  }

  await page.getByRole('button', { name: 'Antwort prüfen' }).click();
  await expect(page.getByRole('heading', { name: 'Richtig.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('P25A offline cache includes the new variety planner and updated question bank cache generation', async ({ request }) => {
  const response = await request.get(`${BASE}service-worker.js`);
  expect(response.ok()).toBeTruthy();
  const text = await response.text();
  expect(text).toContain("pflegelern-p25a-v1.1.0-dev25a");
  expect(text).toContain("'./js/p25a-variety-core.js'");
  expect(text).toContain("'./data/questions.json'");
});
