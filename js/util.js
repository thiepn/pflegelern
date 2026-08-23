export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function stableShuffle(array, seed = 1) {
  const copy = [...array];
  let state = hashString(String(seed)) || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9äöü]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function arraysEqualAsSets(a = [], b = []) {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((value, index) => value === bb[index]);
}

export function arraysEqual(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function diffDays(a, b) {
  return Math.max(0, (a.getTime() - b.getTime()) / 86_400_000);
}

export function formatMinutes(minutes) {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `ca. ${rounded} Minuten`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `ca. ${hours} Std. ${rest} Min.` : `ca. ${hours} Std.`;
}

export function formatDateTime(value) {
  if (!value) return '–';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function formatDate(value) {
  if (!value) return '–';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function percent(value) {
  return `${Math.round(clamp(value, 0, 1) * 100)} %`;
}

export function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function stripSourceNoise(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

export function firstSentence(text = '') {
  const clean = stripSourceNoise(text);
  const match = clean.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1] : clean;
}
