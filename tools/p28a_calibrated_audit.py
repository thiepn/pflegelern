#!/usr/bin/env python3
"""Calibrated P28A clinical/contextual validity audit.

The base detector intentionally over-surfaces possible ambiguity. This layer
removes broad heuristics that are not independently sufficient for a
question-level finding, while preserving strong adversarial signals for P28B.
Detection only: no learning content or answer key is changed.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import p28a_clinical_context_audit as raw

ROOT = Path(__file__).resolve().parents[1]
REPORT_JSON = ROOT / "reports" / "P28A_CLINICAL_CONTEXT_VALIDITY_AUDIT.json"
REPORT_MD = ROOT / "reports" / "P28A_CLINICAL_CONTEXT_VALIDITY_AUDIT.md"
PRIORITY_MD = ROOT / "reports" / "P28A_PRIORITY_REVIEW.md"

EXPLICIT_COMBINATION = re.compile(
    r"\b(beide|alle\s+(?:genannten|antworten|aussagen|maßnahmen|faktoren)|(?:a|b|c|d)\s+und\s+(?:a|b|c|d))\b",
    re.I,
)
SOURCE_RECALL_CASE = re.compile(
    r"\b(laut\s+lehrbuch|nennt\s+das\s+lehrbuch|bezeichnet\s+das\s+lehrbuch|ordnet\s+das\s+lehrbuch|"
    r"welche\s+(?:komplikation|dringlichkeit|lebensmittelgruppe|lage|phase|ursache|folge)\s+nennt\s+das\s+lehrbuch)\b",
    re.I,
)

STRONG_SINGLE_CODES = {
    "SINGLE_CHOICE_FOR_PLURAL_KNOWLEDGE",
    "MULTIPLE_SOURCE_SUPPORTED_OPTIONS",
    "CONTEXT_DEPENDENT_SINGLE_CHOICE",
    "NON_MUTUALLY_EXCLUSIVE_OPTIONS",
    "OPTION_SUBSUMPTION",
    "OVERLAPPING_NUMERIC_OPTIONS",
    "HIDDEN_MULTI_ANSWER_AS_SINGLE_CHOICE",
    "KEYED_ANSWER_WEAK_SOURCE_RELATION",
}

PRIORITY_CODES = [
    "POSSIBLE_MISSING_CORRECT_OPTIONS",
    "MULTIPLE_SOURCE_SUPPORTED_OPTIONS",
    "NON_MUTUALLY_EXCLUSIVE_OPTIONS",
    "OPTION_SUBSUMPTION",
    "OVERLAPPING_NUMERIC_OPTIONS",
    "SINGLE_CHOICE_FOR_PLURAL_KNOWLEDGE",
    "CONTEXT_DEPENDENT_SINGLE_CHOICE",
    "PRIORITY_QUESTION_WITHOUT_DECISION_CONTEXT",
    "INSUFFICIENT_CLINICAL_CASE_CONTEXT",
    "PLURAL_PROMPT_WITH_NARROW_REFERENCE",
]


def _token_containment(inner: str, outer: str) -> float:
    a = raw.tokens(inner)
    b = raw.tokens(outer)
    return (len(a & b) / len(a)) if a else 0.0


def _compound_key_is_real(question: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    options = raw.option_texts(question)
    correct = [str(x) for x in question.get("correct", [])] if isinstance(question.get("correct"), list) else []
    if len(correct) != 1 or correct[0] not in options:
        return False, {}
    keyed_id = correct[0]
    keyed = options[keyed_id]
    if EXPLICIT_COMBINATION.search(keyed):
        return True, {"mode": "explicit-combination", "correctText": keyed}
    if not re.search(r"\b(und|sowie)\b", keyed, re.I):
        return False, {"correctText": keyed}
    components = []
    for oid, text in options.items():
        if oid == keyed_id:
            continue
        score = _token_containment(text, keyed)
        if score >= 0.72 and len(raw.tokens(text)) >= 2:
            components.append({"id": oid, "text": text, "containment": round(score, 3)})
    return len(components) >= 2, {"mode": "component-distractors", "correctText": keyed, "components": components}


def _calibrate_row(row: dict[str, Any], question: dict[str, Any]) -> dict[str, Any]:
    prompt = row["prompt"]
    dimensions = row.get("contextDimensions", [])
    calibrated: list[dict[str, Any]] = []

    for issue in row.get("issues", []):
        code = issue["code"]

        if code == "PRIORITY_QUESTION_WITHOUT_DECISION_CONTEXT":
            # Generic "am ehesten" stems are common in factual MC questions.
            # Retain this only when the stem genuinely asks for an action.
            if not raw.ACTION_CUES.search(prompt):
                continue
            if len(dimensions) == 1:
                issue = {
                    **issue,
                    "risk": "medium",
                    "rationale": "A priority/action question provides only one explicit context dimension; P28B should verify that this is enough to make the preferred action unique.",
                    "evidence": {**issue.get("evidence", {}), "calibrated": True},
                }

        elif code == "HIDDEN_MULTI_ANSWER_AS_SINGLE_CHOICE":
            keep, evidence = _compound_key_is_real(question)
            if not keep:
                continue
            issue = {**issue, "evidence": evidence}

        elif code == "INSUFFICIENT_CLINICAL_CASE_CONTEXT":
            has_case_cue = bool(raw.CASE_CUES.search(prompt))
            # Many legacy 'clinical_case' items are actually textbook-recall
            # questions wrapped in one sentence of scenario. That is a
            # pedagogical/type-fit weakness, but not by itself evidence that a
            # reference answer is clinically wrong. Separate it from genuine
            # answer-ambiguity risk.
            if SOURCE_RECALL_CASE.search(prompt):
                issue = {
                    **issue,
                    "code": "PSEUDO_CLINICAL_CASE_SOURCE_RECALL",
                    "risk": "review",
                    "rationale": "This item is typed as a clinical case but primarily asks for a source-specific textbook fact. P28B may retype or enrich it, but this alone does not establish answer ambiguity.",
                    "evidence": {**issue.get("evidence", {}), "calibrated": True},
                }
            elif len(dimensions) >= 2:
                continue
            elif len(dimensions) == 1 and (len(prompt) >= 60 or has_case_cue):
                issue = {
                    **issue,
                    "risk": "medium",
                    "rationale": "The case contains concrete context but only one detected contextual dimension; P28B should verify whether that is sufficient for the expected answer.",
                    "evidence": {**issue.get("evidence", {}), "calibrated": True},
                }
            elif has_case_cue and len(prompt) >= 50:
                issue = {
                    **issue,
                    "risk": "medium",
                    "rationale": "The prompt is case-like, but the detector cannot establish enough independent contextual dimensions; semantic review is warranted without presuming the answer is wrong.",
                    "evidence": {**issue.get("evidence", {}), "calibrated": True},
                }
            # Only genuinely thin/non-case-like prompts remain high risk.

        calibrated.append(issue)

    highest = max((raw.RISK_RANK[i["risk"]] for i in calibrated), default=0)
    risk_band = "clear" if highest == 0 else next(name for name, rank in raw.RISK_RANK.items() if rank == highest)
    codes = {i["code"] for i in calibrated}
    recommendation = "retain"
    if row["type"] == "single_choice" and codes & STRONG_SINGLE_CODES:
        recommendation = "manual-adjudication-before-single-choice-retention"
    elif highest >= raw.RISK_RANK["high"]:
        recommendation = "manual-adjudication-required"
    elif calibrated:
        recommendation = "review"

    return {**row, "riskBand": risk_band, "recommendation": recommendation, "issues": calibrated}


def calibrated_audit() -> dict[str, Any]:
    base = raw.audit()
    questions = raw.load_json(raw.QUESTIONS)
    by_id = {str(q["id"]): q for q in questions}
    rows = [_calibrate_row(row, by_id[row["questionId"]]) for row in base["questions"]]

    risk_counts = Counter(r["riskBand"] for r in rows)
    type_counts = Counter(r["type"] for r in rows)
    epistemic_counts = Counter(r["epistemicClass"] for r in rows)
    issue_counts = Counter(i["code"] for r in rows for i in r["issues"])
    recommendation_counts = Counter(r["recommendation"] for r in rows)
    single_rows = [r for r in rows if r["type"] == "single_choice"]
    single_manual = [r for r in single_rows if r["recommendation"] == "manual-adjudication-before-single-choice-retention"]
    objective_high = [r for r in rows if r["type"] in raw.OBJECTIVE_TYPES and raw.RISK_RANK[r["riskBand"]] >= raw.RISK_RANK["high"]]
    critical = [r for r in rows if r["riskBand"] == "critical"]
    currentness = [r for r in rows if any(i["code"] == "CURRENT_GUIDANCE_SENSITIVE_TOPIC" for i in r["issues"])]

    status = "ACTION_REQUIRED" if critical or objective_high or single_manual else "PASS"
    summary = {
        "riskCounts": dict(sorted(risk_counts.items())),
        "typeCounts": dict(sorted(type_counts.items())),
        "epistemicClassCounts": dict(sorted(epistemic_counts.items())),
        "recommendationCounts": dict(sorted(recommendation_counts.items())),
        "issueCounts": dict(issue_counts.most_common()),
        "singleChoiceTotal": len(single_rows),
        "singleChoiceManualAdjudication": len(single_manual),
        "criticalQuestions": len(critical),
        "highOrCriticalObjectiveQuestions": len(objective_high),
        "currentGuidanceSensitiveReview": len(currentness),
        "allQuestionsCovered": len(rows) == 1299,
    }
    queues = {
        "criticalQuestionIds": [r["questionId"] for r in critical],
        "singleChoiceAdjudicationIds": [r["questionId"] for r in single_manual],
        "highOrCriticalObjectiveIds": [r["questionId"] for r in objective_high],
        "currentGuidanceSensitiveIds": [r["questionId"] for r in currentness],
    }

    return {
        **base,
        "status": status,
        "summary": summary,
        "priorityQueues": queues,
        "questions": rows,
        "calibration": {
            "version": 3,
            "purpose": "Remove broad wording/type-shape false positives while retaining clinically meaningful ambiguity signals.",
            "rawFirstPass": {
                "riskCounts": base["summary"]["riskCounts"],
                "singleChoiceManualAdjudication": base["summary"]["singleChoiceManualAdjudication"],
                "criticalQuestions": base["summary"]["criticalQuestions"],
                "highOrCriticalObjectiveQuestions": base["summary"]["highOrCriticalObjectiveQuestions"],
            },
            "rules": [
                "Priority wording alone is not a defect; it must also ask for an action/decision.",
                "Ordinary conjunctions are not hidden multi-answer items unless explicit combination wording or component distractors prove compound encoding.",
                "Source-recall questions wrapped as clinical cases are classified as type-fit review rather than high-risk answer ambiguity.",
                "Clinical cases with substantive narrative/context are not high-risk merely for missing detector keywords.",
                "Strong source-supported alternative, missing-correct-option, option-overlap, subsumption, numeric-overlap and context-sensitive single-choice signals are preserved.",
            ],
        },
    }


def render_summary(report: dict[str, Any]) -> str:
    s = report["summary"]
    lines = [
        "# P28A — Clinical & Contextual Question Validity Audit", "",
        f"**Status: {report['status']}**", "",
        "P28A is detection-only. It does not edit the frozen P26G question bank, answer keys, learning logic, grading, FSRS, or release behavior.", "",
        "## Full-bank coverage", "",
        f"- Questions audited: **{report['scope']['questions']} / 1,299**",
        f"- Frozen SHA-256 preserved: `{report['scope']['questionBankSha256']}`",
        f"- Single-choice questions: **{s['singleChoiceTotal']}**",
        f"- Single-choice items requiring adversarial adjudication before retention: **{s['singleChoiceManualAdjudication']}**",
        f"- Critical-risk questions: **{s['criticalQuestions']}**",
        f"- High/critical objective questions: **{s['highOrCriticalObjectiveQuestions']}**",
        f"- Current-guidance-sensitive review queue: **{s['currentGuidanceSensitiveReview']}**", "",
        "## Calibrated risk distribution", "",
    ]
    for key in ("critical", "high", "medium", "review", "clear"):
        lines.append(f"- {key}: **{s['riskCounts'].get(key, 0)}**")
    lines += ["", "## Most common calibrated signals", ""]
    for code, count in list(s["issueCounts"].items())[:20]:
        lines.append(f"- `{code}`: **{count}**")
    lines += [
        "", "## Interpretation", "",
        "A flag is not automatically a claim that the textbook fact is wrong. It means the question/answer contract may be unsafe for learning without semantic adjudication. P28A deliberately separates source-faithful 2015 correctness from current-guidance validity.", "",
        "Single-choice is treated strictly: it may remain single-choice only if exactly one answer is defensible under the information explicitly supplied in the prompt.", "",
        "The first-pass detector was intentionally over-sensitive. Calibration removes wording-only signals such as generic ‘am ehesten’ stems and ordinary conjunctions, and separates pseudo-clinical textbook recall from true answer-ambiguity risk.", "",
        "## Next phase", "", "**P28B — Adversarial Question-by-Question Adjudication & Repair**", "",
        "P28B must inspect the priority queues semantically and repair each unsafe item by adding context, converting to multiple choice/free response/clinical case, accepting additional answers, rewriting distractors, or removing the item. Any question-bank edit invalidates the P26G freeze and requires re-certification.", "",
    ]
    return "\n".join(lines)


def render_priority(report: dict[str, Any], limit: int = 8) -> str:
    by_code: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = {code: [] for code in PRIORITY_CODES}
    for row in report["questions"]:
        for issue in row["issues"]:
            if issue["code"] in by_code and len(by_code[issue["code"]]) < limit:
                by_code[issue["code"]].append((row, issue))
    lines = ["# P28A — Priority Review Samples", "", "These are detector examples for P28B adjudication, not final judgments that the keyed answer is wrong.", ""]
    for code in PRIORITY_CODES:
        matches = by_code[code]
        total = report["summary"]["issueCounts"].get(code, 0)
        if not total:
            continue
        lines += [f"## {code} — {total}", ""]
        for row, issue in matches:
            prompt = row["prompt"].replace("\n", " ")
            if len(prompt) > 240:
                prompt = prompt[:237] + "…"
            lines.append(f"- `{row['questionId']}` · `{row['type']}` · **{issue['risk']}** — {prompt}")
        lines.append("")
    return "\n".join(lines)


def write_reports(report: dict[str, Any]) -> None:
    REPORT_JSON.parent.mkdir(exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_MD.write_text(render_summary(report), encoding="utf-8")
    PRIORITY_MD.write_text(render_priority(report), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check-report", action="store_true")
    args = parser.parse_args()
    report = calibrated_audit()
    expected_json = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    expected_md = render_summary(report)
    expected_priority = render_priority(report)
    if args.write:
        write_reports(report)
    if args.check_report:
        for path, expected in [(REPORT_JSON, expected_json), (REPORT_MD, expected_md), (PRIORITY_MD, expected_priority)]:
            if not path.exists() or path.read_text(encoding="utf-8") != expected:
                print(f"P28A report drift detected: {path.name}")
                return 1
    print(json.dumps({"phase": report["phase"], "status": report["status"], **report["summary"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
