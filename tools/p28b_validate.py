#!/usr/bin/env python3
"""Current-main validator for PflegeLern P28B."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHASE = "P28B"
VERSION = "1.1.1-dev.28b"
STATUS = "development"
CACHE = "pflegelern-p28b-v1.1.1-dev28b"
QUESTION_SHA = "97d27b764223443ac72708524774d3003ff07a44394bdea175ebbd37fb11f708"
OLD_SHA = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"
EXPECTED_COUNTS = {"chapters": 66, "sections": 1363, "concepts": 2089, "cards": 2094, "questions": 1299, "cases": 120}
EXPECTED_TYPES = {"clinical_case": 214, "matching": 39, "multiple_choice": 24, "ordering": 2, "short_answer": 321, "single_choice": 699}

REGRESSIONS = [
    [sys.executable, "tests/p28b-adjudication.test.py"],
    [sys.executable, "tests/p26a-semantic-audit.test.py"],
    [sys.executable, "tests/p26b-report-evidence.test.py"],
    [sys.executable, "tests/p26b-semantic-correction.test.py"],
    [sys.executable, "tests/p26c-adjudication.test.py"],
    [sys.executable, "tests/p26d-confirmed-defect-repair.test.py"],
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

def text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")

def data(rel: str):
    return json.loads(text(rel))

def sha(rel: str) -> str:
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()

def checks() -> list[dict]:
    out = []
    def add(name: str, ok: bool, detail: str):
        out.append({"name": name, "status": "PASS" if ok else "FAIL", "detail": detail})
    manifest = data("data/manifest.json")
    counts = {k: len(data(f"data/{k}.json")) for k in EXPECTED_COUNTS}
    questions = data("data/questions.json")
    type_counts = {}
    for q in questions:
        type_counts[q["type"]] = type_counts.get(q["type"], 0) + 1
    report = data("reports/P28B_ADJUDICATION.json")
    app = text("js/app.js")
    sw = text("service-worker.js")
    readme = text("README.md")
    qa = text("QA.md")
    p26g = data("reports/P26G_FINAL_QUESTION_CERTIFICATION.json")
    add("production-counts", counts == EXPECTED_COUNTS, str(counts))
    add("question-type-counts", type_counts == EXPECTED_TYPES, str(type_counts))
    add("p28b-question-bank-hash", sha("data/questions.json") == QUESTION_SHA, sha("data/questions.json"))
    add("historical-p26g-preserved", p26g.get("freeze", {}).get("questionBankSha256") == OLD_SHA, p26g.get("freeze", {}).get("questionBankSha256", "missing"))
    add("manifest-current-main-identity", (manifest.get("phase"), manifest.get("version"), manifest.get("status")) == (PHASE, VERSION, STATUS), f"{manifest.get('phase')} / {manifest.get('version')} / {manifest.get('status')}")
    m = re.search(r"const APP_VERSION = '([^']+)';", app)
    add("learner-facing-version", bool(m and m.group(1) == VERSION), m.group(1) if m else "missing")
    add("service-worker-cache", f"const CACHE = '{CACHE}';" in sw, CACHE)
    add("p28b-report", report.get("status") == "PASS" and report.get("scope", {}).get("questionsAdjudicated") == 44 and report.get("scope", {}).get("questionsRepaired") == 12 and report.get("scope", {}).get("unresolved") == 0 and report.get("questionBank", {}).get("p28bSha256") == QUESTION_SHA, f"status={report.get('status')} adjudicated={report.get('scope',{}).get('questionsAdjudicated')}")
    add("p28b-next-phase", report.get("nextPhase", {}).get("phase") == "P28C", str(report.get("nextPhase", {})))
    add("readme-current-truth", all(x in readme for x in [PHASE, VERSION, QUESTION_SHA, "12 confirmed defects repaired", "32 detector flags", "P28C"]), "P28B identity/hash/outcome/next phase")
    add("qa-current-truth", all(x in qa for x in [PHASE, VERSION, QUESTION_SHA, "44 / 44", "P28C"]), "P28B QA identity/hash/coverage")
    add("p26g-not-misrepresented-as-current", "historical" in readme.lower() and OLD_SHA in readme and QUESTION_SHA in readme, "README distinguishes v1.1.0 baseline from current main")
    assets = [m.group(1) for m in re.finditer(r"'\\./([^']+)'", sw)]
    missing = sorted({a for a in assets if a and not (ROOT / a).exists()})
    add("service-worker-assets", not missing, f"missing={missing}")
    webmanifest = data("manifest.webmanifest")
    missing_icons = [i.get("src") for i in webmanifest.get("icons", []) if not (ROOT / str(i.get("src", "")).removeprefix("./")).exists()]
    add("manifest-icons", not missing_icons, f"missing={missing_icons}")
    return out

def run_full() -> int:
    for cmd in REGRESSIONS:
        print(f"\n$ {' '.join(cmd)}", flush=True)
        r = subprocess.run(cmd, cwd=ROOT)
        if r.returncode:
            return r.returncode
    for rel in ["js/app.js", "service-worker.js", "js/study-engine.js", "js/p18-bootstrap.js"]:
        cmd = ["node", "--check", rel]
        print(f"\n$ {' '.join(cmd)}", flush=True)
        r = subprocess.run(cmd, cwd=ROOT)
        if r.returncode:
            return r.returncode
    return 0

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true")
    args = ap.parse_args()
    current = checks()
    failed = [c for c in current if c["status"] == "FAIL"]
    print(json.dumps({"phase": PHASE, "version": VERSION, "status": "PASS" if not failed else "FAIL", "checks": current}, ensure_ascii=False, indent=2))
    if failed:
        return 1
    if args.full:
        return run_full()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
