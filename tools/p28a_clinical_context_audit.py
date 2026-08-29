#!/usr/bin/env python3
"""P28A — Clinical & Contextual Question Validity Audit.

Detection only. This audit does not mutate data/questions.json and does not
attempt to modernize the 2015 textbook source. It adversarially evaluates all
1,299 questions for question-type fit, contextual sufficiency, answer-key
uniqueness, multiply-defensible answer risk, source support, and rubric breadth.

The audit intentionally prefers false-positive manual review over silently
certifying a potentially misleading nursing question.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REPORTS = ROOT / "reports"
QUESTIONS = DATA / "questions.json"
FROZEN_SHA256 = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"
REPORT_JSON = REPORTS / "P28A_CLINICAL_CONTEXT_VALIDITY_AUDIT.json"
REPORT_MD = REPORTS / "P28A_CLINICAL_CONTEXT_VALIDITY_AUDIT.md"

QUESTION_TYPES = {
    "single_choice", "multiple_choice", "ordering", "matching", "short_answer", "clinical_case"
}
OBJECTIVE_TYPES = {"single_choice", "multiple_choice", "ordering", "matching"}

STOPWORDS = {
    "aber", "als", "am", "an", "auch", "auf", "aus", "bei", "beim", "bis", "da", "das", "dass",
    "dem", "den", "der", "des", "die", "dies", "diese", "diesem", "diesen", "dieser", "dieses",
    "durch", "ein", "eine", "einem", "einen", "einer", "eines", "er", "es", "für", "hat", "haben",
    "im", "in", "ist", "laut", "mit", "nach", "nicht", "oder", "sich", "sie", "sind", "so", "soll",
    "sollen", "über", "um", "und", "unter", "vom", "von", "vor", "was", "welche", "welcher", "welches",
    "welchen", "wie", "wird", "werden", "zu", "zum", "zur", "genannt", "nennt", "entspricht",
    "aussage", "aussagen", "folgende", "folgenden", "folgendes", "richtig", "korrekt", "antwort",
    "antworten", "pflege", "pflegekraft", "pflegeperson", "lehrbuch", "icare", "care",
}

GENERIC_PROMPT = re.compile(
    r"^(?:was|welche|welcher|wie|warum|wodurch)\s+(?:ist|sind|soll|sollen|wird|werden|kann|können|gehört|gehören)\b",
    re.I,
)
PLURAL_ASK = re.compile(
    r"\b(welche\s+(?:maßnahmen|aussagen|faktoren|ursachen|zeichen|symptome|regeln|aufgaben|ziele|risiken|folgen|prinzipien)|"
    r"nennen\s+sie|nenne\s+|beschreiben\s+sie|beschreibe\s+|mehrere|zutreffenden\s+aussagen)\b",
    re.I,
)
SINGLE_SCOPE = re.compile(r"\b(eine\s+(?:aussage|maßnahme|ursache|folge|aufgabe|regel)|am\s+ehesten|am\s+besten|primär|zuerst|erste[rnms]?|hauptsächlich|typischste)\b", re.I)
PRIORITY_CUES = re.compile(r"\b(am\s+ehesten|am\s+besten|zuerst|zunächst|priorität|vorrangig|primär|erste\s+maßnahme|unmittelbar)\b", re.I)
ACTION_CUES = re.compile(
    r"\b(maßnahme|maßnahmen|intervention|interventionen|pflegehandlung|pflegehandlungen|vorgehen|reagier|durchführ|"
    r"lager|mobilis|verabreich|anwenden|behandl|beobacht|kontroll|prophylax|unterstütz|berat|informier|"
    r"geeignet|indiziert|kontraindiziert|angemessen|sinnvoll|notwendig|vermeiden|darf|sollte|sollen)\b",
    re.I,
)
CASE_CUES = re.compile(
    r"\b(patient|patientin|bewohner|bewohnerin|klient|klientin|person|kind|säugling|ältere|älterer|"
    r"diagnose|symptom|befund|schmerz|wunde|blutdruck|puls|temperatur|spo2|sauerstoff|sturz|"
    r"postoperativ|präoperativ|nach\s+der|vor\s+der|seit|plötzlich|akut|chronisch|aufnahme|station|situation|fall)\b",
    re.I,
)
CONTEXT_DIMENSIONS = {
    "person": re.compile(r"\b(patient|patientin|bewohner|bewohnerin|klient|klientin|person|kind|säugling|mann|frau)\b", re.I),
    "condition": re.compile(r"\b(diagnose|symptom|befund|schmerz|wunde|fieber|dyspnoe|blutung|sturz|infektion|erkrank|zustand)\b", re.I),
    "timing": re.compile(r"\b(seit|vor|nach|postoperativ|präoperativ|plötzlich|akut|chronisch|heute|stunden|tage|woche|zeitpunkt)\b", re.I),
    "measurement": re.compile(r"\b(\d+(?:[.,]\d+)?\s*(?:mmhg|%|°c|c|mg|g|ml|l|kg|cm|mm|min|sek|bpm)|blutdruck|puls|temperatur|spo2|sättigung)\b", re.I),
    "goal": re.compile(r"\b(ziel|um\s+zu|damit|prophylaxe|vermeiden|fördern|reduzieren|erhalten|verbessern)\b", re.I),
    "setting": re.compile(r"\b(station|pflegeheim|ambulant|häuslich|krankenhaus|intensiv|aufnahme|entlassung|notfall)\b", re.I),
}
CURRENTNESS_CUES = re.compile(
    r"\b(hygiene|desinfektion|isolation|schutzkleidung|medikament|arzneimittel|dosierung|insulin|antibiot|"
    r"reanimation|cpr|druckgeschwür|dekubitus|wund|katheter|sonde|infusion|transfusion|recht|gesetz|"
    r"fixierung|sturzprophylaxe|thromboseprophylaxe|ernährung|diabetes|sauerstoff|impfung)\b",
    re.I,
)
NEGATION = re.compile(r"\b(nicht|kein|keine|keinen|keiner|ohne|nie|niemals|verboten|falsch)\b", re.I)
ABSOLUTE = re.compile(r"\b(immer|nie|niemals|ausschließlich|zwingend|grundsätzlich|in\s+jedem\s+fall|unter\s+keinen\s+umständen)\b", re.I)
COMBINATION_OPTION = re.compile(r"\b(?:und|sowie|beide|alle\s+(?:genannten|antworten|aussagen))\b", re.I)
ORDER_CUES = re.compile(r"\b(reihenfolge|zuerst|zunächst|danach|anschließend|schritte|ablauf|chronologisch|vor.+nach)\b", re.I)

RISK_RANK = {"critical": 4, "high": 3, "medium": 2, "review": 1, "clear": 0}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize(value: Any) -> str:
    text = compact(value).lower().replace("ß", "ss")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"[^a-z0-9äöü+/%<>\-. ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(value: Any) -> set[str]:
    out: set[str] = set()
    for token in re.findall(r"[a-z0-9äöü]+", normalize(value)):
        if len(token) < 3 or token in STOPWORDS or token.isdigit():
            continue
        stem = token
        for suffix in ("ungen", "ischen", "ische", "ischer", "isches", "ung", "keiten", "keit", "ern", "en", "er", "es", "e", "n"):
            if len(stem) >= len(suffix) + 5 and stem.endswith(suffix):
                stem = stem[: -len(suffix)]
                break
        out.add(stem)
    return out


def recursive_strings(value: Any, *, skip: set[str] | None = None) -> list[str]:
    skip = skip or set()
    out: list[str] = []
    if isinstance(value, str):
        if compact(value):
            out.append(compact(value))
    elif isinstance(value, list):
        for item in value:
            out.extend(recursive_strings(item, skip=skip))
    elif isinstance(value, dict):
        for key, item in value.items():
            k = str(key)
            if k in skip or k.lower().endswith("id") or k.lower().endswith("ids"):
                continue
            out.extend(recursive_strings(item, skip=skip))
    return out


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def coverage(needles: set[str], haystack: set[str]) -> float:
    if not needles:
        return 0.0
    return len(needles & haystack) / len(needles)


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
        self_in = not ((lo == self.low and self.low_open) or (lo == self.high and self.high_open))
        other_in = not ((lo == other.low and other.low_open) or (lo == other.high and other.high_open))
        return self_in and other_in


def parse_interval(value: str) -> Interval | None:
    text = normalize(value).replace(",", ".")
    nums = [float(x) for x in re.findall(r"(?<![a-z])(-?\d+(?:\.\d+)?)", text)]
    if not nums:
        return None
    if re.search(r"\b(unter|weniger als|kleiner als)\b|<", text):
        return Interval(-math.inf, nums[0], high_open=True)
    if re.search(r"\b(uber|mehr als|grosser als)\b|>", text):
        return Interval(nums[0], math.inf, low_open=True)
    if re.search(r"\b(mindestens|ab)\b|>=", text):
        return Interval(nums[0], math.inf)
    if re.search(r"\b(hochstens|maximal|bis zu)\b|<=", text):
        return Interval(-math.inf, nums[0])
    if len(nums) >= 2 and ("-" in text or re.search(r"\b(bis|zwischen)\b", text)):
        lo, hi = sorted(nums[:2])
        return Interval(lo, hi)
    if len(nums) == 1 and len(text.split()) <= 7:
        return Interval(nums[0], nums[0])
    return None


def model_answer(q: dict[str, Any]) -> str:
    for key in ("modelAnswer", "sampleAnswer", "expectedAnswer", "correctText", "answer", "explanation"):
        value = q.get(key)
        if isinstance(value, str) and compact(value):
            return compact(value)
    correct = q.get("correct")
    if isinstance(correct, str):
        return compact(correct)
    return ""


def option_texts(q: dict[str, Any]) -> dict[str, str]:
    return {str(o.get("id")): compact(o.get("text")) for o in q.get("options", []) if o.get("id") is not None}


def evidence_fragments(concepts: list[dict[str, Any]], cards: list[dict[str, Any]]) -> dict[str, list[str]]:
    by_concept: dict[str, list[str]] = defaultdict(list)
    for concept in concepts:
        cid = str(concept.get("id", ""))
        if not cid:
            continue
        strings = recursive_strings(concept, skip={"source", "certification", "status"})
        if strings:
            by_concept[cid].append(" ".join(strings))
    for card in cards:
        ids = list(card.get("conceptIds") or [])
        if card.get("conceptId"):
            ids.append(card.get("conceptId"))
        strings = recursive_strings(card, skip={"source", "certification", "status"})
        if not strings:
            continue
        fragment = " ".join(strings)
        for cid in dict.fromkeys(str(x) for x in ids if x):
            by_concept[cid].append(fragment)
    return by_concept


def relation_support(prompt: str, option: str, fragments: Iterable[str]) -> dict[str, Any]:
    pt = tokens(prompt)
    ot = tokens(option)
    best = {"score": 0.0, "optionCoverage": 0.0, "promptCoverage": 0.0, "exactOption": False, "fragment": ""}
    nopt = normalize(option)
    for frag in fragments:
        ft = tokens(frag)
        oc = coverage(ot, ft) if ot else 0.0
        pc = coverage(pt, ft) if pt else 0.0
        exact = bool(nopt and len(nopt) >= 4 and nopt in normalize(frag))
        if not ot and exact:
            oc = 1.0
        score = oc * 0.7 + pc * 0.3
        if exact:
            score = max(score, 0.78 + 0.22 * pc)
        if score > best["score"]:
            best = {
                "score": round(score, 3),
                "optionCoverage": round(oc, 3),
                "promptCoverage": round(pc, 3),
                "exactOption": exact,
                "fragment": compact(frag)[:220],
            }
    return best


def context_dimensions(prompt: str) -> list[str]:
    return [name for name, pattern in CONTEXT_DIMENSIONS.items() if pattern.search(prompt)]


def infer_epistemic_class(q: dict[str, Any]) -> str:
    qtype = q.get("type")
    prompt = compact(q.get("prompt"))
    if qtype == "clinical_case":
        return "clinical-judgment"
    if qtype == "short_answer":
        return "open-recall"
    if qtype == "ordering" or ORDER_CUES.search(prompt):
        return "sequence"
    if qtype == "matching":
        return "association"
    if PRIORITY_CUES.search(prompt):
        return "best-or-priority-choice"
    if ACTION_CUES.search(prompt):
        return "context-sensitive-action"
    if PLURAL_ASK.search(prompt):
        return "multi-fact-set"
    if re.search(r"\b(wert|bereich|grenze|normal|normwert|prozent|mmhg|mg|ml|temperatur|puls)\b", prompt, re.I):
        return "numeric-or-threshold-fact"
    return "discrete-fact"


def add_issue(issues: list[dict[str, Any]], code: str, risk: str, rationale: str, evidence: dict[str, Any] | None = None) -> None:
    if any(x["code"] == code for x in issues):
        return
    issues.append({"code": code, "risk": risk, "rationale": rationale, "evidence": evidence or {}})


def option_overlap_checks(q: dict[str, Any], issues: list[dict[str, Any]]) -> None:
    opts = list(option_texts(q).items())
    for i, (aid, atext) in enumerate(opts):
        at = tokens(atext)
        ai = parse_interval(atext)
        for bid, btext in opts[i + 1:]:
            bt = tokens(btext)
            bi = parse_interval(btext)
            if ai and bi and ai.intersects(bi) and normalize(atext) != normalize(btext):
                add_issue(
                    issues, "OVERLAPPING_NUMERIC_OPTIONS", "critical",
                    "Two displayed numeric/range options overlap, so more than one option can be true for the same value.",
                    {"optionA": aid, "textA": atext, "optionB": bid, "textB": btext},
                )
            if at and bt:
                contain = max(coverage(at, bt), coverage(bt, at))
                sim = jaccard(at, bt)
                opposite = bool(NEGATION.search(atext)) != bool(NEGATION.search(btext))
                if not opposite and contain >= 0.82 and min(len(at), len(bt)) >= 2:
                    add_issue(
                        issues, "NON_MUTUALLY_EXCLUSIVE_OPTIONS", "high",
                        "Two answer options substantially overlap semantically and may not be mutually exclusive.",
                        {"optionA": aid, "textA": atext, "optionB": bid, "textB": btext, "containment": round(contain, 3), "jaccard": round(sim, 3)},
                    )
            na, nb = normalize(atext), normalize(btext)
            if na and nb and na != nb and (na in nb or nb in na) and min(len(na), len(nb)) >= 8:
                add_issue(
                    issues, "OPTION_SUBSUMPTION", "high",
                    "One option text is substantially contained in another, which can make both defensible under the same prompt.",
                    {"optionA": aid, "textA": atext, "optionB": bid, "textB": btext},
                )


def audit_question(q: dict[str, Any], source_fragments: dict[str, list[str]]) -> dict[str, Any]:
    qid = str(q.get("id", ""))
    qtype = str(q.get("type", ""))
    prompt = compact(q.get("prompt"))
    explanation = compact(q.get("explanation"))
    issues: list[dict[str, Any]] = []
    epistemic = infer_epistemic_class(q)
    dimensions = context_dimensions(prompt)
    options = option_texts(q)
    correct = [str(x) for x in (q.get("correct") or [])] if isinstance(q.get("correct"), list) else []

    if qtype not in QUESTION_TYPES:
        add_issue(issues, "UNSUPPORTED_QUESTION_TYPE", "critical", "Question type is not supported by the certified runtime.", {"type": qtype})
    if not prompt:
        add_issue(issues, "MISSING_PROMPT", "critical", "Question has no prompt.")

    fragments: list[str] = []
    for cid in q.get("conceptIds", []) or []:
        fragments.extend(source_fragments.get(str(cid), []))

    support: dict[str, dict[str, Any]] = {
        oid: relation_support(prompt, text, fragments) for oid, text in options.items()
    }

    if qtype == "single_choice":
        if len(correct) != 1 or correct[0] not in options:
            add_issue(issues, "INVALID_SINGLE_CHOICE_KEY", "critical", "Single-choice must resolve to exactly one displayed keyed answer.", {"correct": correct})
        if PLURAL_ASK.search(prompt) and not SINGLE_SCOPE.search(prompt):
            add_issue(
                issues, "SINGLE_CHOICE_FOR_PLURAL_KNOWLEDGE", "critical",
                "The prompt asks for plural/multiple knowledge but the item permits exactly one answer.",
            )
        if ACTION_CUES.search(prompt) and len(dimensions) < 2 and not re.search(r"\b(definition|begriff|bedeutet|kennzeichen|ziel)\b", prompt, re.I):
            add_issue(
                issues, "CONTEXT_DEPENDENT_SINGLE_CHOICE", "high",
                "A care action/intervention is forced into one answer without enough explicit patient/situation context to establish uniqueness.",
                {"contextDimensions": dimensions, "promptLength": len(prompt)},
            )
        if PRIORITY_CUES.search(prompt) and len(dimensions) < 2:
            add_issue(
                issues, "PRIORITY_QUESTION_WITHOUT_DECISION_CONTEXT", "high",
                "A 'best/first/priority' answer depends on context, but the prompt provides too little decision context.",
                {"contextDimensions": dimensions},
            )
        if correct and correct[0] in options and COMBINATION_OPTION.search(options[correct[0]]) and len(options) >= 3:
            add_issue(
                issues, "HIDDEN_MULTI_ANSWER_AS_SINGLE_CHOICE", "high",
                "The keyed single-choice option combines multiple propositions, which can hide a multi-answer concept inside one radio option.",
                {"correctText": options[correct[0]]},
            )
        option_overlap_checks(q, issues)

        if correct and correct[0] in support:
            keyed = correct[0]
            keyed_support = support[keyed]
            wrong_supported = [
                {"id": oid, "text": options[oid], **s}
                for oid, s in support.items()
                if oid != keyed and s["optionCoverage"] >= 0.8 and s["promptCoverage"] >= 0.45 and s["score"] >= 0.68
            ]
            if wrong_supported:
                add_issue(
                    issues, "MULTIPLE_SOURCE_SUPPORTED_OPTIONS", "critical",
                    "At least one unkeyed option is also strongly supported in source fragments together with the prompt concept; single-answer uniqueness requires manual adjudication.",
                    {"keyed": {"id": keyed, "text": options[keyed], **keyed_support}, "alsoSupported": wrong_supported[:4]},
                )
            if fragments and keyed_support["optionCoverage"] < 0.45 and keyed_support["score"] < 0.42:
                add_issue(
                    issues, "KEYED_ANSWER_WEAK_SOURCE_RELATION", "high",
                    "The keyed option has weak detectable relation to its anchored source evidence; the key/source mapping requires manual review.",
                    {"keyed": {"id": keyed, "text": options[keyed], **keyed_support}},
                )

    elif qtype == "multiple_choice":
        valid_correct = [x for x in correct if x in options]
        if not valid_correct:
            add_issue(issues, "INVALID_MULTIPLE_CHOICE_KEY", "critical", "Multiple-choice has no valid displayed keyed answer.", {"correct": correct})
        unkeyed_supported = [
            {"id": oid, "text": text, **support[oid]}
            for oid, text in options.items()
            if oid not in valid_correct and support[oid]["optionCoverage"] >= 0.82 and support[oid]["promptCoverage"] >= 0.5 and support[oid]["score"] >= 0.7
        ]
        if unkeyed_supported:
            add_issue(
                issues, "POSSIBLE_MISSING_CORRECT_OPTIONS", "critical",
                "One or more unkeyed options are strongly source-supported with the prompt and may also need to be accepted.",
                {"unkeyedSupported": unkeyed_supported[:5]},
            )
        if options and len(valid_correct) == len(options):
            add_issue(issues, "ALL_OPTIONS_KEYED_CORRECT", "high", "Every option is marked correct, so the item does not test discrimination.")
        option_overlap_checks(q, issues)

    elif qtype == "clinical_case":
        if len(prompt) < 80 or not CASE_CUES.search(prompt) or len(dimensions) < 2:
            add_issue(
                issues, "INSUFFICIENT_CLINICAL_CASE_CONTEXT", "high",
                "The clinical-case prompt may not contain enough concrete patient/situation information to constrain a clinically meaningful answer.",
                {"promptLength": len(prompt), "contextDimensions": dimensions},
            )
        ref = model_answer(q)
        if PLURAL_ASK.search(prompt) and len(ref) < 90:
            add_issue(
                issues, "CASE_REFERENCE_ANSWER_TOO_NARROW", "medium",
                "The case asks for multiple considerations but provides a comparatively narrow reference answer; acceptable alternatives should be represented as a rubric.",
                {"referenceLength": len(ref)},
            )
        if ACTION_CUES.search(prompt) and len(dimensions) < 3:
            add_issue(
                issues, "CASE_ACTION_NEEDS_MORE_CONTEXT", "medium",
                "The case asks for an action/decision but supplies fewer than three contextual dimensions; additional findings/timing/goals may be needed.",
                {"contextDimensions": dimensions},
            )

    elif qtype == "short_answer":
        ref = model_answer(q)
        if not ref:
            add_issue(issues, "MISSING_REFERENCE_ANSWER", "critical", "Short-answer item has no usable reference answer.")
        if PLURAL_ASK.search(prompt) and len(ref) < 70:
            add_issue(
                issues, "PLURAL_PROMPT_WITH_NARROW_REFERENCE", "medium",
                "The prompt invites multiple valid points, but the reference answer is narrow and may teach an incomplete answer as if exhaustive.",
                {"referenceLength": len(ref)},
            )
        if (len(prompt) < 44 or GENERIC_PROMPT.match(prompt)) and len(ref) > 180:
            add_issue(
                issues, "UNDER_SPECIFIED_PROMPT_BROAD_REFERENCE", "review",
                "A short/generic prompt maps to a broad reference answer; multiple reasonable learner answers are likely.",
                {"promptLength": len(prompt), "referenceLength": len(ref)},
            )

    elif qtype == "ordering":
        if not ORDER_CUES.search(prompt):
            add_issue(issues, "ORDERING_WITHOUT_SEQUENCE_CONSTRAINT", "high", "Ordering requires a uniquely defined sequence, but the prompt lacks an explicit sequence/chronology constraint.")

    elif qtype == "matching":
        # Matching is structurally less vulnerable to clinical-context ambiguity, but
        # overlapping pair labels can still make more than one mapping defensible.
        lefts, rights = [], []
        for text in options.values():
            parts = [compact(x) for x in str(text).split("↔")]
            if len(parts) == 2:
                lefts.append(parts[0]); rights.append(parts[1])
        for side_name, values in (("left", lefts), ("right", rights)):
            for i, a in enumerate(values):
                for b in values[i + 1:]:
                    at, bt = tokens(a), tokens(b)
                    if at and bt and max(coverage(at, bt), coverage(bt, at)) >= 0.85:
                        add_issue(issues, "OVERLAPPING_MATCHING_LABELS", "medium", "Matching labels overlap strongly and may permit more than one plausible pairing.", {"side": side_name, "a": a, "b": b})

    if CURRENTNESS_CUES.search(prompt + " " + explanation):
        add_issue(
            issues, "CURRENT_GUIDANCE_SENSITIVE_TOPIC", "review",
            "This item concerns a topic where practice/guidance can change; source-faithful 2015 correctness should remain distinct from current-guidance validity.",
        )

    highest = max((RISK_RANK[x["risk"]] for x in issues), default=0)
    risk_band = next((name for name, rank in RISK_RANK.items() if rank == highest), "clear")
    if highest == 0:
        risk_band = "clear"

    recommendation = "retain"
    codes = {x["code"] for x in issues}
    if qtype == "single_choice" and codes & {
        "SINGLE_CHOICE_FOR_PLURAL_KNOWLEDGE", "MULTIPLE_SOURCE_SUPPORTED_OPTIONS", "CONTEXT_DEPENDENT_SINGLE_CHOICE",
        "NON_MUTUALLY_EXCLUSIVE_OPTIONS", "OPTION_SUBSUMPTION", "OVERLAPPING_NUMERIC_OPTIONS", "HIDDEN_MULTI_ANSWER_AS_SINGLE_CHOICE",
    }:
        recommendation = "manual-adjudication-before-single-choice-retention"
    elif highest >= RISK_RANK["high"]:
        recommendation = "manual-adjudication-required"
    elif issues:
        recommendation = "review"

    return {
        "questionId": qid,
        "type": qtype,
        "epistemicClass": epistemic,
        "riskBand": risk_band,
        "recommendation": recommendation,
        "conceptIds": q.get("conceptIds", []),
        "prompt": prompt,
        "contextDimensions": dimensions,
        "correct": correct,
        "issues": issues,
        "sourceSupport": support if qtype in {"single_choice", "multiple_choice"} else {},
    }


def audit() -> dict[str, Any]:
    question_sha = sha256(QUESTIONS)
    if question_sha != FROZEN_SHA256:
        raise AssertionError(f"P26G frozen question bank changed before P28A: {question_sha}")

    questions = load_json(QUESTIONS)
    concepts = load_json(DATA / "concepts.json")
    cards = load_json(DATA / "cards.json")
    if len(questions) != 1299:
        raise AssertionError(f"Expected 1299 questions, found {len(questions)}")

    source = evidence_fragments(concepts, cards)
    rows = [audit_question(q, source) for q in questions]
    if len({r["questionId"] for r in rows}) != len(rows):
        raise AssertionError("Question IDs are not unique")

    risk_counts = Counter(r["riskBand"] for r in rows)
    type_counts = Counter(r["type"] for r in rows)
    epistemic_counts = Counter(r["epistemicClass"] for r in rows)
    issue_counts = Counter(i["code"] for r in rows for i in r["issues"])
    recommendation_counts = Counter(r["recommendation"] for r in rows)

    single_rows = [r for r in rows if r["type"] == "single_choice"]
    single_manual = [r for r in single_rows if r["recommendation"] == "manual-adjudication-before-single-choice-retention"]
    objective_high = [r for r in rows if r["type"] in OBJECTIVE_TYPES and RISK_RANK[r["riskBand"]] >= RISK_RANK["high"]]
    critical = [r for r in rows if r["riskBand"] == "critical"]
    currentness = [r for r in rows if any(i["code"] == "CURRENT_GUIDANCE_SENSITIVE_TOPIC" for i in r["issues"])]

    status = "ACTION_REQUIRED" if critical or objective_high or single_manual else "PASS"
    return {
        "schemaVersion": 1,
        "phase": "P28A",
        "title": "Clinical & Contextual Question Validity Audit",
        "status": status,
        "scope": {
            "questions": len(rows),
            "questionBankSha256": question_sha,
            "frozenP26GSha256": FROZEN_SHA256,
            "questionBankMutated": False,
            "sourceBasis": "2015 I care – Pflege repository-local source evidence; no current clinical guidance merged",
        },
        "summary": {
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
        },
        "priorityQueues": {
            "criticalQuestionIds": [r["questionId"] for r in critical],
            "singleChoiceAdjudicationIds": [r["questionId"] for r in single_manual],
            "highOrCriticalObjectiveIds": [r["questionId"] for r in objective_high],
            "currentGuidanceSensitiveIds": [r["questionId"] for r in currentness],
        },
        "questions": rows,
        "policy": {
            "singleChoiceRetentionRule": "Retain single-choice only when exactly one answer is defensible from the explicit prompt context.",
            "evaluateOptionsIndependentlyOfExistingKey": True,
            "contextDependentCareActionsRequireContext": True,
            "freeResponseReferenceIsRubricNotExhaustiveTruth": True,
            "sourceCorrectnessSeparatedFromCurrentGuidance": True,
            "questionContentEditedByP28A": False,
            "answerKeysEditedByP28A": False,
            "gradingChangedByP28A": False,
            "fsrsChangedByP28A": False,
        },
        "nextPhase": {
            "phase": "P28B",
            "name": "Adversarial Question-by-Question Adjudication & Repair",
            "purpose": "Manually/semantically adjudicate P28A priority queues against source context, then rewrite, retype, accept multiple answers, add context, or remove unsafe items before re-certification.",
        },
    }


def render_md(report: dict[str, Any]) -> str:
    s = report["summary"]
    lines = [
        "# P28A — Clinical & Contextual Question Validity Audit",
        "",
        f"**Status: {report['status']}**",
        "",
        "P28A is detection-only. It does not edit the frozen P26G question bank.",
        "",
        "## Full-bank coverage",
        "",
        f"- Questions audited: **{report['scope']['questions']} / 1,299**",
        f"- Frozen SHA-256 preserved: `{report['scope']['questionBankSha256']}`",
        f"- Single-choice questions: **{s['singleChoiceTotal']}**",
        f"- Single-choice items requiring adversarial adjudication before retention: **{s['singleChoiceManualAdjudication']}**",
        f"- Critical-risk questions: **{s['criticalQuestions']}**",
        f"- High/critical objective questions: **{s['highOrCriticalObjectiveQuestions']}**",
        f"- Current-guidance-sensitive review queue: **{s['currentGuidanceSensitiveReview']}**",
        "",
        "## Risk distribution",
        "",
    ]
    for key in ("critical", "high", "medium", "review", "clear"):
        lines.append(f"- {key}: **{s['riskCounts'].get(key, 0)}**")
    lines += ["", "## Most common audit signals", ""]
    for code, count in list(s["issueCounts"].items())[:20]:
        lines.append(f"- `{code}`: **{count}**")
    lines += [
        "",
        "## Interpretation",
        "",
        "A P28A flag is not automatically a claim that the textbook fact is wrong. It means the question/answer contract may be unsafe for learning without semantic adjudication. The audit deliberately separates source-faithful 2015 correctness from current-guidance validity.",
        "",
        "Single-choice is treated strictly: it may remain single-choice only if exactly one answer is defensible under the information explicitly supplied in the prompt.",
        "",
        "## Next phase",
        "",
        "**P28B — Adversarial Question-by-Question Adjudication & Repair**",
        "",
        "P28B must inspect the priority queues semantically and repair each unsafe item by adding context, converting to multiple choice/free response/clinical case, accepting additional answers, rewriting distractors, or removing the item. Any question-bank edit invalidates the P26G freeze and requires re-certification.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="write deterministic JSON/Markdown audit reports")
    parser.add_argument("--check-report", action="store_true", help="require checked-in reports to match deterministic output")
    args = parser.parse_args()

    report = audit()
    expected_json = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    expected_md = render_md(report)
    if args.write:
        REPORTS.mkdir(exist_ok=True)
        REPORT_JSON.write_text(expected_json, encoding="utf-8")
        REPORT_MD.write_text(expected_md, encoding="utf-8")
    if args.check_report:
        if not REPORT_JSON.exists() or REPORT_JSON.read_text(encoding="utf-8") != expected_json:
            print("P28A JSON report drift detected.")
            return 1
        if not REPORT_MD.exists() or REPORT_MD.read_text(encoding="utf-8") != expected_md:
            print("P28A Markdown report drift detected.")
            return 1

    print(json.dumps({
        "phase": report["phase"],
        "status": report["status"],
        **report["summary"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
