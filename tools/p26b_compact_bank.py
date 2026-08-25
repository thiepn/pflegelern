#!/usr/bin/env python3
"""Restore the question bank's compact one-line serialization after P26B edits."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
questions_path = ROOT / "data" / "questions.json"
report_path = ROOT / "reports" / "P26B_SEMANTIC_CORRECTION_REPORT.json"

questions = json.loads(questions_path.read_text(encoding="utf-8"))
assert len(questions) == 1299
questions_path.write_text(
    json.dumps(questions, ensure_ascii=False, separators=(",", ":")) + "\n",
    encoding="utf-8",
)

digest = hashlib.sha256(questions_path.read_bytes()).hexdigest()
if report_path.exists():
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["phase"] == "P26B"
    assert set(report["changedQuestionIds"]) == set(report["targetQuestionIds"])
    report["questionBank"]["afterSha256"] = digest
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(json.dumps({"phase": "P26B", "questionCount": len(questions), "compactSha256": digest}, indent=2))
