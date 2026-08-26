import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


audit_module = load_module('p27a_release_readiness_audit', ROOT / 'tools/p27a_release_readiness_audit.py')
report = json.loads((ROOT / 'reports/P27A_RELEASE_READINESS_AUDIT.json').read_text(encoding='utf-8'))
manifest = json.loads((ROOT / 'data/manifest.json').read_text(encoding='utf-8'))
sw = (ROOT / 'service-worker.js').read_text(encoding='utf-8')
questions_before = (ROOT / 'data/questions.json').read_bytes()

assert audit_module.audit() == report
assert report['phase'] == 'P27A'
assert report['status'] == 'ACTION_REQUIRED'
assert report['productionCounts'] == {
    'chapters': 66,
    'sections': 1363,
    'concepts': 2089,
    'cards': 2094,
    'questions': 1299,
    'cases': 120,
}
assert report['certifiedQuestionBank']['intact'] is True
assert report['certifiedQuestionBank']['sha256'] == '40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024'
assert report['summary']['totalFindings'] == 6
assert report['summary']['actionableFindings'] == 5
assert report['summary']['severityCounts'] == {
    'critical': 1,
    'high': 3,
    'medium': 1,
    'low': 0,
    'info': 1,
}
assert report['summary']['staticRuntimeBlockers'] == 0
assert report['summary']['runtimeBaselineReadyForBrowserCertification'] is True
assert report['summary']['releaseReady'] is False
assert [row['id'] for row in report['findings']] == [
    'P27A-DOC-001',
    'P27A-DOC-002',
    'P27A-DOC-003',
    'P27A-QA-001',
    'P27A-REL-001',
    'P27A-REL-002',
]
assert report['nextPhase']['phase'] == 'P27B'
assert report['nextPhase']['name'] == 'Release Truth & Validation Repair'

assert manifest['phase'] == 'P27A'
assert manifest['version'] == '1.1.0-dev.27a'
assert manifest['status'] == 'p27a-release-readiness-audit'
assert 'pflegelern-p27a-v1.1.0-dev27a' in sw
assert (ROOT / 'data/questions.json').read_bytes() == questions_before

print(json.dumps({
    'phase': report['phase'],
    'status': report['status'],
    'actionableFindings': report['summary']['actionableFindings'],
    'staticRuntimeBlockers': report['summary']['staticRuntimeBlockers'],
    'questionBankFrozen': report['certifiedQuestionBank']['intact'],
    'nextPhase': report['nextPhase']['phase'],
}, ensure_ascii=False, indent=2))
print('P27A release-readiness audit certification passed.')
