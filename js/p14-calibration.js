const GUIDANCE_ID = 'p14-rating-guidance';
const BULLET_PREFIX = /^(?:[-–—•●▪◦]\s*|\d+[.)]\s*)/;
const LIST_QUESTION = /\b(welche|welcher|welches|nenn(?:e|en)|was gehört|woraus|schritte|reihenfolge|merkmale|symptome|ursachen|maßnahmen|massnahmen|punkte|faktoren|komplikationen|bestandteile|regeln|zeichen|aspekte|formen|arten|kriterien|indikationen|kontraindikationen|folgen)\b/i;

function cleanPoint(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(BULLET_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeHeading(value) {
  const text = cleanPoint(value);
  return text.endsWith(':') && text.length <= 80;
}

function isCompactPoint(value) {
  const text = cleanPoint(value);
  if (!text || text.length < 2 || text.length > 180) return false;
  const sentenceMarks = (text.match(/[.!?](?:\s|$)/g) || []).length;
  return sentenceMarks <= 1;
}

export function isRubricEligibleQuestion(questionText) {
  return LIST_QUESTION.test(String(questionText || '').replace(/\s+/g, ' ').trim());
}

export function extractKeyPoints(answerText) {
  const raw = String(answerText || '').replace(/\r/g, '').trim();
  if (!raw) return [];

  const hadExplicitBullets = /(?:^|\n)\s*(?:[-–—•●▪◦]|\d+[.)])\s+/m.test(raw);
  let lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  if (looksLikeHeading(lines[0]) && lines.length >= 3) lines = lines.slice(1);

  const points = lines.map(cleanPoint).filter(Boolean);
  if (points.length < 2 || points.length > 7) return [];
  if (!points.every(isCompactPoint)) return [];

  // Plain multi-line prose should not be promoted to an "essential points" rubric.
  // Without explicit bullets, require short list-like lines rather than paragraphs.
  if (!hadExplicitBullets && points.some((point) => point.length > 120)) return [];

  return points;
}

export function calibrationModel({ questionText = '', answerText = '' } = {}) {
  const keyPoints = isRubricEligibleQuestion(questionText) ? extractKeyPoints(answerText) : [];
  return {
    keyPoints,
    ratings: {
      1: 'Antwort falsch, nicht erinnert oder wesentliche Teile fehlten.',
      2: 'Grundidee richtig, aber mindestens ein wichtiger Punkt fehlte oder war unsicher.',
      3: 'Alle wesentlichen Punkte korrekt und ohne entscheidende Hilfe erinnert.'
    }
  };
}

function createKeyPointPanel(points) {
  const panel = document.createElement('section');
  panel.className = 'p14-keypoints';
  panel.setAttribute('aria-labelledby', 'p14-keypoints-title');

  const title = document.createElement('h3');
  title.id = 'p14-keypoints-title';
  title.textContent = 'Kernpunkte';

  const list = document.createElement('ul');
  for (const point of points) {
    const item = document.createElement('li');
    item.textContent = point;
    list.appendChild(item);
  }

  panel.append(title, list);
  return panel;
}

function createGuidance(model) {
  const guidance = document.createElement('p');
  guidance.id = GUIDANCE_ID;
  guidance.className = 'p14-rating-guidance';
  guidance.innerHTML = '<strong>Bewerte streng:</strong> Gewusst = vollständig · Unsicher = wichtiger Punkt fehlte · Nicht gewusst = falsch oder nicht erinnert';
  return guidance;
}

function calibrateVisibleCard(root = document) {
  const card = root.querySelector('.flashcard');
  const answer = card?.querySelector('.card-answer');
  const ratingGrid = card?.querySelector('.rating-grid');
  if (!card || !answer || !ratingGrid || card.dataset.p14Calibrated === 'true') return false;

  const question = card.querySelector('.card-question')?.innerText || '';
  const answerText = answer.innerText || answer.textContent || '';
  const model = calibrationModel({ questionText: question, answerText });

  if (model.keyPoints.length) {
    answer.insertAdjacentElement('afterend', createKeyPointPanel(model.keyPoints));
  }

  const guidance = createGuidance(model);
  ratingGrid.insertAdjacentElement('beforebegin', guidance);
  ratingGrid.setAttribute('aria-describedby', GUIDANCE_ID);

  const labels = model.ratings;
  ratingGrid.querySelectorAll('[data-rating]').forEach((button) => {
    const rating = Number(button.dataset.rating);
    if (!labels[rating]) return;
    button.setAttribute('aria-label', `${button.textContent.trim()} – ${labels[rating]}`);
    button.title = labels[rating];
  });

  card.dataset.p14Calibrated = 'true';
  return true;
}

function initCalibration() {
  const main = document.getElementById('main');
  if (!main) return;
  calibrateVisibleCard(main);
  const observer = new MutationObserver(() => calibrateVisibleCard(main));
  observer.observe(main, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') initCalibration();
