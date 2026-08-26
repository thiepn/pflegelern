#!/usr/bin/env python3
"""P26C precision refinement for source-derived enumeration prompts."""

from __future__ import annotations

import re
import p26c_adjudicate as base

_ORIGINAL_RESOLVE_SOURCE_CONTRACT = base.resolve_source_contract
_ORIGINAL_ADJUDICATE = base.adjudicate


def _tokens(text):
    return set(re.findall(r"[0-9a-zäöüß-]+", base.norm(text).lower()))


def resolve_source_contract(q, cards_by_concept):
    result = _ORIGINAL_RESOLVE_SOURCE_CONTRACT(q, cards_by_concept)
    if result['resolved']:
        result['resolutionMode'] = 'exact-front-back'
        return result

    prompt_tokens = _tokens(q.get('prompt'))
    explanation = base.norm(q.get('explanation'))
    matches = []
    for cid in q.get('conceptIds', []):
        for card in cards_by_concept.get(cid, []):
            if card.get('type') != 'enumeration':
                continue
            front = base.norm(card.get('front') or card.get('prompt') or card.get('question'))
            back = base.norm(card.get('back') or card.get('answer') or card.get('text'))
            if not front or not back or back != explanation:
                continue
            front_tokens = _tokens(front)
            common = prompt_tokens & front_tokens
            count_tokens = {'eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn'}
            same_count = bool(common & count_tokens)
            overlap = len(common) / max(1, min(len(prompt_tokens), len(front_tokens)))
            if same_count and overlap >= 0.4:
                matches.append(card['id'])

    return {
        'resolved': bool(matches),
        'matchingCardIds': sorted(set(matches)),
        'resolutionMode': 'equivalent-enumeration-prompt' if matches else 'none',
    }


def adjudicate():
    report = _ORIGINAL_ADJUDICATE()
    for row in report['adjudications']:
        if row.get('evidence', {}).get('resolutionMode') == 'equivalent-enumeration-prompt':
            row['rationale'] = (
                'The anchored enumeration card has the exact same reference answer, and both prompts '
                'request the same explicit item count for the same concept. The question is therefore a '
                'more specific wording of the source-card task rather than an under-specified response prompt.'
            )
    report['policy']['sourceCardEquivalentEnumerationContractClearsLengthHeuristic'] = True
    return report


base.resolve_source_contract = resolve_source_contract
base.adjudicate = adjudicate

if __name__ == '__main__':
    base.main()
