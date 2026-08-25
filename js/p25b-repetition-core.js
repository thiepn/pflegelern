const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function timeOf(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function buildRecentSessionExposure(sessions = [], {
  now = Date.now(),
  maxSessions = 12,
  maxAgeDays = 30
} = {}) {
  const cutoff = now - Math.max(1, maxAgeDays) * DAY_MS;
  const recent = [...sessions]
    .filter((session) => Array.isArray(session?.items) && session.items.some((item) => item?.kind === 'question'))
    .filter((session) => {
      const stamp = timeOf(session.startedAt || session.createdAt);
      return stamp !== null && stamp >= cutoff;
    })
    .sort((a, b) => timeOf(b.startedAt || b.createdAt) - timeOf(a.startedAt || a.createdAt))
    .slice(0, Math.max(1, maxSessions));

  const exposure = new Map();
  recent.forEach((session, rank) => {
    const stamp = session.startedAt || session.createdAt;
    const seenInSession = new Set();
    for (const item of session.items) {
      if (item?.kind !== 'question' || !item.id || seenInSession.has(item.id)) continue;
      seenInSession.add(item.id);
      const current = exposure.get(item.id) || {
        questionId: item.id,
        lastSessionAt: stamp,
        recentSessionRank: rank,
        sessionCount: 0
      };
      current.sessionCount += 1;
      if (rank < current.recentSessionRank) {
        current.recentSessionRank = rank;
        current.lastSessionAt = stamp;
      }
      exposure.set(item.id, current);
    }
  });
  return exposure;
}

export function questionRepetitionSignal({
  lastAnsweredAt = null,
  lastSessionAt = null,
  recentSessionRank = Infinity,
  sessionCount = 0,
  now = Date.now()
} = {}) {
  const answered = timeOf(lastAnsweredAt);
  const session = timeOf(lastSessionAt);
  const latest = Math.max(answered ?? -Infinity, session ?? -Infinity);
  const ageHours = Number.isFinite(latest) ? Math.max(0, (now - latest) / HOUR_MS) : Infinity;
  const ageDays = Number.isFinite(ageHours) ? ageHours / 24 : Infinity;
  const rank = Number.isFinite(Number(recentSessionRank)) ? Number(recentSessionRank) : Infinity;
  const count = Math.max(0, Math.floor(Number(sessionCount) || 0));

  let tier = 'clear';
  if (ageHours < 12 || rank <= 0) tier = 'hot';
  else if (ageHours < 24 || rank <= 1) tier = 'same_day';
  else if (ageDays < 3 || rank <= 2) tier = 'recent';
  else if (ageDays < 7 || rank <= 4) tier = 'warm';
  else if (ageDays < 14 || rank <= 7) tier = 'cooling';

  return { tier, ageHours, ageDays, recentSessionRank: rank, sessionCount: count };
}

export function repetitionPenalty(signal = {}) {
  const base = ({
    hot: 1.00,
    same_day: 0.78,
    recent: 0.46,
    warm: 0.22,
    cooling: 0.10,
    clear: 0
  })[signal.tier] ?? 0;
  const frequency = Math.min(0.20, Math.max(0, (Number(signal.sessionCount) || 0) - 1) * 0.05);
  return base + frequency;
}

export function isHardRepeat(signal = {}) {
  return signal.tier === 'hot' || signal.tier === 'same_day';
}

export function chooseRepeatSafe(candidates = [], {
  target = 1,
  getSignal = (row) => row?.repetition || {},
  getId = (row) => row?.q?.id ?? row?.id
} = {}) {
  const wanted = Math.max(0, Math.floor(Number(target) || 0));
  if (!wanted) return [];
  const chosen = [];
  const used = new Set();
  const take = (allowHard) => {
    for (const row of candidates) {
      if (chosen.length >= wanted) break;
      const id = getId(row);
      if (!id || used.has(id)) continue;
      if (!allowHard && isHardRepeat(getSignal(row))) continue;
      chosen.push(row);
      used.add(id);
    }
  };
  take(false);
  if (chosen.length < wanted) take(true);
  return chosen;
}

export function mergeSessionExposure(exposure, session, now = Date.now()) {
  const map = exposure instanceof Map ? exposure : new Map();
  const stamp = session?.startedAt || session?.createdAt || new Date(now).toISOString();
  const ids = new Set((session?.items || []).filter((item) => item?.kind === 'question' && item.id).map((item) => item.id));
  for (const id of ids) {
    const current = map.get(id) || { questionId: id, lastSessionAt: stamp, recentSessionRank: 0, sessionCount: 0 };
    current.lastSessionAt = stamp;
    current.recentSessionRank = 0;
    current.sessionCount = (current.sessionCount || 0) + 1;
    map.set(id, current);
  }
  for (const [id, row] of map) {
    if (!ids.has(id) && Number.isFinite(row.recentSessionRank)) row.recentSessionRank += 1;
  }
  return map;
}
