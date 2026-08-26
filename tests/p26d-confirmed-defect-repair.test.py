import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {
    'q-21-5-06', 'q-36-03', 'q-p12-0043', 'q-p12-0163', 'q-p12-0165',
    'q-p12-0272', 'q-p12-0288', 'q-p12-0295', 'q-p12-0310', 'q-p12-0337',
    'q-p12-0344', 'q-p12-0348', 'q-p12-0534', 'q-p12-0634',
}
SUBSUMPTION = {'q-p12-0272', 'q-p12-0344'}
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


audit = load_module('p26a_semantic_audit', ROOT / 'tools' / 'p26a_semantic_audit.py')
refine = load_module('p26a_semantic_refinement', ROOT / 'tools' / 'p26a_semantic_refinement.py')

questions = json.loads((ROOT / 'data' / 'questions.json').read_text(encoding='utf-8'))
concepts = json.loads((ROOT / 'data' / 'concepts.json').read_text(encoding='utf-8'))
cards = json.loads((ROOT / 'data' / 'cards.json').read_text(encoding='utf-8'))
p26c = json.loads((ROOT / 'reports' / 'P26C_MANUAL_REVIEW_ADJUDICATION.json').read_text(encoding='utf-8'))
p26d = json.loads((ROOT / 'reports' / 'P26D_CONFIRMED_DEFECT_REPAIR.json').read_text(encoding='utf-8'))
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
assert set(p26c['confirmedForRepairIds']) == TARGETS
assert p26c['summary']['confirmedForRepair'] == 14
assert p26c['summary']['unresolved'] == 0
assert p26d['phase'] == 'P26D'
assert p26d['status'] == 'confirmed-defects-repaired'
assert set(p26d['targetQuestionIds']) == TARGETS
assert p26d['summary']['targets'] == 14
assert p26d['summary']['repaired'] == 14
assert p26d['summary']['answerOptionSubsumption'] == 2
assert p26d['summary']['distractorDesign'] == 12
assert p26d['summary']['questionCount'] == 1299

# P26D remains a historical repair certification after later semantic phases.
if manifest['phase'] == 'P26D':
    assert manifest['version'] == '1.1.0-dev.26d'
    assert manifest['status'] == 'p26d-confirmed-defect-repair'
    assert 'pflegelern-p26d-v1.1.0-dev26d' in service_worker
else:
    assert manifest['phase'] >= 'P26E'
    assert manifest['version'] != '1.1.0-dev.26d'
    assert 'pflegelern-p26d-v1.1.0-dev26d' not in service_worker

q_by = {q['id']: q for q in questions}
card_by = {c['id']: c for c in cards}
concept_ids = {c['id'] for c in concepts}
repair_by = {r['questionId']: r for r in p26d['repairs']}
assert set(repair_by) == TARGETS

for qid in TARGETS:
    q = q_by[qid]
    row = repair_by[qid]
    assert q['type'] == 'single_choice'
    assert len(q['options']) == 4
    assert len(q['correct']) == 1
    assert [o['id'] for o in q['options']] == ['a', 'b', 'c', 'd']
    assert q['correct'][0] == row['correctOptionId']
    assert q['conceptIds'] == row['targetConceptIds']
    assert q['options'] == row['afterOptions']
    assert row['beforeOptions'] != row['afterOptions']
    assert len(row['distractorConceptIds']) == 3
    assert len(row['evidenceCardIds']) == 3
    assert all(cid in concept_ids for cid in row['distractorConceptIds'])
    assert all(card_id in card_by for card_id in row['evidenceCardIds'])
    evidence_concepts = []
    for card_id in row['evidenceCardIds']:
        card = card_by[card_id]
        ids = list(card.get('conceptIds') or [])
        if card.get('conceptId'):
            ids.append(card['conceptId'])
        evidence_concepts.extend(ids)
    assert set(row['distractorConceptIds']).issubset(set(evidence_concepts)), (qid, row)
    if qid in SUBSUMPTION:
        assert row['issue'] == 'answer-option-subsumption'
    else:
        assert row['issue'] == 'distractor-absolute-wording-cluster'

# The P26C targets should disappear from the live P26A semantic warning set.
post = refine.recompute(audit.semantic_audit(questions, concepts, cards))
assert post['summary']['confirmedDefects'] == 0, post['confirmedDefectIds']
review_ids = {
    entry['questionId'] for entry in post['registry']
    if entry.get('disposition') == 'manual-review'
}
assert not (TARGETS & review_ids), sorted(TARGETS & review_ids)
assert not (P26B_TARGETS & set(post['confirmedDefectIds']))
assert post['summary']['manualReviewCandidates'] == 94, post['summary']
assert post['summary']['flaggedQuestions'] == 94, post['summary']

# P26B repairs remain present.
assert q_by['q-16-1-01']['correct'] == ['b']
assert q_by['q-16-1-02']['correct'] == ['c']
assert q_by['q-p12-0040']['options'][1]['text'].startswith('Als Epidemie bezeichnet man')

policy = p26d['policy']
for key in [
    'externalClinicalGuidanceAdded', 'questionIdsChanged', 'questionTypesChanged',
    'targetConceptsChanged', 'difficultyChanged', 'correctOptionIdsChanged',
    'sourceAnchorsChanged', 'explanationsChanged', 'fsrsChanged', 'masteryChanged',
    'remediationChanged', 'repetitionControlChanged', 'inputHandlingChanged',
    'mockExamLogicChanged',
]:
    assert policy[key] is False, key

print(json.dumps({
    'currentPhase': manifest['phase'],
    'historicalPhase': 'P26D',
    'questions': len(questions),
    'repaired': 14,
    'remainingP26AReviewSignals': post['summary']['manualReviewCandidates'],
    'remainingConfirmedSemanticDefects': post['summary']['confirmedDefects'],
}, ensure_ascii=False, indent=2))
print('P26D confirmed-defect repair phase-forward certification passed.')
