import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
questions = json.loads((ROOT / 'data/questions.json').read_text(encoding='utf-8'))
concepts = json.loads((ROOT / 'data/concepts.json').read_text(encoding='utf-8'))
cards = json.loads((ROOT / 'data/cards.json').read_text(encoding='utf-8'))
report = json.loads((ROOT / 'reports/P26B_SEMANTIC_CORRECTION_REPORT.json').read_text(encoding='utf-8'))

known = {q['id'] for q in questions} | {c['id'] for c in concepts} | {c['id'] for c in cards}
missing = {}
for repair in report['repairs']:
    unresolved = [evidence_id for evidence_id in repair.get('evidenceIds', []) if evidence_id not in known]
    if unresolved:
        missing[repair['questionId']] = unresolved

assert not missing, missing
print(json.dumps({'phase': 'P26B', 'evidenceReferences': sum(len(r.get('evidenceIds', [])) for r in report['repairs']), 'unresolved': 0}, indent=2))
print('P26B evidence-reference integrity passed.')
