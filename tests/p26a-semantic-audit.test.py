import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

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

assert len(questions) == 1299
assert Counter(q["type"] for q in questions) == Counter({
    "single_choice": 699,
    "short_answer": 321,
    "clinical_case": 214,
    "matching": 39,
    "multiple_choice": 24,
    "ordering": 2,
})
assert manifest["phase"] == "P26A"
assert manifest["version"] == "1.1.0-dev.26a"
assert manifest["status"] == "p26a-semantic-defect-detection"
assert "pflegelern-p26a-v1.1.0-dev26a" in service_worker

report = refine.recompute(audit.semantic_audit(questions, concepts, cards))
assert report["phase"] == "P26A"
assert report["scope"]["questionCount"] == 1299
assert report["scope"]["questionBankMutated"] is False
assert report["refinement"]["version"] == 1
assert report["summary"]["flaggedQuestions"] == 115
assert report["summary"]["confirmedDefects"] == 7
assert report["summary"]["manualReviewCandidates"] == 108

by_id = {entry["questionId"]: entry for entry in report["registry"]}

def codes(qid):
    return {issue["code"] for issue in by_id.get(qid, {}).get("issues", [])}

# Known high-confidence semantic defects from manually reviewed pilot items.
assert "NUMERIC_ANSWER_OVERLAP" in codes("q-16-1-01")
assert "NUMERIC_ANSWER_OVERLAP" in codes("q-16-1-02")
assert "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT" in codes("q-16-1-04")
assert "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT" in codes("q-36-01")

# Precision controls: different units/quantities and numeric-only labels must not become confirmed semantic defects.
assert "NEAR_EQUIVALENT_ANSWER_OPTIONS" not in codes("q-36-02")
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0047")  # pulse vs mg/dl
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0053")  # mmHg vs /min
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0218")  # °C vs g/day
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p12-0447")  # coincident 4–6 weeks in unrelated domains
assert "NUMERIC_ANSWER_OVERLAP" not in codes("q-p7b-chapter-16-definition-01")

# A genuinely near-identical definition distractor must remain detectable.
assert "NEAR_EQUIVALENT_ANSWER_OPTIONS" in codes("q-p12-0040")

expected_confirmed = {
    "q-16-1-04",
    "q-36-01",
    "q-48-4-06",
    "q-61-4-04",
    "q-16-1-01",
    "q-16-1-02",
    "q-p12-0040",
}
assert set(report["confirmedDefectIds"]) == expected_confirmed
confirmed = [entry for entry in report["registry"] if entry["disposition"] == "confirmed-defect"]
review = [entry for entry in report["registry"] if entry["disposition"] == "manual-review"]
assert len(confirmed) == 7
assert len(review) == 108
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
print("P26A refined semantic audit tests passed.")
