#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SHA = "97d27b764223443ac72708524774d3003ff07a44394bdea175ebbd37fb11f708"
OLD_SHA = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"

spec = importlib.util.spec_from_file_location("p28b", ROOT / "tools/p28b_adjudicate.py")
p28b = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(p28b)

questions = json.loads((ROOT / "data/questions.json").read_text(encoding="utf-8"))
by_id = {q["id"]: q for q in questions}
report = json.loads((ROOT / "reports/P28B_ADJUDICATION.json").read_text(encoding="utf-8"))
baseline = json.loads((ROOT / "reports/P28A_CLINICAL_CONTEXT_VALIDITY_AUDIT.json").read_text(encoding="utf-8"))
baseline_rows = {r["questionId"]: r for r in baseline["questions"]}

actual_sha = hashlib.sha256((ROOT / "data/questions.json").read_bytes()).hexdigest()
assert actual_sha == EXPECTED_SHA
assert actual_sha != OLD_SHA
assert len(questions) == len(by_id) == 1299
assert Counter(q["type"] for q in questions) == {
    "single_choice": 699,
    "multiple_choice": 24,
    "short_answer": 321,
    "clinical_case": 214,
    "matching": 39,
    "ordering": 2,
}
queue = baseline["priorityQueues"]["singleChoiceAdjudicationIds"]
assert len(queue) == 44
assert set(queue) == set(p28b.REPAIRS) | set(p28b.RETAIN)
assert len(p28b.REPAIRS) == 12
assert len(p28b.RETAIN) == 32
assert report["phase"] == "P28B"
assert report["status"] == "PASS"
assert report["scope"] == {
    "baseline": "P28A high/critical objective single-choice adjudication queue",
    "questionsAdjudicated": 44,
    "questionsRepaired": 12,
    "questionsRetained": 32,
    "unresolved": 0,
}
assert report["questionBank"]["previousReleaseBaselineSha256"] == OLD_SHA
assert report["questionBank"]["p28bSha256"] == EXPECTED_SHA
assert report["nextPhase"]["phase"] == "P28C"
for qid in p28b.REPAIRS:
    q = by_id[qid]
    row = baseline_rows[qid]
    assert q["type"] == row["type"] == "single_choice"
    assert q["correct"] == row["correct"]
    assert q.get("repair", {}).get("phase") == "P28B"
assert by_id["q-case-pulse-01"]["options"][0]["text"] == "Arzt informieren"
assert "2015-Ausgabe" in by_id["q-36-02"]["prompt"]
for qid in ["q-p12-0090", "q-p12-0091", "q-p12-0104"]:
    assert "2015-Ausgabe" in by_id[qid]["prompt"]
    assert "Historischer Lehrbuchstand 2015" in by_id[qid]["explanation"]
assert "Obstipationsprophylaxe" in by_id["q-p12-0084"]["prompt"]
assert "Parotitis- und Soorprophylaxe" in by_id["q-p12-0085"]["prompt"]
assert next(o["text"] for o in by_id["q-p12-0138"]["options"] if o["id"] == "b") == "Fenster geschlossen halten, damit kein Wirkstoff nach außen gelangt."
for qid in ["q-p12-0444", "q-p12-0446", "q-p12-0448", "q-p12-0525"]:
    assert "Symptomkombination" in by_id[qid]["prompt"]
for qid in p28b.RETAIN:
    q = by_id[qid]
    row = baseline_rows[qid]
    assert q["type"] == row["type"]
    assert q["correct"] == row["correct"]
    assert q.get("repair", {}).get("phase") != "P28B"
p26g = json.loads((ROOT / "reports/P26G_FINAL_QUESTION_CERTIFICATION.json").read_text(encoding="utf-8"))
assert p26g["freeze"]["questionBankSha256"] == OLD_SHA
print(json.dumps({
    "phase": "P28B",
    "status": "PASS",
    "questions": 1299,
    "adjudicated": 44,
    "repaired": 12,
    "retained": 32,
    "unresolved": 0,
    "questionBankSha256": actual_sha,
}, ensure_ascii=False, indent=2))
