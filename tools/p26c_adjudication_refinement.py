#!/usr/bin/env python3
"""P26C precision refinement for equivalent source-derived enumeration prompts."""

from __future__ import annotations

import re
import p26c_adjudicate as base

_ORIGINAL_RESOLVE_SOURCE_CONTRACT = base.resolve_source_contract
_ORIGINAL_ADJUDICATE = base.adjudicate


def _tokens(text):
    return set(re.findall(r"[0-9a-zäöüß-]+", base.norm(text).lower()))


def _enumeration_items(text):
    """Canonicalize simple ordered enumerations without changing item semantics."""
    value = base.norm(text).strip().rstrip('.;:')
    if not value:
        return []
    value = value.replace(';', ',')
    # Source-card prose commonly joins the final item with "und", while generated
    # short answers may use a comma. Normalize only this list-separator role.
    value = re.sub(r"\s+und\s+(?=[^,]+$)", ", ", value, flags=re.IGNORECASE)
    items = [base.norm(part).lower().strip().rstrip('.;:') for part in value.split(',')]
    return [item for item in items if item]


def _same_reference_answer(back, explanation):
    if base.norm(back) == base.norm(explanation):
        return True, 'exact'
    back_items = _enumeration_items(back)
    explanation_items = _enumeration_items(explanation)
    if len(back_items) >= 2 and back_items == explanation_items:
        return True, 'equivalent-enumeration'
    return False, 'none'


def resolve_source_contract(q, cards_by_concept):
    result = _ORIGINAL_RESOLVE_SOURCE_CONTRACT(q, cards_by_concept)
    if result['resolved']:
        result['resolutionMode'] = 'exact-front-back'
        return result

    prompt_tokens = _tokens(q.get('prompt'))
    explanation = base.norm(q.get('explanation'))
    matches = []
    answer_modes = {}
    overlaps = {}
    for cid in q.get('conceptIds', []):
        for card in cards_by_concept.get(cid, []):
            front = base.norm(card.get('front') or card.get('prompt') or card.get('question'))
            back = base.norm(card.get('back') or card.get('answer') or card.get('text'))
            if not front or not back:
                continue
            same_answer, answer_mode = _same_reference_answer(back, explanation)
            if not same_answer:
                continue
            front_tokens = _tokens(front)
            common = prompt_tokens & front_tokens
            count_tokens = {'eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn'}
            same_count = bool(common & count_tokens)
            overlap = len(common) / max(1, min(len(prompt_tokens), len(front_tokens)))
            if same_count and overlap >= 0.4:
                matches.append(card['id'])
                answer_modes[card['id']] = answer_mode
                overlaps[card['id']] = round(overlap, 3)

    return {
        'resolved': bool(matches),
        'matchingCardIds': sorted(set(matches)),
        'resolutionMode': 'equivalent-enumeration-prompt' if matches else 'none',
        'referenceAnswerModes': {cid: answer_modes[cid] for cid in sorted(set(matches))},
        'promptTokenOverlap': {cid: overlaps[cid] for cid in sorted(set(matches))},
    }


def adjudicate():
    report = _ORIGINAL_ADJUDICATE()
    for row in report['adjudications']:
        if row.get('evidence', {}).get('resolutionMode') == 'equivalent-enumeration-prompt':
            row['rationale'] = (
                'The anchored source card has the same ordered reference-answer items, and both prompts '
                'request the same explicit item count for the same concept with substantial wording overlap. '
                'The only answer-text difference is enumeration punctuation/conjunction, so the question is '
                'a more specific formulation of the source-card task rather than an under-specified free-response prompt.'
            )
    report['policy']['sourceCardEquivalentEnumerationContractClearsLengthHeuristic'] = True
    return report


base.resolve_source_contract = resolve_source_contract
base.adjudicate = adjudicate

if __name__ == '__main__':
    base.main()
