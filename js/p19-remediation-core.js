const DAY_MS = 86_400_000;

export const REMEDIATION_VERSION = 1;
export const OBJECTIVE_TYPES = new Set(['single_choice', 'multiple_choice', 'ordering', 'matching']);
export const APPLICATION_TYPES = new Set(['clinical_case', 'short_answer']);

function clamp(value, min, max) {
  const n = Number(value || 0);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function cleanDays(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(-12);
}

export function localDayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nextFollowupAt(now = new Date(), stage = 0) {
  const base = now instanceof Date ? now : new Date(now);
  const days = stage <= 0 ? 1 : stage === 1 ? 3 : 7;
  return new Date(base.getTime() + days * DAY_MS).toISOString();
}

export function normalizeRemediation(raw, now = new Date()) {
  const base = {
    version: REMEDIATION_VERSION,
    status: 'active',
    failureCount: 0,
    independentEvidence: 0,
    successDays: [],
    lastFailureAt: null,
    lastIndependentSuccessAt: null,
    immediateInjectedAt: null,
    immediateItems: [],
    followupStage: 0,
    nextFollowupAt: nextFollowupAt(now, 0),
    resolvedAt: null
  };
  if (!raw || typeof raw !== 'object') return base;
  const result = {
    ...base,
    ...raw,
    version: REMEDIATION_VERSION,
    failureCount: Math.max(0, Number(raw.failureCount || 0)),
    independentEvidence: Math.max(0, Number(raw.independentEvidence || 0)),
    successDays: cleanDays(raw.successDays),
    immediateItems: Array.isArray(raw.immediateItems) ? raw.immediateItems.filter(Boolean).slice(-8) : []
  };
  if (result.status !== 'resolved') result.status = 'active';
  return result;
}

export function onFailure(raw, now = new Date()) {
  const next = normalizeRemediation(raw, now);
  const at = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  next.status = 'active';
  next.failureCount += 1;
  next.lastFailureAt = at;
  next.followupStage = 0;
  next.nextFollowupAt = nextFollowupAt(now, 0);
  next.resolvedAt = null;
  return next;
}

export function evidenceWeight({ contentType, sameAnchor = false, questionType = '', source = 'practice' } = {}) {
  if (sameAnchor) return 0.10;
  if (contentType === 'question') {
    if (source === 'exam') return 1.25;
    if (APPLICATION_TYPES.has(questionType)) return 1.20;
    if (OBJECTIVE_TYPES.has(questionType)) return 1.00;
    return 0.80;
  }
  if (contentType === 'card') return 0.45;
  return 0;
}

export function shouldResolve(remediation, now = new Date()) {
  const r = normalizeRemediation(remediation, now);
  const distinctDays = r.successDays.length;
  const failureTime = r.lastFailureAt ? new Date(r.lastFailureAt).getTime() : 0;
  const successTime = r.lastIndependentSuccessAt ? new Date(r.lastIndependentSuccessAt).getTime() : 0;
  return r.independentEvidence >= 1.5 && distinctDays >= 2 && successTime > failureTime;
}

export function onIndependentSuccess(raw, {
  day = localDayKey(new Date()),
  at = new Date().toISOString(),
  weight = 1
} = {}) {
  const now = new Date(at);
  const next = normalizeRemediation(raw, now);
  next.independentEvidence += Math.max(0, Number(weight || 0));
  next.successDays = cleanDays([...next.successDays, day]);
  next.lastIndependentSuccessAt = at;
  next.followupStage = clamp(next.followupStage + 1, 0, 3);
  next.nextFollowupAt = nextFollowupAt(now, next.followupStage);
  if (shouldResolve(next, now)) {
    next.status = 'resolved';
    next.resolvedAt = at;
    next.nextFollowupAt = null;
  }
  return next;
}

export function isFollowupDue(remediation, now = new Date()) {
  const r = normalizeRemediation(remediation, now);
  if (r.status === 'resolved' || !r.nextFollowupAt) return false;
  const due = new Date(r.nextFollowupAt).getTime();
  return Number.isFinite(due) && due <= (now instanceof Date ? now.getTime() : new Date(now).getTime());
}

export function immediateOffsets(count = 3) {
  return [3, 7, 11].slice(0, Math.max(0, Math.min(3, count)));
}

export function questionRole(type) {
  if (APPLICATION_TYPES.has(type)) return 'application';
  if (OBJECTIVE_TYPES.has(type)) return 'objective';
  return 'productive';
}

export function remediationPriority(mistake, now = new Date()) {
  const r = normalizeRemediation(mistake?.p19, now);
  if (r.status === 'resolved') return -Infinity;
  const ageHours = mistake?.occurredAt ? Math.max(0, ((now instanceof Date ? now : new Date(now)).getTime() - new Date(mistake.occurredAt).getTime()) / 3_600_000) : 999;
  const recency = Math.max(0, 1 - ageHours / 168);
  return r.failureCount * 0.7 + recency * 0.4 + (isFollowupDue(r, now) ? 1.2 : 0);
}
