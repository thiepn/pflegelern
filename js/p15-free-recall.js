import { ContentRepository } from './content.js';
import { StudyEngine } from './study-engine.js';

const MAX_PROMPT_LENGTH = 220;
const MAX_DRAFT_LENGTH = 320;
const DRAFT_PREFIX = 'pflegelern:p15:recall:';
const WEAK_THRESHOLD = 0.4;

const LONG_FORM_PROMPTS = /\b(ausführlich|detailliert|diskutier(?:e|en)|beurteil(?:e|en)|nimm stellung|nehmen sie stellung|vergleich(?:e|en).*(?:begründ|erläuter))\b/i;
const DEFINITION_PROMPTS = /^(?:was (?:ist|sind|bedeutet|bezeichnet)|wie (?:heißt|heissen|lautet)|wodurch ist .* definiert)\b/i;
const THRESHOLD_PROMPTS = /^(?:ab welche(?:r|m|n)?|bei welche(?:r|m|n)?|welchen .*bereich|wie viele|wie hoch|wie niedrig)\b/i;
const LOCATION_PROMPTS = /^(?:wo|woraus|wofür)\b/i;
const ENUMERATION_PROMPTS = /^(?:welche(?:r|s|n|m)?|welchen|nenn(?:e|en))\b/i;
const EXPLANATION_PROMPTS = /^(?:warum|weshalb|wieso|wodurch|wie (?:wirkt|funktioniert|verändert|entsteht))\b/i;

let runtimeContextPromise = null;

export function normalizeRecallPrompt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function classifyRecallPrompt(questionText) {
  const prompt = normalizeRecallPrompt(questionText);
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH || LONG_FORM_PROMPTS.test(prompt)) return null;
  if (DEFINITION_PROMPTS.test(prompt)) return 'definition';
  if (THRESHOLD_PROMPTS.test(prompt)) return 'threshold';
  if (LOCATION_PROMPTS.test(prompt)) return 'location';
  if (ENUMERATION_PROMPTS.test(prompt)) return 'enumeration';
  if (EXPLANATION_PROMPTS.test(prompt)) return 'explanation';
  return null;
}

export function hasOverconfidenceEvidence(conceptState = {}) {
  const selfRatedSuccess = Number(conceptState.flashCorrect || 0);
  const independentFailures = Number(conceptState.practiceWrong || 0) + Number(conceptState.examWrong || 0);
  return selfRatedSuccess >= 2 && independentFailures > 0;
}

export function selectFreeRecallEligibility({
  questionText = '',
  card = null,
  concept = null,
  weaknessScore = 0,
  conceptState = {}
} = {}) {
  const prompt = normalizeRecallPrompt(questionText);
  const kind = classifyRecallPrompt(prompt);
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH || LONG_FORM_PROMPTS.test(prompt)) {
    return { eligible: false, kind: null, reasons: [] };
  }

  const reasons = [];
  const weak = Number(weaknessScore || 0) >= WEAK_THRESHOLD;
  const overconfidence = hasOverconfidenceEvidence(conceptState);
  const core = concept?.importance === 'core';
  const definition = concept?.type === 'definition' || kind === 'definition';
  const structured = ['sequence', 'procedure'].includes(concept?.type) || card?.type === 'enumeration' || kind === 'enumeration';
  const exactFact = kind === 'threshold';
  const explanation = kind === 'explanation';

  if (core) reasons.push('core');
  if (weak) reasons.push('weak');
  if (definition) reasons.push('definition');
  if (structured) reasons.push('structured');
  if (overconfidence) reasons.push('overconfidence');
  if (exactFact) reasons.push('exact-fact');

  const eligible = Boolean(
    weak ||
    overconfidence ||
    definition ||
    structured ||
    exactFact ||
    (core && Boolean(kind)) ||
    (explanation && (core || concept?.type === 'principle'))
  );

  return { eligible, kind: kind || (structured ? 'enumeration' : definition ? 'definition' : 'free'), reasons };
}

export function shouldOfferFreeRecall(questionText) {
  return Boolean(classifyRecallPrompt(questionText));
}

export function recallDraftKey(cardId) {
  const id = String(cardId || '').trim();
  return id ? `${DRAFT_PREFIX}${id}` : '';
}

