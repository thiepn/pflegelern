#!/usr/bin/env python3
"""P26A semantic defect detection for PflegeLern.

Detection only: this script never rewrites data/questions.json.
It produces a conservative, reproducible registry of confirmed defects and
manual-review candidates for the later P26 correction phases.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REPORTS = ROOT / "reports"

STOPWORDS = {
    "aber", "als", "am", "an", "auch", "auf", "aus", "bei", "beim", "bis", "da", "das", "dass",
    "dem", "den", "der", "des", "die", "dies", "diese", "diesem", "diesen", "dieser", "dieses",
    "durch", "ein", "eine", "einem", "einen", "einer", "eines", "er", "es", "für", "hat", "haben",
    "im", "in", "ist", "laut", "mit", "nach", "nicht", "oder", "sich", "sie", "sind", "so", "soll",
    "sollen", "über", "um", "und", "unter", "vom", "von", "vor", "was", "welche", "welcher", "welches",
    "welchen", "wie", "wird", "werden", "zu", "zum", "zur", "lehrbuch", "genannt", "nennt", "entspricht",
    "aussage", "aussagen", "folgende", "folgenden", "folgendes", "richtig", "korrekt", "patient", "patienten",
    "pflege", "pflegekraft", "pflegeperson"
}

GENERIC_FREE_RESPONSE = re.compile(
    r"^(?:was|welche|welcher|wie|warum)\s+(?:ist|sind|soll|sollen|wird|werden|kann|können)\b.{0,34}[?]?$",
    re.I,
)
ABSOLUTES = re.compile(r"\b(immer|nie|niemals|ausschließlich|grundsätzlich|zwingend|unter keinen umständen|in jedem fall)\b", re.I)
NEGATIONS = re.compile(r"\b(nicht|kein|keine|keinen|keiner|ohne|nie|niemals|verboten)\b", re.I)
SEQUENCE_CUES = re.compile(r"\b(reihenfolge|zuerst|zunächst|danach|anschließend|schritte|ablauf|chronologisch|folge|vor.*nach)\b", re.I)
CASE_CUES = re.compile(r"\b(patient|patientin|bewohner|bewohnerin|person|klient|klientin|situation|fall|symptom|befund|beobacht|beschwerd|vital|wunde|schmerz|pflegekraft)\b", re.I)
ALL_NONE = re.compile(r"^(?:alle|keine)\s+(?:der|die|diese|genannten|antworten|aussagen)", re.I)
COUNT_WORDS = {
    "eine": 1, "einen": 1, "einer": 1, "ein": 1,
    "zwei": 2, "drei": 3, "vier": 4, "fünf": 5, "sechs": 6, "sieben": 7, "acht": 8,
}

SEVERITY_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "review": 0}
CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def compact_space(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def normalize(text: Any) -> str:
    value = compact_space(text).lower().replace("ß", "ss")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace("–", "-").replace("—", "-")
    value = re.sub(r"[^a-z0-9äöü+/%<>\-. ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def tokens(text: Any) -> set[str]:
    value = normalize(text)
    out = set()
    for token in re.findall(r"[a-z0-9äöü]+", value):
        if len(token) < 3 or token in STOPWORDS or token.isdigit():
            continue
        # Tiny German suffix normalization; conservative enough for overlap checks.
        stem = token
        for suffix in ("ungen", "ung", "ischen", "ische", "ischer", "isches", "ern", "en", "er", "es", "e", "n"):
            if len(stem) >= len(suffix) + 5 and stem.endswith(suffix):
                stem = stem[: -len(suffix)]
                break
        out.add(stem)
    return out


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def containment(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def recursive_text(value: Any, *, skip_keys: set[str] | None = None) -> str:
    skip_keys = skip_keys or set()
    parts: list[str] = []
    if isinstance(value, str):
        parts.append(value)
    elif isinstance(value, list):
        for item in value:
            parts.append(recursive_text(item, skip_keys=skip_keys))
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in skip_keys or key.lower().endswith("id") or key.lower().endswith("ids"):
                continue
            parts.append(recursive_text(item, skip_keys=skip_keys))
    return compact_space(" ".join(parts))


def correct_option_texts(question: dict[str, Any]) -> list[str]:
    ids = {str(x) for x in question.get("correct", [])}
    return [compact_space(o.get("text")) for o in question.get("options", []) if str(o.get("id")) in ids]


def wrong_option_texts(question: dict[str, Any]) -> list[str]:
    ids = {str(x) for x in question.get("correct", [])}
    return [compact_space(o.get("text")) for o in question.get("options", []) if str(o.get("id")) not in ids]


def question_semantic_text(question: dict[str, Any]) -> str:
    return compact_space(" ".join([
        question.get("prompt", ""),
        " ".join(correct_option_texts(question)),
        question.get("explanation", ""),
        question.get("modelAnswer", ""),
        question.get("answer", "") if isinstance(question.get("answer"), str) else "",
    ]))


def expected_free_response_text(question: dict[str, Any]) -> str:
    for key in ("modelAnswer", "sampleAnswer", "expectedAnswer", "answer", "explanation"):
        value = question.get(key)
        if isinstance(value, str) and compact_space(value):
            return compact_space(value)
    correct = question.get("correct")
    if isinstance(correct, str):
        return compact_space(correct)
    if isinstance(correct, list):
        string_values = [compact_space(x) for x in correct if isinstance(x, str)]
        if string_values:
            return " ".join(string_values)
    return ""


@dataclass(frozen=True)
class Interval:
    low: float
    high: float
    low_open: bool = False
    high_open: bool = False

    def intersects(self, other: "Interval") -> bool:
        lo = max(self.low, other.low)
        hi = min(self.high, other.high)
        if lo < hi:
            return True
        if lo > hi:
            return False
        # Single touching boundary: only intersects when both include it.
        self_in = not ((lo == self.low and self.low_open) or (lo == self.high and self.high_open))
        other_in = not ((lo == other.low and other.low_open) or (lo == other.high and other.high_open))
        return self_in and other_in

    def contains(self, other: "Interval") -> bool:
        left = self.low < other.low or (self.low == other.low and (not self.low_open or other.low_open))
        right = self.high > other.high or (self.high == other.high and (not self.high_open or other.high_open))
        return left and right


def parse_numeric_interval(text: str) -> Interval | None:
    value = normalize(text).replace(",", ".")
    nums = [float(x) for x in re.findall(r"(?<![a-z])(-?\d+(?:\.\d+)?)", value)]
    if not nums:
        return None
    if re.search(r"\b(unter|weniger als|kleiner als)\b|<", value) and len(nums) >= 1:
        return Interval(-math.inf, nums[0], high_open=True)
    if re.search(r"\b(uber|mehr als|grosser als)\b|>", value) and len(nums) >= 1:
        return Interval(nums[0], math.inf, low_open=True)
    if re.search(r"\b(mindestens|ab)\b|>=", value) and len(nums) >= 1:
        return Interval(nums[0], math.inf)
    if re.search(r"\b(hochstens|maximal|bis zu)\b|<=", value) and len(nums) >= 1:
        return Interval(-math.inf, nums[0])
    if len(nums) >= 2 and ("-" in value or re.search(r"\b(bis|zwischen)\b", value)):
        lo, hi = sorted(nums[:2])
        return Interval(lo, hi)
    if len(nums) == 1 and len(value.split()) <= 5:
        return Interval(nums[0], nums[0])
    return None


def explicit_count_from_prompt(prompt: str) -> int | None:
    value = normalize(prompt)
    for word, count in COUNT_WORDS.items():
        if re.search(rf"\b{re.escape(normalize(word))}\b", value):
            # Only treat the word as an expected answer count near factor/item nouns.
            if re.search(rf"\b{re.escape(normalize(word))}\b\s+(?:faktoren|punkte|zeichen|regeln|grunde|ursachen|massnahmen|angaben|schritte|merkmale|bestandteile|aspekte)", value):
                return count
    m = re.search(r"\b(\d+)\s+(?:faktoren|punkte|zeichen|regeln|grunde|ursachen|massnahmen|angaben|schritte|merkmale|bestandteile|aspekte)\b", value)
    return int(m.group(1)) if m else None


def add_issue(registry: dict[str, dict[str, Any]], q: dict[str, Any], code: str, *, severity: str,
              confidence: str, rationale: str, evidence: dict[str, Any] | None = None,
              related_ids: Iterable[str] = ()) -> None:
    qid = q.get("id", "unknown")
    entry = registry.setdefault(qid, {
        "questionId": qid,
        "type": q.get("type"),
        "difficulty": q.get("difficulty"),
        "conceptIds": q.get("conceptIds", []),
        "prompt": q.get("prompt", ""),
        "correctTexts": correct_option_texts(q),
        "explanation": q.get("explanation", ""),
        "issues": [],
    })
    if any(issue["code"] == code and issue.get("relatedQuestionIds", []) == list(related_ids) for issue in entry["issues"]):
        return
    entry["issues"].append({
        "code": code,
        "severity": severity,
        "confidence": confidence,
        "rationale": rationale,
        "evidence": evidence or {},
        "relatedQuestionIds": list(related_ids),
    })


def build_source_text_by_concept(concepts: list[dict[str, Any]], cards: list[dict[str, Any]]) -> tuple[dict[str, str], set[str]]:
    concept_by_id = {str(c.get("id")): c for c in concepts if c.get("id")}
    card_texts: dict[str, list[str]] = defaultdict(list)
    for card in cards:
        cid = card.get("conceptId")
        if cid:
            card_texts[str(cid)].append(recursive_text(card, skip_keys={"certification", "status", "source"}))
    result = {}
    for cid, concept in concept_by_id.items():
        result[cid] = compact_space(" ".join([
            recursive_text(concept, skip_keys={"certification", "status", "source"}),
            " ".join(card_texts.get(cid, [])),
        ]))
    return result, set(concept_by_id)


def semantic_audit(questions: list[dict[str, Any]], concepts: list[dict[str, Any]], cards: list[dict[str, Any]]) -> dict[str, Any]:
    registry: dict[str, dict[str, Any]] = {}
    source_text_by_concept, known_concepts = build_source_text_by_concept(concepts, cards)

    # Per-question checks.
    for q in questions:
        qid = str(q.get("id", ""))
        qtype = q.get("type")
        prompt = compact_space(q.get("prompt"))
        explanation = compact_space(q.get("explanation"))
        options = q.get("options") if isinstance(q.get("options"), list) else []
        correct = [str(x) for x in q.get("correct", [])] if isinstance(q.get("correct"), list) else []
        option_by_id = {str(o.get("id")): o for o in options if o.get("id") is not None}

        unknown = [cid for cid in q.get("conceptIds", []) if str(cid) not in known_concepts]
        if unknown:
            add_issue(registry, q, "UNKNOWN_CONCEPT_ANCHOR", severity="critical", confidence="high",
                      rationale="Question references concept IDs that are absent from concepts.json.",
                      evidence={"unknownConceptIds": unknown})

        if qtype == "single_choice":
            if len(correct) != 1 or correct[0] not in option_by_id:
                add_issue(registry, q, "INVALID_SINGLE_CHOICE_KEY", severity="critical", confidence="high",
                          rationale="Single-choice item does not resolve to exactly one valid option.",
                          evidence={"correct": correct, "optionIds": list(option_by_id)})
            elif len(options) >= 2:
                correct_id = correct[0]
                correct_text = compact_space(option_by_id[correct_id].get("text"))
                correct_tokens = tokens(correct_text)
                correct_interval = parse_numeric_interval(correct_text)
                correct_neg = bool(NEGATIONS.search(correct_text))
                for option in options:
                    oid = str(option.get("id"))
                    if oid == correct_id:
                        continue
                    wrong_text = compact_space(option.get("text"))
                    wrong_tokens = tokens(wrong_text)
                    wrong_interval = parse_numeric_interval(wrong_text)
                    wrong_neg = bool(NEGATIONS.search(wrong_text))
                    sim = jaccard(correct_tokens, wrong_tokens)
                    contain = containment(correct_tokens, wrong_tokens)
                    if correct_interval and wrong_interval and correct_interval.intersects(wrong_interval):
                        # Threshold/category questions with overlapping intervals admit more than one numerically true option.
                        add_issue(registry, q, "NUMERIC_ANSWER_OVERLAP", severity="high", confidence="high",
                                  rationale="A distractor numerically overlaps the keyed answer, so both choices can be true for some values.",
                                  evidence={"correct": correct_text, "distractor": wrong_text, "distractorId": oid})
                    elif sim >= 0.80 and correct_neg == wrong_neg:
                        add_issue(registry, q, "NEAR_EQUIVALENT_ANSWER_OPTIONS", severity="high", confidence="high",
                                  rationale="Keyed answer and distractor are semantically near-equivalent by lexical content.",
                                  evidence={"correct": correct_text, "distractor": wrong_text, "jaccard": round(sim, 3)})
                    elif contain >= 0.92 and min(len(correct_tokens), len(wrong_tokens)) >= 2 and correct_neg == wrong_neg:
                        add_issue(registry, q, "ANSWER_OPTION_SUBSUMPTION", severity="medium", confidence="medium",
                                  rationale="One answer option largely subsumes another without a negation distinction, creating possible ambiguity.",
                                  evidence={"correct": correct_text, "distractor": wrong_text, "containment": round(contain, 3)})

        if qtype == "multiple_choice":
            valid_correct = [cid for cid in correct if cid in option_by_id]
            if not valid_correct:
                add_issue(registry, q, "INVALID_MULTIPLE_CHOICE_KEY", severity="critical", confidence="high",
                          rationale="Multiple-choice item has no valid keyed answer.", evidence={"correct": correct})
            if options and len(valid_correct) == len(options):
                add_issue(registry, q, "MULTIPLE_CHOICE_ALL_OPTIONS_CORRECT", severity="critical", confidence="high",
                          rationale="Every displayed option is keyed correct, so the item contains no distractor and does not discriminate knowledge.",
                          evidence={"optionCount": len(options), "correctCount": len(valid_correct)})
            expected_count = explicit_count_from_prompt(prompt)
            if expected_count is not None and len(valid_correct) != expected_count:
                add_issue(registry, q, "PROMPT_ANSWER_COUNT_MISMATCH", severity="high", confidence="high",
                          rationale="Prompt explicitly requests a fixed number of answers that does not match the answer key.",
                          evidence={"expectedCount": expected_count, "correctCount": len(valid_correct)})

        # Explanation consistency checks.
        if options and correct:
            expected_count = explicit_count_from_prompt(explanation)
            if expected_count is not None and expected_count != len([cid for cid in correct if cid in option_by_id]):
                add_issue(registry, q, "EXPLANATION_ANSWER_COUNT_MISMATCH", severity="high", confidence="high",
                          rationale="Explanation states a fixed count inconsistent with the keyed answers.",
                          evidence={"explanationCount": expected_count, "correctCount": len(correct)})

        if qtype in {"short_answer", "clinical_case"}:
            model = expected_free_response_text(q)
            if not model:
                add_issue(registry, q, "FREE_RESPONSE_WITHOUT_REFERENCE_ANSWER", severity="critical", confidence="high",
                          rationale="Free-response item has no detectable model/reference answer for learner self-check.")
            if len(prompt) < 42 or GENERIC_FREE_RESPONSE.match(prompt):
                add_issue(registry, q, "UNDER_SPECIFIED_FREE_RESPONSE_PROMPT", severity="review", confidence="medium",
                          rationale="Free-response prompt is very short/generic and may permit multiple reasonable interpretations.",
                          evidence={"promptLength": len(prompt)})
            if qtype == "clinical_case" and len(prompt) < 100 and not CASE_CUES.search(prompt):
                add_issue(registry, q, "CLINICAL_CASE_WITHOUT_CASE_CONTEXT", severity="medium", confidence="medium",
                          rationale="Clinical-case item lacks clear patient/situation context and may function as ordinary recall rather than application.",
                          evidence={"promptLength": len(prompt)})
            if model and len(model) > 220 and len(prompt) < 90:
                add_issue(registry, q, "BROAD_REFERENCE_ANSWER_TO_NARROW_PROMPT", severity="review", confidence="low",
                          rationale="Reference answer is much broader than the prompt, suggesting possible under-specification.",
                          evidence={"promptLength": len(prompt), "referenceAnswerLength": len(model)})

        if qtype == "ordering":
            combined = f"{prompt} {explanation}"
            if not SEQUENCE_CUES.search(combined):
                add_issue(registry, q, "ORDERING_WITHOUT_SEQUENCE_JUSTIFICATION", severity="review", confidence="medium",
                          rationale="Ordering item does not contain an explicit sequence/process cue in prompt or explanation.")

        # Source-anchor lexical sanity check. This is only a review candidate, never a confirmed error.
        source_text = " ".join(source_text_by_concept.get(str(cid), "") for cid in q.get("conceptIds", []))
        source_tokens = tokens(source_text)
        q_tokens = tokens(question_semantic_text(q))
        if len(source_tokens) >= 5 and len(q_tokens) >= 3:
            overlap = q_tokens & source_tokens
            if not overlap:
                add_issue(registry, q, "SOURCE_ANCHOR_ZERO_LEXICAL_OVERLAP", severity="review", confidence="low",
                          rationale="Question/answer wording shares no meaningful lexical token with its concept/card anchor; manual source-alignment review recommended.",
                          evidence={"questionTokenCount": len(q_tokens), "sourceTokenCount": len(source_tokens)})

        if qtype in {"single_choice", "multiple_choice"} and options:
            correct_texts = correct_option_texts(q)
            wrong_texts = wrong_option_texts(q)
            if wrong_texts and sum(bool(ABSOLUTES.search(x)) for x in wrong_texts) >= math.ceil(len(wrong_texts) / 2):
                add_issue(registry, q, "DISTRACTOR_ABSOLUTE_WORDING_CLUSTER", severity="review", confidence="medium",
                          rationale="Most distractors use absolute wording, which may make them rejectable without domain knowledge.",
                          evidence={"absoluteDistractors": [x for x in wrong_texts if ABSOLUTES.search(x)]})
            if any(ALL_NONE.search(x) for x in [*correct_texts, *wrong_texts]):
                add_issue(registry, q, "ALL_NONE_OPTION_PATTERN", severity="review", confidence="medium",
                          rationale="All/none-style answer option can create test-wise cues and should receive editorial review.")

    # Exact and near-duplicate semantic checks.
    by_prompt: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for q in questions:
        key = normalize(q.get("prompt", ""))
        if key:
            by_prompt[key].append(q)
    for group in by_prompt.values():
        if len(group) <= 1:
            continue
        ids = [str(q.get("id")) for q in group]
        for q in group:
            add_issue(registry, q, "EXACT_PROMPT_DUPLICATE", severity="medium", confidence="high",
                      rationale="Another question has the exact same normalized prompt.", related_ids=[x for x in ids if x != str(q.get("id"))])

    # O(n^2) is fine for 1,299 questions; restrict comparisons aggressively to avoid noisy false positives.
    token_cache = {str(q.get("id")): tokens(q.get("prompt", "")) for q in questions}
    for i, a in enumerate(questions):
        aid = str(a.get("id"))
        at = token_cache[aid]
        if len(at) < 4:
            continue
        aconcepts = set(map(str, a.get("conceptIds", [])))
        for b in questions[i + 1:]:
            if a.get("type") != b.get("type"):
                continue
            bconcepts = set(map(str, b.get("conceptIds", [])))
            if not (aconcepts & bconcepts):
                continue
            bid = str(b.get("id"))
            bt = token_cache[bid]
            if len(bt) < 4:
                continue
            sim = jaccard(at, bt)
            if sim >= 0.86 and normalize(a.get("prompt")) != normalize(b.get("prompt")):
                add_issue(registry, a, "NEAR_DUPLICATE_PROMPT", severity="review", confidence="medium",
                          rationale="Prompt is highly similar to another question anchored to the same concept.",
                          evidence={"jaccard": round(sim, 3)}, related_ids=[bid])
                add_issue(registry, b, "NEAR_DUPLICATE_PROMPT", severity="review", confidence="medium",
                          rationale="Prompt is highly similar to another question anchored to the same concept.",
                          evidence={"jaccard": round(sim, 3)}, related_ids=[aid])

    # Sort issue lists by severity/confidence and compute entry-level disposition.
    for entry in registry.values():
        entry["issues"].sort(key=lambda x: (-SEVERITY_RANK[x["severity"]], -CONFIDENCE_RANK[x["confidence"]], x["code"]))
        top = entry["issues"][0]
        entry["highestSeverity"] = top["severity"]
        entry["highestConfidence"] = top["confidence"]
        entry["disposition"] = "confirmed-defect" if (
            SEVERITY_RANK[top["severity"]] >= SEVERITY_RANK["high"] and top["confidence"] == "high"
        ) else "manual-review"

    ordered = sorted(registry.values(), key=lambda e: (
        -SEVERITY_RANK[e["highestSeverity"]],
        0 if e["disposition"] == "confirmed-defect" else 1,
        str(e["questionId"]),
    ))

    issue_counts = Counter()
    severity_counts = Counter()
    disposition_counts = Counter()
    type_counts = Counter()
    for entry in ordered:
        severity_counts[entry["highestSeverity"]] += 1
        disposition_counts[entry["disposition"]] += 1
        type_counts[entry.get("type")] += 1
        for issue in entry["issues"]:
            issue_counts[issue["code"]] += 1

    confirmed = [e for e in ordered if e["disposition"] == "confirmed-defect"]
    return {
        "schemaVersion": 1,
        "phase": "P26A",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "questionCount": len(questions),
            "conceptCount": len(concepts),
            "cardCount": len(cards),
            "questionBankMutated": False,
        },
        "summary": {
            "flaggedQuestions": len(ordered),
            "confirmedDefects": len(confirmed),
            "manualReviewCandidates": len(ordered) - len(confirmed),
            "highestSeverityCounts": dict(sorted(severity_counts.items())),
            "dispositionCounts": dict(sorted(disposition_counts.items())),
            "flaggedTypeCounts": dict(sorted(type_counts.items(), key=lambda x: str(x[0]))),
            "issueCodeCounts": dict(issue_counts.most_common()),
        },
        "confirmedDefectIds": [e["questionId"] for e in confirmed],
        "registry": ordered,
    }


def write_markdown(report: dict[str, Any], path: Path) -> None:
    summary = report["summary"]
    confirmed = [e for e in report["registry"] if e["disposition"] == "confirmed-defect"]
    review = [e for e in report["registry"] if e["disposition"] == "manual-review"]
    lines = [
        "# P26A — Semantic Defect Detection",
        "",
        "> Detection only. `data/questions.json` is intentionally unchanged in P26A.",
        "",
        f"- Questions scanned: **{report['scope']['questionCount']}**",
        f"- Confirmed semantic defects: **{summary['confirmedDefects']}**",
        f"- Manual-review candidates: **{summary['manualReviewCandidates']}**",
        f"- Total flagged questions: **{summary['flaggedQuestions']}**",
        "",
        "## Confirmed defects",
        "",
    ]
    if not confirmed:
        lines.append("No high-confidence semantic defects detected.")
    else:
        lines.append("| Question | Type | Severity | Codes | Prompt |")
        lines.append("|---|---|---|---|---|")
        for entry in confirmed:
            codes = ", ".join(issue["code"] for issue in entry["issues"] if issue["severity"] in {"critical", "high"} and issue["confidence"] == "high")
            prompt = compact_space(entry["prompt"]).replace("|", "\\|")
            if len(prompt) > 110:
                prompt = prompt[:107] + "…"
            lines.append(f"| `{entry['questionId']}` | {entry['type']} | {entry['highestSeverity']} | {codes} | {prompt} |")
    lines += ["", "## Issue counts", ""]
    for code, count in summary["issueCodeCounts"].items():
        lines.append(f"- `{code}`: {count}")
    lines += [
        "",
        "## Review policy",
        "",
        "- **confirmed-defect** requires a high-confidence `high` or `critical` finding.",
        "- **manual-review** means the detector found a plausible semantic/editorial risk but not enough evidence to auto-classify it as wrong.",
        "- P26A does not change answers, prompts, explanations, difficulty, FSRS, mastery, remediation, or exam scoring.",
        "",
        f"Manual-review entries are fully enumerated in `P26A_SEMANTIC_DEFECT_REGISTRY.json` ({len(review)} candidates).",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write registry + markdown into reports/")
    parser.add_argument("--json", action="store_true", help="print full report JSON")
    args = parser.parse_args()

    questions = load_json(DATA / "questions.json")
    concepts = load_json(DATA / "concepts.json")
    cards = load_json(DATA / "cards.json")
    report = semantic_audit(questions, concepts, cards)

    if args.write:
        REPORTS.mkdir(exist_ok=True)
        json_path = REPORTS / "P26A_SEMANTIC_DEFECT_REGISTRY.json"
        md_path = REPORTS / "P26A_SEMANTIC_DEFECT_REPORT.md"
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_markdown(report, md_path)
        print(f"wrote {json_path.relative_to(ROOT)}")
        print(f"wrote {md_path.relative_to(ROOT)}")

    print(json.dumps({
        "phase": report["phase"],
        "scope": report["scope"],
        "summary": report["summary"],
        "confirmedDefectIds": report["confirmedDefectIds"],
    }, ensure_ascii=False, indent=2))
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
