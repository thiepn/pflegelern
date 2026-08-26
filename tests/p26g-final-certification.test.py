import hashlib
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = ROOT / 'data' / 'questions.json'
EXPECTED_SHA = '40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024'
EXPECTED_TYPES = Counter({
    'single_choice': 699,
    'short_answer': 321,
    'clinical_case': 214,
    'matching': 39,
    'multiple_choice': 24,
    'ordering': 2,
})


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


cert = load_module('p26g_final_certification', ROOT / 'tools' / 'p26g_final_certification.py')
questions_before = QUESTIONS.read_bytes()
questions = json.loads(questions_before)
manifest = json.loads((ROOT / 'data/manifest.json').read_text(encoding='utf-8'))
materialized = json.loads((ROOT / 'reports/P26G_FINAL_QUESTION_CERTIFICATION.json').read_text(encoding='utf-8'))
service_worker = (ROOT / 'service-worker.js').read_text(encoding='utf-8')

assert len(questions) == 1299
assert Counter(q['type'] for q in questions) == EXPECTED_TYPES
assert hashlib.sha256(questions_before).hexdigest() == EXPECTED_SHA
if manifest['phase'] == 'P26G':
    assert manifest['version'] == '1.1.0-dev.26g'
    assert manifest['status'] == 'p26g-final-1299-question-certification'
    assert 'pflegelern-p26g-v1.1.0-dev26g' in service_worker
else:
    assert manifest['phase'] >= 'P27A'
    assert any(str(note).startswith('P26G freezes and certifies') for note in manifest.get('notes', []))
    assert 'pflegelern-' in service_worker

fresh = cert.certify()
assert fresh == materialized
assert fresh['status'] == 'PASS'
assert fresh['certification'] == 'final-1299-question-bank-v1'
assert fresh['freeze']['state'] == 'CERTIFIED_FROZEN'
assert fresh['freeze']['questionBankSha256'] == EXPECTED_SHA
assert fresh['freeze']['expectedQuestionBankSha256'] == EXPECTED_SHA
assert fresh['freeze']['semanticProjectionSha256'] == 'b6c5cff467765879ceff70b38281f2f8e9db122951c58bc8078b75adfb617d68'

assert fresh['bank'] == {
    'questions': 1299,
    'typeCounts': {
        'single_choice': 699,
        'multiple_choice': 24,
        'ordering': 2,
        'matching': 39,
        'short_answer': 321,
        'clinical_case': 214,
    },
    'objectiveQuestions': 764,
    'applicationQuestions': 535,
    'chapters': 66,
    'sections': 1363,
    'concepts': 2089,
    'cards': 2094,
}

contracts = fresh['contracts']
assert contracts['uniqueQuestionIds'] is True
assert contracts['validConceptReferenceGraph'] is True
assert contracts['validAnswerInputContractForAllQuestions'] is True
assert contracts['sixSupportedQuestionTypesOnly'] is True
assert contracts['p25aVarietyCertificationClosed'] is True
assert contracts['p26SemanticClosure'] is True
assert contracts['p26SourceAlignmentClosure'] is True
assert contracts['externalClinicalGuidanceAddedByP26FOrP26G'] is False
assert contracts['questionLearningContentEditedByP26G'] is False

history = fresh['historicalClosure']
assert history['p25a']['legacyQuestionsPreserved'] == 954
assert history['p25a']['generatedQuestions'] == 345
assert history['p26aConfirmedDefects'] == 7
assert history['p26bRepairs'] == 7
assert history['p26cConfirmedForRepair'] == 14
assert history['p26dRepairs'] == 14
assert history['p26eActionableDefects'] == 0
assert history['p26eUnadjudicatedSignals'] == 0
assert history['p26fSourceFindings'] == 0

assert fresh['findings'] == {
    'inputContract': {},
    'referenceGraph': {},
    'questionStatus': {},
    'errors': [],
    'warnings': [],
}

for key, value in fresh['policy'].items():
    assert value is False, (key, value)

assert QUESTIONS.read_bytes() == questions_before

print(json.dumps({
    'currentPhase': manifest['phase'],
    'certifiedPhase': 'P26G',
    'status': fresh['status'],
    'questions': fresh['bank']['questions'],
    'objectiveQuestions': fresh['bank']['objectiveQuestions'],
    'applicationQuestions': fresh['bank']['applicationQuestions'],
    'questionBankSha256': fresh['freeze']['questionBankSha256'],
    'semanticProjectionSha256': fresh['freeze']['semanticProjectionSha256'],
    'residualFindings': len(fresh['findings']['errors']),
}, ensure_ascii=False, indent=2))
print('P26G frozen-bank phase-forward certification passed.')
