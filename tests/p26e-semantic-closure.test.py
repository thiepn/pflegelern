import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = ROOT / 'data' / 'questions.json'


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


closure = load_module('p26e_semantic_closure', ROOT / 'tools' / 'p26e_semantic_closure.py')
questions_before = QUESTIONS.read_bytes()
report = closure.build_report()
questions_after = QUESTIONS.read_bytes()

p26a = json.loads((ROOT / 'reports' / 'P26A_SEMANTIC_DEFECT_REGISTRY.json').read_text(encoding='utf-8'))
p26b = json.loads((ROOT / 'reports' / 'P26B_SEMANTIC_CORRECTION_REPORT.json').read_text(encoding='utf-8'))
p26c = json.loads((ROOT / 'reports' / 'P26C_MANUAL_REVIEW_ADJUDICATION.json').read_text(encoding='utf-8'))
p26d = json.loads((ROOT / 'reports' / 'P26D_CONFIRMED_DEFECT_REPAIR.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'data' / 'manifest.json').read_text(encoding='utf-8'))
service_worker = (ROOT / 'service-worker.js').read_text(encoding='utf-8')

assert report['phase'] == 'P26E'
assert report['status'] == 'semantic-audit-closed'
assert report['scope'] == {
    'questionCount': 1299,
    'questionBankMutated': False,
    'externalClinicalGuidanceAdded': False,
    'rawDetectorPreserved': True,
    'historicalAdjudicationsPreserved': True,
}

summary = report['summary']
assert summary['historicalConfirmedDefects'] == 7
assert summary['historicalManualReviewCandidates'] == 108
assert summary['p26bRepairs'] == 7
assert summary['p26cAdjudicated'] == 108
assert summary['p26cCleared'] == 94
assert summary['p26cConfirmedForRepair'] == 14
assert summary['p26dRepairs'] == 14
assert summary['rawDetectorConfirmedDefects'] == 0
assert summary['rawDetectorReviewSignals'] == 94
assert summary['clearedHistoricalSignals'] == 94
assert summary['actionableDefects'] == 0
assert summary['unadjudicatedSignals'] == 0
assert summary['pendingRepairs'] == 0
assert summary['staleRepairTargets'] == 0
assert summary['semanticClosure'] is True

p26a_confirmed = set(p26a['confirmedDefectIds'])
p26a_manual = {
    row['questionId'] for row in p26a['registry']
    if row.get('disposition') == 'manual-review'
}
p26b_targets = set(p26b['targetQuestionIds'])
p26c_cleared = set(p26c['clearedIds'])
p26c_repair = set(p26c['confirmedForRepairIds'])
p26d_targets = set(p26d['targetQuestionIds'])
live_review = set(report['liveDetector']['manualReviewSignalIds'])

assert len(p26a_confirmed) == 7
assert len(p26a_manual) == 108
assert p26b_targets == p26a_confirmed
assert len(p26c_cleared) == 94
assert len(p26c_repair) == 14
assert p26c_cleared | p26c_repair == p26a_manual
assert not (p26c_cleared & p26c_repair)
assert p26d_targets == p26c_repair
assert live_review == p26c_cleared
assert not (live_review & p26d_targets)
assert report['liveDetector']['confirmedDefectIds'] == []
assert report['closure'] == {
    'actionableDefectIds': [],
    'unadjudicatedSignalIds': [],
    'pendingRepairIds': [],
    'staleRepairTargetIds': [],
}

assert report['clearedSignalClassification']['categoryCounts'] == {
    'case-context-present': 2,
    'intentional-matching-template': 12,
    'source-card-contract': 80,
}
assert report['clearedSignalClassification']['typeCounts'] == {
    'clinical_case': 2,
    'matching': 12,
    'short_answer': 80,
}
assert set(report['clearedSignalClassification']['questionIds']) == p26c_cleared

live_sha = hashlib.sha256(questions_after).hexdigest()
assert report['baseline']['liveQuestionBankSha256'] == live_sha
assert live_sha == p26d['baseline']['questionBankAfterSha256']
assert questions_after == questions_before

for key, value in report['policy'].items():
    if key.endswith('Changed') or key.endswith('Edited') or key.endswith('Rewritten') or key == 'externalClinicalGuidanceAdded':
        assert value is False, (key, value)

if manifest['phase'] == 'P26E':
    assert manifest['version'] == '1.1.0-dev.26e'
    assert manifest['status'] == 'p26e-semantic-closure-certification'
    assert 'pflegelern-p26e-v1.1.0-dev26e' in service_worker
else:
    assert manifest['phase'] == 'P26D'

materialized = ROOT / 'reports' / 'P26E_SEMANTIC_CLOSURE.json'
if materialized.exists():
    disk_report = json.loads(materialized.read_text(encoding='utf-8'))
    assert disk_report == report

print(json.dumps({
    'phase': report['phase'],
    'questions': report['scope']['questionCount'],
    'rawReviewSignals': summary['rawDetectorReviewSignals'],
    'clearedHistoricalSignals': summary['clearedHistoricalSignals'],
    'actionableDefects': summary['actionableDefects'],
    'unadjudicatedSignals': summary['unadjudicatedSignals'],
    'pendingRepairs': summary['pendingRepairs'],
    'semanticClosure': summary['semanticClosure'],
}, ensure_ascii=False, indent=2))
print('P26E semantic closure certification passed.')
