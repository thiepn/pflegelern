#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FROZEN = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"

spec = importlib.util.spec_from_file_location("p28a", ROOT / "tools" / "p28a_clinical_context_audit.py")
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

report = module.audit()
questions = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
actual_sha = hashlib.sha256((ROOT / "data" / "questions.json").read_bytes()).hexdigest()

assert actual_sha == FROZEN
assert report["phase"] == "P28A"
assert report["scope"]["questions"] == 1299
assert report["scope"]["questionBankSha256"] == FROZEN
assert report["scope"]["questionBankMutated"] is False
assert report["summary"]["allQuestionsCovered"] is True
assert len(report["questions"]) == len(questions) == 1299
assert len({row["questionId"] for row in report["questions"]}) == 1299
assert sum(report["summary"]["riskCounts"].values()) == 1299
assert sum(report["summary"]["typeCounts"].values()) == 1299
assert report["summary"]["singleChoiceTotal"] == 699
assert report["policy"]["evaluateOptionsIndependentlyOfExistingKey"] is True
assert report["policy"]["sourceCorrectnessSeparatedFromCurrentGuidance"] is True
assert report["nextPhase"]["phase"] == "P28B"

for queue in report["priorityQueues"].values():
    assert len(queue) == len(set(queue))
    assert set(queue) <= {q["id"] for q in questions}

for row in report["questions"]:
    assert row["riskBand"] in {"critical", "high", "medium", "review", "clear"}
    assert row["recommendation"] in {
        "retain", "review", "manual-adjudication-required", "manual-adjudication-before-single-choice-retention"
    }
    for issue in row["issues"]:
        assert issue["risk"] in {"critical", "high", "medium", "review"}
        assert issue["code"]
        assert issue["rationale"]

print(json.dumps({
    "phase": "P28A",
    "status": report["status"],
    "questions": 1299,
    "singleChoice": report["summary"]["singleChoiceTotal"],
    "singleChoiceManualAdjudication": report["summary"]["singleChoiceManualAdjudication"],
    "criticalQuestions": report["summary"]["criticalQuestions"],
    "highOrCriticalObjectiveQuestions": report["summary"]["highOrCriticalObjectiveQuestions"],
    "frozenBankIntact": actual_sha == FROZEN,
}, ensure_ascii=False, indent=2))