async function loadRuntimeContext() {
  const content = await ContentRepository.load();
  const engine = new StudyEngine(content);
  await engine.init();
  return { content, engine };
}

function getRuntimeContext() {
  runtimeContextPromise ||= loadRuntimeContext().catch((error) => {
    console.warn('P15-Kontext konnte nicht vollständig geladen werden:', error);
    return null;
  });
  return runtimeContextPromise;
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
  textarea.rows = kind === 'explanation' ? 3 : 2;
  textarea.maxLength = MAX_DRAFT_LENGTH;
  textarea.placeholder = kind === 'enumeration' ? 'Kernpunkte kurz notieren …' : kind === 'explanation' ? 'In eigenen Worten kurz erklären …' : 'Kurz aus dem Gedächtnis antworten …';
  textarea.value = draft;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('spellcheck', 'true');
  textarea.addEventListener('input', () => writeDraft(cardId, textarea.value));

  const hint = document.createElement('p');
  hint.className = 'p15-free-recall-hint';
  hint.textContent = 'Tippen ist freiwillig – du kannst auch nur im Kopf antworten. Keine automatische Bewertung.';

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

export async function enhanceFreeRecall(root = document, runtime = undefined) {
  const cardElement = root.querySelector('.flashcard');
  if (!cardElement || cardElement.dataset.p15RecallEnhanced === 'true' || cardElement.dataset.p15RecallPending === 'true') return false;
  cardElement.dataset.p15RecallPending = 'true';

  const questionText = cardElement.querySelector('.card-question')?.innerText || cardElement.querySelector('.card-question')?.textContent || '';
  const cardId = cardIdFrom(cardElement);
  if (!cardId) {
    delete cardElement.dataset.p15RecallPending;
    return false;
  }

  const context = runtime === undefined ? await getRuntimeContext() : runtime;
  if (!cardElement.isConnected && typeof document !== 'undefined') return false;

  let selection;
  if (context?.content && context?.engine) {
    const card = context.content.cardById.get(cardId) || null;
    const concept = card ? context.content.conceptById.get(card.conceptId) || null : null;
    selection = selectFreeRecallEligibility({
      questionText,
      card,
      concept,
      weaknessScore: concept ? context.engine.weaknessScore(concept.id) : 0,
      conceptState: concept ? context.engine.conceptState(concept.id) : {}
    });
  } else {
    const kind = classifyRecallPrompt(questionText);
    selection = { eligible: Boolean(kind), kind, reasons: kind ? ['prompt-fallback'] : [] };
  }

  if (!selection.eligible) {
    cardElement.dataset.p15RecallEnhanced = 'true';
    delete cardElement.dataset.p15RecallPending;
    return false;
  }

  const revealed = Boolean(cardElement.querySelector('.card-answer'));
  const draft = readDraft(cardId);

  if (!revealed) {
    const actions = cardElement.querySelector('.card-actions');
    if (!actions) {
      delete cardElement.dataset.p15RecallPending;
      return false;
    }
    actions.insertAdjacentElement('beforebegin', buildRecallComposer(cardId, selection.kind || 'free', draft));
  } else if (draft.trim()) {
    const divider = cardElement.querySelector('.card-divider');
    const answer = cardElement.querySelector('.card-answer');
    const comparison = buildRecallComparison(draft);
    if (divider) divider.insertAdjacentElement('beforebegin', comparison);
    else if (answer) answer.insertAdjacentElement('beforebegin', comparison);
  }

  cardElement.dataset.p15RecallReasons = selection.reasons.join(',');
  cardElement.dataset.p15RecallEnhanced = 'true';
  delete cardElement.dataset.p15RecallPending;
  return true;
}

function initSelectiveFreeRecall() {
  const main = document.getElementById('main');
  if (!main) return;
  void getRuntimeContext().then(() => enhanceFreeRecall(main));
  const observer = new MutationObserver(() => { void enhanceFreeRecall(main); });
  observer.observe(main, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const ratingButton = event.target.closest?.('[data-action="rate-card"]');
    if (!ratingButton) return;
    const card = ratingButton.closest('.flashcard');
    clearDraft(cardIdFrom(card));
    setTimeout(() => {
      void getRuntimeContext().then((context) => context?.engine?.init()).catch(() => {});
    }, 250);
  }, true);
}

if (typeof document !== 'undefined') initSelectiveFreeRecall();
