import assert from 'node:assert/strict';
import {
  buildRecentSessionExposure,
  chooseRepeatSafe,
  isHardRepeat,
  mergeSessionExposure,
  questionRepetitionSignal,
  repetitionPenalty
} from '../js/p25b-repetition-core.js';

let tests = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  tests += 1;
};

const now = Date.parse('2026-08-25T12:00:00Z');
const iso = (hoursAgo) => new Date(now - hoursAgo * 3_600_000).toISOString();

const sessions = [
  { id: 'newest', startedAt: iso(1), items: [{ kind: 'question', id: 'q1' }, { kind: 'question', id: 'q1' }, { kind: 'card', id: 'c1' }] },
  { id: 'second', startedAt: iso(8), items: [{ kind: 'question', id: 'q2' }, { kind: 'question', id: 'q1' }] },
  { id: 'third', startedAt: iso(30), items: [{ kind: 'question', id: 'q3' }] },
  { id: 'old', startedAt: new Date(now - 40 * 86_400_000).toISOString(), items: [{ kind: 'question', id: 'old-q' }] },
  { id: 'cards-only', startedAt: iso(2), items: [{ kind: 'card', id: 'c2' }] }
];
const exposure = buildRecentSessionExposure(sessions, { now });
check(exposure.size === 3, 'only recent question sessions are indexed');
check(exposure.get('q1').sessionCount === 2, 'duplicate question inside one session counts once');
check(exposure.get('q1').recentSessionRank === 0, 'latest session rank is retained');
check(exposure.get('q1').lastSessionAt === iso(1), 'latest session timestamp is retained');
check(exposure.get('q2').sessionCount === 1, 'single session exposure counted once');
check(exposure.get('q2').recentSessionRank === 1, 'second recent session rank retained');
check(exposure.get('q3').recentSessionRank === 2, 'third recent session rank retained');
check(!exposure.has('old-q'), 'old sessions fall outside the exposure horizon');

const hot = questionRepetitionSignal({ lastAnsweredAt: iso(2), now });
const sameDay = questionRepetitionSignal({ lastAnsweredAt: iso(18), now });
const recent = questionRepetitionSignal({ lastAnsweredAt: iso(48), now });
const warm = questionRepetitionSignal({ lastAnsweredAt: iso(120), now });
const cooling = questionRepetitionSignal({ lastAnsweredAt: iso(240), now });
const clear = questionRepetitionSignal({ lastAnsweredAt: iso(500), now });
check(hot.tier === 'hot', 'under 12h is hot');
check(sameDay.tier === 'same_day', 'under 24h is same-day');
check(recent.tier === 'recent', 'under 3d is recent');
check(warm.tier === 'warm', 'under 7d is warm');
check(cooling.tier === 'cooling', 'under 14d is cooling');
check(clear.tier === 'clear', 'older history clears');
check(isHardRepeat(hot), 'hot repetition is hard-block eligible');
check(isHardRepeat(sameDay), 'same-day repetition is hard-block eligible');
check(!isHardRepeat(recent), 'multi-day repetition is penalized but not hard-blocked');
check(repetitionPenalty(hot) > repetitionPenalty(sameDay), 'hot penalty exceeds same-day');
check(repetitionPenalty(sameDay) > repetitionPenalty(recent), 'same-day penalty exceeds recent');
check(repetitionPenalty(recent) > repetitionPenalty(warm), 'recent penalty exceeds warm');
check(repetitionPenalty(warm) > repetitionPenalty(cooling), 'warm penalty exceeds cooling');
check(repetitionPenalty(cooling) > repetitionPenalty(clear), 'cooling penalty exceeds clear');
check(repetitionPenalty({ ...warm, sessionCount: 5 }) > repetitionPenalty(warm), 'repeat frequency adds a bounded penalty');

const rows = [
  { id: 'hot-a', repetition: hot },
  { id: 'fresh-a', repetition: clear },
  { id: 'fresh-b', repetition: clear },
  { id: 'hot-b', repetition: sameDay }
];
const safe = chooseRepeatSafe(rows, { target: 2 });
check(safe.length === 2, 'repeat-safe chooser fills requested target');
check(safe.every((row) => row.id.startsWith('fresh')), 'fresh rows are selected before hard repeats');
const fallback = chooseRepeatSafe(rows.filter((row) => row.id.startsWith('hot')), { target: 2 });
check(fallback.length === 2, 'hard repeats remain available as graceful fallback');

const mergedBase = new Map([
  ['old-one', { questionId: 'old-one', lastSessionAt: iso(30), recentSessionRank: 0, sessionCount: 1 }]
]);
const merged = mergeSessionExposure(mergedBase, {
  startedAt: iso(0),
  items: [{ kind: 'question', id: 'new-one' }, { kind: 'question', id: 'new-one' }, { kind: 'card', id: 'c' }]
}, now);
check(merged.get('new-one').sessionCount === 1, 'new session exposure deduplicates question IDs');
check(merged.get('new-one').recentSessionRank === 0, 'new exposure becomes newest rank');
check(merged.get('old-one').recentSessionRank === 1, 'older exposure rank advances');

const rankHot = questionRepetitionSignal({ lastSessionAt: iso(30), recentSessionRank: 0, now });
const rankSameDay = questionRepetitionSignal({ lastSessionAt: iso(30), recentSessionRank: 1, now });
const rankRecent = questionRepetitionSignal({ lastSessionAt: iso(100), recentSessionRank: 2, now });
check(rankHot.tier === 'hot', 'most recent session can hard-block even when timestamp is older');
check(rankSameDay.tier === 'same_day', 'second recent session remains hard-blocked');
check(rankRecent.tier === 'recent', 'third recent session receives strong soft penalty');

console.log(JSON.stringify({ phase: 'P25B-core', tests, errors: 0 }, null, 2));
