import { addDays, addMinutes, clamp, diffDays } from './util.js';

// FSRS-6 default parameters published by the Open Spaced Repetition project.
// This module implements the core D/S/R update equations plus the official
// default 1m/10m learning and 10m relearning steps used by ts-fsrs.
export const FSRS_W = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
  0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
]);

export const Rating = Object.freeze({ AGAIN: 1, HARD: 2, GOOD: 3 });
export const CardState = Object.freeze({ NEW: 'new', LEARNING: 'learning', REVIEW: 'review', RELEARNING: 'relearning' });

const REQUEST_RETENTION = 0.90;
const MAX_INTERVAL = 36500;
const LEARNING_STEPS = [1, 10];
const RELEARNING_STEP = 10;

export function createFsrsState(cardId) {
  return {
    cardId,
    state: CardState.NEW,
    due: null,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningStep: 0,
    lastReview: null,
    lastRating: null,
    extraPracticeCount: 0,
    updatedAt: null
  };
}

export function isDue(state, now = new Date()) {
  if (!state || state.state === CardState.NEW || !state.due) return false;
  return new Date(state.due).getTime() <= now.getTime();
}

export function retrievability(state, now = new Date()) {
  if (!state || !state.lastReview || !state.stability) return 0;
  const elapsed = diffDays(now, new Date(state.lastReview));
  return forgettingCurve(elapsed, state.stability);
}

export function scheduleReview(input, rating, now = new Date()) {
  if (![1, 2, 3].includes(rating)) throw new Error('Ungültige Lernbewertung.');
  const state = { ...createFsrsState(input.cardId), ...input };
  const previousState = state.state || CardState.NEW;
  const previousReview = state.lastReview ? new Date(state.lastReview) : null;
  const elapsed = previousReview ? diffDays(now, previousReview) : 0;
  let stability = state.stability || 0;
  let difficulty = state.difficulty || 0;
  let nextState = previousState;
  let due;
  let scheduledDays = 0;
  let learningStep = state.learningStep || 0;
  let lapses = state.lapses || 0;

  if (previousState === CardState.NEW || state.reps === 0) {
    stability = initialStability(rating);
    difficulty = initialDifficulty(rating);
    nextState = CardState.LEARNING;
    if (rating === Rating.AGAIN) {
      learningStep = 0;
      due = addMinutes(now, LEARNING_STEPS[0]);
    } else if (rating === Rating.HARD) {
      learningStep = 0;
      due = addMinutes(now, 6);
    } else {
      learningStep = 1;
      due = addMinutes(now, LEARNING_STEPS[1]);
    }
  } else if (previousState === CardState.LEARNING) {
    difficulty = nextDifficulty(difficulty || initialDifficulty(rating), rating);
    stability = sameDayStability(Math.max(stability, 0.001), rating);
    if (rating === Rating.AGAIN) {
      learningStep = 0;
      due = addMinutes(now, LEARNING_STEPS[0]);
    } else if (rating === Rating.HARD) {
      due = addMinutes(now, 6);
    } else if (learningStep < LEARNING_STEPS.length - 1) {
      learningStep += 1;
      due = addMinutes(now, LEARNING_STEPS[learningStep]);
    } else {
      nextState = CardState.REVIEW;
      learningStep = 0;
      scheduledDays = nextInterval(stability);
      due = addDays(now, scheduledDays);
    }
  } else if (previousState === CardState.RELEARNING) {
    difficulty = nextDifficulty(difficulty || initialDifficulty(rating), rating);
    const r = forgettingCurve(elapsed, Math.max(stability, 0.001));
    if (rating === Rating.AGAIN) {
      stability = elapsed < 1 ? sameDayStability(Math.max(stability, 0.001), rating) : forgettingStability(difficulty, Math.max(stability, 0.001), r);
      due = addMinutes(now, RELEARNING_STEP);
    } else if (rating === Rating.HARD) {
      stability = elapsed < 1 ? sameDayStability(Math.max(stability, 0.001), rating) : recallStability(difficulty, Math.max(stability, 0.001), r, rating);
      due = addMinutes(now, 15);
    } else {
      stability = elapsed < 1 ? sameDayStability(Math.max(stability, 0.001), rating) : recallStability(difficulty, Math.max(stability, 0.001), r, rating);
      nextState = CardState.REVIEW;
      scheduledDays = nextInterval(stability);
      due = addDays(now, scheduledDays);
    }
  } else {
    const r = forgettingCurve(elapsed, Math.max(stability, 0.001));
    difficulty = nextDifficulty(difficulty || initialDifficulty(rating), rating);
    if (rating === Rating.AGAIN) {
      stability = elapsed < 1 ? sameDayStability(Math.max(stability, 0.001), rating) : forgettingStability(difficulty, Math.max(stability, 0.001), r);
      nextState = CardState.RELEARNING;
      lapses += 1;
      due = addMinutes(now, RELEARNING_STEP);
    } else {
      stability = elapsed < 1 ? sameDayStability(Math.max(stability, 0.001), rating) : recallStability(difficulty, Math.max(stability, 0.001), r, rating);
      nextState = CardState.REVIEW;
      scheduledDays = nextInterval(stability);
      due = addDays(now, scheduledDays);
    }
  }

  if (!due) {
    scheduledDays = nextInterval(stability);
    due = addDays(now, scheduledDays);
  }

  return {
    ...state,
    state: nextState,
    due: due.toISOString(),
    stability: round(stability, 6),
    difficulty: round(clamp(difficulty, 1, 10), 6),
    elapsedDays: round(elapsed, 4),
    scheduledDays,
    reps: (state.reps || 0) + 1,
    lapses,
    learningStep,
    lastReview: now.toISOString(),
    lastRating: rating,
    updatedAt: now.toISOString()
  };
}

