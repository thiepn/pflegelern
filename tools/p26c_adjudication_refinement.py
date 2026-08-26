#!/usr/bin/env python3
"""P26C precision refinement for source-derived enumeration prompts."""

from __future__ import annotations

import re
import p26c_adjudicate as base

_ORIGINAL_RESOLVE_SOURCE_CONTRACT = base.resolve_source_contract


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


base.resolve_source_contract = resolve_source_contract

if __name__ == '__main__':
    base.main()
