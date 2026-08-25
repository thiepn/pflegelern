import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';
const STUDY_TYPES = ['single_choice', 'multiple_choice', 'ordering', 'matching', 'short_answer', 'clinical_case'];
const EXAM_TYPES = ['single_choice', 'multiple_choice', 'ordering', 'matching'];

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

async function createQuestionSession(page, type) {
  return page.evaluate(async (requestedType) => {
    const engine = globalThis.__PFLEGE_P20_ENGINE__;
    if (!engine) throw new Error('StudyEngine unavailable');
    const question = engine.content.questions.find((q) => q.type === requestedType);
    if (!question) throw new Error(`Missing ${requestedType}`);
    const item = engine.prepareQuestionItem(question, `p25c-${requestedType}`);
    const session = await engine.createSession({
      type: 'p25c-input-qa', source: 'recommended', title: `P25C ${requestedType}`, items: [item]
    });
    return { sessionId: session.id, questionId: question.id };
  }, type);
}

async function openStudySession(page, sessionId) {
  await page.goto(`${BASE}?view=study&session=${encodeURIComponent(sessionId)}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.question-shell')).toBeVisible();
}

async function savedStudyResponse(page, sessionId) {
  return page.evaluate(async (id) => {
    const session = await globalThis.__PFLEGE_P20_ENGINE__.getSession(id);
    return session?.responses?.['0'] || null;
  }, sessionId);
}

async function initialStudyOrder(page, sessionId) {
  return page.evaluate(async (id) => {
    const session = await globalThis.__PFLEGE_P20_ENGINE__.getSession(id);
    return [...(session?.items?.[0]?.variant?.order || [])];
  }, sessionId);
}

async function exerciseStudyType(page, type) {
  const { sessionId } = await createQuestionSession(page, type);
  await openStudySession(page, sessionId);

  if (type === 'single_choice') {
    const input = page.locator('[data-study-option]').first();
    await expect(input).toBeEnabled();
    await input.check();
    expect((await savedStudyResponse(page, sessionId))?.selected?.length).toBe(1);
  } else if (type === 'multiple_choice') {
    const input = page.locator('[data-study-option]').first();
    await expect(input).toBeEnabled();
    await input.check();
    expect((await savedStudyResponse(page, sessionId))?.selected?.length).toBeGreaterThanOrEqual(1);
  } else if (type === 'ordering') {
    const before = await initialStudyOrder(page, sessionId);
    expect(before.length).toBeGreaterThan(1);
    const down = page.locator('[data-action="move-order"][data-direction="1"]:not([disabled])').first();
    await expect(down).toBeVisible();
    await down.click();
    await expect.poll(async () => ((await savedStudyResponse(page, sessionId))?.order || []).join('|'))
      .not.toBe(before.join('|'));
    const saved = await savedStudyResponse(page, sessionId);
    expect(saved?.order?.length).toBe(before.length);
  } else if (type === 'matching') {
    const selects = page.locator('[data-study-match]');
    const count = await selects.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i += 1) {
      await expect(selects.nth(i)).toBeEnabled();
      await selects.nth(i).selectOption({ index: (i % (await selects.nth(i).locator('option').count() - 1)) + 1 });
    }
    expect(Object.keys((await savedStudyResponse(page, sessionId))?.matches || {}).length).toBe(count);
  } else {
    const textarea = page.locator('[data-study-text]');
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();
    const text = `P25C ${type} – Eingabe bleibt erhalten`;
    await page.evaluate((value) => {
      const field = document.querySelector('[data-study-text]');
      const button = document.querySelector('[data-action="check-question"]');
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      button.click();
    }, text);
    await expect(page.locator('.question-feedback')).toBeVisible();
    await expect(textarea).toHaveValue(text);
    expect((await savedStudyResponse(page, sessionId))?.text).toBe(text);
  }

  if (!['short_answer', 'clinical_case'].includes(type)) {
    await page.locator('[data-action="check-question"]').click();
    await expect(page.locator('.question-feedback')).toBeVisible();
  }
}

async function createExamForType(page, type) {
  return page.evaluate(async (requestedType) => {
    const engine = globalThis.__PFLEGE_P20_ENGINE__;
    const question = engine.content.questions.find((q) => q.type === requestedType);
    if (!question) throw new Error(`Missing exam question ${requestedType}`);
    const id = `p25c-exam-${requestedType}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();
    const attempt = {
      id, mode: 'quick', chapterId: null, sectionId: null, count: 1,
      startedAt: now, completedAt: null, completed: false, processed: false,
      currentIndex: 0, markedForReview: [], answers: {}, processedQuestionIds: [],
      questions: [engine.prepareQuestionItem(question, `p25c-exam-${requestedType}`)],
      p20: {
        version: 2, configuredCount: 1, actualCount: 1, timerEnabled: false,
        durationMinutes: null, deadlineAt: null, passThreshold: 60, weakness: false,
        chapterIds: [], blueprint: null, createdAt: now, timeExpired: false
      }
    };
    await engine.saveExam(attempt);
    return { examId: id, questionId: question.id };
  }, type);
}

