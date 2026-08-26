#!/usr/bin/env python3
"""Generate compact evidence packets for the 108 P26A manual-review candidates."""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
registry = json.loads((ROOT / 'reports/P26A_SEMANTIC_DEFECT_REGISTRY.json').read_text(encoding='utf-8'))
questions = json.loads((ROOT / 'data/questions.json').read_text(encoding='utf-8'))
concepts = json.loads((ROOT / 'data/concepts.json').read_text(encoding='utf-8'))
cards = json.loads((ROOT / 'data/cards.json').read_text(encoding='utf-8'))

q_by_id = {q['id']: q for q in questions}
c_by_id = {c['id']: c for c in concepts}
card_by_id = {c['id']: c for c in cards}
cards_by_concept = defaultdict(list)
for card in cards:
    for cid in card.get('conceptIds', []) or ([card.get('conceptId')] if card.get('conceptId') else []):
        if cid:
            cards_by_concept[cid].append(card)

candidates = [e for e in registry['registry'] if e.get('disposition') == 'manual-review']
assert len(candidates) == 108


def compact_obj(obj):
    if not obj:
        return None
    preferred = [
        'id', 'chapterId', 'sectionId', 'conceptId', 'conceptIds', 'type', 'kind', 'title', 'name',
        'prompt', 'question', 'front', 'back', 'answer', 'definition', 'statement', 'text', 'content',
        'explanation', 'sourceText', 'source', 'keyPoints', 'expected', 'acceptedAnswers', 'correct'
    ]
    out = {}
    for key in preferred:
        if key in obj and obj[key] not in (None, '', [], {}):
            out[key] = obj[key]
    return out


def packet(entry):
    q = q_by_id[entry['questionId']]
    concept_packets = []
    card_packets = []
    for cid in q.get('conceptIds', []):
        concept_packets.append(compact_obj(c_by_id.get(cid)))
        for card in cards_by_concept.get(cid, [])[:4]:
            card_packets.append(compact_obj(card))
    return {
        'questionId': q['id'],
        'type': q.get('type'),
        'difficulty': q.get('difficulty'),
        'prompt': q.get('prompt'),
        'options': q.get('options'),
        'correct': q.get('correct'),
        'answer': q.get('answer'),
        'expectedAnswer': q.get('expectedAnswer'),
        'acceptedAnswers': q.get('acceptedAnswers'),
        'explanation': q.get('explanation'),
        'conceptIds': q.get('conceptIds', []),
        'issues': entry.get('issues', []),
        'conceptEvidence': [x for x in concept_packets if x],
        'cardEvidence': [x for x in card_packets if x],
    }

parser = argparse.ArgumentParser()
parser.add_argument('--issue', default=None)
parser.add_argument('--batch', type=int, default=None)
parser.add_argument('--batch-size', type=int, default=25)
args = parser.parse_args()

selected = candidates
if args.issue:
    selected = [e for e in selected if any(i.get('code') == args.issue for i in e.get('issues', []))]
selected = sorted(selected, key=lambda e: e['questionId'])
if args.batch is not None:
    start = args.batch * args.batch_size
    selected = selected[start:start + args.batch_size]

print(json.dumps({
    'phase': 'P26C-review-packets',
    'totalManualReviewCandidates': len(candidates),
    'selected': len(selected),
    'issueCounts': Counter(i['code'] for e in candidates for i in e.get('issues', [])),
}, ensure_ascii=False, indent=2))
for entry in selected:
    print('PACKET ' + json.dumps(packet(entry), ensure_ascii=False, separators=(',', ':')))
