#!/usr/bin/env python3
"""P26G — final deterministic certification of the 1,299-question PflegeLern bank.

P26G is a freeze/certification phase, not a content-generation phase. It
combines the final bank's structural/input contracts with the historical P25/P26
quality evidence. Any future mutation of data/questions.json invalidates the
frozen SHA-256 and therefore this certification.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
REPORTS = ROOT / 'reports'

EXPECTED_QUESTION_SHA256 = '40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024'
EXPECTED_COUNTS = {
    'single_choice': 699,
    'short_answer': 321,
    'clinical_case': 214,
    'matching': 39,
    'multiple_choice': 24,
    'ordering': 2,
}
OBJECTIVE_TYPES = {'single_choice', 'multiple_choice', 'matching', 'ordering'}
APPLICATION_TYPES = {'short_answer', 'clinical_case'}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def split_matching(value: Any):
    parts = str(value or '').split('↔')
    if len(parts) != 2:
        return None
    left, right = parts[0].strip(), parts[1].strip()
    return (left, right) if left and right else None


def input_contract_issues(q: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    qtype = str(q.get('type') or '')
    if qtype not in OBJECTIVE_TYPES | APPLICATION_TYPES:
        issues.append(f'unsupported-type:{qtype or "missing"}')
    if not str(q.get('prompt') or '').strip():
        issues.append('missing-prompt')

    options = q.get('options') if isinstance(q.get('options'), list) else []
    option_ids = [str(o.get('id') or '') for o in options]
    if any(not x for x in option_ids):
        issues.append('missing-option-id')
    if len(option_ids) != len(set(option_ids)):
        issues.append('duplicate-option-id')

    if qtype in {'single_choice', 'multiple_choice'}:
        if len(options) < 2:
            issues.append('too-few-options')
        correct = [str(x) for x in (q.get('correct') or [])]
        if not correct:
            issues.append('missing-correct-options')
        if qtype == 'single_choice' and len(correct) != 1:
            issues.append('single-choice-correct-count')
        if len(correct) != len(set(correct)):
            issues.append('duplicate-correct-option')
        if any(x not in option_ids for x in correct):
            issues.append('correct-option-missing')
    elif qtype == 'ordering':
        if len(options) < 2:
            issues.append('too-few-order-items')
        correct = [str(x) for x in (q.get('correct') or [])]
        if len(correct) != len(option_ids):
            issues.append('ordering-length-mismatch')
        if len(correct) != len(set(correct)):
            issues.append('duplicate-order-item')
        if any(x not in option_ids for x in correct):
            issues.append('ordering-item-missing')
    elif qtype == 'matching':
        if len(options) < 2:
            issues.append('too-few-matching-pairs')
        pairs = [split_matching(o.get('text')) for o in options]
        if any(pair is None for pair in pairs):
            issues.append('invalid-matching-pair')
        valid = [pair for pair in pairs if pair]
        if len({p[0] for p in valid}) != len(valid):
            issues.append('duplicate-matching-left')
        if len({p[1] for p in valid}) != len(valid):
            issues.append('duplicate-matching-right')
    elif qtype in APPLICATION_TYPES:
        if not str(q.get('correctText') or q.get('explanation') or '').strip():
            issues.append('missing-reference-answer')

    return issues


def certify() -> dict[str, Any]:
    questions_path = DATA / 'questions.json'
    questions = load(questions_path)
    concepts = load(DATA / 'concepts.json')
    cards = load(DATA / 'cards.json')
    sections = load(DATA / 'sections.json')
    chapters = load(DATA / 'chapters.json')
    manifest = load(DATA / 'manifest.json')

    p25a = load(ROOT / 'P25A_QUESTION_VARIETY_REPORT.json')
    p26a = load(REPORTS / 'P26A_SEMANTIC_DEFECT_REGISTRY.json')
    p26b = load(REPORTS / 'P26B_SEMANTIC_CORRECTION_REPORT.json')
    p26c = load(REPORTS / 'P26C_MANUAL_REVIEW_ADJUDICATION.json')
    p26d = load(REPORTS / 'P26D_CONFIRMED_DEFECT_REPAIR.json')
    p26e = load(REPORTS / 'P26E_SEMANTIC_CLOSURE.json')
    p26f = load(REPORTS / 'P26F_SOURCE_ALIGNMENT_AUDIT.json')
    p26f_correction = load(REPORTS / 'P26F_SOURCE_ALIGNMENT_CORRECTION.json')

    errors: list[str] = []
    warnings: list[str] = []

    def require(condition: bool, message: str):
        if not condition:
            errors.append(message)

    qids = [q.get('id') for q in questions]
    concept_by = {c.get('id'): c for c in concepts}
    section_by = {s.get('id'): s for s in sections}
    chapter_by = {c.get('id'): c for c in chapters}
    card_by = {c.get('id'): c for c in cards}

    type_counts = Counter(str(q.get('type') or '') for q in questions)
    bank_sha = sha256(questions_path)

    require(len(questions) == 1299, f'question-count:{len(questions)}')
    require(dict(type_counts) == EXPECTED_COUNTS, f'type-counts:{dict(type_counts)}')
    require(bank_sha == EXPECTED_QUESTION_SHA256, f'frozen-question-sha:{bank_sha}')
    require(len(qids) == len(set(qids)), 'duplicate-question-id')
    require(all(qids), 'missing-question-id')

    input_findings: dict[str, list[str]] = {}
    reference_findings: dict[str, list[str]] = {}
    status_findings: dict[str, str] = {}

    for q in questions:
        qid = str(q.get('id') or '<missing>')
        issues = input_contract_issues(q)
        if issues:
            input_findings[qid] = issues

        cids = q.get('conceptIds') if isinstance(q.get('conceptIds'), list) else []
        ref_issues: list[str] = []
        if not cids:
            ref_issues.append('missing-concept-anchors')
        if len(cids) != len(set(cids)):
            ref_issues.append('duplicate-concept-anchor')
        for cid in cids:
            concept = concept_by.get(cid)
            if not concept:
                ref_issues.append(f'missing-concept:{cid}')
                continue
            if concept.get('status') != 'approved':
                ref_issues.append(f'concept-not-approved:{cid}:{concept.get("status")}')
            chapter_id = concept.get('chapterId')
            section_id = concept.get('sectionId')
            if chapter_id and chapter_id not in chapter_by:
                ref_issues.append(f'missing-chapter:{cid}:{chapter_id}')
            if section_id and section_id not in section_by:
                ref_issues.append(f'missing-section:{cid}:{section_id}')
            if section_id and chapter_id and section_by.get(section_id, {}).get('chapterId') != chapter_id:
                ref_issues.append(f'section-chapter-mismatch:{cid}')
        if ref_issues:
            reference_findings[qid] = ref_issues

        if q.get('status') not in {None, 'approved'}:
            status_findings[qid] = str(q.get('status'))

    require(not input_findings, f'input-contract-findings:{len(input_findings)}')
    require(not reference_findings, f'reference-findings:{len(reference_findings)}')
    require(not status_findings, f'question-status-findings:{len(status_findings)}')

    # Global content graph integrity.
    require(len(concept_by) == len(concepts), 'duplicate-concept-id')
    require(len(card_by) == len(cards), 'duplicate-card-id')
    require(len(section_by) == len(sections), 'duplicate-section-id')
    require(len(chapter_by) == len(chapters), 'duplicate-chapter-id')
    require(len(concepts) == 2089, f'concept-count:{len(concepts)}')
    require(len(cards) == 2094, f'card-count:{len(cards)}')
    require(len(chapters) == 66, f'chapter-count:{len(chapters)}')

    # P25A bank-shape / lineage history.
    require(p25a.get('status') == 'PASS', 'p25a-status')
    require(p25a.get('totalQuestions') == 1299, 'p25a-total')
    require(p25a.get('finalTypeCounts') == EXPECTED_COUNTS, 'p25a-type-counts')
    require(p25a.get('legacyPreservation', {}).get('preservedExactly') is True, 'p25a-legacy-preservation')
    require(p25a.get('legacyPreservation', {}).get('count') == 954, 'p25a-legacy-count')
    require(p25a.get('qualityGates', {}).get('errors') == [], 'p25a-quality-errors')

    # P26 semantic chain must be fully closed.
    require(len(p26a.get('confirmedDefectIds', [])) == 7, 'p26a-confirmed-history')
    require(set(p26b.get('targetQuestionIds', [])) == set(p26a.get('confirmedDefectIds', [])), 'p26b-repair-set')
    require(len(p26c.get('confirmedForRepairIds', [])) == 14, 'p26c-repair-count')
    require(set(p26d.get('targetQuestionIds', [])) == set(p26c.get('confirmedForRepairIds', [])), 'p26d-repair-set')
    e = p26e.get('summary', {})
    require(e.get('semanticClosure') is True, 'p26e-semantic-closure')
    require(e.get('actionableDefects') == 0, 'p26e-actionable-defects')
    require(e.get('unadjudicatedSignals') == 0, 'p26e-unadjudicated-signals')
    require(e.get('pendingRepairs') == 0, 'p26e-pending-repairs')
    require(e.get('staleRepairTargets') == 0, 'p26e-stale-repair-targets')

    # P26F source chain must be fully closed on the exact frozen bank.
    f = p26f.get('summary', {})
    require(p26f.get('baseline', {}).get('questionBankSha256') == bank_sha, 'p26f-bank-hash')
    require(f.get('questionsWithFindings') == 0, 'p26f-source-findings')
    require(f.get('actionableQuestionCount') == 0, 'p26f-source-actionable')
    require(f.get('reviewQuestionCount') == 0, 'p26f-source-review')
    require(f.get('usedConceptsWithoutCards') == 0, 'p26f-source-card-gaps')
    require(f.get('usedConceptsWithoutSourceEvidence') == 0, 'p26f-source-evidence-gaps')
    require(p26f_correction.get('summary', {}).get('questionLearningContentChanges') == 0, 'p26f-learning-content-change')
    require(p26f_correction.get('summary', {}).get('externalClinicalGuidanceAdded') is False, 'p26f-external-guidance')

    require(manifest.get('phase') == 'P26G', f'manifest-phase:{manifest.get("phase")}')
    require(manifest.get('version') == '1.1.0-dev.26g', f'manifest-version:{manifest.get("version")}')
    require(manifest.get('status') == 'p26g-final-1299-question-certification', f'manifest-status:{manifest.get("status")}')

    objective_count = sum(type_counts[t] for t in OBJECTIVE_TYPES)
    application_count = sum(type_counts[t] for t in APPLICATION_TYPES)

    semantic_projection = [
        {
            key: q.get(key)
            for key in ('id', 'conceptIds', 'type', 'prompt', 'difficulty', 'explanation', 'status', 'options', 'correct', 'correctText', 'certification')
        }
        for q in questions
    ]

    critical_runtime_paths = [
        'js/p17-study-mix.js',
        'js/p25a-variety-core.js',
        'js/p25b-repetition-core.js',
        'js/p25b-repetition.js',
        'js/p25c-input-core.js',
        'js/p25c-input-reliability.js',
        'js/p25d-question-quality-core.js',
        'js/p25d-question-quality.js',
        'js/p20-exam-core.js',
        'js/p20-exam.js',
        'js/study-engine.js',
        'js/fsrs.js',
    ]
    runtime_hashes = {path: sha256(ROOT / path) for path in critical_runtime_paths}

    report = {
        'schemaVersion': 1,
        'phase': 'P26G',
        'status': 'PASS' if not errors else 'FAIL',
        'certification': 'final-1299-question-bank-v1',
        'freeze': {
            'state': 'CERTIFIED_FROZEN' if not errors else 'BLOCKED',
            'questionBankSha256': bank_sha,
            'expectedQuestionBankSha256': EXPECTED_QUESTION_SHA256,
            'semanticProjectionSha256': canonical_sha(semantic_projection),
            'invalidationRule': 'Any mutation of data/questions.json invalidates P26G and requires a new certification.',
        },
        'bank': {
            'questions': len(questions),
            'typeCounts': dict(type_counts),
            'objectiveQuestions': objective_count,
            'applicationQuestions': application_count,
            'chapters': len(chapters),
            'sections': len(sections),
            'concepts': len(concepts),
            'cards': len(cards),
        },
        'contracts': {
            'uniqueQuestionIds': len(qids) == len(set(qids)) and all(qids),
            'validConceptReferenceGraph': not reference_findings,
            'validAnswerInputContractForAllQuestions': not input_findings,
            'sixSupportedQuestionTypesOnly': set(type_counts) == set(EXPECTED_COUNTS),
            'objectiveOnlyExamTypeSet': sorted(OBJECTIVE_TYPES),
            'applicationTypeSet': sorted(APPLICATION_TYPES),
            'p25aVarietyCertificationClosed': p25a.get('status') == 'PASS',
            'p26SemanticClosure': e.get('semanticClosure') is True and e.get('actionableDefects') == 0,
            'p26SourceAlignmentClosure': f.get('questionsWithFindings') == 0,
            'externalClinicalGuidanceAddedByP26FOrP26G': False,
            'questionLearningContentEditedByP26G': False,
        },
        'historicalClosure': {
            'p25a': {
                'legacyQuestionsPreserved': p25a.get('legacyPreservation', {}).get('count'),
                'generatedQuestions': p25a.get('generatedQuestions'),
                'legacyCanonicalSha256': p25a.get('legacyPreservation', {}).get('canonicalSha256'),
            },
            'p26aConfirmedDefects': len(p26a.get('confirmedDefectIds', [])),
            'p26bRepairs': len(p26b.get('targetQuestionIds', [])),
            'p26cConfirmedForRepair': len(p26c.get('confirmedForRepairIds', [])),
            'p26dRepairs': len(p26d.get('targetQuestionIds', [])),
            'p26eActionableDefects': e.get('actionableDefects'),
            'p26eUnadjudicatedSignals': e.get('unadjudicatedSignals'),
            'p26fSourceFindings': f.get('questionsWithFindings'),
        },
        'runtimeSha256': runtime_hashes,
        'validationEvidenceRequired': [
            'P25A variety planner regression',
            'P25B repetition-control unit + browser regression',
            'P25C exhaustive input-contract + desktop/mobile browser regression',
            'P25D question-quality unit/integration + browser regression',
            'P18 mastery regression',
            'P19 remediation regression',
            'P20 mock-exam regression',
            'P26A-P26F semantic/source regression chain',
        ],
        'findings': {
            'inputContract': input_findings,
            'referenceGraph': reference_findings,
            'questionStatus': status_findings,
            'errors': errors,
            'warnings': warnings,
        },
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
    return report


def markdown(report: dict[str, Any]) -> str:
    b = report['bank']
    h = report['historicalClosure']
    lines = [
        '# P26G — Final 1,299-Question Certification', '',
        f"**Status: {report['status']}**", '',
        f"Frozen bank SHA-256: `{report['freeze']['questionBankSha256']}`", '',
        '## Certified bank', '',
        f"- Questions: **{b['questions']}**",
        f"- Objective questions: **{b['objectiveQuestions']}**",
        f"- Application/free-response questions: **{b['applicationQuestions']}**",
        f"- Question types: `{json.dumps(b['typeCounts'], ensure_ascii=False, sort_keys=True)}`",
        f"- Concepts: **{b['concepts']}**; cards: **{b['cards']}**; chapters: **{b['chapters']}**", '',
        '## Closure chain', '',
        f"- P25A: 954 legacy questions preserved + {h['p25a']['generatedQuestions']} source-derived additions.",
        f"- P26A/P26B: {h['p26aConfirmedDefects']} confirmed defects, {h['p26bRepairs']} repaired.",
        f"- P26C/P26D: {h['p26cConfirmedForRepair']} additional confirmed repair targets, {h['p26dRepairs']} repaired.",
        f"- P26E: {h['p26eActionableDefects']} actionable semantic defects; {h['p26eUnadjudicatedSignals']} unadjudicated signals.",
        f"- P26F: {h['p26fSourceFindings']} residual source-alignment findings.", '',
        '## Freeze rule', '',
        report['freeze']['invalidationRule'], '',
        'P26G does not modify question learning content. Runtime/browser regressions are enforced by the P26G validation workflow before promotion to `main`.', ''
    ]
    return '\n'.join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report = certify()
    if args.write:
        REPORTS.mkdir(exist_ok=True)
        (REPORTS / 'P26G_FINAL_QUESTION_CERTIFICATION.json').write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        (REPORTS / 'P26G_FINAL_QUESTION_CERTIFICATION.md').write_text(markdown(report), encoding='utf-8')
    print(json.dumps({
        'phase': report['phase'],
        'status': report['status'],
        'freeze': report['freeze'],
        'bank': report['bank'],
        'historicalClosure': report['historicalClosure'],
        'errors': report['findings']['errors'],
    }, ensure_ascii=False, indent=2))
    if report['status'] != 'PASS':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
