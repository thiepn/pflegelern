const DAY_MS = 86_400_000;

export const EXAM_PLAN_SETTING_KEY = 'examPlan';

export function localDayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (d.getFullYear() !== Number(match[1]) || d.getMonth() !== Number(match[2]) - 1 || d.getDate() !== Number(match[3])) return null;
  return d;
}

export function daysUntilExam(examDate, now = new Date()) {
  const target = parseLocalDate(examDate);
  if (!target) return null;
  const today = parseLocalDate(localDayKey(now));
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function examPhaseForDays(daysLeft) {
  if (!Number.isFinite(daysLeft)) return 'inactive';
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 1) return 'final_day';
  if (daysLeft <= 3) return 'final_days';
  if (daysLeft <= 7) return 'final_week';
  if (daysLeft <= 28) return 'medium';
  return 'long';
}

export function phasePolicy(phase) {
  return ({
    long: {
      label: 'Abdeckung + Wiederholungen',
      description: 'Lernstoff breit aufbauen und fällige Wiederholungen stabil halten.',
      scopeBoost: 0.10,
      replacementShare: 0.25,
      allowNew: 'all',
      questionScopeBoost: 0.25
    },
    medium: {
      label: 'Festigen + gemischt abrufen',
      description: 'Prüfungsstoff stärker gewichten, Schwächen schließen und weiter wiederholen.',
      scopeBoost: 0.18,
      replacementShare: 0.45,
      allowNew: 'all',
      questionScopeBoost: 0.45
    },
    final_week: {
      label: 'Schwächen + Prüfungsfragen',
      description: 'Kernstoff, Unsicherheiten und unabhängige Abrufaufgaben priorisieren.',
      scopeBoost: 0.28,
      replacementShare: 0.62,
      allowNew: 'core_important',
      questionScopeBoost: 0.70
    },
    final_days: {
      label: 'Kernstoff + Anwendung',
      description: 'Fast nur noch prüfungsnahen Kernstoff, Fehler und Anwendung trainieren.',
      scopeBoost: 0.36,
      replacementShare: 0.78,
      allowNew: 'core_only',
      questionScopeBoost: 0.90
    },
    final_day: {
      label: 'Leicht und gezielt wiederholen',
      description: 'Keine künstliche Lastspitze: fällige Karten, Schwächen und Kernfragen gezielt wiederholen.',
      scopeBoost: 0.40,
      replacementShare: 0.88,
      allowNew: 'none',
      questionScopeBoost: 1.00
    },
    expired: {
      label: 'Prüfungsdatum vorbei',
      description: 'Passe das Prüfungsdatum an, um die adaptive Planung weiterzuverwenden.',
      scopeBoost: 0,
      replacementShare: 0,
      allowNew: 'all',
      questionScopeBoost: 0
    },
    inactive: {
      label: 'Kein Prüfungsplan',
      description: '',
      scopeBoost: 0,
      replacementShare: 0,
      allowNew: 'all',
      questionScopeBoost: 0
    }
  })[phase] || null;
}

export function normalizeExamPlan(raw, validChapterIds = null) {
  if (!raw || typeof raw !== 'object') return null;
  const examDate = String(raw.examDate || '').trim();
  if (!parseLocalDate(examDate)) return null;
  const scopeType = raw.scopeType === 'chapters' ? 'chapters' : 'all';
  let chapterIds = Array.isArray(raw.chapterIds) ? [...new Set(raw.chapterIds.map(String).filter(Boolean))] : [];
  if (validChapterIds) {
    const allowed = validChapterIds instanceof Set ? validChapterIds : new Set(validChapterIds);
    chapterIds = chapterIds.filter((id) => allowed.has(id));
  }
  if (scopeType === 'chapters' && !chapterIds.length) return null;
  return {
    examDate,
    scopeType,
    chapterIds: scopeType === 'chapters' ? chapterIds : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

export function examPlanContext(plan, now = new Date()) {
  if (!plan) return { active: false, phase: 'inactive', daysLeft: null, policy: phasePolicy('inactive') };
  const daysLeft = daysUntilExam(plan.examDate, now);
  const phase = examPhaseForDays(daysLeft);
  return {
    active: phase !== 'inactive' && phase !== 'expired',
    expired: phase === 'expired',
    daysLeft,
    phase,
    policy: phasePolicy(phase),
    plan
  };
}

export function scopeLabel(plan, chapters = []) {
  if (!plan || plan.scopeType !== 'chapters') return 'Gesamtes Buch';
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const names = plan.chapterIds.map((id) => byId.get(id)).filter(Boolean).map((c) => `${c.number}. ${c.title}`);
  if (!names.length) return 'Ausgewählte Kapitel';
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
}

export function canIntroduceNew(importance, phase) {
  const mode = phasePolicy(phase)?.allowNew || 'all';
  if (mode === 'none') return false;
  if (mode === 'core_only') return importance === 'core';
  if (mode === 'core_important') return importance === 'core' || importance === 'important';
  return true;
}
