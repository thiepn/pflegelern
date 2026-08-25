import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_CONFIRMED = {
    "q-16-1-04",
    "q-36-01",
    "q-48-4-06",
    "q-61-4-04",
    "q-16-1-01",
    "q-16-1-02",
    "q-p12-0040",
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
manifest = json.loads((ROOT / "data" / "manifest.json").read_text(encoding="utf-8"))
service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
historical = json.loads((ROOT / "reports" / "P26A_SEMANTIC_DEFECT_REGISTRY.json").read_text(encoding="utf-8"))

assert len(questions) == 1299
assert Counter(q["type"] for q in questions) == Counter({
    "single_choice": 699,
    "short_answer": 321,
    "clinical_case": 214,
    "matching": 39,
    "multiple_choice": 24,
    "ordering": 2,
})

# The materialized P26A registry is an immutable historical baseline even after
# later correction phases advance the live bank.
assert historical["phase"] == "P26A"
assert historical["summary"]["confirmedDefects"] == 7
assert historical["summary"]["manualReviewCandidates"] == 108
assert set(historical["confirmedDefectIds"]) == EXPECTED_CONFIRMED

report = refine.recompute(audit.semantic_audit(questions, concepts, cards))
assert report["phase"] == "P26A"
assert report["scope"]["questionCount"] == 1299
assert report["scope"]["questionBankMutated"] is False
assert report["refinement"]["version"] == 1

by_id = {entry["questionId"]: entry for entry in report["registry"]}


def codes(qid):
    return {issue["code"] for issue in by_id.get(qid, {}).get("issues", [])}

# Precision controls must remain true regardless of whether the seven P26A
# defects are still present or have been corrected by a later phase.
assert "NEAR_EQUIVALENT_ANSWER_OPTIONS" not in codes("q-36-02")
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0047")
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0053")
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0218")
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0447")
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p7b-chapter-16-definition-01")

if manifest["phase"] == "P26A":
    assert manifest["version"] == "1.1.0-dev.26a"
    assert manifest["status"] == "p26a-semantic-defect-detection"
    assert "pflegelern-p26a-v1.1.0-dev26a" in service_worker
    assert report["summary"]["flaggedQuestions"] == 115
    assert report["summary"]["confirmedDefects"] == 7
    assert report["summary"]["manualReviewCandidates"] == 108
    assert set(report["confirmedDefectIds"]) == EXPECTED_CONFIRMED
    assert "NUMERIC_ANSWER_OVERLAP" in codes("q-16-1-01")
    assert "NUMERIC_ANSWER_OVERLAP" in codes("q-16-1-02")
    assert "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT" in codes("q-16-1-04")
    assert "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT" in codes("q-36-01")
    assert "NEAR_EQUIVALENT_ANSWER_OPTIONS" in codes("q-p12-0040")
else:
    # P26B and later phases may repair the P26A findings. The detector must then
    # remain useful as a regression oracle instead of forcing historical defects
    # to stay in production forever.
    assert manifest["phase"] >= "P26B"
    assert report["summary"]["confirmedDefects"] == 0
    assert report["confirmedDefectIds"] == []
    assert report["summary"]["manualReviewCandidates"] == 108
    assert report["summary"]["flaggedQuestions"] == 108
    review_ids = {
        entry["questionId"] for entry in report["registry"]
        if entry.get("disposition") == "manual-review"
    }
    historical_review_ids = {
        entry["questionId"] for entry in historical["registry"]
        if entry.get("disposition") == "manual-review"
    }
    assert review_ids == historical_review_ids
    assert not EXPECTED_CONFIRMED.intersection(report["confirmedDefectIds"])

questions_after = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
assert questions_after == questions

print(json.dumps({
    "phase": manifest["phase"],
    "detector": "P26A",
    "questions": len(questions),
    "flaggedQuestions": report["summary"]["flaggedQuestions"],
    "confirmedDefects": report["summary"]["confirmedDefects"],
    "manualReviewCandidates": report["summary"]["manualReviewCandidates"],
}, ensure_ascii=False, indent=2))
print("P26A semantic detector regression passed.")
