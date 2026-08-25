#!/usr/bin/env python3
"""Second-pass precision filter for P26A semantic findings.

The first pass intentionally over-detects numerical/lexical overlap. This pass
removes findings that are explainable by different units, different quantities,
or too little lexical evidence to justify a high-confidence semantic defect.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REPORTS = ROOT / "reports"

spec = importlib.util.spec_from_file_location("p26a_semantic_audit", ROOT / "tools" / "p26a_semantic_audit.py")
base = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base
spec.loader.exec_module(base)

UNIT_PATTERNS = {
    "per_min": re.compile(r"(?:/\s*min\b|pro\s+minute|schl[aä]ge?\s+pro\s+minute)", re.I),
    "mmhg": re.compile(r"\bmm\s*hg\b", re.I),
    "mg_dl": re.compile(r"\bmg\s*/\s*dl\b", re.I),
    "mmol_l": re.compile(r"\bmmol\s*/\s*l\b", re.I),
    "celsius": re.compile(r"(?:°\s*c\b|grad\s+celsius)", re.I),
    "weeks": re.compile(r"\bwoch(?:e|en)\b", re.I),
    "hours": re.compile(r"\bstund(?:e|en)\b", re.I),
    "days": re.compile(r"\btag(?:e|en)?\b|/\s*tag\b", re.I),
    "ml": re.compile(r"\bml\b", re.I),
    "litre": re.compile(r"\b(?:l|liter)\b", re.I),
    "kg": re.compile(r"\bkg\b", re.I),
    "gram": re.compile(r"\b(?:g|gramm)\b", re.I),
    "percent": re.compile(r"%|prozent", re.I),
    "cm": re.compile(r"\bcm\b", re.I),
    "mm": re.compile(r"\bmm\b", re.I),
}

GENERIC_NUMERIC_TOKENS = {
    "ca", "etwa", "maximal", "mindestens", "hochstens", "unter", "uber", "mehr", "wenig", "wert", "werte",
    "liegt", "liegen", "betragt", "betragen", "spricht", "minute", "stunden", "stunde", "wochen", "woche",
}


def unit_signature(text: str) -> set[str]:
    return {name for name, pattern in UNIT_PATTERNS.items() if pattern.search(str(text or ""))}


def numbers(text: str) -> tuple[str, ...]:
    value = str(text or "").replace(",", ".")
    return tuple(re.findall(r"(?<![A-Za-z])\d+(?:\.\d+)?", value))


def semantic_tokens(text: str) -> set[str]:
    return {token for token in base.tokens(text) if token not in GENERIC_NUMERIC_TOKENS}


def keep_numeric_overlap(issue: dict[str, Any]) -> bool:
    evidence = issue.get("evidence", {})
    correct = str(evidence.get("correct", ""))
    distractor = str(evidence.get("distractor", ""))
    cu = unit_signature(correct)
    du = unit_signature(distractor)

    # If either option exposes a recognizable unit, they must describe the same quantity family.
    if cu or du:
        if not cu or not du or cu.isdisjoint(du):
            return False

    # Short threshold/range choices with the same units are intrinsically ambiguous when they overlap.
    if len(correct) <= 65 and len(distractor) <= 65:
        return True

    ct = semantic_tokens(correct)
    dt = semantic_tokens(distractor)
    if not ct or not dt:
        return False
    # Long prose options require strong semantic-context agreement, not merely coincident numbers.
    return base.jaccard(ct, dt) >= 0.55 or base.containment(ct, dt) >= 0.78


def keep_near_equivalent(issue: dict[str, Any]) -> bool:
    evidence = issue.get("evidence", {})
    correct = str(evidence.get("correct", ""))
    distractor = str(evidence.get("distractor", ""))
    ct = semantic_tokens(correct)
    dt = semantic_tokens(distractor)
    # Numeric-only labels such as "1 Stunde" vs "24 Stunden" are not semantically equivalent.
    if len(ct) < 3 or len(dt) < 3:
        return False
    cn, dn = numbers(correct), numbers(distractor)
    if (cn or dn) and cn != dn:
        return False
    cu, du = unit_signature(correct), unit_signature(distractor)
    if (cu or du) and cu != du:
        return False
    return base.jaccard(ct, dt) >= 0.78 or base.containment(ct, dt) >= 0.92


def recompute(report: dict[str, Any]) -> dict[str, Any]:
    registry = []
    for entry in report.get("registry", []):
        issues = []
        for issue in entry.get("issues", []):
            code = issue.get("code")
            if code == "NUMERIC_ANSWER_OVERLAP" and not keep_numeric_overlap(issue):
                continue
            if code == "NEAR_EQUIVALENT_ANSWER_OPTIONS" and not keep_near_equivalent(issue):
                continue
            issues.append(issue)
        if not issues:
            continue
        issues.sort(key=lambda x: (-base.SEVERITY_RANK[x["severity"]], -base.CONFIDENCE_RANK[x["confidence"]], x["code"]))
        entry = dict(entry)
        entry["issues"] = issues
        top = issues[0]
        entry["highestSeverity"] = top["severity"]
        entry["highestConfidence"] = top["confidence"]
        entry["disposition"] = "confirmed-defect" if (
            base.SEVERITY_RANK[top["severity"]] >= base.SEVERITY_RANK["high"] and top["confidence"] == "high"
        ) else "manual-review"
        registry.append(entry)

    registry.sort(key=lambda e: (
        -base.SEVERITY_RANK[e["highestSeverity"]],
        0 if e["disposition"] == "confirmed-defect" else 1,
        str(e["questionId"]),
    ))
    issue_counts = Counter()
    severity_counts = Counter()
    disposition_counts = Counter()
    type_counts = Counter()
    for entry in registry:
        severity_counts[entry["highestSeverity"]] += 1
        disposition_counts[entry["disposition"]] += 1
        type_counts[entry.get("type")] += 1
        for issue in entry["issues"]:
            issue_counts[issue["code"]] += 1

    confirmed = [entry for entry in registry if entry["disposition"] == "confirmed-defect"]
    report = dict(report)
    report["refinement"] = {
        "version": 1,
        "policy": "unit-aware numeric overlap + number-aware lexical equivalence",
    }
    report["registry"] = registry
    report["confirmedDefectIds"] = [entry["questionId"] for entry in confirmed]
    report["summary"] = {
        "flaggedQuestions": len(registry),
        "confirmedDefects": len(confirmed),
        "manualReviewCandidates": len(registry) - len(confirmed),
        "highestSeverityCounts": dict(sorted(severity_counts.items())),
        "dispositionCounts": dict(sorted(disposition_counts.items())),
        "flaggedTypeCounts": dict(sorted(type_counts.items(), key=lambda x: str(x[0]))),
        "issueCodeCounts": dict(issue_counts.most_common()),
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(REPORTS / "P26A_SEMANTIC_DEFECT_REGISTRY.json"))
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    path = Path(args.input)
    report = json.loads(path.read_text(encoding="utf-8"))
    refined = recompute(report)
    if args.write:
        path.write_text(json.dumps(refined, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        base.write_markdown(refined, REPORTS / "P26A_SEMANTIC_DEFECT_REPORT.md")
    print(json.dumps({
        "phase": refined["phase"],
        "summary": refined["summary"],
        "confirmedDefectIds": refined["confirmedDefectIds"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
