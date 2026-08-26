import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_CONFIRMED = {
    'q-21-5-06',
    'q-36-03',
    'q-p12-0043',
    'q-p12-0163',
    'q-p12-0165',
    'q-p12-0272',
    'q-p12-0288',
    'q-p12-0295',
    'q-p12-0310',
    'q-p12-0337',
    'q-p12-0344',
    'q-p12-0348',
    'q-p12-0534',
    'q-p12-0634',
}
P26B_TARGETS = {
    'q-16-1-01', 'q-16-1-02', 'q-16-1-04', 'q-36-01',
    'q-48-4-06', 'q-61-4-04', 'q-p12-0040',
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


# Import base first, then the refinement which patches the final P26C policy.
base = load_module('p26c_adjudicate', ROOT / 'tools' / 'p26c_adjudicate.py')
refinement = load_module('p26c_adjudication_refinement', ROOT / 'tools' / 'p26c_adjudication_refinement.py')

questions_path = ROOT / 'data' / 'questions.json'
questions_before = questions_path.read_bytes()
questions = json.loads(questions_before.decode('utf-8'))
p26a = json.loads((ROOT / 'reports' / 'P26A_SEMANTIC_DEFECT_REGISTRY.json').read_text(encoding='utf-8'))
p26b = json.loads((ROOT / 'reports' / 'P26B_SEMANTIC_CORRECTION_REPORT.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'data' / 'manifest.json').read_text(encoding='utf-8'))
service_worker = (ROOT / 'service-worker.js').read_text(encoding='utf-8')

assert len(questions) == 1299
assert Counter(q['type'] for q in questions) == Counter({
    'single_choice': 699,
    'short_answer': 321,
    'clinical_case': 214,
    'matching': 39,
    'multiple_choice': 24,
    'ordering': 2,
})
assert p26a['summary']['manualReviewCandidates'] == 108
assert set(p26b['targetQuestionIds']) == P26B_TARGETS

report = refinement.adjudicate()
summary = report['summary']
assert report['phase'] == 'P26C'
assert report['status'] == 'manual-review-adjudicated'
assert report['scope']['p26aManualReviewCandidates'] == 108
assert report['scope']['questionBankMutated'] is False
assert report['scope']['externalClinicalGuidanceAdded'] is False
assert summary['adjudicated'] == 108
assert summary['confirmedForRepair'] == 14
assert summary['cleared'] == 94
assert summary['unresolved'] == 0
assert summary['dispositionCounts'] == {
    'cleared': 94,
    'confirmed-design-defect': 12,
    'confirmed-semantic-defect': 2,
}
assert summary['categoryCounts'] == {
    'answer-option-subsumption': 2,
    'case-context-present': 2,
    'distractor-absolute-wording-cluster': 12,
    'intentional-matching-template': 12,
    'source-card-contract': 80,
}
assert summary['typeCounts'] == {
    'clinical_case': 2,
    'matching': 12,
    'short_answer': 80,
    'single_choice': 14,
}
assert set(report['confirmedForRepairIds']) == EXPECTED_CONFIRMED
assert len(report['clearedIds']) == 94
assert report['unresolvedIds'] == []
assert not (EXPECTED_CONFIRMED & set(report['clearedIds']))
assert not (P26B_TARGETS & EXPECTED_CONFIRMED)
assert set(report['confirmedForRepairIds']) | set(report['clearedIds']) == {
    e['questionId'] for e in p26a['registry'] if e.get('disposition') == 'manual-review'
}

by_id = {r['questionId']: r for r in report['adjudications']}
assert by_id['q-p12-0272']['disposition'] == 'confirmed-semantic-defect'
assert by_id['q-p12-0344']['disposition'] == 'confirmed-semantic-defect'
assert by_id['q-36-03']['disposition'] == 'confirmed-design-defect'
assert by_id['q-case-p7b-aneurysm']['disposition'] == 'cleared'
assert by_id['q-case-p7b-postop-bleeding']['disposition'] == 'cleared'
for i in range(1, 13):
    assert by_id[f'q-p12-match-{i:02d}']['category'] == 'intentional-matching-template'

q3610 = by_id['q-36-10']
assert q3610['disposition'] == 'cleared'
assert q3610['category'] == 'source-card-contract'
assert q3610['evidence']['resolutionMode'] == 'equivalent-enumeration-prompt'
assert q3610['evidence']['matchingCardIds'] == ['card-36-6r-list']

assert report['policy']['sourceCardEquivalentEnumerationContractClearsLengthHeuristic'] is True
assert report['policy']['p26bSevenCorrectionsReopened'] is False
assert report['policy']['questionContentEdited'] is False
assert report['policy']['fsrsChanged'] is False
assert report['policy']['masteryChanged'] is False
assert report['policy']['remediationChanged'] is False
assert report['policy']['examLogicChanged'] is False

assert manifest['phase'] == 'P26C'
assert manifest['version'] == '1.1.0-dev.26c'
assert manifest['status'] == 'p26c-manual-review-adjudication'
assert 'pflegelern-p26c-v1.1.0-dev26c' in service_worker

# P26C is adjudication-only. Recomputing it cannot alter the production bank.
assert questions_path.read_bytes() == questions_before

materialized = ROOT / 'reports' / 'P26C_MANUAL_REVIEW_ADJUDICATION.json'
if materialized.exists():
    disk_report = json.loads(materialized.read_text(encoding='utf-8'))
    assert disk_report == report

print(json.dumps({
    'phase': 'P26C',
    'questions': len(questions),
    'adjudicated': summary['adjudicated'],
    'confirmedForRepair': summary['confirmedForRepair'],
    'cleared': summary['cleared'],
    'unresolved': summary['unresolved'],
    'confirmedForRepairIds': report['confirmedForRepairIds'],
}, ensure_ascii=False, indent=2))
print('P26C manual-review adjudication certification passed.')
