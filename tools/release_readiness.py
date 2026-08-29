#!/usr/bin/env python3
"""Canonical PflegeLern release-readiness validator.

P27B establishes this script as the single current non-browser validation entrypoint.
It verifies release truth, the frozen P26G question bank, PWA/static integrity and,
with --full, the current semantic/question/adaptive/exam regression chain.
Browser interaction remains a dedicated CI job because it requires Playwright.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FROZEN_QUESTION_SHA256 = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"
EXPECTED_COUNTS = {
    "chapters": 66,
    "sections": 1363,
    "concepts": 2089,
    "cards": 2094,
    "questions": 1299,
    "cases": 120,
}
PHASE = "P27B"
VERSION = "1.1.0-rc.1"
STATUS = "release-candidate"
CACHE_ID = "pflegelern-p27b-v1.1.0-rc1"
REPORT_JSON = ROOT / "reports" / "P27B_RELEASE_TRUTH_VALIDATION.json"
REPORT_MD = ROOT / "reports" / "P27B_RELEASE_TRUTH_VALIDATION.md"

REGRESSION_COMMANDS = [
    [sys.executable, "tests/p26g-final-certification.test.py"],
    [sys.executable, "tests/p26f-source-alignment.test.py"],
    [sys.executable, "tests/p26e-semantic-closure.test.py"],
    ["node", "tests/p25a-variety-core.test.mjs"],
    ["node", "tests/p25b-repetition-core.test.mjs"],
    ["node", "tests/p25c-input-core.test.mjs"],
    ["node", "tests/p25d-question-quality.test.mjs"],
    ["node", "tests/p25d-integration.test.mjs"],
    ["node", "tests/p17-study-mix.test.mjs"],
    ["node", "tests/p18-mastery.test.mjs"],
    ["node", "tests/p19-remediation.test.mjs"],
    ["node", "tests/p20-exam-core.test.mjs"],
    ["node", "tests/p20-runtime.test.mjs"],
]


def read_text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def read_json(rel: str):
    return json.loads(read_text(rel))


def sha256(rel: str) -> str:
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()


def collect_checks() -> tuple[list[dict], dict]:
    checks: list[dict] = []

    def check(name: str, ok: bool, detail: str) -> None:
        checks.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    manifest = read_json("data/manifest.json")
    counts = {key: len(read_json(f"data/{key}.json")) for key in EXPECTED_COUNTS}
    question_sha = sha256("data/questions.json")
    p26g = read_json("reports/P26G_FINAL_QUESTION_CERTIFICATION.json")
    app_js = read_text("js/app.js")
    sw = read_text("service-worker.js")
    index = read_text("index.html")
    readme = read_text("README.md")
    qa = read_text("QA.md")

    check("production-counts", counts == EXPECTED_COUNTS, f"actual={counts}")
    check("p26g-question-bank-freeze", question_sha == FROZEN_QUESTION_SHA256, question_sha)
    check(
        "p26g-certification",
        p26g.get("status") == "PASS"
        and p26g.get("freeze", {}).get("questionBankSha256") == FROZEN_QUESTION_SHA256
        and p26g.get("bank", {}).get("questions") == 1299,
        f"status={p26g.get('status')} questions={p26g.get('bank', {}).get('questions')}",
    )
    check(
        "manifest-release-identity",
        manifest.get("phase") == PHASE and manifest.get("version") == VERSION and manifest.get("status") == STATUS,
        f"{manifest.get('phase')} / {manifest.get('version')} / {manifest.get('status')}",
    )
    app_match = re.search(r"const APP_VERSION = '([^']+)';", app_js)
    check("learner-facing-version", bool(app_match and app_match.group(1) == VERSION), app_match.group(1) if app_match else "missing")
    check("service-worker-cache-identity", f"const CACHE = '{CACHE_ID}';" in sw, CACHE_ID)

    assets = [m.group(1) for m in re.finditer(r"'\./([^']+)'", sw)]
    missing_assets = sorted({asset for asset in assets if asset and not (ROOT / asset).exists()})
    check("service-worker-precache-assets", not missing_assets, f"missing={missing_assets}")

    webmanifest = read_json("manifest.webmanifest")
    missing_icons = []
    for icon in webmanifest.get("icons", []):
        rel = str(icon.get("src", "")).removeprefix("./")
        if not rel or not (ROOT / rel).exists():
            missing_icons.append(icon.get("src"))
    check("manifest-icons", not missing_icons, f"missing={missing_icons}")

    required_routes = ["today", "learn", "exam", "progress", "settings"]
    route_ok = all(f'data-route="{route}"' in index for route in required_routes)
    check("primary-navigation-surface", route_ok, ", ".join(required_routes))
    check("viewport-metadata", 'name="viewport"' in index and "viewport-fit=cover" in index, "viewport-fit=cover")

    readme_tokens = [
        "1.1.0-rc.1",
        "1,299",
        "1,363",
        "120",
        "python3 tools/release_readiness.py --full",
        "P26G",
        "P27B",
    ]
    check("readme-release-truth", all(token in readme for token in readme_tokens), "current version/counts/canonical command")
    check("readme-no-obsolete-primary-release", "P10 final release" not in readme and "85 practice/exam questions" not in readme, "no stale P10/85-question identity")

    qa_tokens = ["P27B", "1.1.0-rc.1", "1,299", "1,363", "120", "P26G", "real Chromium"]
    check("qa-release-truth", all(token in qa for token in qa_tokens), "current release-candidate QA record")
    check("qa-no-obsolete-boundary", "browser process again failed" not in qa.lower(), "no stale P9 browser limitation")

    failed = [item for item in checks if item["status"] == "FAIL"]
    report = {
        "schemaVersion": 1,
        "phase": PHASE,
        "title": "Release Truth & Validation Repair",
        "status": "PASS" if not failed else "FAIL",
        "releaseIdentity": {"version": VERSION, "status": STATUS, "cacheId": CACHE_ID},
        "productionCounts": counts,
        "certifiedQuestionBank": {
            "questions": counts["questions"],
            "sha256": question_sha,
            "expectedSha256": FROZEN_QUESTION_SHA256,
            "intact": question_sha == FROZEN_QUESTION_SHA256,
        },
        "checks": checks,
        "summary": {
            "checks": len(checks),
            "passed": len(checks) - len(failed),
            "failed": len(failed),
            "actionableFindings": len(failed),
            "releaseTruthReady": not failed,
            "browserCertification": "CI_REQUIRED",
        },
        "canonicalValidationCommand": "python3 tools/release_readiness.py --full",
        "nextPhase": {
            "phase": "P27C",
            "name": "Final Release Certification & Promotion",
            "purpose": "Run the final exact-head CI/browser/deployment gate and promote the release candidate only if all checks pass.",
        },
        "policy": {
            "questionBankEditedByP27B": False,
            "fsrsChanged": False,
            "masteryChanged": False,
            "remediationChanged": False,
            "repetitionControlChanged": False,
            "inputHandlingChanged": False,
            "examLogicChanged": False,
            "externalClinicalGuidanceAdded": False,
        },
    }
    return checks, report


def render_markdown(report: dict) -> str:
    lines = [
        "# P27B — Release Truth & Validation Repair",
        "",
        f"**Status: {report['status']}**",
        "",
        "## Release identity",
        "",
        f"- Version: **{VERSION}**",
        f"- Phase: **{PHASE}**",
        f"- Repository state: **{STATUS}**",
        f"- Service-worker cache: `{CACHE_ID}`",
        "",
        "## Frozen learning bank",
        "",
        f"- Questions: **{report['productionCounts']['questions']}**",
        f"- Sections: **{report['productionCounts']['sections']}**",
        f"- Concepts: **{report['productionCounts']['concepts']}**",
        f"- Flashcards: **{report['productionCounts']['cards']}**",
        f"- Cases: **{report['productionCounts']['cases']}**",
        f"- P26G SHA-256: `{report['certifiedQuestionBank']['sha256']}`",
        "- Question-bank mutation by P27B: **none**",
        "",
        "## Validation",
        "",
        f"Canonical command: `{report['canonicalValidationCommand']}`",
        "",
    ]
    for item in report["checks"]:
        lines.append(f"- **{item['status']} — {item['name']}**: {item['detail']}")
    lines += [
        "",
        "Browser interaction is rerun by the P27B GitHub Actions workflow using real Chromium on desktop/mobile surfaces.",
        "",
        "## Next phase",
        "",
        "**P27C — Final Release Certification & Promotion**",
        "",
        "Run the final exact-head CI/browser/deployment gate and promote the release candidate only if all checks pass.",
        "",
    ]
    return "\n".join(lines)


def write_report(report: dict) -> None:
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_MD.write_text(render_markdown(report), encoding="utf-8")


def run_regressions() -> int:
    for command in REGRESSION_COMMANDS:
        print(f"\n$ {' '.join(command)}", flush=True)
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode:
            return result.returncode
    for rel in ["js/app.js", "service-worker.js", "js/study-engine.js", "js/p18-bootstrap.js"]:
        command = ["node", "--check", rel]
        print(f"\n$ {' '.join(command)}", flush=True)
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode:
            return result.returncode
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="run the current non-browser regression chain after release-truth checks")
    parser.add_argument("--write-report", action="store_true", help="materialize deterministic P27B JSON/Markdown reports")
    parser.add_argument("--check-report", action="store_true", help="require materialized reports to match current deterministic output")
    args = parser.parse_args()

    checks, report = collect_checks()
    if args.write_report:
        write_report(report)
    if args.check_report:
        expected_json = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        expected_md = render_markdown(report)
        if not REPORT_JSON.exists() or REPORT_JSON.read_text(encoding="utf-8") != expected_json:
            print("P27B JSON report drift detected.", file=sys.stderr)
            return 1
        if not REPORT_MD.exists() or REPORT_MD.read_text(encoding="utf-8") != expected_md:
            print("P27B Markdown report drift detected.", file=sys.stderr)
            return 1

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"] != "PASS":
        return 1
    if args.full:
        return run_regressions()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
