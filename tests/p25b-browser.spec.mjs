import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';

async function openApp(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem('pflege-onboarded', '1');
    localStorage.setItem('pflege-theme', 'light');
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor({ state: 'visible' });
  return errors;
}

test('a second recommended session avoids exact question repeats when alternatives exist', async ({ page }) => {
  const errors = await openApp(page);
  const result = await page.evaluate(async () => {
    const { ContentRepository } = await import(new URL('./js/content.js', location.href).href);
    const { StudyEngine } = await import(new URL('./js/study-engine.js', location.href).href);
    const content = await ContentRepository.load();
    const engine = new StudyEngine(content);
    await engine.init();

    const first = engine.selectRecommended({ target: 22, seed: 'p25b-first' });
    const firstQuestions = first.filter((item) => item.kind === 'question').map((item) => item.id);
    await engine.createSession({ type: 'recommended', source: 'recommended', title: 'P25B first', items: first });
    const second = engine.selectRecommended({ target: 22, seed: 'p25b-second' });
    const secondQuestions = second.filter((item) => item.kind === 'question').map((item) => item.id);
    return {
      firstQuestions,
      secondQuestions,
      overlap: firstQuestions.filter((id) => secondQuestions.includes(id)),
      firstCards: first.filter((item) => item.kind === 'card').map((item) => item.id),
      firstCount: first.length,
      secondCount: second.length
    };
  });

  expect(result.firstQuestions.length).toBeGreaterThanOrEqual(4);
  expect(result.secondQuestions.length).toBeGreaterThanOrEqual(4);
  expect(result.overlap).toEqual([]);
  expect(result.secondCount).toBe(result.firstCount);
  expect(result.secondCount).toBeGreaterThanOrEqual(12);
  expect(result.firstCards.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('recent abandoned-session exposure survives a new engine init', async ({ page }) => {
  const errors = await openApp(page);
  const result = await page.evaluate(async () => {
    const { ContentRepository } = await import(new URL('./js/content.js', location.href).href);
    const { StudyEngine } = await import(new URL('./js/study-engine.js', location.href).href);
    const content = await ContentRepository.load();
    const firstEngine = new StudyEngine(content);
    await firstEngine.init();
    const first = firstEngine.selectRecommended({ target: 22, seed: 'p25b-persist-first' });
    const firstQuestions = first.filter((item) => item.kind === 'question').map((item) => item.id);
    await firstEngine.createSession({ type: 'recommended', source: 'recommended', title: 'P25B abandoned', items: first });

    const reloaded = new StudyEngine(content);
    await reloaded.init();
    const indexed = firstQuestions.filter((id) => reloaded.p25bSessionExposure?.has(id));
    const second = reloaded.selectRecommended({ target: 22, seed: 'p25b-persist-second' });
    const secondQuestions = second.filter((item) => item.kind === 'question').map((item) => item.id);
    return {
      firstQuestions,
      indexed,
      overlap: firstQuestions.filter((id) => secondQuestions.includes(id))
    };
  });

  expect(result.indexed).toEqual(result.firstQuestions);
  expect(result.overlap).toEqual([]);
  expect(errors).toEqual([]);
});

test('direct repetition guard changes only repeated questions, never card items', async ({ page }) => {
  const errors = await openApp(page);
  const result = await page.evaluate(async () => {
    const { ContentRepository } = await import(new URL('./js/content.js', location.href).href);
    const { StudyEngine } = await import(new URL('./js/study-engine.js', location.href).href);
    const { applyQuestionRepetitionGuard } = await import(new URL('./js/p25b-repetition.js', location.href).href);
    const content = await ContentRepository.load();
    const engine = new StudyEngine(content);
    await engine.init();
    const items = engine.selectRecommended({ target: 22, seed: 'p25b-card-preserve' });
    const questionIndex = items.findIndex((item) => item.kind === 'question');
    const question = items[questionIndex];
    const cardsBefore = items.filter((item) => item.kind === 'card').map((item) => item.id);
    const exposure = new Map([[question.id, {
      questionId: question.id,
      lastSessionAt: new Date().toISOString(),
      recentSessionRank: 0,
      sessionCount: 1
    }]]);
    const guarded = applyQuestionRepetitionGuard(engine, items, { seed: 'p25b-direct', exposure });
    const cardsAfter = guarded.filter((item) => item.kind === 'card').map((item) => item.id);
    return {
      cardsBefore,
      cardsAfter,
      originalQuestion: question.id,
      replacementQuestion: guarded[questionIndex]?.id,
      originalType: content.questionById.get(question.id)?.type,
      replacementType: content.questionById.get(guarded[questionIndex]?.id)?.type,
      originalTotal: items.length,
      total: guarded.length
    };
  });

  expect(result.cardsAfter).toEqual(result.cardsBefore);
  expect(result.replacementQuestion).not.toBe(result.originalQuestion);
  expect(result.replacementType).toBe(result.originalType);
  expect(result.total).toBe(result.originalTotal);
  expect(errors).toEqual([]);
});

test('P25B manifest and offline cache expose the repetition-control runtime', async ({ request }) => {
  const [manifestResponse, swResponse] = await Promise.all([
    request.get(`${BASE}data/manifest.json`),
    request.get(`${BASE}service-worker.js`)
  ]);
  expect(manifestResponse.ok()).toBeTruthy();
  expect(swResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  const sw = await swResponse.text();
  expect(manifest.phase).toBe('P25B');
  expect(manifest.version).toBe('1.1.0-dev.25b');
  expect(manifest.status).toBe('p25b-question-repetition-control');
  expect(sw).toContain("pflegelern-p25b-v1.1.0-dev25b");
  expect(sw).toContain("'./js/p25b-repetition-core.js'");
  expect(sw).toContain("'./js/p25b-repetition.js'");
});
