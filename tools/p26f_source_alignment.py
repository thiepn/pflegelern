#!/usr/bin/env python3
"""P26F — source alignment audit for all PflegeLern questions.

The audit is repository-local and source-faithful. It verifies that every
question resolves through valid concept/section/source metadata and that its
learning content is materially supported by the anchored concept/card record.
It does not introduce external clinical guidance.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
REPORTS = ROOT / 'reports'

STOP = {
    'aber','alle','als','am','an','auch','auf','aus','bei','beim','bis','da','das','dass','dem','den','der','des','die',
    'diese','diesem','diesen','dieser','dieses','durch','ein','eine','einem','einen','einer','eines','er','es','für','hat',
    'haben','im','in','ist','laut','mit','nach','nicht','oder','sich','sie','sind','so','soll','sollen','über','um','und',
    'unter','vom','von','vor','was','welche','welcher','welches','welchen','wie','wird','werden','zu','zum','zur','lehrbuch',
    'genannt','nennt','entspricht','aussage','aussagen','folgende','folgenden','folgendes','richtig','korrekt','patient',
    'patienten','patientin','pflege','pflegekraft','pflegeperson','frage','antwort','antworten'
}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm(text: Any) -> str:
    value = str(text or '').lower().replace('ß', 'ss')
    value = unicodedata.normalize('NFKD', value)
    value = ''.join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace('–', '-').replace('—', '-')
    value = re.sub(r'[^a-z0-9äöü+/%<>\-. ]+', ' ', value)
    return re.sub(r'\s+', ' ', value).strip()


def tokens(text: Any) -> set[str]:
    out = set()
    for token in re.findall(r'[a-z0-9äöü]+', norm(text)):
        if len(token) < 3 or token in STOP or token.isdigit():
            continue
        stem = token
        for suffix in ('ungen','ung','ischen','ische','ischer','isches','keiten','keit','ern','en','er','es','e','n'):
            if len(stem) >= len(suffix) + 5 and stem.endswith(suffix):
                stem = stem[:-len(suffix)]
                break
        out.add(stem)
    return out


def recursive_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ' '.join(recursive_text(x) for x in value)
    if isinstance(value, dict):
        parts = []
        for key, val in value.items():
            if key.lower().endswith('id') or key.lower().endswith('ids'):
                continue
            parts.append(recursive_text(val))
        return ' '.join(parts)
    return ''


def question_learning_text(q: dict[str, Any]) -> str:
    correct_ids = {str(x) for x in q.get('correct', [])}
    correct_text = ' '.join(
        str(o.get('text', '')) for o in q.get('options', [])
        if str(o.get('id')) in correct_ids
    )
    parts = [q.get('prompt',''), q.get('explanation',''), correct_text]
    for key in ('answer','expectedAnswer','acceptedAnswers'):
        if q.get(key):
            parts.append(recursive_text(q[key]))
    return ' '.join(map(str, parts))


def card_learning_text(card: dict[str, Any]) -> str:
    return ' '.join(str(card.get(k, '')) for k in ('front','back','prompt','answer','text'))


def source_shape(concept: dict[str, Any]) -> dict[str, Any]:
    """Normalize both manually-reviewed and deterministic P7B provenance shapes."""
    source = concept.get('source') or {}
    pages = source.get('printedPages') or []
    evidence_refs = source.get('evidenceRefs') or []
    evidence_record_ids = source.get('evidenceRecordIds') or []
    pointers = list(evidence_refs) + list(evidence_record_ids)
    return {
        'hasSource': bool(source),
        'sourceSection': source.get('section'),
        'printedPages': pages,
        'evidenceRefs': evidence_refs,
        'evidenceRecordIds': evidence_record_ids,
        'evidencePointers': pointers,
        'validPages': bool(pages) and all(isinstance(p, int) and p > 0 for p in pages),
        'validEvidencePointers': bool(pointers) and all(isinstance(r, str) and r.strip() for r in pointers),
    }


def audit() -> dict[str, Any]:
    questions = load(DATA / 'questions.json')
    concepts = load(DATA / 'concepts.json')
    cards = load(DATA / 'cards.json')
    sections = load(DATA / 'sections.json')
    chapters = load(DATA / 'chapters.json')

    concept_by = {c['id']: c for c in concepts}
    card_by = {c['id']: c for c in cards}
    section_by = {s['id']: s for s in sections}
    chapter_by = {c['id']: c for c in chapters}
    cards_by_concept: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for card in cards:
        ids = list(card.get('conceptIds') or [])
        if card.get('conceptId'):
            ids.append(card['conceptId'])
        for cid in dict.fromkeys(ids):
            cards_by_concept[cid].append(card)

    findings = []
    used_concepts = set()

    def flag(qid: str, code: str, severity: str, detail: dict[str, Any]):
        findings.append({'questionId': qid, 'code': code, 'severity': severity, 'detail': detail})

    for q in questions:
        qid = q['id']
        cids = list(q.get('conceptIds') or [])
        used_concepts.update(cids)
        if not cids:
            flag(qid, 'QUESTION_WITHOUT_CONCEPT_ANCHOR', 'critical', {})
            continue
        missing = [cid for cid in cids if cid not in concept_by]
        if missing:
            flag(qid, 'MISSING_CONCEPT_ANCHOR', 'critical', {'missingConceptIds': missing})
            continue

        qtext = question_learning_text(q)
        qt = tokens(qtext)
        chapters_for_question = set()
        for cid in cids:
            concept = concept_by[cid]
            section_id = concept.get('sectionId')
            chapter_id = concept.get('chapterId')
            chapters_for_question.add(chapter_id)
            section = section_by.get(section_id)
            source = source_shape(concept)

            if concept.get('status') != 'approved':
                flag(qid, 'TARGET_CONCEPT_NOT_APPROVED', 'high', {'conceptId': cid, 'status': concept.get('status')})
            if not chapter_id or chapter_id not in chapter_by:
                flag(qid, 'INVALID_CONCEPT_CHAPTER', 'critical', {'conceptId': cid, 'chapterId': chapter_id})
            if not section_id or not section:
                flag(qid, 'INVALID_CONCEPT_SECTION', 'critical', {'conceptId': cid, 'sectionId': section_id})
            elif chapter_id and section.get('chapterId') != chapter_id:
                flag(qid, 'SECTION_CHAPTER_MISMATCH', 'high', {
                    'conceptId': cid, 'sectionId': section_id,
                    'conceptChapterId': chapter_id, 'sectionChapterId': section.get('chapterId')
                })
            if not source['hasSource']:
                flag(qid, 'MISSING_SOURCE_PROVENANCE', 'critical', {'conceptId': cid})
            if not source['validPages']:
                flag(qid, 'MISSING_OR_INVALID_SOURCE_PAGES', 'high', {'conceptId': cid, 'source': source})
            if not source['validEvidencePointers']:
                flag(qid, 'MISSING_SOURCE_EVIDENCE_POINTER', 'high', {'conceptId': cid, 'source': source})

            anchored_cards = [c for c in cards_by_concept.get(cid, []) if c.get('status') == 'approved']
            support_text = ' '.join([
                concept.get('title',''), ' '.join(concept.get('tags') or []),
                ' '.join(card_learning_text(c) for c in anchored_cards),
            ])
            st = tokens(support_text)
            overlap = sorted(qt & st)
            lexical_support = len(overlap)
            exact_answer_support = False
            normalized_q = norm(qtext)
            for card in anchored_cards:
                back = norm(card.get('back') or card.get('answer') or card.get('text'))
                if back and (back in normalized_q or normalized_q in back):
                    exact_answer_support = True
                    break

            narrow_support = bool(overlap) and len(st) <= 4
            supported = exact_answer_support or lexical_support >= 2 or narrow_support
            if not anchored_cards:
                flag(qid, 'NO_APPROVED_CARD_FOR_TARGET_CONCEPT', 'review', {'conceptId': cid})
            elif not supported:
                flag(qid, 'LOW_LEXICAL_SOURCE_ALIGNMENT', 'review', {
                    'conceptId': cid,
                    'conceptTitle': concept.get('title'),
                    'sectionId': section_id,
                    'sourceSection': source['sourceSection'],
                    'sourcePages': source['printedPages'],
                    'evidencePointers': source['evidencePointers'],
                    'approvedCardIds': [c['id'] for c in anchored_cards],
                    'sharedTokens': overlap,
                })

        if len({x for x in chapters_for_question if x}) > 1:
            flag(qid, 'MULTI_CHAPTER_TARGET_ANCHORS', 'review', {'chapterIds': sorted(x for x in chapters_for_question if x)})

        generation = q.get('generation') or {}
        for cid in generation.get('distractorConceptIds', []) or []:
            if cid not in concept_by:
                flag(qid, 'MISSING_GENERATION_DISTRACTOR_CONCEPT', 'high', {'conceptId': cid})
        for card_id in generation.get('evidenceCardIds', []) or []:
            if card_id not in card_by:
                flag(qid, 'MISSING_GENERATION_EVIDENCE_CARD', 'high', {'cardId': card_id})

        repair = q.get('repair') or {}
        distractor_cids = repair.get('distractorConceptIds', []) or []
        evidence_cards = repair.get('evidenceCardIds', []) or []
        for cid in distractor_cids:
            if cid not in concept_by:
                flag(qid, 'MISSING_REPAIR_DISTRACTOR_CONCEPT', 'critical', {'conceptId': cid})
        evidence_concepts = set()
        for card_id in evidence_cards:
            card = card_by.get(card_id)
            if not card:
                flag(qid, 'MISSING_REPAIR_EVIDENCE_CARD', 'critical', {'cardId': card_id})
                continue
            ids = list(card.get('conceptIds') or [])
            if card.get('conceptId'):
                ids.append(card['conceptId'])
            evidence_concepts.update(ids)
        if distractor_cids and not set(distractor_cids).issubset(evidence_concepts):
            flag(qid, 'REPAIR_EVIDENCE_CONCEPT_MISMATCH', 'critical', {
                'distractorConceptIds': distractor_cids,
                'evidenceCardIds': evidence_cards,
                'evidenceConceptIds': sorted(evidence_concepts),
            })

    used_missing_cards = sorted(cid for cid in used_concepts if not cards_by_concept.get(cid))
    used_missing_source = sorted(
        cid for cid in used_concepts
        if cid in concept_by and not source_shape(concept_by[cid])['validEvidencePointers']
    )

    severity_counts = Counter(f['severity'] for f in findings)
    code_counts = Counter(f['code'] for f in findings)
    question_ids = sorted({f['questionId'] for f in findings})
    actionable = sorted({f['questionId'] for f in findings if f['severity'] in {'critical','high'}})
    review = sorted({f['questionId'] for f in findings if f['severity'] == 'review'} - set(actionable))

    return {
        'schemaVersion': 2,
        'phase': 'P26F',
        'status': 'source-alignment-audited',
        'baseline': {
            'questionBankSha256': sha(DATA / 'questions.json'),
            'conceptBankSha256': sha(DATA / 'concepts.json'),
            'cardBankSha256': sha(DATA / 'cards.json'),
            'sectionBankSha256': sha(DATA / 'sections.json'),
        },
        'scope': {
            'questionCount': len(questions),
            'conceptCount': len(concepts),
            'cardCount': len(cards),
            'usedConceptCount': len(used_concepts),
            'questionBankMutatedByAudit': False,
            'externalClinicalGuidanceAdded': False,
        },
        'summary': {
            'questionsWithFindings': len(question_ids),
            'actionableQuestionCount': len(actionable),
            'reviewQuestionCount': len(review),
            'criticalFindings': severity_counts.get('critical', 0),
            'highFindings': severity_counts.get('high', 0),
            'reviewFindings': severity_counts.get('review', 0),
            'usedConceptsWithoutCards': len(used_missing_cards),
            'usedConceptsWithoutSourceEvidence': len(used_missing_source),
            'codeCounts': dict(sorted(code_counts.items())),
        },
        'actionableQuestionIds': actionable,
        'reviewQuestionIds': review,
        'usedConceptIdsWithoutCards': used_missing_cards,
        'usedConceptIdsWithoutSourceEvidence': used_missing_source,
        'findings': findings,
        'policy': {
            'manualAndDeterministicSourceSchemasSupported': True,
            'structuralSourceMetadataRequired': True,
            'conceptSectionChapterIntegrityRequired': True,
            'approvedCardSupportAudited': True,
            'explicitRepairEvidenceAudited': True,
            'externalClinicalGuidanceAdded': False,
            'questionContentEditedByAudit': False,
        },
    }


def write_md(report: dict[str, Any]) -> str:
    s = report['summary']
    lines = [
        '# P26F — Source Alignment Audit', '',
        '> Repository-local source alignment audit of all 1,299 questions. No external clinical guidance is used.', '',
        f"- Questions audited: **{report['scope']['questionCount']}**",
        f"- Used concepts audited: **{report['scope']['usedConceptCount']}**",
        f"- Actionable questions: **{s['actionableQuestionCount']}**",
        f"- Review-only questions: **{s['reviewQuestionCount']}**",
        f"- Critical findings: **{s['criticalFindings']}**",
        f"- High findings: **{s['highFindings']}**",
        f"- Review findings: **{s['reviewFindings']}**",
        f"- Used concepts without cards: **{s['usedConceptsWithoutCards']}**",
        f"- Used concepts without source evidence: **{s['usedConceptsWithoutSourceEvidence']}**", '',
        '## Finding counts', '',
    ]
    if not s['codeCounts']:
        lines.append('- None')
    else:
        for code, count in s['codeCounts'].items():
            lines.append(f'- `{code}`: {count}')
    lines += ['', '## Actionable questions', '']
    lines.extend(f'- `{qid}`' for qid in report['actionableQuestionIds']) if report['actionableQuestionIds'] else lines.append('None.')
    lines += ['', '## Review-only questions', '']
    lines.extend(f'- `{qid}`' for qid in report['reviewQuestionIds']) if report['reviewQuestionIds'] else lines.append('None.')
    lines += ['', 'The JSON report contains the exact residual finding evidence for deterministic follow-up.', '']
    return '\n'.join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report = audit()
    if args.write:
        REPORTS.mkdir(exist_ok=True)
        (REPORTS / 'P26F_SOURCE_ALIGNMENT_AUDIT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (REPORTS / 'P26F_SOURCE_ALIGNMENT_AUDIT.md').write_text(write_md(report), encoding='utf-8')
    residual = report['findings'] if len(report['findings']) <= 50 else []
    print(json.dumps({
        'phase': report['phase'],
        'scope': report['scope'],
        'summary': report['summary'],
        'actionableQuestionIds': report['actionableQuestionIds'],
        'reviewQuestionIds': report['reviewQuestionIds'],
        'residualFindings': residual,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
