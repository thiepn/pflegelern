#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
questions = json.loads((ROOT / 'data/questions.json').read_text(encoding='utf-8'))
concepts = json.loads((ROOT / 'data/concepts.json').read_text(encoding='utf-8'))
cards = json.loads((ROOT / 'data/cards.json').read_text(encoding='utf-8'))

TARGETS = [
    'q-16-1-01', 'q-16-1-02', 'q-16-1-04', 'q-36-01',
    'q-48-4-06', 'q-61-4-04', 'q-p12-0040'
]
q_by_id = {q['id']: q for q in questions}
c_by_id = {c['id']: c for c in concepts}

for qid in TARGETS:
    q = q_by_id[qid]
    print('\n' + '=' * 90)
    print('QUESTION', qid)
    print(json.dumps(q, ensure_ascii=False, indent=2))
    for cid in q.get('conceptIds', []):
        print('\nCONCEPT', cid)
        print(json.dumps(c_by_id.get(cid), ensure_ascii=False, indent=2))
        matched = [card for card in cards if card.get('conceptId') == cid or cid in card.get('conceptIds', [])]
        print('CARDS_FOR_CONCEPT', len(matched))
        for card in matched:
            print(json.dumps(card, ensure_ascii=False, indent=2))

# Print nearby/source-related items useful for source-backed distractors.
keywords = {
    'tachy': ['tachyk', 'bradyk', 'puls', 'herzfrequenz'],
    'medication': ['6-r', 'arzneimittel', 'medikament', 'applik'],
    'ethics': ['ethisch', 'entscheidungsfindung', 'werte', 'wille'],
    'aphasia': ['aphasie', 'kommunikation', 'gestik', 'mimik', 'buchstabentafel'],
    'infection': ['nosokomial', 'infektion', 'kontamination', 'kolonisation'],
}

def as_text(obj):
    return json.dumps(obj, ensure_ascii=False).lower()

for label, terms in keywords.items():
    print('\n' + '#' * 90)
    print('RELATED', label)
    matches = []
    for c in concepts:
        text = as_text(c)
        if any(term in text for term in terms):
            matches.append(c)
    print('RELATED_CONCEPTS', len(matches))
    for c in matches[:30]:
        print(json.dumps(c, ensure_ascii=False))
    qmatches = []
    for q in questions:
        text = as_text(q)
        if any(term in text for term in terms):
            qmatches.append(q)
    print('RELATED_QUESTIONS', len(qmatches))
    for q in qmatches[:30]:
        print(json.dumps(q, ensure_ascii=False))
