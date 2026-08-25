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

function resolveDraftIndex(textarea) {
  const shell = textarea?.closest?.('.study-page');
  const sessionId = currentStudySessionId();
  const engine = globalThis.__PFLEGE_P20_ENGINE__;
  if (!shell || !sessionId || !engine) return 0;
  // The active StudyEngine session object is private to app.js. The rendered page
  // always represents the persisted session's currentIndex, so use a cached index
  // placed on the textarea when available and otherwise resolve it during save.
  const value = Number(textarea.dataset.p25cSessionIndex);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function restoreVisibleDraft(root = document) {
  const textarea = root.querySelector?.('[data-study-text]');
  if (!textarea) return false;
  const sessionId = currentStudySessionId();
  if (!sessionId) return false;
  const engine = globalThis.__PFLEGE_P20_ENGINE__;
  const sessionIndex = Number(textarea.dataset.p25cSessionIndex);
  const fallbackIndex = Number.isFinite(sessionIndex) ? sessionIndex : 0;
  const draft = readDraft(sessionId, fallbackIndex);
  if (!draft) return false;
  if (!textarea.value && draft.text) textarea.value = draft.text;
  textarea.dataset.p25cDraftProtected = 'true';
  if (engine && !Number.isFinite(sessionIndex)) {
    void engine.getSession(sessionId).then((session) => {
      if (session && textarea.isConnected) textarea.dataset.p25cSessionIndex = String(session.currentIndex || 0);
    }).catch(() => {});
  }
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
      // Keep the recovered draft durable even if the learner refreshed before the
      // legacy debounced writer had a chance to run.
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
  const engine = globalThis.__PFLEGE_P20_ENGINE__;
  const knownIndex = Number(textarea.dataset.p25cSessionIndex);
  if (Number.isFinite(knownIndex)) {
    writeDraft(sessionId, knownIndex, textarea.value);
    return;
  }
  // Resolve once, then every subsequent keystroke is synchronous. This path is
  // only needed on the first keystroke of a freshly rendered free-response item.
  if (engine) {
    const value = textarea.value;
    void engine.getSession(sessionId).then((session) => {
      if (!session) return;
      const index = session.currentIndex || 0;
      if (textarea.isConnected) textarea.dataset.p25cSessionIndex = String(index);
      writeDraft(sessionId, index, value);
    }).catch(() => {});
  } else {
    writeDraft(sessionId, resolveDraftIndex(textarea), textarea.value);
  }
}

function labelInteractiveSurfaces(root = document) {
  root.querySelectorAll?.('[data-study-option], [data-exam-option], [data-study-match], [data-exam-match], [data-study-text]').forEach((control) => {
    control.dataset.p25cInput = 'ready';
  });
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

export { installEnginePatches, readDraft, writeDraft, clearDraft, restoreVisibleDraft };