async function savedExamAnswer(page, examId, questionId) {
  return page.evaluate(async ({ examId: id, questionId: qid }) => {
    const attempt = await globalThis.__PFLEGE_P20_ENGINE__.getExam(id);
    return attempt?.answers?.[qid] || null;
  }, { examId, questionId });
}

async function exerciseExamType(page, type) {
  const { examId, questionId } = await createExamForType(page, type);
  await page.goto(`${BASE}?view=exam-run&exam=${encodeURIComponent(examId)}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.question-shell')).toBeVisible();

  if (type === 'single_choice' || type === 'multiple_choice') {
    const input = page.locator('[data-exam-option]').first();
    await expect(input).toBeEnabled();
    await input.check();
    expect((await savedExamAnswer(page, examId, questionId))?.selected?.length).toBeGreaterThanOrEqual(1);
  } else if (type === 'ordering') {
    const down = page.locator('[data-action="move-exam-order"][data-direction="1"]:not([disabled])').first();
    await expect(down).toBeVisible();
    await down.click();
    await expect.poll(async () => ((await savedExamAnswer(page, examId, questionId))?.order || []).length)
      .toBeGreaterThan(1);
  } else if (type === 'matching') {
    const selects = page.locator('[data-exam-match]');
    const count = await selects.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i += 1) {
      await selects.nth(i).selectOption({ index: 1 });
    }
    expect(Object.keys((await savedExamAnswer(page, examId, questionId))?.matches || {}).length).toBe(count);
  }

  await page.reload({ waitUntil: 'networkidle' });
  if (type === 'single_choice' || type === 'multiple_choice') {
    await expect(page.locator('[data-exam-option]:checked')).toHaveCount(1);
  } else if (type === 'matching') {
    await expect(page.locator('[data-exam-match]').first()).not.toHaveValue('');
  }
}

for (const profile of [
  { name: 'desktop', viewport: { width: 1280, height: 900 }, hasTouch: false },
  { name: 'mobile-touch', viewport: { width: 375, height: 812 }, hasTouch: true }
]) {
  test.describe(profile.name, () => {
    test.use({ viewport: profile.viewport, hasTouch: profile.hasTouch });

    test('all six study answer types accept and persist input', async ({ page }) => {
      const errors = await openApp(page);
      for (const type of STUDY_TYPES) await exerciseStudyType(page, type);
      expect(errors).toEqual([]);
    });

    test('all four objectively graded exam controls accept and persist input', async ({ page }) => {
      const errors = await openApp(page);
      for (const type of EXAM_TYPES) await exerciseExamType(page, type);
      expect(errors).toEqual([]);
    });
  });
}

test('free response survives immediate exit before legacy debounce fires', async ({ page }) => {
  const errors = await openApp(page);
  const { sessionId } = await createQuestionSession(page, 'short_answer');
  await openStudySession(page, sessionId);
  const text = 'Diese Antwort wurde vor dem Verlassen sofort geschützt.';
  await page.evaluate((value) => {
    const field = document.querySelector('[data-study-text]');
    const exit = document.querySelector('[data-action="exit-study"]');
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    exit.click();
  }, text);
  await page.waitForURL((url) => !url.searchParams.get('session'));
  await openStudySession(page, sessionId);
  await expect(page.locator('[data-study-text]')).toHaveValue(text);
  expect((await savedStudyResponse(page, sessionId))?.text).toBe(text);
  expect(errors).toEqual([]);
});

test('P25C runtime marks real answer controls as reliability-protected', async ({ page }) => {
  const errors = await openApp(page);
  const { sessionId } = await createQuestionSession(page, 'single_choice');
  await openStudySession(page, sessionId);
  await expect(page.locator('[data-study-option]').first()).toHaveAttribute('data-p25c-input', 'ready');
  expect(errors).toEqual([]);
});
