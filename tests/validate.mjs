import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentRepository } from '../js/content.js';
import { StudyEngine, AUTO_GRADABLE } from '../js/study-engine.js';
import { Rating, createFsrsState, forgettingCurve, scheduleReview } from '../js/fsrs.js';
import { DB_VERSION, STORE_DEFS, validateBackup } from '../js/storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const data = {
  manifest: read('data/manifest.json'), chapters: read('data/chapters.json'), sections: read('data/sections.json'),
  concepts: read('data/concepts.json'), cards: read('data/cards.json'), questions: read('data/questions.json'), cases: read('data/cases.json')
};
const errors = [];
const assert = (cond, msg) => { if (!cond) errors.push(msg); };
const uniqueIds = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    assert(item?.id, `${label}: item without id`);
    if (seen.has(item?.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seen.add(item?.id);
  }
  return seen;
};

// Core schema/reference graph.
const chapterIds = uniqueIds(data.chapters, 'chapters');
const sectionIds = uniqueIds(data.sections, 'sections');
const conceptIds = uniqueIds(data.concepts, 'concepts');
uniqueIds(data.cards, 'cards');
const questionIds = uniqueIds(data.questions, 'questions');
uniqueIds(data.cases, 'cases');
for (const s of data.sections) assert(chapterIds.has(s.chapterId), `section ${s.id}: missing chapter ${s.chapterId}`);
for (const c of data.concepts) {
  assert(c.sectionId || c.chapterId, `concept ${c.id}: missing both section and chapter`);
  if (c.sectionId) assert(sectionIds.has(c.sectionId), `concept ${c.id}: missing section ${c.sectionId}`);
  if (c.chapterId) assert(chapterIds.has(c.chapterId), `concept ${c.id}: missing explicit chapter ${c.chapterId}`);
}
for (const c of data.cards) {
  assert(conceptIds.has(c.conceptId), `card ${c.id}: missing concept ${c.conceptId}`);
  assert(String(c.front || '').trim(), `card ${c.id}: empty front`);
  assert(String(c.back || '').trim(), `card ${c.id}: empty back`);
}
for (const q of data.questions) {
  assert(Array.isArray(q.conceptIds) && q.conceptIds.length, `question ${q.id}: no conceptIds`);
  for (const id of q.conceptIds || []) assert(conceptIds.has(id), `question ${q.id}: missing concept ${id}`);
  assert(String(q.prompt || '').trim(), `question ${q.id}: empty prompt`);
  if (AUTO_GRADABLE.has(q.type)) {
    assert(Array.isArray(q.options) && q.options.length >= 2, `question ${q.id}: insufficient options`);
    const optionIds = new Set((q.options || []).map(o => o.id));
    assert(optionIds.size === (q.options || []).length, `question ${q.id}: duplicate option ids`);
    if (q.type !== 'matching') {
      assert(Array.isArray(q.correct) && q.correct.length, `question ${q.id}: missing correct answers`);
      for (const id of q.correct || []) assert(optionIds.has(id), `question ${q.id}: invalid correct option ${id}`);
    }
  }
}
for (const c of data.cases) for (const qid of c.questions || []) assert(questionIds.has(qid), `case ${c.id}: missing question ${qid}`);

// Locked P10 final content counts.
const repo = new ContentRepository(data);
const expected = { chapters: 66, sections: 1361, concepts: 2089, cards: 2094, questions: 85, cases: 18 };
for (const [key, value] of Object.entries(expected)) assert(repo[key].length === value, `expected ${value} ${key}, got ${repo[key].length}`);
assert(data.manifest.phase === 'P10', `manifest phase is ${data.manifest.phase}`);
assert(data.manifest.status === 'released', `manifest status is ${data.manifest.status}`);

