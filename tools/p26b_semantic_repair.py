#!/usr/bin/env python3
"""P26B: deterministically correct the seven confirmed P26A semantic defects.

This phase is deliberately narrow. It changes only the seven question objects
listed in P26A's confirmedDefectIds and preserves every P26A manual-review
candidate for later adjudication.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "data" / "questions.json"
P26A_REGISTRY = ROOT / "reports" / "P26A_SEMANTIC_DEFECT_REGISTRY.json"
REPORT_JSON = ROOT / "reports" / "P26B_SEMANTIC_CORRECTION_REPORT.json"
REPORT_MD = ROOT / "reports" / "P26B_SEMANTIC_CORRECTION_REPORT.md"

TARGETS = [
    "q-16-1-01",
    "q-16-1-02",
    "q-16-1-04",
    "q-36-01",
    "q-48-4-06",
    "q-61-4-04",
    "q-p12-0040",
]

EXPECTED_DEFECT_CODE = {
    "q-16-1-01": "NUMERIC_ANSWER_OVERLAP",
    "q-16-1-02": "NUMERIC_ANSWER_OVERLAP",
    "q-16-1-04": "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT",
    "q-36-01": "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT",
    "q-48-4-06": "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT",
    "q-61-4-04": "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT",
    "q-p12-0040": "NEAR_EQUIVALENT_ANSWER_OPTIONS",
}

# Exact pre-P26B states. These prevent the repair tool from silently operating
# on an unexpected question-bank revision.
EXPECTED_ORIGINAL = {
    "q-16-1-01": {
        "prompt": "Welche Pulsfrequenz entspricht laut Lehrbuch einer Bradykardie beim Erwachsenen?",
        "options": [
            {"id": "a", "text": "45–59/min"},
            {"id": "b", "text": "Unter 60/min"},
            {"id": "c", "text": "Unter 80/min"},
            {"id": "d", "text": "Über 100/min"},
        ],
        "correct": ["b"],
    },
    "q-16-1-02": {
        "prompt": "Welche Herzfrequenz bezeichnet das Lehrbuch beim Erwachsenen als Tachykardie?",
        "options": [
            {"id": "a", "text": "Über 80/min"},
            {"id": "b", "text": "Über 90/min"},
            {"id": "c", "text": "Über 100/min"},
            {"id": "d", "text": "Über 130/min"},
        ],
        "correct": ["c"],
    },
    "q-16-1-04": {
        "prompt": "Welche Begleitzeichen machen eine plötzlich und ohne erkennbare Ursache auftretende Tachykardie laut Lehrbuch besonders alarmierend?",
        "options": [
            {"id": "a", "text": "Schwindel"},
            {"id": "b", "text": "Luftnot"},
            {"id": "c", "text": "Brustschmerzen"},
            {"id": "d", "text": "Todesangst"},
            {"id": "e", "text": "Plötzliche Bewusstseinsbeeinträchtigung"},
        ],
        "correct": ["a", "b", "c", "d", "e"],
    },
    "q-36-01": {
        "prompt": "Welche Punkte gehören zur 6-R-Regel?",
        "options": [
            {"id": "a", "text": "Richtiger Patient"},
            {"id": "b", "text": "Richtiges Medikament"},
            {"id": "c", "text": "Richtige Dosierung"},
            {"id": "d", "text": "Richtige Applikationsform"},
            {"id": "e", "text": "Richtiger Zeitpunkt"},
            {"id": "f", "text": "Richtige Dokumentation"},
        ],
        "correct": ["a", "b", "c", "d", "e", "f"],
    },
    "q-48-4-06": {
        "prompt": "Welche Informationen sollen im zweiten Schritt der ethischen Entscheidungsfindung gesammelt werden?",
        "options": [
            {"id": "a", "text": "Pflegerische Fakten"},
            {"id": "b", "text": "Medizinische Fakten"},
            {"id": "c", "text": "Rechtliche Fakten"},
            {"id": "d", "text": "Soziale und organisatorische Fakten"},
            {"id": "e", "text": "Werte und Wille des Patienten"},
        ],
        "correct": ["a", "b", "c", "d", "e"],
    },
    "q-61-4-04": {
        "prompt": "Welche Hilfsmittel nennt das Lehrbuch, wenn verbale Kommunikation bei Aphasie nicht ausreicht?",
        "options": [
            {"id": "a", "text": "Gestik"},
            {"id": "b", "text": "Mimik"},
            {"id": "c", "text": "Bilder"},
            {"id": "d", "text": "Zeichnungen"},
            {"id": "e", "text": "Buchstabentafeln"},
        ],
        "correct": ["a", "b", "c", "d", "e"],
    },
    "q-p12-0040": {
        "prompt": "Welche Beschreibung passt laut Lehrbuch am besten zu „Nosokomiale Infektion“?",
        "options": [
            {"id": "a", "text": "Nosokomiale Infektionen sind Infektionen, die im Krankenhaus, Pflegeheim oder ambulant durch ärztliche oder pflegerische Maßnahmen erworben wurden und vorher nicht bestanden."},
            {"id": "b", "text": "Dies sind Infektionen, die im Krankenhaus, im Pflegeheim oder ambulant durch ärztliche oder pflegerische Maßnahmen erworben wurden und vorher nicht bestanden."},
            {"id": "c", "text": "Die Standardhygiene, auch Basishygiene genannt, umfasst Maßnahmen, die immer bei der Versorgung von Patienten oder Bewohnern in einer Gesundheitseinrichtung durchzuführen sind."},
            {"id": "d", "text": "Die Inkubationszeit für eine bestimmte Infektionserkrankung entspricht der Zeit, die vom Eindringen des Krankheitserregers bis zum Auftreten der ersten Symptome vergeht."},
        ],
        "correct": ["a"],
        "distractorConceptIds": [
            "concept-15-301-75-wissen-1",
            "concept-15-304-5-definition-1",
            "concept-15-300-87-definition-1",
        ],
    },
}

EXPECTED_CORRECTED = {
    "q-16-1-01": {
        "prompt": EXPECTED_ORIGINAL["q-16-1-01"]["prompt"],
        "options": [
            {"id": "a", "text": "60–100/min"},
            {"id": "b", "text": "Unter 60/min"},
            {"id": "c", "text": "Über 100/min"},
            {"id": "d", "text": "Genau 60/min"},
        ],
        "correct": ["b"],
        "explanation": "Das Lehrbuch definiert Bradykardie beim Erwachsenen als Herzfrequenz unter 60/min; 60/min selbst liegt damit nicht unter diesem Grenzwert.",
    },
    "q-16-1-02": {
        "prompt": EXPECTED_ORIGINAL["q-16-1-02"]["prompt"],
        "options": [
            {"id": "a", "text": "Unter 60/min"},
            {"id": "b", "text": "60–100/min"},
            {"id": "c", "text": "Über 100/min"},
            {"id": "d", "text": "Genau 100/min"},
        ],
        "correct": ["c"],
        "explanation": "Beim Erwachsenen spricht das Lehrbuch bei mehr als 100/min von Tachykardie; genau 100/min erfüllt den Grenzwert „über 100/min“ nicht.",
    },
    "q-16-1-04": {
        "prompt": EXPECTED_ORIGINAL["q-16-1-04"]["prompt"],
        "options": EXPECTED_ORIGINAL["q-16-1-04"]["options"] + [
            {"id": "f", "text": "Körperliche Anstrengung"},
            {"id": "g", "text": "Hyperkaliämie"},
        ],
        "correct": ["a", "b", "c", "d", "e"],
        "explanation": "Das Lehrbuch nennt Schwindel, Luftnot, Brustschmerzen, Todesangst und plötzliche Bewusstseinsbeeinträchtigung als Alarmzeichen. Körperliche Anstrengung wird als physiologischer Grund für eine erhöhte Herzfrequenz genannt; Hyperkaliämie steht im Abschnitt als Ursache einer Bradykardie.",
    },
    "q-36-01": {
        "prompt": EXPECTED_ORIGINAL["q-36-01"]["prompt"],
        "options": EXPECTED_ORIGINAL["q-36-01"]["options"] + [
            {"id": "g", "text": "First-in-First-out-Prinzip"},
            {"id": "h", "text": "Vier-Augen-Prinzip"},
        ],
        "correct": ["a", "b", "c", "d", "e", "f"],
        "explanation": "Die 6-R-Regel umfasst richtiger Patient, richtiges Medikament, richtige Dosierung, richtige Applikationsform, richtiger Zeitpunkt und richtige Dokumentation. First-in-First-out- und Vier-Augen-Prinzip werden im Medikamentenmanagement separat behandelt.",
    },
    "q-48-4-06": {
        "prompt": EXPECTED_ORIGINAL["q-48-4-06"]["prompt"],
        "options": EXPECTED_ORIGINAL["q-48-4-06"]["options"] + [
            {"id": "f", "text": "Handlungsmöglichkeiten entwickeln und bewerten"},
            {"id": "g", "text": "Eine Handlung auswählen und begründen"},
        ],
        "correct": ["a", "b", "c", "d", "e"],
        "explanation": "Im zweiten Schritt werden pflegerische, medizinische, rechtliche, soziale und organisatorische Fakten sowie Werte und Wille des Patienten gesammelt. Handlungsmöglichkeiten entwickeln und bewerten gehört zu Schritt 4; eine Handlung auswählen und begründen zu Schritt 5.",
    },
    "q-61-4-04": {
        "prompt": "Welche alternativen Kommunikationshilfen nennt das Lehrbuch bei Aphasie, wenn verbale Kommunikation nicht ausreicht?",
        "options": EXPECTED_ORIGINAL["q-61-4-04"]["options"] + [
            {"id": "f", "text": "Ja/Nein-Fragen"},
            {"id": "g", "text": "Langsam und deutlich sprechen"},
        ],
        "correct": ["a", "b", "c", "d", "e"],
        "explanation": "Als alternative Kommunikationshilfen nennt das Lehrbuch Gestik, Mimik, Bilder, Zeichnungen und Buchstabentafeln. Ja/Nein-Fragen sowie langsames, deutliches Sprechen sind separate Kommunikationsstrategien im selben Abschnitt.",
    },
    "q-p12-0040": {
        "prompt": EXPECTED_ORIGINAL["q-p12-0040"]["prompt"],
        "options": [
            EXPECTED_ORIGINAL["q-p12-0040"]["options"][0],
            {"id": "b", "text": "Als Epidemie bezeichnet man ein stark gehäuftes Auftreten einer Krankheit innerhalb einer bestimmten Region oder Bevölkerung."},
            EXPECTED_ORIGINAL["q-p12-0040"]["options"][2],
            EXPECTED_ORIGINAL["q-p12-0040"]["options"][3],
        ],
        "correct": ["a"],
        "distractorConceptIds": [
            "concept-15-312-8-definition-1",
            "concept-15-304-5-definition-1",
            "concept-15-300-87-definition-1",
        ],
    },
}

EVIDENCE = {
    "q-16-1-01": ["card-16-1-brady-def", "card-16-1-puls-normal", "card-16-1-tachy-def"],
    "q-16-1-02": ["card-16-1-tachy-def", "card-16-1-brady-def", "card-16-1-puls-normal"],
    "q-16-1-04": ["card-16-1-tachy-alarm", "q-16-1-03"],
    "q-36-01": ["card-36-6r-list", "concept-36-fifo", "concept-36-vier-augen"],
    "q-48-4-06": ["card-48-4-step2", "concept-48-4-schritt4", "concept-48-4-schritt5"],
    "q-61-4-04": ["card-61-4-alt-comms", "concept-61-4-ja-nein", "concept-61-4-kommunikation-tempo"],
    "q-p12-0040": ["card-301-34-definition-1", "concept-15-312-8-definition-1", "q-p12-0044"],
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(q: dict[str, Any]) -> dict[str, Any]:
    result = {
        "prompt": q.get("prompt"),
        "options": copy.deepcopy(q.get("options")),
        "correct": copy.deepcopy(q.get("correct")),
    }
    if q.get("id") == "q-p12-0040":
        result["distractorConceptIds"] = copy.deepcopy(q.get("generation", {}).get("distractorConceptIds"))
    return result


def corrected_snapshot(q: dict[str, Any]) -> dict[str, Any]:
    result = snapshot(q)
    result["explanation"] = q.get("explanation")
    return result


def validate_registry(registry: dict[str, Any]) -> set[str]:
    confirmed = set(registry.get("confirmedDefectIds", []))
    if confirmed != set(TARGETS):
        raise AssertionError(f"P26A confirmed-defect set changed unexpectedly: {sorted(confirmed)}")
    entries = {entry["questionId"]: entry for entry in registry.get("registry", [])}
    for qid in TARGETS:
        codes = {issue.get("code") for issue in entries[qid].get("issues", [])}
        if EXPECTED_DEFECT_CODE[qid] not in codes:
            raise AssertionError(f"{qid} missing expected P26A code {EXPECTED_DEFECT_CODE[qid]}")
    return {entry["questionId"] for entry in registry.get("registry", []) if entry.get("disposition") == "manual-review"}


def apply_repairs(questions: list[dict[str, Any]]) -> tuple[list[str], list[dict[str, Any]]]:
    by_id = {q["id"]: q for q in questions}
    if set(TARGETS) - set(by_id):
        raise AssertionError(f"Missing P26B targets: {sorted(set(TARGETS) - set(by_id))}")

    before_all = {q["id"]: copy.deepcopy(q) for q in questions}
    repair_rows: list[dict[str, Any]] = []

    for qid in TARGETS:
        q = by_id[qid]
        current = snapshot(q)
        expected_original = EXPECTED_ORIGINAL[qid]
        expected_corrected = EXPECTED_CORRECTED[qid]

        already_corrected = True
        for key, value in expected_corrected.items():
            if key == "explanation":
                if q.get("explanation") != value:
                    already_corrected = False
            elif key == "distractorConceptIds":
                if q.get("generation", {}).get("distractorConceptIds") != value:
                    already_corrected = False
            elif current.get(key) != value:
                already_corrected = False

        if not already_corrected:
            for key, value in expected_original.items():
                if current.get(key) != value:
                    raise AssertionError(
                        f"{qid} is neither the certified P26A source state nor the expected P26B state; mismatch in {key}"
                    )

            q["prompt"] = expected_corrected["prompt"]
            q["options"] = copy.deepcopy(expected_corrected["options"])
            q["correct"] = copy.deepcopy(expected_corrected["correct"])
            if "explanation" in expected_corrected:
                q["explanation"] = expected_corrected["explanation"]
            if "distractorConceptIds" in expected_corrected:
                q.setdefault("generation", {})["distractorConceptIds"] = copy.deepcopy(expected_corrected["distractorConceptIds"])

        # P26B does not alter identity/scope/grading metadata.
        assert q["id"] == qid
        assert q.get("conceptIds") == before_all[qid].get("conceptIds")
        assert q.get("type") == before_all[qid].get("type")
        assert q.get("difficulty") == before_all[qid].get("difficulty")
        assert q.get("status") == before_all[qid].get("status")
        assert q.get("correct") == expected_corrected["correct"]

        repair_rows.append({
            "questionId": qid,
            "p26aDefectCode": EXPECTED_DEFECT_CODE[qid],
            "evidenceIds": EVIDENCE[qid],
            "before": expected_original,
            "after": expected_corrected,
        })

    changed = [q["id"] for q in questions if q != before_all[q["id"]]]
    unexpected = set(changed) - set(TARGETS)
    if unexpected:
        raise AssertionError(f"P26B attempted to modify non-target questions: {sorted(unexpected)}")
    return changed, repair_rows


def make_report(question_count: int, changed: list[str], repairs: list[dict[str, Any]], manual_review_ids: set[str], before_hash: str, after_hash: str) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "phase": "P26B",
        "status": "confirmed-semantic-defects-corrected",
        "scope": {
            "questionCount": question_count,
            "inputConfirmedDefects": 7,
            "targetedQuestions": len(TARGETS),
            "manualReviewCandidatesPreserved": len(manual_review_ids),
            "nonTargetQuestions": question_count - len(TARGETS),
        },
        "questionBank": {
            "beforeSha256": before_hash,
            "afterSha256": after_hash,
        },
        "changedQuestionIds": sorted(changed),
        "targetQuestionIds": sorted(TARGETS),
        "preservedManualReviewQuestionIds": sorted(manual_review_ids),
        "repairs": repairs,
        "policy": {
            "externalClinicalGuidanceAdded": False,
            "manualReviewCandidatesEdited": False,
            "questionIdsChanged": False,
            "questionTypesChanged": False,
            "conceptAnchorsChanged": False,
            "difficultyChanged": False,
            "fsrsChanged": False,
            "masteryChanged": False,
            "remediationChanged": False,
            "examLogicChanged": False,
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# P26B — Confirmed Semantic Defect Correction",
        "",
        "> Corrects only the seven high-confidence defects certified by P26A. The P26A manual-review queue is preserved for later phases.",
        "",
        f"- Questions in bank: **{report['scope']['questionCount']}**",
        f"- P26A confirmed defects targeted: **{report['scope']['inputConfirmedDefects']}**",
        f"- P26A manual-review candidates preserved: **{report['scope']['manualReviewCandidatesPreserved']}**",
        f"- Non-target questions preserved: **{report['scope']['nonTargetQuestions']}**",
        "",
        "## Repairs",
        "",
        "| Question | P26A defect | Repair |",
        "|---|---|---|",
    ]
    descriptions = {
        "q-16-1-01": "Replaced overlapping bradycardia distractors with mutually non-overlapping threshold/range choices.",
        "q-16-1-02": "Replaced nested tachycardia thresholds with non-overlapping adult-frequency choices.",
        "q-16-1-04": "Added two source-backed contrast distractors so the multiple-choice item discriminates knowledge.",
        "q-36-01": "Added FIFO and Vier-Augen as separate medication-management principles, not 6-R components.",
        "q-48-4-06": "Added actions from steps 4 and 5 as source-backed distractors for step-2 information categories.",
        "q-61-4-04": "Added separate aphasia communication strategies as distractors to the alternative-aids list.",
        "q-p12-0040": "Replaced the near-duplicate nosocomial-infection distractor with the source-backed Epidemie definition.",
    }
    for row in report["repairs"]:
        lines.append(f"| `{row['questionId']}` | `{row['p26aDefectCode']}` | {descriptions[row['questionId']]} |")
    lines += [
        "",
        "## Invariants",
        "",
        "- No external clinical guidance is introduced.",
        "- Question IDs, types, concept anchors, difficulty and status remain unchanged.",
        "- The 108 P26A manual-review candidates are not adjudicated or rewritten in P26B.",
        "- FSRS, mastery, remediation and mock-exam logic are outside P26B scope.",
        "",
        "Residual-defect certification is performed by `tests/p26b-semantic-correction.test.py` using the P26A detector itself.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write corrected question bank and P26B reports")
    args = parser.parse_args()

    registry = load_json(P26A_REGISTRY)
    manual_review_ids = validate_registry(registry)
    if len(manual_review_ids) != 108:
        raise AssertionError(f"Expected 108 P26A manual-review candidates, found {len(manual_review_ids)}")

    before_hash = sha256(QUESTIONS_PATH)
    questions = load_json(QUESTIONS_PATH)
    if len(questions) != 1299:
        raise AssertionError(f"Expected 1,299 questions, found {len(questions)}")

    changed, repairs = apply_repairs(questions)

    if args.write and changed:
        QUESTIONS_PATH.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    after_hash = sha256(QUESTIONS_PATH) if args.write else before_hash
    report = make_report(len(questions), changed, repairs, manual_review_ids, before_hash, after_hash)

    if args.write:
        REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
        REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        REPORT_MD.write_text(render_markdown(report), encoding="utf-8")

    print(json.dumps({
        "phase": "P26B",
        "questions": len(questions),
        "changedThisRun": sorted(changed),
        "targets": sorted(TARGETS),
        "manualReviewCandidatesPreserved": len(manual_review_ids),
        "beforeSha256": before_hash,
        "afterSha256": after_hash,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
