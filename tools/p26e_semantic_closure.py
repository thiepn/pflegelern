#!/usr/bin/env python3
"""P26E: adjudication-aware semantic closure certification for PflegeLern.

P26E does not mutate the question bank. It composes the historical P26A raw
semantic detector with the P26B repairs, P26C adjudication, and P26D bounded
repair report to prove that every semantic signal is either repaired or already
adjudicated as non-actionable repository-local evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REPORTS = ROOT / "reports"

QUESTIONS = DATA / "questions.json"
CONCEPTS = DATA / "concepts.json"
CARDS = DATA / "cards.json"
P26A = REPORTS / "P26A_SEMANTIC_DEFECT_REGISTRY.json"
P26B = REPORTS / "P26B_SEMANTIC_CORRECTION_REPORT.json"
P26C = REPORTS / "P26C_MANUAL_REVIEW_ADJUDICATION.json"
P26D = REPORTS / "P26D_CONFIRMED_DEFECT_REPAIR.json"
OUT_JSON = REPORTS / "P26E_SEMANTIC_CLOSURE.json"
OUT_MD = REPORTS / "P26E_SEMANTIC_CLOSURE.md"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def raw_live_detector() -> dict[str, Any]:
    audit = load_module("p26e_p26a_semantic_audit", ROOT / "tools" / "p26a_semantic_audit.py")
    refine = load_module("p26e_p26a_semantic_refinement", ROOT / "tools" / "p26a_semantic_refinement.py")
    questions = load_json(QUESTIONS)
    concepts = load_json(CONCEPTS)
    cards = load_json(CARDS)
    return refine.recompute(audit.semantic_audit(questions, concepts, cards))


def build_report() -> dict[str, Any]:
    questions = load_json(QUESTIONS)
    p26a = load_json(P26A)
    p26b = load_json(P26B)
    p26c = load_json(P26C)
    p26d = load_json(P26D)
    live = raw_live_detector()

    p26a_confirmed = set(p26a.get("confirmedDefectIds", []))
    p26a_manual = {
        row["questionId"] for row in p26a.get("registry", [])
        if row.get("disposition") == "manual-review"
    }
    p26b_targets = set(p26b.get("targetQuestionIds", []))
    p26c_cleared = set(p26c.get("clearedIds", []))
    p26c_repair = set(p26c.get("confirmedForRepairIds", []))
    p26d_targets = set(p26d.get("targetQuestionIds", []))
    raw_confirmed = set(live.get("confirmedDefectIds", []))
    raw_review = {
        row["questionId"] for row in live.get("registry", [])
        if row.get("disposition") == "manual-review"
    }
    raw_flagged = {row["questionId"] for row in live.get("registry", [])}

    # Historical chain invariants.
    assert len(questions) == 1299
    assert p26a["summary"]["confirmedDefects"] == 7
    assert p26a["summary"]["manualReviewCandidates"] == 108
    assert len(p26a_confirmed) == 7
    assert len(p26a_manual) == 108
    assert p26b_targets == p26a_confirmed
    assert p26b["scope"]["targetedQuestions"] == 7
    assert p26c["summary"]["adjudicated"] == 108
    assert p26c["summary"]["cleared"] == 94
    assert p26c["summary"]["confirmedForRepair"] == 14
    assert p26c["summary"]["unresolved"] == 0
    assert p26c_cleared | p26c_repair == p26a_manual
    assert not (p26c_cleared & p26c_repair)
    assert p26d["summary"]["targets"] == 14
    assert p26d["summary"]["repaired"] == 14
    assert p26d_targets == p26c_repair

    # Live closure invariants after P26D.
    assert live["summary"]["confirmedDefects"] == 0
    assert live["summary"]["manualReviewCandidates"] == 94
    assert live["summary"]["flaggedQuestions"] == 94
    assert raw_confirmed == set()
    assert raw_review == p26c_cleared
    assert raw_flagged == p26c_cleared
    assert not (p26d_targets & raw_flagged)
    assert sha256(QUESTIONS) == p26d["baseline"]["questionBankAfterSha256"]

    cleared_category_counts = Counter()
    cleared_type_counts = Counter()
    for row in p26c.get("adjudications", []):
        if row.get("questionId") in p26c_cleared:
            cleared_category_counts[row.get("category", "unknown")] += 1
            cleared_type_counts[row.get("type", "unknown")] += 1

    actionable = sorted(raw_confirmed | (raw_review - p26c_cleared))
    unadjudicated = sorted(raw_flagged - p26c_cleared)
    pending_repairs = sorted(p26c_repair - p26d_targets)
    stale_repair_targets = sorted(p26d_targets & raw_flagged)

    assert actionable == []
    assert unadjudicated == []
    assert pending_repairs == []
    assert stale_repair_targets == []

    report = {
        "schemaVersion": 1,
        "phase": "P26E",
        "status": "semantic-audit-closed",
        "generatedFrom": f"live-question-bank-sha256:{sha256(QUESTIONS)}",
        "scope": {
            "questionCount": len(questions),
            "questionBankMutated": False,
            "externalClinicalGuidanceAdded": False,
            "rawDetectorPreserved": True,
            "historicalAdjudicationsPreserved": True,
        },
        "baseline": {
            "liveQuestionBankSha256": sha256(QUESTIONS),
            "p26aRegistrySha256": sha256(P26A),
            "p26bCorrectionReportSha256": sha256(P26B),
            "p26cAdjudicationReportSha256": sha256(P26C),
            "p26dRepairReportSha256": sha256(P26D),
        },
        "summary": {
            "historicalConfirmedDefects": len(p26a_confirmed),
            "historicalManualReviewCandidates": len(p26a_manual),
            "p26bRepairs": len(p26b_targets),
            "p26cAdjudicated": p26c["summary"]["adjudicated"],
            "p26cCleared": len(p26c_cleared),
            "p26cConfirmedForRepair": len(p26c_repair),
            "p26dRepairs": len(p26d_targets),
            "rawDetectorConfirmedDefects": len(raw_confirmed),
            "rawDetectorReviewSignals": len(raw_review),
            "clearedHistoricalSignals": len(raw_review & p26c_cleared),
            "actionableDefects": len(actionable),
            "unadjudicatedSignals": len(unadjudicated),
            "pendingRepairs": len(pending_repairs),
            "staleRepairTargets": len(stale_repair_targets),
            "semanticClosure": True,
        },
        "clearedSignalClassification": {
            "categoryCounts": dict(sorted(cleared_category_counts.items())),
            "typeCounts": dict(sorted(cleared_type_counts.items())),
            "questionIds": sorted(p26c_cleared),
        },
        "repairChain": {
            "p26bRepairedQuestionIds": sorted(p26b_targets),
            "p26dRepairedQuestionIds": sorted(p26d_targets),
            "pendingRepairQuestionIds": pending_repairs,
            "staleRepairQuestionIds": stale_repair_targets,
        },
        "liveDetector": {
            "confirmedDefectIds": sorted(raw_confirmed),
            "manualReviewSignalIds": sorted(raw_review),
            "summary": live["summary"],
        },
        "closure": {
            "actionableDefectIds": actionable,
            "unadjudicatedSignalIds": unadjudicated,
            "pendingRepairIds": pending_repairs,
            "staleRepairTargetIds": stale_repair_targets,
        },
        "policy": {
            "rawP26ADetectorRewritten": False,
            "historicalP26ARegistryRewritten": False,
            "historicalP26CAdjudicationRewritten": False,
            "questionContentEdited": False,
            "answerKeysEdited": False,
            "externalClinicalGuidanceAdded": False,
            "fsrsChanged": False,
            "masteryChanged": False,
            "remediationChanged": False,
            "repetitionControlChanged": False,
            "inputHandlingChanged": False,
            "examLogicChanged": False,
        },
    }
    return report


def write_markdown(report: dict[str, Any], path: Path) -> None:
    s = report["summary"]
    cats = report["clearedSignalClassification"]["categoryCounts"]
    lines = [
        "# P26E — Semantic Audit Closure",
        "",
        "> Final adjudication-aware certification of the P26A–P26D semantic-audit chain. No question-bank mutation occurs in P26E.",
        "",
        f"- Questions certified: **{report['scope']['questionCount']}**",
        f"- Historical P26A confirmed defects: **{s['historicalConfirmedDefects']}** — repaired in P26B",
        f"- Historical P26A manual-review candidates: **{s['historicalManualReviewCandidates']}**",
        f"- P26C cleared signals: **{s['p26cCleared']}**",
        f"- P26C repair queue: **{s['p26cConfirmedForRepair']}** — repaired in P26D",
        f"- Live raw-detector confirmed defects: **{s['rawDetectorConfirmedDefects']}**",
        f"- Live raw-detector review signals: **{s['rawDetectorReviewSignals']}**",
        f"- Actionable defects: **{s['actionableDefects']}**",
        f"- Unadjudicated signals: **{s['unadjudicatedSignals']}**",
        f"- Pending repairs: **{s['pendingRepairs']}**",
        "",
        "## Why 94 raw signals remain",
        "",
        "The P26A detector intentionally remains conservative and unchanged. The 94 live review signals are not unresolved defects: they are exactly the 94 IDs already cleared by P26C against repository-local textbook-derived evidence.",
        "",
    ]
    for category, count in cats.items():
        lines.append(f"- `{category}`: {count}")
    lines += [
        "",
        "## Closure invariants",
        "",
        "- The 94 live review IDs equal the P26C-cleared ID set exactly.",
        "- None of the 14 P26D repair targets remains flagged by the live detector.",
        "- The seven P26A confirmed defects remain closed through P26B.",
        "- Actionable defects, unadjudicated signals, pending repairs, and stale repair targets are all zero.",
        "- `data/questions.json` is byte-identical to the P26D-certified bank.",
        "- No external clinical guidance or learning-system behavior is introduced or changed.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="materialize deterministic P26E JSON/Markdown reports")
    parser.add_argument("--json", action="store_true", help="print full closure report")
    args = parser.parse_args()

    report = build_report()
    if args.write:
        OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_markdown(report, OUT_MD)
        print(f"wrote {OUT_JSON.relative_to(ROOT)}")
        print(f"wrote {OUT_MD.relative_to(ROOT)}")

    print(json.dumps({
        "phase": report["phase"],
        "status": report["status"],
        "summary": report["summary"],
        "baseline": report["baseline"],
    }, ensure_ascii=False, indent=2))
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
