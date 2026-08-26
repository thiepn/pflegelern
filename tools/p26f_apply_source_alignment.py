#!/usr/bin/env python3
"""Apply the bounded source-hierarchy corrections certified for P26F.

Corrections are limited to source metadata/hierarchy. Question prompts, answer
options, answer keys, explanations, IDs, types, and difficulty are untouched.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
REPORTS = ROOT / 'reports'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dump_pretty(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def dump_compact(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()

    qpath = DATA / 'questions.json'
    cpath = DATA / 'concepts.json'
    spath = DATA / 'sections.json'

    questions = load(qpath)
    concepts = load(cpath)
    sections = load(spath)
    before = {
        'questionBankSha256': digest(qpath),
        'conceptBankSha256': digest(cpath),
        'sectionBankSha256': digest(spath),
    }

    q_by = {q['id']: q for q in questions}
    c_by = {c['id']: c for c in concepts}
    s_by = {s['id']: s for s in sections}

    # Exact source hierarchy recovered from the uploaded 2015 textbook:
    # 3.2.2 Kurative Pflege starts on printed p. 33.
    # 8.1.1 Was ist Stress? starts on printed p. 145 and contains the p. 146/148 concepts below.
    new_sections = [
        {
            'id': 'sec-3-2-2',
            'number': '3.2.2',
            'title': 'Kurative Pflege',
            'chapterId': 'chapter-3',
            'firstPdfPage': 33,
            'p26fRecoveredSourceAlignment': True,
        },
        {
            'id': 'sec-8-1-1',
            'number': '8.1.1',
            'title': 'Was ist Stress?',
            'chapterId': 'chapter-8',
            'firstPdfPage': 145,
            'p26fRecoveredSourceAlignment': True,
        },
    ]

    for row in new_sections:
        if row['id'] in s_by:
            assert s_by[row['id']] == row, (row['id'], s_by[row['id']])
        else:
            anchor_id = 'sec-3-2-1' if row['id'] == 'sec-3-2-2' else 'sec-8-1'
            idx = next(i for i, s in enumerate(sections) if s['id'] == anchor_id)
            sections.insert(idx + 1, deepcopy(row))
            s_by[row['id']] = row

    concept_patches = {
        'concept-4-33-51-definition-1': {
            'before': {'sectionId': None, 'chapterId': 'chapter-4'},
            'after': {'sectionId': 'sec-3-2-2', 'chapterId': 'chapter-3'},
        },
        'concept-8-146-51-definition-1': {
            'before': {'sectionId': None, 'chapterId': 'chapter-8'},
            'after': {'sectionId': 'sec-8-1-1', 'chapterId': 'chapter-8'},
        },
        'concept-8-146-101-merken-1': {
            'before': {'sectionId': None, 'chapterId': 'chapter-8'},
            'after': {'sectionId': 'sec-8-1-1', 'chapterId': 'chapter-8'},
        },
        'concept-8-148-17-merken-1': {
            'before': {'sectionId': None, 'chapterId': 'chapter-8'},
            'after': {'sectionId': 'sec-8-1-1', 'chapterId': 'chapter-8'},
        },
        'concept-8-148-99-wissen-3': {
            'before': {'sectionId': None, 'chapterId': 'chapter-8'},
            'after': {'sectionId': 'sec-8-1-1', 'chapterId': 'chapter-8'},
        },
    }

    changed_concepts = []
    for cid, patch in concept_patches.items():
        c = c_by[cid]
        current = {k: c.get(k) for k in patch['before']}
        if current == patch['before']:
            for k, v in patch['after'].items():
                c[k] = v
            changed_concepts.append(cid)
        else:
            assert current == patch['after'], (cid, current)

    # P12 serialized its own source snapshot. Keep those two explicit snapshots
    # consistent with their corrected concept/section anchors.
    q_patches = {
        'q-p12-0207': {
            'before': {'sectionId': None, 'chapterId': 'chapter-4'},
            'after': {'sectionId': 'sec-3-2-2', 'chapterId': 'chapter-3'},
        },
        'q-p12-0630': {
            'before': {'sectionId': None, 'chapterId': 'chapter-8'},
            'after': {'sectionId': 'sec-8-1-1', 'chapterId': 'chapter-8'},
        },
    }
    changed_questions = []
    for qid, patch in q_patches.items():
        q = q_by[qid]
        source = q.get('source') or {}
        current = {k: source.get(k) for k in patch['before']}
        if current == patch['before']:
            for k, v in patch['after'].items():
                source[k] = v
            q['source'] = source
            changed_questions.append(qid)
        else:
            assert current == patch['after'], (qid, current)

    # Prove learning content was not touched by the metadata operation.
    immutable_fields = ('id','conceptIds','type','prompt','difficulty','explanation','status','options','correct','correctText','certification')
    original_questions = load(qpath)
    original_by = {q['id']: q for q in original_questions}
    for qid in q_patches:
        for key in immutable_fields:
            assert q_by[qid].get(key) == original_by[qid].get(key), (qid, key)

    if args.write:
        dump_pretty(spath, sections)
        dump_pretty(cpath, concepts)
        dump_compact(qpath, questions)

    after = before if not args.write else {
        'questionBankSha256': digest(qpath),
        'conceptBankSha256': digest(cpath),
        'sectionBankSha256': digest(spath),
    }

    report = {
        'schemaVersion': 1,
        'phase': 'P26F',
        'status': 'source-alignment-corrected',
        'sourceBasis': {
            'title': 'I care – Pflege',
            'editionYear': 2015,
            'recoveredSections': [
                {'number': '3.2.2', 'title': 'Kurative Pflege', 'printedPage': 33},
                {'number': '8.1.1', 'title': 'Was ist Stress?', 'printedPage': 145},
            ],
        },
        'baseline': before,
        'after': after,
        'summary': {
            'recoveredSections': 2,
            'correctedConceptAnchors': 5,
            'correctedQuestionSourceSnapshots': 2,
            'questionLearningContentChanges': 0,
            'externalClinicalGuidanceAdded': False,
        },
        'recoveredSections': new_sections,
        'conceptCorrections': concept_patches,
        'questionSourceCorrections': q_patches,
        'changedConceptIds': sorted(changed_concepts),
        'changedQuestionSourceIds': sorted(changed_questions),
        'policy': {
            'questionIdsChanged': False,
            'questionTypesChanged': False,
            'questionPromptsChanged': False,
            'questionOptionsChanged': False,
            'answerKeysChanged': False,
            'explanationsChanged': False,
            'difficultyChanged': False,
            'fsrsChanged': False,
            'masteryChanged': False,
            'remediationChanged': False,
            'repetitionControlChanged': False,
            'inputHandlingChanged': False,
            'examLogicChanged': False,
            'externalClinicalGuidanceAdded': False,
        },
    }

    if args.write:
        REPORTS.mkdir(exist_ok=True)
        (REPORTS / 'P26F_SOURCE_ALIGNMENT_CORRECTION.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        lines = [
            '# P26F — Source Alignment Correction', '',
            '- Recovered missing section `3.2.2 Kurative Pflege` (printed p. 33).',
            '- Recovered missing section `8.1.1 Was ist Stress?` (starts printed p. 145).',
            '- Corrected 5 concept section/chapter anchors.',
            '- Corrected 2 P12 question source snapshots.',
            '- Changed 0 prompts, options, answer keys, explanations, types, IDs, or difficulty values.',
            '- Added no external clinical guidance.', '',
        ]
        (REPORTS / 'P26F_SOURCE_ALIGNMENT_CORRECTION.md').write_text('\n'.join(lines), encoding='utf-8')

    print(json.dumps({
        'phase': 'P26F',
        'write': args.write,
        'summary': report['summary'],
        'changedConceptIds': report['changedConceptIds'],
        'changedQuestionSourceIds': report['changedQuestionSourceIds'],
        'before': before,
        'after': after,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
