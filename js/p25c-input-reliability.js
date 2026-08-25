import { StudyEngine } from './study-engine.js';
import {
  mergeStudyTextDraft,
  normalizeDraftRecord,
  studyDraftStorageKey
} from './p25c-input-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p25c.answerInputReliabilityPatched');
const MAX_DRAFT_LENGTH = 12_000;
let started = false;

function currentStudySessionId() {
  const params = new URLSearchParams(location.search);
  return params.get('view') === 'study' ? params.get('session') || '' : '';
}

function renderedSessionIndex() {
  const text = document.querySelector('.study-counter')?.textContent || '';
  const match = text.match(/^\s*(\d+)\s*\/\s*\d+/);
  return match ? Math.max(0, Number(match[1]) - 1) : null;
}

function readDraft(sessionId, fallbackIndex = 0) {
  const key = studyDraftStorageKey(sessionId);
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    try { return normalizeDraftRecord(JSON.parse(raw), fallbackIndex); }
    catch { return normalizeDraftRecord(raw, fallbackIndex); }
  } catch {
    return null;
  }
}

function writeDraft(sessionId, index, text) {
  const key = studyDraftStorageKey(sessionId);
  if (!key) return;
  const record = {
    index: Math.max(0, Math.floor(Number(index) || 0)),
    text: String(text ?? '').slice(0, MAX_DRAFT_LENGTH),
    updatedAt: new Date().toISOString()
  };
  try { sessionStorage.setItem(key, JSON.stringify(record)); } catch {}
}

function clearDraft(sessionId) {
  const key = studyDraftStorageKey(sessionId);
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch {}
}

function restoreVisibleDraft(root = document) {
  const textarea = root.querySelector?.('[data-study-text]');
  if (!textarea) return false;
  const sessionId = currentStudySessionId();
  if (!sessionId) return false;

  const renderedIndex = renderedSessionIndex();
  if (renderedIndex !== null) textarea.dataset.p25cSessionIndex = String(renderedIndex);
  const fallbackIndex = renderedIndex ?? Number(textarea.dataset.p25cSessionIndex) || 0;
  const draft = readDraft(sessionId, fallbackIndex);
  if (!draft || draft.index !== fallbackIndex) return false;

  if (!textarea.value && draft.text) textarea.value = draft.text;
  textarea.dataset.p25cDraftProtected = 'true';
  return true;
}

function installEnginePatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousGetSession = StudyEngine.prototype.getSession;
  StudyEngine.prototype.getSession = async function p25cGetSession(id) {
    const session = await previousGetSession.call(this, id);
    if (!session) return session;
    const draft = readDraft(id, session.currentIndex || 0);
    if (draft) {
      mergeStudyTextDraft(session, draft);
      // A refresh/navigation can happen before app.js's legacy 180 ms debounce.
      // Persist the recovered draft immediately when the session is next loaded.
      await this.saveSession(session);
    }
    return session;
  };

  const previousSaveSession = StudyEngine.prototype.saveSession;
  StudyEngine.prototype.saveSession = async function p25cSaveSession(session) {
    if (!session) return previousSaveSession.call(this, session);
    const draft = readDraft(session.id, session.currentIndex || 0);
    if (draft) mergeStudyTextDraft(session, draft);
    const saved = await previousSaveSession.call(this, session);
    if (draft) {
      const response = saved?.responses?.[String(draft.index)];
      if (response && response.text === draft.text) clearDraft(session.id);
    }
    return saved;
  };
}

function captureStudyText(event) {
  const textarea = event.target?.closest?.('[data-study-text]');
  if (!textarea) return;
  const sessionId = currentStudySessionId();
  if (!sessionId) return;

  const cached = Number(textarea.dataset.p25cSessionIndex);
  const index = Number.isFinite(cached) ? cached : (renderedSessionIndex() ?? 0);
  textarea.dataset.p25cSessionIndex = String(index);

  // This is intentionally synchronous. It closes the exact race where a learner
  // types and immediately checks, exits, navigates or reloads before the existing
  // debounced IndexedDB save gets to run.
  writeDraft(sessionId, index, textarea.value);
}

function labelInteractiveSurfaces(root = document) {
  root.querySelectorAll?.('[data-study-option], [data-exam-option], [data-study-match], [data-exam-match], [data-study-text]').forEach((control) => {
    control.dataset.p25cInput = 'ready';
  });
  const textarea = root.querySelector?.('[data-study-text]');
  const index = renderedSessionIndex();
  if (textarea && index !== null) textarea.dataset.p25cSessionIndex = String(index);
  restoreVisibleDraft(root);
}

export function initAnswerInputReliability() {
  if (started || typeof document === 'undefined') return;
  started = true;
  installEnginePatches();
  document.addEventListener('input', captureStudyText, true);
  const main = document.getElementById('main');
  if (main) {
    labelInteractiveSurfaces(main);
    const observer = new MutationObserver(() => labelInteractiveSurfaces(main));
    observer.observe(main, { childList: true, subtree: true });
  }
}

export { installEnginePatches, readDraft, writeDraft, clearDraft, restoreVisibleDraft, renderedSessionIndex };
