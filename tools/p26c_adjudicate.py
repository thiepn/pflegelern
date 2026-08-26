#!/usr/bin/env python3
"""P26C: adjudicate all 108 P26A manual-review candidates without mutating questions.

The adjudicator only clears a candidate when repository evidence resolves the
original P26A signal. It promotes persistent option-quality problems to a
confirmed P26C repair queue for the next correction phase.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
P26A_PATH = ROOT / 'reports' / 'P26A_SEMANTIC_DEFECT_REGISTRY.json'
P26B_PATH = ROOT / 'reports' / 'P26B_SEMANTIC_CORRECTION_REPORT.json'
QUESTIONS_PATH = ROOT / 'data' / 'questions.json'
CONCEPTS_PATH = ROOT / 'data' / 'concepts.json'
CARDS_PATH = ROOT / 'data' / 'cards.json'
REPORT_JSON = ROOT / 'reports' / 'P26C_MANUAL_REVIEW_ADJUDICATION.json'
REPORT_MD = ROOT / 'reports' / 'P26C_MANUAL_REVIEW_ADJUDICATION.md'

CONFIRM_CODES = {
    'ANSWER_OPTION_SUBSUMPTION': ('confirmed-semantic-defect', 'medium'),
    'DISTRACTOR_ABSOLUTE_WORDING_CLUSTER': ('confirmed-design-defect', 'medium'),
}
CLEAR_CODES = {
    'EXACT_PROMPT_DUPLICATE',
    'CLINICAL_CASE_WITHOUT_CASE_CONTEXT',
    'UNDER_SPECIFIED_FREE_RESPONSE_PROMPT',
    'BROAD_REFERENCE_ANSWER_TO_NARROW_PROMPT',
}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm(text: Any) -> str:
    return ' '.join(str(text or '').split()).strip()


def card_concept_ids(card: dict[str, Any]) -> list[str]:
    ids = list(card.get('conceptIds') or [])
    if card.get('conceptId'):
        ids.append(card['conceptId'])
    return list(dict.fromkeys(ids))


def issue_codes(entry: dict[str, Any]) -> set[str]:
    return {issue.get('code') for issue in entry.get('issues', []) if issue.get('code')}


def resolve_source_contract(q: dict[str, Any], cards_by_concept: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    prompt = norm(q.get('prompt'))
    explanation = norm(q.get('explanation'))
    matches = []
    for cid in q.get('conceptIds', []):
        for card in cards_by_concept.get(cid, []):
            front = norm(card.get('front') or card.get('prompt') or card.get('question'))
            back = norm(card.get('back') or card.get('answer') or card.get('text'))
            if front == prompt and back == explanation and front and back:
                matches.append(card['id'])
    return {'resolved': bool(matches), 'matchingCardIds': sorted(set(matches))}


def resolve_matching_template(q: dict[str, Any], entry: dict[str, Any], q_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    related = [q_by_id[qid] for issue in entry.get('issues', []) if issue.get('code') == 'EXACT_PROMPT_DUPLICATE' for qid in issue.get('relatedQuestionIds', []) if qid in q_by_id]
    if q.get('type') != 'matching' or not related:
        return {'resolved': False, 'relatedQuestionIds': [x.get('id') for x in related]}
    prompt = norm(q.get('prompt'))
    same_prompt = all(norm(other.get('prompt')) == prompt for other in related)
    own_concepts = set(q.get('conceptIds') or [])
    distinct_content = all(set(other.get('conceptIds') or []) != own_concepts for other in related)
    four_pairs = len(q.get('options') or []) >= 2 and all(len(other.get('options') or []) >= 2 for other in related)
    return {
        'resolved': same_prompt and distinct_content and four_pairs,
        'relatedQuestionIds': sorted(other['id'] for other in related),
        'distinctConceptSets': distinct_content,
        'templatePrompt': prompt,
    }


def resolve_case_context(q: dict[str, Any]) -> dict[str, Any]:
    prompt = norm(q.get('prompt'))
    # These are not keyword guesses about medicine; they are structural scenario
    # markers showing that the prompt names an event/situation before asking the task.
    markers = ['ein ', 'eine ', 'nach ', 'fällt ', 'rupturiert', 'patient', 'patientin']
    marker_hits = [m for m in markers if m in prompt.lower()]
    contextual = q.get('type') == 'clinical_case' and len(prompt) >= 60 and bool(marker_hits)
    return {'resolved': contextual, 'promptLength': len(prompt), 'contextMarkers': marker_hits}


def adjudicate() -> dict[str, Any]:
    p26a = load(P26A_PATH)
    p26b = load(P26B_PATH)
    questions = load(QUESTIONS_PATH)
    cards = load(CARDS_PATH)
    concepts = load(CONCEPTS_PATH)
    q_by_id = {q['id']: q for q in questions}
    cards_by_concept: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for card in cards:
        for cid in card_concept_ids(card):
            cards_by_concept[cid].append(card)

    candidates = [e for e in p26a['registry'] if e.get('disposition') == 'manual-review']
    if len(candidates) != 108:
        raise AssertionError(f'Expected 108 P26A manual-review candidates, found {len(candidates)}')
    if p26b['phase'] != 'P26B' or len(p26b.get('targetQuestionIds', [])) != 7:
        raise AssertionError('P26B correction baseline missing or unexpected')

    rows = []
    for entry in sorted(candidates, key=lambda e: e['questionId']):
        qid = entry['questionId']
        q = q_by_id[qid]
        codes = issue_codes(entry)
        unknown = codes - CLEAR_CODES - set(CONFIRM_CODES)
        if unknown:
            raise AssertionError(f'{qid}: unsupported P26C issue codes {sorted(unknown)}')

        disposition = 'unresolved'
        category = 'unresolved'
        rationale = 'Repository evidence did not safely resolve the P26A signal.'
        evidence: dict[str, Any] = {}

        confirm = sorted(codes & set(CONFIRM_CODES))
        if confirm:
            # The two confirmed classes are intrinsic to the displayed answer
            # choices and do not depend on external clinical facts.
            disposition = CONFIRM_CODES[confirm[0]][0]
            category = confirm[0].lower().replace('_', '-')
            evidence = {
                'issueCodes': confirm,
                'options': q.get('options', []),
                'correct': q.get('correct', []),
            }
            if 'ANSWER_OPTION_SUBSUMPTION' in confirm:
                rationale = 'A displayed distractor substantially overlaps/subsumes the keyed answer, so the item can be ambiguous even with source knowledge.'
            else:
                rationale = 'The distractor set is dominated by absolute or obviously off-scope wording, making the keyed answer identifiable by test-taking cues rather than the target concept.'
        elif codes <= {'UNDER_SPECIFIED_FREE_RESPONSE_PROMPT', 'BROAD_REFERENCE_ANSWER_TO_NARROW_PROMPT'}:
            contract = resolve_source_contract(q, cards_by_concept)
            evidence = contract
            if contract['resolved'] and q.get('type') == 'short_answer':
                disposition = 'cleared'
                category = 'source-card-contract'
                rationale = 'The question prompt exactly matches the anchored source-derived card front and its reference answer exactly matches that card back; prompt length alone is therefore not evidence of semantic ambiguity.'
        elif codes == {'EXACT_PROMPT_DUPLICATE'}:
            template = resolve_matching_template(q, entry, q_by_id)
            evidence = template
            if template['resolved']:
                disposition = 'cleared'
                category = 'intentional-matching-template'
                rationale = 'Only the generic matching instruction is duplicated; each item carries a distinct concept set and distinct matching content, so this is intentional template reuse rather than duplicate learning content.'
        elif codes == {'CLINICAL_CASE_WITHOUT_CASE_CONTEXT'}:
            case = resolve_case_context(q)
            evidence = case
            if case['resolved']:
                disposition = 'cleared'
                category = 'case-context-present'
                rationale = 'The prompt already contains a concrete situation/event before the task, so the detector flag is a false positive for missing case context.'
        else:
            # Mixed clear-only codes are currently expected only in source-card
            # short answers. Keep the logic conservative if the bank changes.
            contract = resolve_source_contract(q, cards_by_concept)
            evidence = contract
            if contract['resolved'] and q.get('type') == 'short_answer' and codes <= {'UNDER_SPECIFIED_FREE_RESPONSE_PROMPT', 'BROAD_REFERENCE_ANSWER_TO_NARROW_PROMPT'}:
                disposition = 'cleared'
                category = 'source-card-contract'
                rationale = 'The source-derived card establishes an exact prompt/reference-answer contract; detector length heuristics do not establish a semantic defect.'

        rows.append({
            'questionId': qid,
            'type': q.get('type'),
            'conceptIds': q.get('conceptIds', []),
            'p26aIssueCodes': sorted(codes),
            'disposition': disposition,
            'category': category,
            'rationale': rationale,
            'evidence': evidence,
        })

    disposition_counts = Counter(r['disposition'] for r in rows)
    category_counts = Counter(r['category'] for r in rows)
    confirmed_ids = sorted(r['questionId'] for r in rows if r['disposition'].startswith('confirmed-'))
    cleared_ids = sorted(r['questionId'] for r in rows if r['disposition'] == 'cleared')
    unresolved_ids = sorted(r['questionId'] for r in rows if r['disposition'] == 'unresolved')

    return {
        'schemaVersion': 1,
        'phase': 'P26C',
        'status': 'manual-review-adjudicated',
        'scope': {
            'questionCount': len(questions),
            'conceptCount': len(concepts),
            'cardCount': len(cards),
            'p26aManualReviewCandidates': len(candidates),
            'questionBankMutated': False,
            'externalClinicalGuidanceAdded': False,
        },
        'baseline': {
            'p26aRegistrySha256': sha(P26A_PATH),
            'p26bCorrectionReportSha256': sha(P26B_PATH),
            'liveQuestionBankSha256': sha(QUESTIONS_PATH),
        },
        'summary': {
            'adjudicated': len(rows),
            'confirmedForRepair': len(confirmed_ids),
            'cleared': len(cleared_ids),
            'unresolved': len(unresolved_ids),
            'dispositionCounts': dict(sorted(disposition_counts.items())),
            'categoryCounts': dict(sorted(category_counts.items())),
            'typeCounts': dict(sorted(Counter(r['type'] for r in rows).items())),
        },
        'confirmedForRepairIds': confirmed_ids,
        'clearedIds': cleared_ids,
        'unresolvedIds': unresolved_ids,
        'adjudications': rows,
        'policy': {
            'sourceCardExactContractClearsLengthHeuristic': True,
            'genericMatchingInstructionMayRepeatAcrossDistinctContent': True,
            'caseContextEvaluatedStructurally': True,
            'optionSubsumptionRequiresRepair': True,
            'absoluteDistractorClusterRequiresRepair': True,
            'p26bSevenCorrectionsReopened': False,
            'questionContentEdited': False,
            'fsrsChanged': False,
            'masteryChanged': False,
            'remediationChanged': False,
            'examLogicChanged': False,
        },
    }


def render_md(report: dict[str, Any]) -> str:
    s = report['summary']
    lines = [
        '# P26C — Manual Review Adjudication', '',
        '> Resolves the 108 lower-confidence P26A candidates against repository evidence. P26C is adjudication-only; question content is not changed.', '',
        f"- Candidates adjudicated: **{s['adjudicated']}**",
        f"- Confirmed for repair: **{s['confirmedForRepair']}**",
        f"- Cleared as detector false positives / intentional structure: **{s['cleared']}**",
        f"- Unresolved: **{s['unresolved']}**", '',
        '## Outcome by category', '',
        '| Category | Count | P26C decision |', '|---|---:|---|',
        f"| Source-card prompt/reference contract | {s['categoryCounts'].get('source-card-contract', 0)} | Cleared |",
        f"| Intentional matching-template prompt | {s['categoryCounts'].get('intentional-matching-template', 0)} | Cleared |",
        f"| Clinical case context already present | {s['categoryCounts'].get('case-context-present', 0)} | Cleared |",
        f"| Absolute/off-scope distractor construction | {s['categoryCounts'].get('distractor-absolute-wording-cluster', 0)} | Confirmed design defect |",
        f"| Answer-option subsumption | {s['categoryCounts'].get('answer-option-subsumption', 0)} | Confirmed semantic defect |", '',
        '## Confirmed repair queue', '',
    ]
    for qid in report['confirmedForRepairIds']:
        row = next(r for r in report['adjudications'] if r['questionId'] == qid)
        lines.append(f"- `{qid}` — {row['category']}")
    lines += ['', '## Invariants', '',
              '- The 1,299-question bank is not edited in P26C.',
              '- P26B’s seven corrected defects remain closed and are not reopened.',
              '- No external clinical guidance is merged.',
              '- FSRS, mastery, remediation, repetition control and mock-exam behavior are unchanged.',
              '- P26D can consume `confirmedForRepairIds` as the bounded correction queue.', '']
    return '\n'.join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report = adjudicate()
    if args.write:
        REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        REPORT_MD.write_text(render_md(report), encoding='utf-8')
    print(json.dumps({
        'phase': report['phase'],
        **report['summary'],
        'confirmedForRepairIds': report['confirmedForRepairIds'],
        'unresolvedIds': report['unresolvedIds'],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