// Textbook hierarchy reconstruction.
const sectionByNumber = new Map(data.sections.map((x) => [String(x.number), x]));
for (const s of data.sections) {
  const parts = String(s.number).split('.');
  if (parts.length > 2) {
    const parent = parts.slice(0, -1).join('.');
    assert(sectionByNumber.has(parent), `section ${s.number}: missing immediate parent ${parent}`);
  }
}
for (const bad of ['28.9', '59.16', '36.3–36.4']) assert(!sectionByNumber.has(bad), `known false/synthetic section still exists: ${bad}`);
for (const [num, title] of [
  ['6.1','Grundlagen'], ['8.1','Einleitung'], ['19.1','Essen und trinken anreichen'], ['30.1','Grundlagen'],
  ['36.1','Grundlagen'], ['37.2','Grundlagen'], ['47.1','Grundlagen'],
  ['36.4.2','Hinweise zu verschiedenen Applikationsformen'], ['37.2.5','Akuter und chronischer Schmerz']
]) assert(sectionByNumber.get(num)?.title === title, `${num}: title mismatch (${sectionByNumber.get(num)?.title || 'missing'})`);

// Descendant scope must include child content.
const parent364 = sectionByNumber.get('36.4');
const child3642 = sectionByNumber.get('36.4.2');
assert(parent364 && child3642, '36.4 hierarchy missing');
if (parent364 && child3642) {
  const scoped = repo.cardsForScope({ sectionId: parent364.id });
  const childCards = repo.cardsBySection.get(child3642.id) || [];
  assert(childCards.length > 0, '36.4.2 has no cards');
  const scopedIds = new Set(scoped.map((x) => x.id));
  assert(childCards.every((x) => scopedIds.has(x.id)), 'parent 36.4 scope does not include all 36.4.2 cards');
}

// Learner-facing content hygiene.
const controlRe = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/;
const frontNorm = new Set();
for (const card of data.cards) {
  assert(!controlRe.test(`${card.front}\n${card.back}`), `card ${card.id}: control character leakage`);
  assert(!/Aspekt\s+[12]/i.test(card.front), `card ${card.id}: machine placeholder remains`);
  assert(!/^Was gilt bei „.+“ im Zusammenhang mit „.+“\?/i.test(card.front), `card ${card.id}: old machine prompt remains`);
  const norm = String(card.front).toLocaleLowerCase('de-DE').normalize('NFKC').replace(/\s+/g,' ').trim();
  assert(!frontNorm.has(norm), `duplicate normalized card front: ${card.id}`);
  frontNorm.add(norm);
}
for (const q of data.questions) assert(!controlRe.test(`${q.prompt}\n${q.explanation || ''}`), `question ${q.id}: control character leakage`);

// Fresh-profile session behavior: simple surface, CORE-first, no fake weakness.
const engine = new StudyEngine(repo);
assert(engine.hasWeaknessEvidence() === false, 'fresh profile incorrectly has weakness evidence');
const preview = engine.recommendedPreview();
assert(preview.total > 0 && preview.total <= 22, `recommended preview count invalid: ${preview.total}`);
const selectedCardImportances = preview.items.filter((x) => x.kind === 'card').map((x) => repo.conceptById.get(repo.cardById.get(x.id)?.conceptId)?.importance);
assert(selectedCardImportances.length > 0, 'fresh recommended preview has no cards');
assert(selectedCardImportances.every((x) => x === 'core'), `fresh recommended cards are not CORE-only: ${selectedCardImportances.join(', ')}`);
const itemConcepts = (item) => item.kind === 'card' ? [repo.cardById.get(item.id)?.conceptId].filter(Boolean) : (repo.questionById.get(item.id)?.conceptIds || []);
let leakConflicts = 0;
for (let i = 0; i < preview.items.length; i++) {
  const ids = new Set(itemConcepts(preview.items[i]));
  for (let j = Math.max(0, i - 3); j < i; j++) if (itemConcepts(preview.items[j]).some((id) => ids.has(id))) leakConflicts += 1;
}
assert(leakConflicts === 0, `recommended queue has ${leakConflicts} nearby concept collision(s)`);

// FSRS invariants.
const fresh = createFsrsState('test');
const reviewed = scheduleReview(fresh, Rating.GOOD, new Date('2026-08-23T00:00:00Z'));
assert(reviewed.reps === 1, 'FSRS first review did not increment reps');
assert(new Date(reviewed.due) > new Date('2026-08-23T00:00:00Z'), 'FSRS due date is not in the future');
assert(Math.abs(forgettingCurve(10, 10) - 0.9) < 1e-9, `FSRS forgetting curve invariant failed: ${forgettingCurve(10,10)}`);

