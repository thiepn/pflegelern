import { normalizeText } from './util.js';

async function fetchJson(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Inhalt konnte nicht geladen werden: ${url.pathname}`);
  return response.json();
}

export class ContentRepository {
  constructor(data) {
    Object.assign(this, data);
    this.chapterById = new Map(this.chapters.map((x) => [x.id, x]));
    this.sectionById = new Map(this.sections.map((x) => [x.id, x]));
    this.conceptById = new Map(this.concepts.map((x) => [x.id, x]));
    this.cardById = new Map(this.cards.map((x) => [x.id, x]));
    this.questionById = new Map(this.questions.map((x) => [x.id, x]));
    this.caseById = new Map(this.cases.map((x) => [x.id, x]));

    this.sectionsByChapter = new Map();
    this.conceptsBySection = new Map();
    this.cardsByConcept = new Map();
    this.cardsByChapter = new Map();
    this.cardsBySection = new Map();
    this.questionsByConcept = new Map();
    this.childSectionsByParent = new Map();
    this.parentSectionById = new Map();
    this.descendantSectionIdsCache = new Map();

    for (const section of this.sections) {
      if (!this.sectionsByChapter.has(section.chapterId)) this.sectionsByChapter.set(section.chapterId, []);
      this.sectionsByChapter.get(section.chapterId).push(section);
    }
    for (const list of this.sectionsByChapter.values()) list.sort(compareSectionNumbers);

    const sectionByNumber = new Map(this.sections.map((section) => [String(section.number), section]));
    for (const section of this.sections) {
      const parts = String(section.number).split('.');
      let parent = null;
      if (parts.length > 2) parent = sectionByNumber.get(parts.slice(0, -1).join('.')) || null;
      if (parent) {
        this.parentSectionById.set(section.id, parent);
        if (!this.childSectionsByParent.has(parent.id)) this.childSectionsByParent.set(parent.id, []);
        this.childSectionsByParent.get(parent.id).push(section);
      }
    }
    for (const list of this.childSectionsByParent.values()) list.sort(compareSectionNumbers);

    for (const concept of this.concepts) {
      if (!this.conceptsBySection.has(concept.sectionId)) this.conceptsBySection.set(concept.sectionId, []);
      this.conceptsBySection.get(concept.sectionId).push(concept);
    }

    for (const card of this.cards) {
      if (!this.cardsByConcept.has(card.conceptId)) this.cardsByConcept.set(card.conceptId, []);
      this.cardsByConcept.get(card.conceptId).push(card);
      const concept = this.conceptById.get(card.conceptId);
      const chapterId = concept?.chapterId || this.sectionById.get(concept?.sectionId)?.chapterId;
      const sectionId = concept?.sectionId;
      if (chapterId) {
        if (!this.cardsByChapter.has(chapterId)) this.cardsByChapter.set(chapterId, []);
        this.cardsByChapter.get(chapterId).push(card);
      }
      if (sectionId) {
        if (!this.cardsBySection.has(sectionId)) this.cardsBySection.set(sectionId, []);
        this.cardsBySection.get(sectionId).push(card);
      }
    }

    for (const question of this.questions) {
      for (const conceptId of question.conceptIds || []) {
        if (!this.questionsByConcept.has(conceptId)) this.questionsByConcept.set(conceptId, []);
        this.questionsByConcept.get(conceptId).push(question);
      }
    }

    this.chapterCardCounts = new Map(this.chapters.map((c) => [c.id, this.cardsByChapter.get(c.id)?.length || 0]));
  }

  static async load() {
    const [manifest, chapters, sections, concepts, cards, questions, cases] = await Promise.all([
      fetchJson('../data/manifest.json'),
      fetchJson('../data/chapters.json'),
      fetchJson('../data/sections.json'),
      fetchJson('../data/concepts.json'),
      fetchJson('../data/cards.json'),
      fetchJson('../data/questions.json'),
      fetchJson('../data/cases.json')
    ]);
    return new ContentRepository({ manifest, chapters, sections, concepts, cards, questions, cases });
  }

  cardContext(cardOrId) {
    const card = typeof cardOrId === 'string' ? this.cardById.get(cardOrId) : cardOrId;
    const concept = card ? this.conceptById.get(card.conceptId) : null;
    const section = concept ? this.sectionById.get(concept.sectionId) : null;
    const chapter = concept ? this.chapterById.get(concept.chapterId || section?.chapterId) : null;
    return { card, concept, section, chapter };
  }

  conceptChapter(conceptId) {
    const concept = this.conceptById.get(conceptId);
    if (!concept) return null;
    return this.chapterById.get(concept.chapterId || this.sectionById.get(concept.sectionId)?.chapterId) || null;
  }

  sectionParent(sectionId) {
    return this.parentSectionById.get(sectionId) || null;
  }

  directSections({ chapterId = null, sectionId = null } = {}) {
    if (sectionId) return this.childSectionsByParent.get(sectionId) || [];
    if (!chapterId) return [];
    return (this.sectionsByChapter.get(chapterId) || []).filter((section) => !this.parentSectionById.has(section.id));
  }

  descendantSectionIds(sectionId) {
    if (this.descendantSectionIdsCache.has(sectionId)) return this.descendantSectionIdsCache.get(sectionId);
    const ids = new Set([sectionId]);
    const stack = [...(this.childSectionsByParent.get(sectionId) || [])];
    while (stack.length) {
      const section = stack.pop();
      if (!section || ids.has(section.id)) continue;
      ids.add(section.id);
      stack.push(...(this.childSectionsByParent.get(section.id) || []));
    }
    this.descendantSectionIdsCache.set(sectionId, ids);
    return ids;
  }

  cardsForScope(scope = {}) {
    if (scope.cardIds) return scope.cardIds.map((id) => this.cardById.get(id)).filter(Boolean);
    if (scope.sectionId) {
      const ids = this.descendantSectionIds(scope.sectionId);
      return [...ids].flatMap((id) => this.cardsBySection.get(id) || []);
    }
    if (scope.chapterId) return this.cardsByChapter.get(scope.chapterId) || [];
    return this.cards;
  }

  questionsForScope(scope = {}) {
    if (!scope.chapterId && !scope.sectionId) return this.questions;
    const sectionIds = scope.sectionId ? this.descendantSectionIds(scope.sectionId) : null;
    return this.questions.filter((q) => (q.conceptIds || []).some((conceptId) => {
      const concept = this.conceptById.get(conceptId);
      if (!concept) return false;
      if (sectionIds && !sectionIds.has(concept.sectionId)) return false;
      const chapterId = concept.chapterId || this.sectionById.get(concept.sectionId)?.chapterId;
      return !scope.chapterId || chapterId === scope.chapterId;
    }));
  }

  topicLabelForCard(cardOrId) {
    const { section, chapter } = this.cardContext(cardOrId);
    if (section?.title) return section.title;
    return chapter?.title || 'Pflegewissen';
  }

  search(query, limit = 30) {
    const q = normalizeText(query);
    if (!q) return { chapters: [], sections: [], concepts: [], cards: [] };
    const score = (text) => {
      const normalized = normalizeText(text);
      if (normalized === q) return 100;
      if (normalized.startsWith(q)) return 80;
      if (normalized.includes(q)) return 60;
      const words = q.split(' ');
      const hits = words.filter((word) => normalized.includes(word)).length;
      return hits ? hits * 10 : 0;
    };
    const take = (items, textFn) => items
      .map((item) => ({ item, score: score(textFn(item)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.item);
    return {
      chapters: take(this.chapters, (x) => `${x.number} ${x.title}`).slice(0, 8),
      sections: take(this.sections, (x) => `${x.number} ${x.title}`).slice(0, 12),
      concepts: take(this.concepts, (x) => `${x.title} ${(x.tags || []).join(' ')}`).slice(0, 15),
      cards: take(this.cards, (x) => x.front).slice(0, 20)
    };
  }
}

function compareSectionNumbers(a, b) {
  const aa = String(a?.number ?? a ?? '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  const bb = String(b?.number ?? b ?? '').split('.').map((x) => Number.parseInt(x, 10) || 0);
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (aa[i] ?? -1) - (bb[i] ?? -1);
    if (diff) return diff;
  }
  return 0;
}