export function initialStability(grade) {
  return FSRS_W[grade - 1];
}

export function initialDifficulty(grade) {
  const [,,,, w4, w5] = FSRS_W;
  return clamp(w4 - Math.exp(w5 * (grade - 1)) + 1, 1, 10);
}

export function nextDifficulty(difficulty, grade) {
  const w4 = FSRS_W[4];
  const w5 = FSRS_W[5];
  const w6 = FSRS_W[6];
  const w7 = FSRS_W[7];
  const d0Easy = clamp(w4 - Math.exp(w5 * 3) + 1, 1, 10);
  const delta = -w6 * (grade - 3);
  const damped = difficulty + delta * ((10 - difficulty) / 9);
  return clamp(w7 * d0Easy + (1 - w7) * damped, 1, 10);
}

export function forgettingCurve(elapsedDays, stability) {
  const decay = FSRS_W[20];
  const factor = Math.pow(0.9, -1 / decay) - 1;
  return Math.pow(1 + factor * elapsedDays / Math.max(stability, 0.001), -decay);
}

export function nextInterval(stability, retention = REQUEST_RETENTION) {
  const decay = FSRS_W[20];
  const factor = Math.pow(0.9, -1 / decay) - 1;
  const interval = stability / factor * (Math.pow(retention, -1 / decay) - 1);
  return clamp(Math.max(1, Math.round(interval)), 1, MAX_INTERVAL);
}

export function recallStability(difficulty, stability, r, grade) {
  const w8 = FSRS_W[8];
  const w9 = FSRS_W[9];
  const w10 = FSRS_W[10];
  const hardPenalty = grade === Rating.HARD ? FSRS_W[15] : 1;
  const easyBonus = grade === 4 ? FSRS_W[16] : 1;
  const growth = Math.exp(w8) * (11 - difficulty) * Math.pow(stability, -w9) * (Math.exp(w10 * (1 - r)) - 1) * hardPenalty * easyBonus;
  return Math.max(stability, stability * (1 + growth));
}

export function forgettingStability(difficulty, stability, r) {
  const w11 = FSRS_W[11];
  const w12 = FSRS_W[12];
  const w13 = FSRS_W[13];
  const w14 = FSRS_W[14];
  const value = w11 * Math.pow(difficulty, -w12) * (Math.pow(stability + 1, w13) - 1) * Math.exp(w14 * (1 - r));
  return clamp(value, 0.001, Math.max(0.001, stability));
}

export function sameDayStability(stability, grade) {
  const w17 = FSRS_W[17];
  const w18 = FSRS_W[18];
  const w19 = FSRS_W[19];
  const multiplier = Math.exp(w17 * (grade - 3 + w18)) * Math.pow(stability, -w19);
  const updated = stability * multiplier;
  return grade >= Rating.HARD ? Math.max(stability, updated) : Math.max(0.001, updated);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export const FSRS_CONFIG = Object.freeze({
  algorithm: 'FSRS-6 core',
  desiredRetention: REQUEST_RETENTION,
  learningStepsMinutes: LEARNING_STEPS,
  relearningStepMinutes: RELEARNING_STEP,
  maxIntervalDays: MAX_INTERVAL
});
