export const QUESTION_INPUT_TYPES = Object.freeze([
  'single_choice',
  'multiple_choice',
  'ordering',
  'matching',
  'short_answer',
  'clinical_case'
]);

export function splitMatchingPairText(value) {
  const parts = String(value ?? '').split('↔');
  if (parts.length !== 2) return null;
  const left = parts[0].trim();
  const right = parts[1].trim();
  if (!left || !right) return null;
  return { left, right };
}

function uniqueStrings(values = []) {
  const list = values.map((value) => String(value));
  return list.length === new Set(list).size;
}

export function validateQuestionInputContract(question = {}) {
  const issues = [];
  const type = String(question.type || '');
  if (!QUESTION_INPUT_TYPES.includes(type)) issues.push(`unsupported-type:${type || 'missing'}`);
  if (!String(question.prompt || '').trim()) issues.push('missing-prompt');

  const options = Array.isArray(question.options) ? question.options : [];
  const optionIds = options.map((option) => String(option?.id ?? '')).filter(Boolean);
  if (!uniqueStrings(optionIds)) issues.push('duplicate-option-id');
  if (options.some((option) => !String(option?.id ?? '').trim())) issues.push('missing-option-id');

  if (type === 'single_choice' || type === 'multiple_choice') {
    if (options.length < 2) issues.push('too-few-options');
    const correct = Array.isArray(question.correct) ? question.correct.map(String) : [];
    if (!correct.length) issues.push('missing-correct-options');
    if (type === 'single_choice' && correct.length !== 1) issues.push('single-choice-correct-count');
    if (!uniqueStrings(correct)) issues.push('duplicate-correct-option');
    if (correct.some((id) => !optionIds.includes(id))) issues.push('correct-option-missing');
  } else if (type === 'ordering') {
    if (options.length < 2) issues.push('too-few-order-items');
    const correct = Array.isArray(question.correct) ? question.correct.map(String) : [];
    if (correct.length !== optionIds.length) issues.push('ordering-length-mismatch');
    if (!uniqueStrings(correct)) issues.push('duplicate-order-item');
    if (correct.some((id) => !optionIds.includes(id))) issues.push('ordering-item-missing');
  } else if (type === 'matching') {
    if (options.length < 2) issues.push('too-few-matching-pairs');
    const pairs = options.map((option) => splitMatchingPairText(option?.text));
    if (pairs.some((pair) => !pair)) issues.push('invalid-matching-pair');
    const validPairs = pairs.filter(Boolean);
    if (!uniqueStrings(validPairs.map((pair) => pair.left))) issues.push('duplicate-matching-left');
    if (!uniqueStrings(validPairs.map((pair) => pair.right))) issues.push('duplicate-matching-right');
  } else if (type === 'short_answer' || type === 'clinical_case') {
    if (!String(question.correctText || question.explanation || '').trim()) issues.push('missing-reference-answer');
  }

  return { valid: issues.length === 0, type, issues };
}

export function studyDraftStorageKey(sessionId) {
  const id = String(sessionId || '').trim();
  return id ? `pflegelern:p25c:study-text:${id}` : '';
}

export function normalizeDraftRecord(value, fallbackIndex = 0) {
  if (typeof value === 'string') return { index: Number(fallbackIndex) || 0, text: value, updatedAt: null };
  if (!value || typeof value !== 'object') return null;
  const index = Math.max(0, Math.floor(Number(value.index) || 0));
  return {
    index,
    text: String(value.text ?? ''),
    updatedAt: value.updatedAt || null
  };
}

export function mergeStudyTextDraft(session, draft) {
  if (!session || !draft) return false;
  const normalized = normalizeDraftRecord(draft, session.currentIndex || 0);
  if (!normalized) return false;
  session.responses ||= {};
  const key = String(normalized.index);
  session.responses[key] ||= {};
  if (session.responses[key].text === normalized.text) return false;
  session.responses[key].text = normalized.text;
  return true;
}
