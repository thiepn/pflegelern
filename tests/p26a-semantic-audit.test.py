import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("p26a_semantic_audit", ROOT / "tools" / "p26a_semantic_audit.py")
audit = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = audit
spec.loader.exec_module(audit)

questions = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
concepts = json.loads((ROOT / "data" / "concepts.json").read_text(encoding="utf-8"))
cards = json.loads((ROOT / "data" / "cards.json").read_text(encoding="utf-8"))

assert len(questions) == 1299
assert Counter(q["type"] for q in questions) == Counter({
    "single_choice": 699,
    "short_answer": 321,
    "clinical_case": 214,
    "matching": 39,
    "multiple_choice": 24,
    "ordering": 2,
})

report = audit.semantic_audit(questions, concepts, cards)
assert report["phase"] == "P26A"
assert report["scope"]["questionCount"] == 1299
assert report["scope"]["questionBankMutated"] is False
assert report["summary"]["flaggedQuestions"] > 0
assert report["summary"]["confirmedDefects"] > 0

by_id = {entry["questionId"]: entry for entry in report["registry"]}

def codes(qid):
    assert qid in by_id, f"expected {qid} in semantic registry"
    return {issue["code"] for issue in by_id[qid]["issues"]}

# Known high-confidence semantic defects from the manually reviewed P6 pilot items.
assert "NUMERIC_ANSWER_OVERLAP" in codes("q-16-1-01")
assert "NUMERIC_ANSWER_OVERLAP" in codes("q-16-1-02")
assert "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT" in codes("q-16-1-04")
assert "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT" in codes("q-36-01")

# The detector must distinguish confirmed defects from editorial/manual-review candidates.
confirmed = [entry for entry in report["registry"] if entry["disposition"] == "confirmed-defect"]
review = [entry for entry in report["registry"] if entry["disposition"] == "manual-review"]
assert confirmed
assert review
assert all(entry["highestSeverity"] in {"critical", "high", "medium", "low", "review"} for entry in report["registry"])

# P26A is a registry phase; it must not mutate source content.
questions_after = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
assert questions_after == questions

print(json.dumps({
    "phase": "P26A",
    "questions": len(questions),
    "flaggedQuestions": report["summary"]["flaggedQuestions"],
    "confirmedDefects": report["summary"]["confirmedDefects"],
    "manualReviewCandidates": report["summary"]["manualReviewCandidates"],
    "issueCodeCounts": report["summary"]["issueCodeCounts"],
    "confirmedDefectIds": report["confirmedDefectIds"],
}, ensure_ascii=False, indent=2))
print("P26A semantic audit tests passed.")
