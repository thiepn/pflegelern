import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {
    "q-16-1-01", "q-16-1-02", "q-16-1-04", "q-36-01",
    "q-48-4-06", "q-61-4-04", "q-p12-0040",
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


audit = load_module("p26a_semantic_audit", ROOT / "tools" / "p26a_semantic_audit.py")
refine = load_module("p26a_semantic_refinement", ROOT / "tools" / "p26a_semantic_refinement.py")

questions = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
concepts = json.loads((ROOT / "data" / "concepts.json").read_text(encoding="utf-8"))
cards = json.loads((ROOT / "data" / "cards.json").read_text(encoding="utf-8"))
baseline = json.loads((ROOT / "reports" / "P26A_SEMANTIC_DEFECT_REGISTRY.json").read_text(encoding="utf-8"))
manifest = json.loads((ROOT / "data" / "manifest.json").read_text(encoding="utf-8"))
service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")

assert len(questions) == 1299
assert Counter(q["type"] for q in questions) == Counter({
    "single_choice": 699,
    "short_answer": 321,
    "clinical_case": 214,
    "matching": 39,
    "multiple_choice": 24,
    "ordering": 2,
})
assert set(baseline["confirmedDefectIds"]) == TARGETS
assert baseline["summary"]["confirmedDefects"] == 7
assert baseline["summary"]["manualReviewCandidates"] == 108

assert manifest["phase"] == "P26B"
assert manifest["version"] == "1.1.0-dev.26b"
assert manifest["status"] == "p26b-semantic-defect-correction"
assert "pflegelern-p26b-v1.1.0-dev26b" in service_worker

by_id = {q["id"]: q for q in questions}

assert by_id["q-16-1-01"]["options"] == [
    {"id": "a", "text": "60–100/min"},
    {"id": "b", "text": "Unter 60/min"},
    {"id": "c", "text": "Über 100/min"},
    {"id": "d", "text": "Genau 60/min"},
]
assert by_id["q-16-1-01"]["correct"] == ["b"]

assert by_id["q-16-1-02"]["options"] == [
    {"id": "a", "text": "Unter 60/min"},
    {"id": "b", "text": "60–100/min"},
    {"id": "c", "text": "Über 100/min"},
    {"id": "d", "text": "Genau 100/min"},
]
assert by_id["q-16-1-02"]["correct"] == ["c"]

for qid, expected_ids, correct_ids in [
    ("q-16-1-04", list("abcdefg"), list("abcde")),
    ("q-48-4-06", list("abcdefg"), list("abcde")),
    ("q-61-4-04", list("abcdefg"), list("abcde")),
]:
    q = by_id[qid]
    assert [o["id"] for o in q["options"]] == expected_ids
    assert q["correct"] == correct_ids
    assert len(q["correct"]) < len(q["options"])

q36 = by_id["q-36-01"]
assert [o["id"] for o in q36["options"]] == list("abcdefgh")
assert q36["correct"] == list("abcdef")
assert {o["text"] for o in q36["options"][-2:]} == {"First-in-First-out-Prinzip", "Vier-Augen-Prinzip"}

nosocomial = by_id["q-p12-0040"]
assert nosocomial["options"][1]["text"] == "Als Epidemie bezeichnet man ein stark gehäuftes Auftreten einer Krankheit innerhalb einer bestimmten Region oder Bevölkerung."
assert nosocomial["generation"]["distractorConceptIds"] == [
    "concept-15-312-8-definition-1",
    "concept-15-304-5-definition-1",
    "concept-15-300-87-definition-1",
]

# Re-run the P26A semantic detector on the corrected bank. No confirmed defects
# may remain, and the exact manual-review queue from P26A must be preserved.
post = refine.recompute(audit.semantic_audit(questions, concepts, cards))
assert post["summary"]["confirmedDefects"] == 0, post["confirmedDefectIds"]
assert post["confirmedDefectIds"] == []

baseline_review_ids = {
    entry["questionId"] for entry in baseline["registry"]
    if entry.get("disposition") == "manual-review"
}
post_review_ids = {
    entry["questionId"] for entry in post["registry"]
    if entry.get("disposition") == "manual-review"
}
assert len(baseline_review_ids) == 108
assert post_review_ids == baseline_review_ids, {
    "added": sorted(post_review_ids - baseline_review_ids),
    "removed": sorted(baseline_review_ids - post_review_ids),
}
assert post["summary"]["manualReviewCandidates"] == 108
assert post["summary"]["flaggedQuestions"] == 108

# The original seven defect IDs may no longer be classified as confirmed defects.
post_by_id = {entry["questionId"]: entry for entry in post["registry"]}
for qid in TARGETS:
    assert post_by_id.get(qid, {}).get("disposition") != "confirmed-defect"

# P26B report must preserve the original audit trail and declare exactly seven targets.
report = json.loads((ROOT / "reports" / "P26B_SEMANTIC_CORRECTION_REPORT.json").read_text(encoding="utf-8"))
assert report["phase"] == "P26B"
assert set(report["targetQuestionIds"]) == TARGETS
assert report["scope"]["inputConfirmedDefects"] == 7
assert report["scope"]["manualReviewCandidatesPreserved"] == 108
assert set(report["preservedManualReviewQuestionIds"]) == baseline_review_ids
assert report["policy"]["externalClinicalGuidanceAdded"] is False
assert report["policy"]["manualReviewCandidatesEdited"] is False

print(json.dumps({
    "phase": "P26B",
    "questions": len(questions),
    "correctedConfirmedDefects": 7,
    "residualConfirmedDefects": post["summary"]["confirmedDefects"],
    "manualReviewCandidatesPreserved": post["summary"]["manualReviewCandidates"],
    "flaggedQuestionsAfterCorrection": post["summary"]["flaggedQuestions"],
}, ensure_ascii=False, indent=2))
print("P26B semantic correction certification passed.")
