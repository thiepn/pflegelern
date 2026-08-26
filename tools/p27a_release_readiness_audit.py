#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_text(path):
    return (ROOT / path).read_text(encoding='utf-8')


def read_json(path):
    return json.loads(read_text(path))


def sha256(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def finding(fid, severity, area, title, evidence, next_phase='P27B'):
    return {
        'id': fid,
        'severity': severity,
        'area': area,
        'title': title,
        'evidence': evidence,
        'recommendedRepairPhase': next_phase,
    }


def contains_number(text, number):
    return str(number) in text or f'{number:,}' in text


def audit():
    manifest = read_json('data/manifest.json')
    p26g = read_json('reports/P26G_FINAL_QUESTION_CERTIFICATION.json')
    chapters = read_json('data/chapters.json')
    sections = read_json('data/sections.json')
    concepts = read_json('data/concepts.json')
    cards = read_json('data/cards.json')
    questions = read_json('data/questions.json')
    cases = read_json('data/cases.json')
    webmanifest = read_json('manifest.webmanifest')
    readme = read_text('README.md')
    qa = read_text('QA.md')
    validator = read_text('tests/validate.mjs')
    sw = read_text('service-worker.js')
    index = read_text('index.html')
    app = read_text('js/app.js')

    actual_counts = {
        'chapters': len(chapters),
        'sections': len(sections),
        'concepts': len(concepts),
        'cards': len(cards),
        'questions': len(questions),
        'cases': len(cases),
    }

    findings = []

    if '# PflegeLern — v1.0.0 Release' in readme or 'P10 final release' in readme:
        findings.append(finding(
            'P27A-DOC-001', 'high', 'release-documentation',
            'README identifies the repository as the old P10/v1.0.0 release',
            'README.md still labels the repository “v1.0.0 Release” / “P10 final release” while the production manifest has advanced through P26G/P27A.'
        ))

    stale_readme_counts = []
    for label, old, current in [
        ('sections', 1361, actual_counts['sections']),
        ('questions', 85, actual_counts['questions']),
        ('cases', 18, actual_counts['cases']),
    ]:
        if contains_number(readme, old) and old != current:
            stale_readme_counts.append({'entity': label, 'documented': old, 'actual': current})
    if stale_readme_counts:
        findings.append(finding(
            'P27A-DOC-002', 'high', 'release-documentation',
            'README study-bank counts are materially stale',
            stale_readme_counts
        ))

    if qa.startswith('# P9') or 'Questions | 85' in qa or 'Sections/subsections | 1,361' in qa:
        findings.append(finding(
            'P27A-DOC-003', 'medium', 'qa-documentation',
            'QA.md is still the P9 release-hardening record',
            'QA.md reports the pre-expansion 85-question / 1,361-section state and says automated browser E2E was not obtained, despite later real-Chromium certification phases.'
        ))

    legacy_validator_markers = [
        "questions: 85",
        "sections: 1361",
        "data.manifest.phase === 'P10'",
        "pflegelern-v1.0.0",
    ]
    stale_markers = [marker for marker in legacy_validator_markers if marker in validator]
    if stale_markers:
        findings.append(finding(
            'P27A-QA-001', 'critical', 'validation-entrypoint',
            'The README-documented primary validator is obsolete and cannot validate current main',
            {
                'documentedCommand': 'node tests/validate.mjs',
                'staleValidatorMarkers': stale_markers,
                'actualCounts': actual_counts,
            }
        ))

    app_version_match = re.search(r"const\s+APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", app)
    app_version = app_version_match.group(1) if app_version_match else None
    if app_version == '1.0.0':
        findings.append(finding(
            'P27A-REL-001', 'high', 'release-identity',
            'Learner-facing application version is hard-coded to the obsolete 1.0.0 identity',
            {
                'js/app.js APP_VERSION': app_version,
                'manifestVersion': manifest.get('version'),
                'manifestPhase': manifest.get('phase'),
            }
        ))

    if manifest.get('version', '').startswith('1.1.0-dev.'):
        findings.append(finding(
            'P27A-REL-002', 'info', 'release-state',
            'Repository remains on a development-phase version rather than a beta/release-candidate identity',
            {'phase': manifest.get('phase'), 'version': manifest.get('version'), 'status': manifest.get('status')},
            'P27B'
        ))

    frozen_hash = sha256('data/questions.json')
    p26g_hash = p26g['freeze']['questionBankSha256']
    frozen_ok = (
        p26g.get('status') == 'PASS'
        and p26g['freeze']['state'] == 'CERTIFIED_FROZEN'
        and frozen_hash == p26g_hash
        and len(questions) == 1299
    )

    sw_assets = re.findall(r"'\.\/([^']+)'", sw)
    missing_sw_assets = sorted({asset for asset in sw_assets if asset and not (ROOT / asset).exists()})
    manifest_icons = [str(icon.get('src', '')).removeprefix('./') for icon in webmanifest.get('icons', [])]
    missing_manifest_icons = sorted(path for path in manifest_icons if path and not (ROOT / path).exists())

    route_checks = {
        'today': 'renderToday' in app,
        'learn': 'renderLearn' in app,
        'exam': 'renderExamHome' in app,
        'progress': 'renderProgress' in app,
        'settings': 'renderSettings' in app,
    }

    static_blockers = []
    if not frozen_ok:
        static_blockers.append('P26G frozen question-bank contract is not intact')
    if missing_sw_assets:
        static_blockers.append(f'missing service-worker assets: {missing_sw_assets}')
    if missing_manifest_icons:
        static_blockers.append(f'missing webmanifest icons: {missing_manifest_icons}')
    if not all(route_checks.values()):
        static_blockers.append(f'missing route renderers: {[k for k,v in route_checks.items() if not v]}')
    if '<meta name="viewport"' not in index:
        static_blockers.append('viewport metadata missing')

    actionable = [f for f in findings if f['severity'] in {'critical', 'high', 'medium'}]
    severity_counts = {level: sum(1 for f in findings if f['severity'] == level) for level in ['critical', 'high', 'medium', 'low', 'info']}

    return {
        'schemaVersion': 1,
        'phase': 'P27A',
        'title': 'Full-Product Release Readiness Audit',
        'status': 'ACTION_REQUIRED' if actionable or static_blockers else 'PASS',
        'scope': {
            'baseCertifiedPhase': 'P26G',
            'questionBankFrozen': True,
            'learningContentMutationAllowed': False,
            'areas': [
                'production data integrity', 'P26G freeze integrity', 'PWA/offline static integrity',
                'primary navigation surface', 'repository release documentation', 'QA entrypoints',
                'browser regression readiness', 'release identity'
            ],
        },
        'productionCounts': actual_counts,
        'certifiedQuestionBank': {
            'questions': len(questions),
            'sha256': frozen_hash,
            'p26gSha256': p26g_hash,
            'intact': frozen_ok,
        },
        'staticRuntimeChecks': {
            'serviceWorkerPrecacheEntries': len(sw_assets),
            'missingServiceWorkerAssets': missing_sw_assets,
            'missingManifestIcons': missing_manifest_icons,
            'routeRenderersPresent': route_checks,
            'viewportMetadataPresent': '<meta name="viewport"' in index,
            'appVersion': app_version,
            'staticBlockers': static_blockers,
        },
        'findings': findings,
        'summary': {
            'totalFindings': len(findings),
            'actionableFindings': len(actionable),
            'severityCounts': severity_counts,
            'staticRuntimeBlockers': len(static_blockers),
            'runtimeBaselineReadyForBrowserCertification': not static_blockers,
            'releaseReady': not actionable and not static_blockers,
        },
        'browserCertificationRequired': {
            'routes': ['today', 'learn', 'exam', 'progress', 'settings'],
            'desktopAndMobile': True,
            'studyInputRegression': True,
            'questionQualityRegression': True,
            'repetitionRegression': True,
            'offlineReload': True,
            'horizontalOverflowAudit': True,
            'consoleAndPageErrorsMustBeZero': True,
        },
        'nextPhase': {
            'phase': 'P27B',
            'name': 'Release Truth & Validation Repair',
            'purpose': 'Repair stale release identity/documentation and the obsolete canonical validation entrypoint, then establish one current release-readiness command/report without modifying the frozen 1,299-question bank.'
        },
        'policy': {
            'questionBankEditedByP27A': False,
            'fsrsChanged': False,
            'masteryChanged': False,
            'remediationChanged': False,
            'repetitionControlChanged': False,
            'inputHandlingChanged': False,
            'examLogicChanged': False,
            'externalClinicalGuidanceAdded': False,
        },
    }


def markdown(report):
    s = report['summary']
    lines = [
        '# P27A — Full-Product Release Readiness Audit', '',
        f"**Status:** {report['status']}", '',
        '## Certified baseline', '',
        f"- Frozen P26G bank: **{report['certifiedQuestionBank']['questions']} questions**",
        f"- Frozen SHA-256: `{report['certifiedQuestionBank']['sha256']}`",
        f"- Static runtime blockers: **{s['staticRuntimeBlockers']}**",
        f"- Actionable release-readiness findings: **{s['actionableFindings']}**", '',
        '## Findings', ''
    ]
    for item in report['findings']:
        lines.append(f"- **{item['severity'].upper()} — {item['id']}**: {item['title']}")
    lines += ['', '## Runtime gate', '',
              'P27A additionally requires the real-Chromium workflow to pass route, study-input, question-quality, repetition-control, offline-reload, responsive-overflow and console/page-error checks.', '',
              '## Next phase', '',
              f"**{report['nextPhase']['phase']} — {report['nextPhase']['name']}**", '',
              report['nextPhase']['purpose'], '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report = audit()
    if args.write:
        out = ROOT / 'reports'
        out.mkdir(exist_ok=True)
        (out / 'P27A_RELEASE_READINESS_AUDIT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (out / 'P27A_RELEASE_READINESS_AUDIT.md').write_text(markdown(report), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
