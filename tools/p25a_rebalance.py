#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter, defaultdict, deque
from pathlib import Path

ROOT = Path(os.environ.get('PFLEGELERN_ROOT', Path(__file__).resolve().parents[1]))
DATA = ROOT / 'data'
CERT = 'p25a-source-derived-v1'
SHORT_TARGET = 320
MATCHING_TARGET = 80
ORDERING_TARGET = 40


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def dump(path: Path, value, *, pretty=False):
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    else:
        text = json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n'
    path.write_text(text, encoding='utf-8')


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def normalized(value):
    return clean(value).casefold()


def canonical_hash(items):
    payload = json.dumps(items, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def stable_key(value):
    return hashlib.sha1(str(value).encode('utf-8')).hexdigest()


def importance_rank(concept):
    return {'core': 0, 'important': 1, 'detail': 2}.get(str(concept.get('importance', 'detail')), 3)


def chapter_for_concept(concept, section_by_id):
    return concept.get('chapterId') or section_by_id.get(concept.get('sectionId'), {}).get('chapterId')


def round_robin(groups, target):
    queues = {key: deque(items) for key, items in groups.items() if items}
    keys = sorted(queues, key=str)
    result = []
    while len(result) < target and keys:
        next_keys = []
        for key in keys:
            q = queues[key]
            if q and len(result) < target:
                result.append(q.popleft())
            if q:
                next_keys.append(key)
        keys = next_keys
    return result


def parse_steps(text):
    raw = str(text or '').replace('\r\n', '\n').replace('\r', '\n').strip()
    if not raw:
        return []

    def validate(parts):
        out = [clean(re.sub(r'^(?:[-–—•*]|\d+[.)])\s*', '', p)) for p in parts]
        out = [p for p in out if p]
        if not (3 <= len(out) <= 7):
            return []
        if len({normalized(p) for p in out}) != len(out):
            return []
        if any(len(p) < 4 or len(p) > 180 for p in out):
            return []
        return out

    lines = [line for line in raw.split('\n') if clean(line)]
    if len(lines) >= 3:
        checked = validate(lines)
        if checked:
            return checked

    if '→' in raw:
        checked = validate(raw.split('→'))
        if checked:
            return checked

    numbered = re.split(r'(?:^|\s)(?:\d+[.)])\s+', raw)
    checked = validate(numbered)
    if checked:
        return checked

    # Only sequence/procedure concepts call this function. Semicolons are accepted
    # when they clearly delimit several concise steps rather than prose clauses.
    if raw.count(';') >= 2:
        checked = validate(raw.split(';'))
        if checked:
            return checked
    return []


def build_short_answers(base_questions, cards, concept_by_id, section_by_id, existing_prompts):
    by_chapter = defaultdict(list)
    seen_concepts = set()
    for card in cards:
        concept_id = card.get('conceptId')
        concept = concept_by_id.get(concept_id)
        if not concept or concept_id in seen_concepts:
            continue
        front = clean(card.get('front'))
        back = str(card.get('back') or '').strip()
        if not (12 <= len(front) <= 240 and 8 <= len(clean(back)) <= 900):
            continue
        if normalized(front) in existing_prompts:
            continue
        chapter_id = chapter_for_concept(concept, section_by_id)
        if not chapter_id:
            continue
        by_chapter[chapter_id].append((importance_rank(concept), stable_key(card.get('id')), card, concept))
        seen_concepts.add(concept_id)

    for chapter_id in by_chapter:
        by_chapter[chapter_id].sort(key=lambda row: (row[0], row[1]))

    selected = round_robin(by_chapter, SHORT_TARGET)
    result = []
    for _, _, card, concept in selected:
        prompt = clean(card['front'])
        answer = str(card['back']).strip()
        qid = f"p25a-sa-{stable_key(card['id'])[:14]}"
        result.append({
            'id': qid,
            'conceptIds': [card['conceptId']],
            'type': 'short_answer',
            'prompt': prompt,
            'correctText': answer,
            'explanation': answer,
            'sourceKind': 'card',
            'sourceIds': [card['id']],
            'certification': CERT,
            'difficulty': 2 if concept.get('importance') != 'detail' else 1,
            'bloom': 'recall',
            'competency': 'K1'
        })
        existing_prompts.add(normalized(prompt))
    return result


def build_matching(cards, concept_by_id, section_by_id, chapter_by_id, existing_prompts):
    by_section = defaultdict(list)
    for card in cards:
        concept = concept_by_id.get(card.get('conceptId'))
        if not concept:
            continue
        section_id = concept.get('sectionId')
        section = section_by_id.get(section_id)
        if not section:
            continue
        left = clean(concept.get('title'))
        right = clean(card.get('back'))
        if not (4 <= len(left) <= 80 and 18 <= len(right) <= 125):
            continue
        if '↔' in left or '↔' in right or '\n' in str(card.get('back') or ''):
            continue
        if normalized(left) == normalized(right):
            continue
        by_section[section_id].append((importance_rank(concept), stable_key(card.get('id')), card, concept, left, right))

    groups = []
    for section_id, rows in by_section.items():
        rows.sort(key=lambda row: (row[0], row[1]))
        used_concepts = set()
        used_left = set()
        used_right = set()
        picked = []
        for row in rows:
            _, _, card, concept, left, right = row
            if concept['id'] in used_concepts or normalized(left) in used_left or normalized(right) in used_right:
                continue
            picked.append(row)
            used_concepts.add(concept['id'])
            used_left.add(normalized(left))
            used_right.add(normalized(right))
            if len(picked) == 4:
                break
        if len(picked) != 4:
            continue
        section = section_by_id[section_id]
        chapter = chapter_by_id.get(section.get('chapterId'), {})
        label = clean(section.get('number') or '')
        title = clean(section.get('title') or chapter.get('title') or 'Pflegewissen')
        prompt = f"Ordne die Begriffe aus Abschnitt {label} „{title}“ den passenden Aussagen zu." if label else f"Ordne die Begriffe aus „{title}“ den passenden Aussagen zu."
        if normalized(prompt) in existing_prompts:
            continue
        groups.append((str(section.get('number') or ''), section_id, prompt, picked))

    groups.sort(key=lambda row: (row[0], row[1]))
    result = []
    for _, section_id, prompt, picked in groups[:MATCHING_TARGET]:
        source_ids = [row[2]['id'] for row in picked]
        concept_ids = [row[3]['id'] for row in picked]
        options = [
            {'id': f'p{index + 1}', 'text': f"{row[4]} ↔ {row[5]}"}
            for index, row in enumerate(picked)
        ]
        qid = f"p25a-match-{stable_key(section_id + ':' + '|'.join(source_ids))[:14]}"
        result.append({
            'id': qid,
            'conceptIds': concept_ids,
            'type': 'matching',
            'prompt': prompt,
            'options': options,
            'correct': [option['id'] for option in options],
            'correctText': 'Alle vier Begriffe korrekt zuordnen.',
            'explanation': 'Die Zuordnungen stammen direkt aus den zugrunde liegenden Lernkarten.',
            'sourceKind': 'cards',
            'sourceIds': source_ids,
            'certification': CERT,
            'difficulty': 2,
            'bloom': 'understand',
            'competency': 'K2'
        })
        existing_prompts.add(normalized(prompt))
    return result


def build_ordering(cards, concept_by_id, section_by_id, existing_prompts):
    candidates = []
    for card in cards:
        concept = concept_by_id.get(card.get('conceptId'))
        if not concept or str(concept.get('type') or '') not in {'sequence', 'procedure'}:
            continue
        front = clean(card.get('front'))
        if not (8 <= len(front) <= 220):
            continue
        steps = parse_steps(card.get('back'))
        if not steps:
            continue
        prompt = f"Bringe die Schritte in die richtige Reihenfolge: {front}"
        if normalized(prompt) in existing_prompts:
            continue
        chapter_id = chapter_for_concept(concept, section_by_id) or ''
        candidates.append((importance_rank(concept), str(chapter_id), stable_key(card.get('id')), card, concept, prompt, steps))
    candidates.sort(key=lambda row: (row[0], row[1], row[2]))

    result = []
    seen_concepts = set()
    for _, _, _, card, concept, prompt, steps in candidates:
        if concept['id'] in seen_concepts:
            continue
        option_ids = [f's{index + 1}' for index in range(len(steps))]
        qid = f"p25a-order-{stable_key(card['id'])[:14]}"
        result.append({
            'id': qid,
            'conceptIds': [concept['id']],
            'type': 'ordering',
            'prompt': prompt,
            'options': [{'id': option_id, 'text': step} for option_id, step in zip(option_ids, steps)],
            'correct': option_ids,
            'correctText': ' → '.join(steps),
            'explanation': str(card.get('back') or '').strip(),
            'sourceKind': 'card',
            'sourceIds': [card['id']],
            'certification': CERT,
            'difficulty': 2,
            'bloom': 'apply',
            'competency': 'K2'
        })
        existing_prompts.add(normalized(prompt))
        seen_concepts.add(concept['id'])
        if len(result) >= ORDERING_TARGET:
            break
    return result


def patch_p17_selector():
    path = ROOT / 'js' / 'p17-study-mix.js'
    text = path.read_text(encoding='utf-8')
    import_line = "import { buildQuestionTypePlan } from './p25a-variety-core.js';\n"
    if import_line not in text:
        marker = "} from './p17-study-mix-core.js';\n"
        if marker not in text:
            raise RuntimeError('P17 import marker not found')
        text = text.replace(marker, marker + import_line, 1)

    start = text.find('function selectQuestions(engine, mix, preferredConcepts, ctx, seed) {')
    end = text.find('\nfunction cardKeepScore', start)
    if start < 0 or end < 0:
        raise RuntimeError('P17 selectQuestions block not found')
    replacement = '''function selectQuestions(engine, mix, preferredConcepts, ctx, seed) {
  const preferred = new Set(preferredConcepts);
  const candidates = stableShuffle(candidateQuestions(engine, ctx), `${seed}-p17-question-bank`)
    .map((q) => ({ q, score: questionScore(engine, q, ctx, preferred) }))
    .sort((a, b) => b.score - a.score);

  const availableByType = {};
  for (const row of candidates) availableByType[row.q.type] = (availableByType[row.q.type] || 0) + 1;
  const typePlan = buildQuestionTypePlan({
    objectiveTarget: mix.objectiveTarget,
    applicationTarget: mix.applicationTarget,
    availableByType,
    seed: `${seed}-p25a-type-plan`
  });

  const used = new Set();
  const chosen = [];
  const takeBestType = (type) => {
    const row = candidates.find((candidate) => !used.has(candidate.q.id) && candidate.q.type === type);
    if (!row) return false;
    chosen.push(row.q);
    used.add(row.q.id);
    return true;
  };

  for (const type of typePlan) takeBestType(type);

  // Small scopes may not contain every planned subtype. Fill any remaining slots
  // by score so the adaptive system never loses its requested question count.
  const target = Math.max(0, Number(mix.objectiveTarget || 0) + Number(mix.applicationTarget || 0));
  for (const row of candidates) {
    if (chosen.length >= target) break;
    if (used.has(row.q.id)) continue;
    chosen.push(row.q);
    used.add(row.q.id);
  }
  return chosen;
}
'''
    text = text[:start] + replacement + text[end:]
    path.write_text(text, encoding='utf-8')


def patch_service_worker():
    path = ROOT / 'service-worker.js'
    text = path.read_text(encoding='utf-8')
    text = re.sub(r"const CACHE = 'pflegelern-[^']+';", "const CACHE = 'pflegelern-p25a-v1.1.0-dev25a';", text, count=1)
    asset = "  './js/p25a-variety-core.js',\n"
    if asset not in text:
        marker = "  './js/p17-study-mix-core.js',\n"
        if marker not in text:
            raise RuntimeError('service-worker P17 asset marker not found')
        text = text.replace(marker, marker + asset, 1)
    path.write_text(text, encoding='utf-8')


def update_manifest(note):
    path = DATA / 'manifest.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    manifest['phase'] = 'P25A'
    manifest['version'] = '1.1.0-dev.25a'
    manifest['status'] = 'p25a-question-variety-rebalance'
    notes = list(manifest.get('notes') or [])
    notes = [entry for entry in notes if not str(entry).startswith('P25A ')]
    notes.append(note)
    manifest['notes'] = notes
    dump(path, manifest, pretty=True)


def validate_generated(base_questions, generated, cards, concepts):
    all_questions = base_questions + generated
    question_ids = [q.get('id') for q in all_questions]
    if len(question_ids) != len(set(question_ids)):
        raise AssertionError('duplicate question IDs')
    concept_ids = {c.get('id') for c in concepts}
    card_ids = {c.get('id') for c in cards}
    for q in all_questions:
        if not q.get('id') or not q.get('type') or not clean(q.get('prompt')):
            raise AssertionError(f'malformed question: {q.get("id")}')
        if any(cid not in concept_ids for cid in q.get('conceptIds', [])):
            raise AssertionError(f'invalid concept reference: {q.get("id")}')
    for q in generated:
        if not q.get('sourceIds') or any(source_id not in card_ids for source_id in q['sourceIds']):
            raise AssertionError(f'invalid P25A source card: {q.get("id")}')
        if q.get('certification') != CERT:
            raise AssertionError(f'missing P25A certification: {q.get("id")}')
        if q['type'] == 'short_answer' and not clean(q.get('correctText')):
            raise AssertionError(f'empty short answer: {q.get("id")}')
        if q['type'] in {'matching', 'ordering'}:
            options = q.get('options') or []
            ids = [option.get('id') for option in options]
            texts = [normalized(option.get('text')) for option in options]
            if len(options) < 3 or len(ids) != len(set(ids)) or len(texts) != len(set(texts)):
                raise AssertionError(f'invalid structured options: {q.get("id")}')
    return all_questions


def main():
    questions_all = load('questions.json')
    cards = load('cards.json')
    concepts = load('concepts.json')
    sections = load('sections.json')
    chapters = load('chapters.json')

    # Idempotent regeneration: existing P25A-generated items are replaced, never duplicated.
    base_questions = [q for q in questions_all if q.get('certification') != CERT]
    if len(base_questions) != 954:
        raise AssertionError(f'Expected certified P13/P24 baseline of 954 questions, found {len(base_questions)}')

    legacy_hash_before = canonical_hash(base_questions)
    baseline_counts = Counter(q.get('type') for q in base_questions)
    concept_by_id = {c['id']: c for c in concepts}
    section_by_id = {s['id']: s for s in sections}
    chapter_by_id = {c['id']: c for c in chapters}
    existing_prompts = {normalized(q.get('prompt')) for q in base_questions if clean(q.get('prompt'))}

    short_answers = build_short_answers(base_questions, cards, concept_by_id, section_by_id, existing_prompts)
    matching = build_matching(cards, concept_by_id, section_by_id, chapter_by_id, existing_prompts)
    ordering = build_ordering(cards, concept_by_id, section_by_id, existing_prompts)
    generated = short_answers + matching + ordering
    all_questions = validate_generated(base_questions, generated, cards, concepts)

    # Explicit preservation gate: the legacy prefix is not transformed or reordered.
    if canonical_hash(all_questions[:len(base_questions)]) != legacy_hash_before:
        raise AssertionError('legacy questions changed during P25A')

    after_counts = Counter(q.get('type') for q in all_questions)
    single_share_before = baseline_counts.get('single_choice', 0) / len(base_questions)
    single_share_after = after_counts.get('single_choice', 0) / len(all_questions)

    if len(short_answers) < 300:
        raise AssertionError(f'Insufficient safe short-answer expansion: {len(short_answers)}')
    if len(matching) < 20:
        raise AssertionError(f'Insufficient safe matching expansion: {len(matching)}')
    if single_share_after > 0.56:
        raise AssertionError(f'Single Choice still dominates bank: {single_share_after:.3f}')
    if after_counts.get('short_answer', 0) <= baseline_counts.get('short_answer', 0):
        raise AssertionError('Short Answer count did not increase')
    if after_counts.get('matching', 0) <= baseline_counts.get('matching', 0):
        raise AssertionError('Matching count did not increase')

    dump(DATA / 'questions.json', all_questions)
    patch_p17_selector()
    patch_service_worker()

    note = (
        f"P25A rebalances question variety without altering the 954 certified legacy questions: "
        f"+{len(short_answers)} source-card short-answer items, +{len(matching)} source-card matching items "
        f"and +{len(ordering)} strictly source-ordered sequence items. P17 now plans objective/application subtypes "
        f"explicitly before score-based selection, while P20 remains objectively scored only."
    )
    update_manifest(note)

    generated_chapters = set()
    for q in generated:
        for cid in q.get('conceptIds', []):
            concept = concept_by_id.get(cid, {})
            chapter_id = chapter_for_concept(concept, section_by_id)
            if chapter_id:
                generated_chapters.add(chapter_id)

    report = {
        'phase': 'P25A',
        'status': 'PASS',
        'branch': 'p25a-question-variety-rebalance',
        'baselineQuestions': len(base_questions),
        'generatedQuestions': len(generated),
        'totalQuestions': len(all_questions),
        'baselineTypeCounts': dict(sorted(baseline_counts.items())),
        'generatedTypeCounts': dict(sorted(Counter(q['type'] for q in generated).items())),
        'finalTypeCounts': dict(sorted(after_counts.items())),
        'singleChoiceShare': {
            'before': round(single_share_before, 4),
            'after': round(single_share_after, 4)
        },
        'coverage': {
            'chaptersRepresentedByP25A': len(generated_chapters),
            'shortAnswerConcepts': len({q['conceptIds'][0] for q in short_answers}),
            'matchingSections': len(matching),
            'safeOrderingConcepts': len(ordering)
        },
        'sourceLineage': {
            'certification': CERT,
            'policy': 'Generated P25A items are transforms of approved source-backed cards only. No external clinical facts are introduced. Short answers use the exact card back as the model answer; matching pairs map concept titles to concise card-backed statements; ordering is generated only when a sequence/procedure card contains an explicit parseable order.'
        },
        'legacyPreservation': {
            'count': len(base_questions),
            'canonicalSha256': legacy_hash_before,
            'preservedExactly': True
        },
        'qualityGates': {
            'uniqueQuestionIds': True,
            'validConceptReferences': True,
            'validSourceCardReferences': True,
            'legacy954Preserved': True,
            'shortAnswerExpansionAtLeast300': len(short_answers) >= 300,
            'matchingExpansionAtLeast20': len(matching) >= 20,
            'singleChoiceBankShareAtMost56Percent': single_share_after <= 0.56,
            'p17SubtypePlanningEnabled': True,
            'ambiguousSyntheticMultipleChoiceNotGenerated': True,
            'errors': []
        }
    }
    dump(ROOT / 'P25A_QUESTION_VARIETY_REPORT.json', report, pretty=True)

    print(json.dumps({
        'baseline': len(base_questions),
        'generated': len(generated),
        'total': len(all_questions),
        'generatedTypes': report['generatedTypeCounts'],
        'finalTypes': report['finalTypeCounts'],
        'singleChoiceShareAfter': report['singleChoiceShare']['after']
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
