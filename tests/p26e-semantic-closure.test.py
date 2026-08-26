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


questions_before = QUESTIONS.read_bytes()
p26a = json.loads((ROOT / 'reports/P26A_SEMANTIC_DEFECT_REGISTRY.json').read_text(encoding='utf-8'))
p26b = json.loads((ROOT / 'reports/P26B_SEMANTIC_CORRECTION_REPORT.json').read_text(encoding='utf-8'))
p26c = json.loads((ROOT / 'reports/P26C_MANUAL_REVIEW_ADJUDICATION.json').read_text(encoding='utf-8'))
p26d = json.loads((ROOT / 'reports/P26D_CONFIRMED_DEFECT_REPAIR.json').read_text(encoding='utf-8'))
p26e = json.loads((ROOT / 'reports/P26E_SEMANTIC_CLOSURE.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'data/manifest.json').read_text(encoding='utf-8'))
service_worker = (ROOT / 'service-worker.js').read_text(encoding='utf-8')

# P26E remains an immutable historical closure record after source-only phases.
assert p26e['phase'] == 'P26E'
assert p26e['status'] == 'semantic-audit-closed'
summary = p26e['summary']
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
p26a_manual = {r['questionId'] for r in p26a['registry'] if r.get('disposition') == 'manual-review'}
p26c_cleared = set(p26c['clearedIds'])
p26c_repair = set(p26c['confirmedForRepairIds'])
assert set(p26b['targetQuestionIds']) == p26a_confirmed
assert p26c_cleared | p26c_repair == p26a_manual
assert set(p26d['targetQuestionIds']) == p26c_repair
assert set(p26e['liveDetector']['manualReviewSignalIds']) == p26c_cleared
assert p26e['closure'] == {
    'actionableDefectIds': [],
    'unadjudicatedSignalIds': [],
    'pendingRepairIds': [],
    'staleRepairTargetIds': [],
}

if manifest['phase'] == 'P26E':
    closure = load_module('p26e_semantic_closure', ROOT / 'tools/p26e_semantic_closure.py')
    assert closure.build_report() == p26e
    assert manifest['version'] == '1.1.0-dev.26e'
    assert manifest['status'] == 'p26e-semantic-closure-certification'
    assert 'pflegelern-p26e-v1.1.0-dev26e' in service_worker
else:
    assert manifest['phase'] >= 'P26F'
    # Later source-metadata phases may change the question-bank byte hash without
    # changing semantic learning content. Re-run only the semantic detector and
    # prove P26E's substantive closure still holds.
    audit = load_module('p26a_semantic_audit_for_p26e', ROOT / 'tools/p26a_semantic_audit.py')
    refine = load_module('p26a_semantic_refinement_for_p26e', ROOT / 'tools/p26a_semantic_refinement.py')
    questions = json.loads(QUESTIONS.read_text(encoding='utf-8'))
    concepts = json.loads((ROOT / 'data/concepts.json').read_text(encoding='utf-8'))
    cards = json.loads((ROOT / 'data/cards.json').read_text(encoding='utf-8'))
    live = refine.recompute(audit.semantic_audit(questions, concepts, cards))
    live_review = {r['questionId'] for r in live['registry'] if r.get('disposition') == 'manual-review'}
    assert live['summary']['confirmedDefects'] == 0
    assert live['summary']['manualReviewCandidates'] == 94
    assert live['summary']['flaggedQuestions'] == 94
    assert live_review == p26c_cleared
    assert not (set(p26d['targetQuestionIds']) & live_review)

assert QUESTIONS.read_bytes() == questions_before

print(json.dumps({
    'currentPhase': manifest['phase'],
    'historicalPhase': 'P26E',
    'semanticClosure': True,
    'clearedHistoricalSignals': 94,
    'actionableDefects': 0,
}, ensure_ascii=False, indent=2))
print('P26E semantic closure phase-forward certification passed.')
