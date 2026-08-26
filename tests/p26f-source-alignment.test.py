import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


base = load_module('p26f_source_alignment', ROOT / 'tools' / 'p26f_source_alignment.py')
refine = load_module('p26f_source_alignment_refinement', ROOT / 'tools' / 'p26f_source_alignment_refinement.py')

questions = json.loads((ROOT / 'data/questions.json').read_text(encoding='utf-8'))
concepts = json.loads((ROOT / 'data/concepts.json').read_text(encoding='utf-8'))
sections = json.loads((ROOT / 'data/sections.json').read_text(encoding='utf-8'))
audit = json.loads((ROOT / 'reports/P26F_SOURCE_ALIGNMENT_AUDIT.json').read_text(encoding='utf-8'))
correction = json.loads((ROOT / 'reports/P26F_SOURCE_ALIGNMENT_CORRECTION.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'data/manifest.json').read_text(encoding='utf-8'))
service_worker = (ROOT / 'service-worker.js').read_text(encoding='utf-8')

assert len(questions) == 1299
assert len(concepts) == 2089
assert Counter(q['type'] for q in questions) == Counter({
    'single_choice': 699,
    'short_answer': 321,
    'clinical_case': 214,
    'matching': 39,
    'multiple_choice': 24,
    'ordering': 2,
})

if manifest['phase'] == 'P26F':
    assert manifest['version'] == '1.1.0-dev.26f'
    assert manifest['status'] == 'p26f-source-alignment-correction'
    assert 'pflegelern-p26f-v1.1.0-dev26f' in service_worker
else:
    assert manifest['phase'] == 'P26G'
    assert manifest['version'] == '1.1.0-dev.26g'
    assert manifest['status'] == 'p26g-final-1299-question-certification'
    assert 'pflegelern-p26g-v1.1.0-dev26g' in service_worker

assert correction['phase'] == 'P26F'
assert correction['status'] == 'source-alignment-corrected'
assert correction['summary'] == {
    'recoveredSections': 2,
    'correctedConceptAnchors': 5,
    'correctedQuestionSourceSnapshots': 2,
    'questionLearningContentChanges': 0,
    'externalClinicalGuidanceAdded': False,
}
assert correction['baseline']['questionBankSha256'] == 'e385cc4ed8f7b19b2fd65ef6196253f9c061382cc1b41ca4d5f350e7dcf136ba'
assert correction['after']['questionBankSha256'] == '40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024'
assert correction['after']['conceptBankSha256'] == 'a7638af7ef4a6dafe1b4bc1a6cc0439b9b8f8d9c832b5bc23c58f7ff03c3bb36'
assert correction['after']['sectionBankSha256'] == '2c409b05be7e69fb945e4c349bd295a62092b707cffe3772c7528cd7d54b8f85'

section_by = {s['id']: s for s in sections}
assert section_by['sec-3-2-2'] == {
    'id': 'sec-3-2-2',
    'number': '3.2.2',
    'title': 'Kurative Pflege',
    'chapterId': 'chapter-3',
    'firstPdfPage': 33,
    'p26fRecoveredSourceAlignment': True,
}
assert section_by['sec-8-1-1'] == {
    'id': 'sec-8-1-1',
    'number': '8.1.1',
    'title': 'Was ist Stress?',
    'chapterId': 'chapter-8',
    'firstPdfPage': 145,
    'p26fRecoveredSourceAlignment': True,
}

concept_by = {c['id']: c for c in concepts}
expected_concepts = {
    'concept-4-33-51-definition-1': ('sec-3-2-2', 'chapter-3'),
    'concept-8-146-51-definition-1': ('sec-8-1-1', 'chapter-8'),
    'concept-8-146-101-merken-1': ('sec-8-1-1', 'chapter-8'),
    'concept-8-148-17-merken-1': ('sec-8-1-1', 'chapter-8'),
    'concept-8-148-99-wissen-3': ('sec-8-1-1', 'chapter-8'),
}
assert set(correction['changedConceptIds']) == set(expected_concepts)
for cid, (sid, chapter) in expected_concepts.items():
    assert concept_by[cid]['sectionId'] == sid
    assert concept_by[cid]['chapterId'] == chapter

q_by = {q['id']: q for q in questions}
assert set(correction['changedQuestionSourceIds']) == {'q-p12-0207', 'q-p12-0630'}
assert q_by['q-p12-0207']['source']['sectionId'] == 'sec-3-2-2'
assert q_by['q-p12-0207']['source']['chapterId'] == 'chapter-3'
assert q_by['q-p12-0630']['source']['sectionId'] == 'sec-8-1-1'
assert q_by['q-p12-0630']['source']['chapterId'] == 'chapter-8'

for key in [
    'questionIdsChanged', 'questionTypesChanged', 'questionPromptsChanged',
    'questionOptionsChanged', 'answerKeysChanged', 'explanationsChanged',
    'difficultyChanged', 'fsrsChanged', 'masteryChanged', 'remediationChanged',
    'repetitionControlChanged', 'inputHandlingChanged', 'examLogicChanged',
    'externalClinicalGuidanceAdded',
]:
    assert correction['policy'][key] is False, key

for report in [audit, refine.audit()]:
    assert report['scope']['questionCount'] == 1299
    assert report['scope']['usedConceptCount'] == 881
    assert report['summary']['questionsWithFindings'] == 0
    assert report['summary']['actionableQuestionCount'] == 0
    assert report['summary']['reviewQuestionCount'] == 0
    assert report['summary']['criticalFindings'] == 0
    assert report['summary']['highFindings'] == 0
    assert report['summary']['reviewFindings'] == 0
    assert report['summary']['usedConceptsWithoutCards'] == 0
    assert report['summary']['usedConceptsWithoutSourceEvidence'] == 0
    assert report['actionableQuestionIds'] == []
    assert report['reviewQuestionIds'] == []
    assert report['findings'] == []

assert refine.audit() == audit

print(json.dumps({
    'currentPhase': manifest['phase'],
    'certifiedPhase': 'P26F',
    'questions': len(questions),
    'usedConcepts': audit['scope']['usedConceptCount'],
    'recoveredSections': correction['summary']['recoveredSections'],
    'correctedConceptAnchors': correction['summary']['correctedConceptAnchors'],
    'correctedQuestionSourceSnapshots': correction['summary']['correctedQuestionSourceSnapshots'],
    'residualFindings': audit['summary']['questionsWithFindings'],
}, ensure_ascii=False, indent=2))
print('P26F source alignment phase-forward certification passed.')
