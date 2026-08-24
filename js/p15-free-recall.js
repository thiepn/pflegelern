const MAX_PROMPT_LENGTH = 220;
const MAX_DRAFT_LENGTH = 320;
const DRAFT_PREFIX = 'pflegelern:p15:recall:';

const EXCLUDED_PROMPTS = /\b(warum|erklär(?:e|en)|erläuter(?:e|n)|beschreib(?:e|en)|begründe|begründen|diskutier(?:e|en)|beurteil(?:e|en)|vergleich(?:e|en)|wie funktioniert|wie wirkt|wie verändert|wie entwickelt|was soll(?:en)? .* tun)\b/i;
const DEFINITION_PROMPTS = /^(?:was (?:ist|sind|bedeutet|bezeichnet)|wie (?:heißt|heissen|heißt es|lautet)|wodurch ist .* definiert)\b/i;
const THRESHOLD_PROMPTS = /^(?:ab welche(?:r|m|n)?|bei welche(?:r|m|n)?|welchen .*bereich|wie viele|wie hoch|wie niedrig)\b/i;
const LOCATION_PROMPTS = /^(?:wo|woraus|wodurch|wofür)\b/i;
const ENUMERATION_PROMPTS = /^(?:welche(?:r|s|n|m)?|welchen|nenn(?:e|en))\b/i;

export function normalizeRecallPrompt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function classifyRecallPrompt(questionText) {
  const prompt = normalizeRecallPrompt(questionText);
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH || EXCLUDED_PROMPTS.test(prompt)) return null;
  if (DEFINITION_PROMPTS.test(prompt)) return 'definition';
  if (THRESHOLD_PROMPTS.test(prompt)) return 'threshold';
  if (LOCATION_PROMPTS.test(prompt)) return 'location';
  if (ENUMERATION_PROMPTS.test(prompt)) return 'enumeration';
  return null;
}

export function shouldOfferFreeRecall(questionText) {
  return Boolean(classifyRecallPrompt(questionText));
}

export function recallDraftKey(cardId) {
  const id = String(cardId || '').trim();
  return id ? `${DRAFT_PREFIX}${id}` : '';
}

function cardIdFrom(card) {
  return card?.querySelector('[data-card-id]')?.dataset.cardId || '';
}

function readDraft(cardId) {
  const key = recallDraftKey(cardId);
  if (!key || typeof sessionStorage === 'undefined') return '';
  try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
}

function writeDraft(cardId, value) {
  const key = recallDraftKey(cardId);
  if (!key || typeof sessionStorage === 'undefined') return;
  const draft = String(value || '').slice(0, MAX_DRAFT_LENGTH);
  try {
    if (draft.trim()) sessionStorage.setItem(key, draft);
    else sessionStorage.removeItem(key);
  } catch {}
}

function clearDraft(cardId) {
  const key = recallDraftKey(cardId);
  if (!key || typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(key); } catch {}
}

function buildRecallComposer(cardId, kind, draft) {
  const section = document.createElement('section');
  section.className = 'p15-free-recall';
  section.dataset.p15RecallKind = kind;

  const label = document.createElement('label');
  label.className = 'p15-free-recall-label';
  label.htmlFor = 'p15-free-recall-input';
  label.textContent = 'Eigene Antwort (optional)';

  const textarea = document.createElement('textarea');
  textarea.id = 'p15-free-recall-input';
  textarea.className = 'p15-free-recall-input';
  textarea.rows = 2;
  textarea.maxLength = MAX_DRAFT_LENGTH;
  textarea.placeholder = kind === 'enumeration' ? 'Kernpunkte kurz notieren …' : 'Kurz aus dem Gedächtnis antworten …';
  textarea.value = draft;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('spellcheck', 'true');
  textarea.addEventListener('input', () => writeDraft(cardId, textarea.value));

  const hint = document.createElement('p');
  hint.className = 'p15-free-recall-hint';
  hint.textContent = 'Keine automatische Bewertung. Du kannst die Lösung jederzeit direkt anzeigen.';

  section.append(label, textarea, hint);
  return section;
}

function buildRecallComparison(draft) {
  const section = document.createElement('section');
  section.className = 'p15-recall-comparison';
  section.setAttribute('aria-labelledby', 'p15-recall-comparison-title');

  const title = document.createElement('h3');
  title.id = 'p15-recall-comparison-title';
  title.textContent = 'Deine Erinnerung';

  const text = document.createElement('p');
  text.textContent = draft;

  section.append(title, text);
  return section;
}

export function enhanceFreeRecall(root = document) {
  const card = root.querySelector('.flashcard');
  if (!card || card.dataset.p15RecallEnhanced === 'true') return false;

  const questionText = card.querySelector('.card-question')?.innerText || card.querySelector('.card-question')?.textContent || '';
  const kind = classifyRecallPrompt(questionText);
  if (!kind) {
    card.dataset.p15RecallEnhanced = 'true';
    return false;
  }

  const cardId = cardIdFrom(card);
  if (!cardId) return false;
  const revealed = Boolean(card.querySelector('.card-answer'));
  const draft = readDraft(cardId);

  if (!revealed) {
    const actions = card.querySelector('.card-actions');
    if (!actions) return false;
    actions.insertAdjacentElement('beforebegin', buildRecallComposer(cardId, kind, draft));
  } else if (draft.trim()) {
    const divider = card.querySelector('.card-divider');
    const answer = card.querySelector('.card-answer');
    const comparison = buildRecallComparison(draft);
    if (divider) divider.insertAdjacentElement('beforebegin', comparison);
    else if (answer) answer.insertAdjacentElement('beforebegin', comparison);
  }

  card.dataset.p15RecallEnhanced = 'true';
  return true;
}

function initSelectiveFreeRecall() {
  const main = document.getElementById('main');
  if (!main) return;
  enhanceFreeRecall(main);
  const observer = new MutationObserver(() => enhanceFreeRecall(main));
  observer.observe(main, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const ratingButton = event.target.closest?.('[data-action="rate-card"]');
    if (!ratingButton) return;
    const card = ratingButton.closest('.flashcard');
    clearDraft(cardIdFrom(card));
  }, true);
}

if (typeof document !== 'undefined') initSelectiveFreeRecall();
