import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_CONFIRMED = {
    'q-21-5-06', 'q-36-03', 'q-p12-0043', 'q-p12-0163', 'q-p12-0165',
    'q-p12-0272', 'q-p12-0288', 'q-p12-0295', 'q-p12-0310', 'q-p12-0337',
    'q-p12-0344', 'q-p12-0348', 'q-p12-0534', 'q-p12-0634',
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


questions_path = ROOT / 'data' / 'questions.json'
questions_before = questions_path.read_bytes()
questions = json.loads(questions_before.decode('utf-8'))
p26a = json.loads((ROOT / 'reports' / 'P26A_SEMANTIC_DEFECT_REGISTRY.json').read_text(encoding='utf-8'))
p26b = json.loads((ROOT / 'reports' / 'P26B_SEMANTIC_CORRECTION_REPORT.json').read_text(encoding='utf-8'))
p26c = json.loads((ROOT / 'reports' / 'P26C_MANUAL_REVIEW_ADJUDICATION.json').read_text(encoding='utf-8'))
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

# P26C's materialized report is a historical decision record. Its result must
# remain stable even after P26D edits the 14 items it intentionally queued.
assert p26c['phase'] == 'P26C'
assert p26c['status'] == 'manual-review-adjudicated'
assert p26c['scope']['p26aManualReviewCandidates'] == 108
assert p26c['scope']['questionBankMutated'] is False
assert p26c['scope']['externalClinicalGuidanceAdded'] is False
assert p26c['summary']['adjudicated'] == 108
assert p26c['summary']['confirmedForRepair'] == 14
assert p26c['summary']['cleared'] == 94
assert p26c['summary']['unresolved'] == 0
assert p26c['summary']['dispositionCounts'] == {
    'cleared': 94,
    'confirmed-design-defect': 12,
    'confirmed-semantic-defect': 2,
}
assert p26c['summary']['categoryCounts'] == {
    'answer-option-subsumption': 2,
    'case-context-present': 2,
    'distractor-absolute-wording-cluster': 12,
    'intentional-matching-template': 12,
    'source-card-contract': 80,
}
assert set(p26c['confirmedForRepairIds']) == EXPECTED_CONFIRMED
assert len(p26c['clearedIds']) == 94
assert p26c['unresolvedIds'] == []
assert not (EXPECTED_CONFIRMED & set(p26c['clearedIds']))
assert not (P26B_TARGETS & EXPECTED_CONFIRMED)
assert set(p26c['confirmedForRepairIds']) | set(p26c['clearedIds']) == {
    e['questionId'] for e in p26a['registry'] if e.get('disposition') == 'manual-review'
}

by_id = {r['questionId']: r for r in p26c['adjudications']}
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

assert p26c['policy']['sourceCardEquivalentEnumerationContractClearsLengthHeuristic'] is True
assert p26c['policy']['p26bSevenCorrectionsReopened'] is False
assert p26c['policy']['questionContentEdited'] is False

if manifest['phase'] == 'P26C':
    assert manifest['version'] == '1.1.0-dev.26c'
    assert manifest['status'] == 'p26c-manual-review-adjudication'
    assert 'pflegelern-p26c-v1.1.0-dev26c' in service_worker
    # At P26C itself, recomputation must reproduce the historical report exactly.
    base = load_module('p26c_adjudicate', ROOT / 'tools' / 'p26c_adjudicate.py')
    refinement = load_module('p26c_adjudication_refinement', ROOT / 'tools' / 'p26c_adjudication_refinement.py')
    assert refinement.adjudicate() == p26c
else:
    assert manifest['phase'] >= 'P26D'
    p26d = json.loads((ROOT / 'reports' / 'P26D_CONFIRMED_DEFECT_REPAIR.json').read_text(encoding='utf-8'))
    assert set(p26d['targetQuestionIds']) == EXPECTED_CONFIRMED
    # The P26C queue has been consumed, while P26C itself remains immutable.
    audit = load_module('p26a_semantic_audit_for_p26c', ROOT / 'tools' / 'p26a_semantic_audit.py')
    refine = load_module('p26a_semantic_refinement_for_p26c', ROOT / 'tools' / 'p26a_semantic_refinement.py')
    concepts = json.loads((ROOT / 'data' / 'concepts.json').read_text(encoding='utf-8'))
    cards = json.loads((ROOT / 'data' / 'cards.json').read_text(encoding='utf-8'))
    live = refine.recompute(audit.semantic_audit(questions, concepts, cards))
    live_review_ids = {
        entry['questionId'] for entry in live['registry']
        if entry.get('disposition') == 'manual-review'
    }
    assert not (EXPECTED_CONFIRMED & live_review_ids)
    assert live['summary']['manualReviewCandidates'] == 94

assert questions_path.read_bytes() == questions_before

print(json.dumps({
    'currentPhase': manifest['phase'],
    'historicalPhase': 'P26C',
    'questions': len(questions),
    'adjudicated': p26c['summary']['adjudicated'],
    'confirmedForRepair': p26c['summary']['confirmedForRepair'],
    'cleared': p26c['summary']['cleared'],
    'unresolved': p26c['summary']['unresolved'],
}, ensure_ascii=False, indent=2))
print('P26C historical adjudication phase-forward regression passed.')