// Persistence migration / backup safety.
assert(DB_VERSION === 2, `IndexedDB expected v2, got v${DB_VERSION}`);
assert(STORE_DEFS.questionHistory?.keyPath === 'questionId', 'questionHistory store missing');
let acceptedBackup = false;
try { validateBackup({ app:'pflegelern', backupVersion:1, stores:{ cardState:[{cardId:'x'}] } }); acceptedBackup = true; } catch {}
assert(acceptedBackup, 'valid minimal backup rejected');
let rejectedBackup = false;
try { validateBackup({ app:'pflegelern', backupVersion:1, stores:{ cardState:[{}] } }); } catch { rejectedBackup = true; }
assert(rejectedBackup, 'invalid backup was not rejected');

// UI/static accessibility and design gates.
const index = text('index.html');
const appJs = text('js/app.js');
const allCss = ['css/tokens.css','css/base.css','css/layout.css','css/components.css','css/study.css','css/responsive.css'].map(text).join('\n');
assert(index.includes('aria-labelledby="confirm-title"') && index.includes('aria-describedby="confirm-message"'), 'confirm dialog labelling missing');
assert(appJs.includes('role="group" aria-label="Wie gut konntest du dich erinnern?"'), 'rating control group semantics missing');
assert(appJs.includes('data-action="move-exam-order"') && appJs.includes('aria-label="Nach oben"') && appJs.includes('aria-label="Nach unten"'), 'exam ordering aria labels missing');
assert(!/linear-gradient|radial-gradient|conic-gradient/i.test(allCss), 'gradient remains in production CSS');
assert(/\.order-buttons button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s.test(allCss), 'ordering buttons are smaller than 44px');
assert(/\.segmented button\s*\{[^}]*min-height:\s*44px;/s.test(allCss), 'segmented controls are smaller than 44px');
assert(/\.bottom-nav-link\s*\{[^}]*min-height:\s*48px;/s.test(allCss), 'bottom navigation touch target is not hardened');
assert(allCss.includes('env(safe-area-inset-bottom)'), 'mobile safe-area padding missing');
assert(allCss.includes('overflow-x: hidden'), 'horizontal overflow safeguard missing');

// App behavior hardening presence.
assert(appJs.includes("data-action=\"continue-exam\""), 'open-exam recovery action missing');
assert(appJs.includes("data-action=\"practice-exam-errors\""), 'exam-error practice action missing');
assert(appJs.includes('content.directSections({ sectionId: id })'), 'hierarchical subtopic navigation missing');
assert(appJs.includes("resultSection('Begriffe'"), 'concept search results missing');
assert(appJs.includes('engine.pauseSession(activeSession)'), 'study pause handling missing');
assert(appJs.includes('(session.activeMs || 0)'), 'active-time history calculation missing');

// PWA/static assets.
const sw = text('service-worker.js');
assert(sw.includes("pflegelern-v1.0.0"), 'service-worker cache version not final P10');
assert(sw.includes("event.request.mode === 'navigate'"), 'navigation fallback missing in service worker');
const assetMatches = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((x) => x && x !== '/');
for (const asset of assetMatches) assert(fs.existsSync(path.join(root, asset)), `service worker asset missing: ${asset}`);
for (const m of index.matchAll(/(?:href|src)="\.\/([^"?#]+)[^"]*"/g)) assert(fs.existsSync(path.join(root, m[1])), `index asset missing: ${m[1]}`);
const webmanifest = read('manifest.webmanifest');
for (const icon of webmanifest.icons || []) {
  const rel = String(icon.src || '').replace(/^\.\//, '');
  assert(rel && fs.existsSync(path.join(root, rel)), `manifest icon missing: ${icon.src}`);
}

const summary = {
  ...Object.fromEntries(Object.keys(expected).map((k) => [k, data[k].length])),
  recommendedPreview: { total: preview.total, reviews: preview.reviews, newCards: preview.newCards, questions: preview.questions, minutes: preview.minutes },
  freshCardImportance: selectedCardImportances,
  nearbyConceptCollisions: leakConflicts,
  indexedDbVersion: DB_VERSION,
  errors: errors.length
};
console.log(JSON.stringify(summary, null, 2));
if (errors.length) {
  console.error('\nValidation failures:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
