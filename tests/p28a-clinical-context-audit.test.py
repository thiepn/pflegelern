#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

import p28a_calibrated_audit as module  # noqa: E402

FROZEN = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"

report = module.calibrated_audit()
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
assert report["calibration"]["version"] == 2

question_ids = {q["id"] for q in questions}
for queue in report["priorityQueues"].values():
    assert len(queue) == len(set(queue))
    assert set(queue) <= question_ids

for row in report["questions"]:
    assert row["riskBand"] in {"critical", "high", "medium", "review", "clear"}
    assert row["recommendation"] in {
        "retain", "review", "manual-adjudication-required", "manual-adjudication-before-single-choice-retention"
    }
    for issue in row["issues"]:
        assert issue["risk"] in {"critical", "high", "medium", "review"}
        assert issue["code"]
        assert issue["rationale"]

# Calibration guardrails: the final audit must not simply reproduce the
# deliberately over-sensitive first pass.
raw_first = report["calibration"]["rawFirstPass"]
assert report["summary"]["highOrCriticalObjectiveQuestions"] < raw_first["highOrCriticalObjectiveQuestions"]
assert report["summary"]["singleChoiceManualAdjudication"] < raw_first["singleChoiceManualAdjudication"]

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
