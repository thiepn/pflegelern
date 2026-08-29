#!/usr/bin/env python3
"""P28B bounded semantic adjudication and repair."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = ROOT / "data/questions.json"
MANIFEST = ROOT / "data/manifest.json"
APP_JS = ROOT / "js/app.js"
SW = ROOT / "service-worker.js"
README = ROOT / "README.md"
QA = ROOT / "QA.md"
PHASE_MD = ROOT / "P28B_ADJUDICATION.md"
REPORT_JSON = ROOT / "reports/P28B_ADJUDICATION.json"
REPORT_MD = ROOT / "reports/P28B_ADJUDICATION.md"
P28A_JSON = ROOT / "reports/P28A_CLINICAL_CONTEXT_VALIDITY_AUDIT.json"

OLD_SHA = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"
NEW_SHA = "97d27b764223443ac72708524774d3003ff07a44394bdea175ebbd37fb11f708"
VERSION = "1.1.1-dev.28b"
PHASE = "P28B"
STATUS = "development"
CACHE = "pflegelern-p28b-v1.1.1-dev28b"

REPAIRS: dict[str, dict[str, Any]] = {
    "q-case-pulse-01": {
        "class": "answer-contract-narrowing",
        "rationale": "P28A directly proves physician notification but not every bundled action in the keyed option; narrow the key to the directly anchored action.",
        "prompt": "Ein Patient hat in Ruhe plötzlich einen regelmäßigen Puls von 120/min; frühere Werte lagen bei 70–80/min. Welche unmittelbar belegte Maßnahme nennt das Lehrbuch?",
        "explanation": "Bei einer neu auftretenden, nicht physiologisch erklärten Tachykardie nennt die verankerte Lehrbuchquelle ausdrücklich die ärztliche Information.",
        "option_updates": {"a": "Arzt informieren"},
    },
    "q-36-02": {
        "class": "historical-source-scope",
        "rationale": "The one-hour limit is source-supported but guidance-sensitive; make the 2015 source boundary explicit.",
        "prompt": "Welche Höchstfrist nennt die 2015-Ausgabe des Lehrbuchs für das Richten flüssiger Arzneimittel vor der Verabreichung?",
        "explanation": "Historischer Lehrbuchstand 2015: maximal 1 Stunde vorher; möglichst direkt vor der Verabreichung. Diese Angabe wird hier quellengetreu geprüft und ist nicht als aktuelle universelle Handlungsanweisung zu verstehen.",
    },
    "q-p12-0084": {
        "class": "prompt-precision",
        "rationale": "The key is uniquely source-supported, but the old prompt was truncated and framed too broadly; ask the exact source fact.",
        "prompt": "Welche Einschränkung nennt das Lehrbuch im Abschnitt „Maßnahmen zur Obstipationsprophylaxe“ für probiotische Lebensmittel?",
        "explanation": "Das Lehrbuch hebt hervor, dass probiotische Lebensmittel für Frühgeborene und immunsupprimierte Patienten wegen des Bakteriämierisikos ungeeignet sein können.",
    },
    "q-p12-0085": {
        "class": "prompt-precision",
        "rationale": "The key is uniquely source-supported, but the old prompt contained a broken section label and broad action wording; ask the exact source fact.",
        "prompt": "Welche Stoffe nennt das Lehrbuch im Abschnitt „Maßnahmen zur Parotitis- und Soorprophylaxe“ als für die Mundpflege kontraproduktiv?",
        "explanation": "Kamille, Blutwurz, Myrrhe und Zitrone werden wegen ihrer schleimhautaustrocknenden Wirkung als kontraproduktiv genannt.",
    },
    "q-p12-0090": {
        "class": "historical-source-scope",
        "rationale": "The keyed pair is source-supported, but DVT therapy is guidance-sensitive and another option is partly plausible; constrain the question to the two measures explicitly named in the 2015 source.",
        "prompt": "Welche zwei zentralen Maßnahmen nennt die 2015-Ausgabe des Lehrbuchs im Abschnitt „Thromboseprophylaxe“ bei bestätigter TVT?",
        "explanation": "Historischer Lehrbuchstand 2015: Antikoagulation, z. B. mit Heparin, und Kompression. Die Frage prüft die Quelle von 2015 und ersetzt keine aktuelle klinische Leitlinie.",
    },
    "q-p12-0091": {
        "class": "historical-source-scope",
        "rationale": "The keyed statement is source-supported but guidance-sensitive; explicitly scope it to the 2015 textbook and the interval before medical clarification.",
        "prompt": "Welche unmittelbare Maßnahme nennt die 2015-Ausgabe des Lehrbuchs bei Thromboseverdacht bis zur ärztlichen Abklärung?",
        "explanation": "Historischer Lehrbuchstand 2015: zunächst Bettruhe bis zur ärztlichen Abklärung. Diese quellengetreue Aussage ist nicht als aktuelle universelle Handlungsanweisung zu verstehen.",
    },
    "q-p12-0104": {
        "class": "historical-source-scope",
        "rationale": "The original ZVK stem was too broad for a specific historical ZVD zero-point technique; name the procedure and 2015 boundary.",
        "prompt": "Welche Aussage beschreibt die in der 2015-Ausgabe genannte Bestimmung des Nullpunkts zur ZVD-Messung bei einem nicht implantierten ZVK?",
        "explanation": "Historischer Lehrbuchstand 2015: Der Thorax wird gedanklich in fünf gleiche Teile geteilt; der Nullpunkt liegt etwa 2/5 unterhalb des Sternums, bestimmt bei flach auf dem Rücken liegendem Patienten. Die Frage prüft den damaligen Lehrbuchstand.",
    },
    "q-p12-0138": {
        "class": "distractor-repair",
        "rationale": "Two displayed answers were defensible as fresh-air precautions; preserve the exact source-backed key and replace the second plausible statement with a contradictory distractor.",
        "prompt": "Welche Maßnahme hebt das Lehrbuch unter „Frischluft“ beim Vernebeln von Medikamenten hervor?",
        "explanation": "Beim Vernebeln kann Wirkstoff in die Raumluft gelangen. Das Lehrbuch empfiehlt, das Fenster zu öffnen und den Raum nach Möglichkeit während der Inhalation zu verlassen.",
        "option_updates": {"b": "Fenster geschlossen halten, damit kein Wirkstoff nach außen gelangt."},
    },
    "q-p12-0444": {"class": "single-choice-contract", "rationale": "The keyed option is an intentionally bundled symptom set; ask for the symptom combination so one radio answer is semantically appropriate.", "prompt": "Welche Symptomkombination nennt das Lehrbuch bei Frakturen am Oberarm?"},
    "q-p12-0446": {"class": "single-choice-contract", "rationale": "The keyed option is an intentionally bundled symptom set; ask for the symptom combination so one radio answer is semantically appropriate.", "prompt": "Welche Symptomkombination nennt das Lehrbuch bei einer distalen Radiusfraktur?"},
    "q-p12-0448": {"class": "single-choice-contract", "rationale": "The keyed option is an intentionally bundled symptom set; ask for the symptom combination so one radio answer is semantically appropriate.", "prompt": "Welche Symptomkombination nennt das Lehrbuch bei einer Patellafraktur?"},
    "q-p12-0525": {"class": "single-choice-contract", "rationale": "The keyed option is an intentionally bundled symptom set; ask for the symptom combination so one radio answer is semantically appropriate.", "prompt": "Welche Symptomkombination nennt das Lehrbuch bei einer Netzhautablösung?"},
}

RETAIN: dict[str, str] = {
    "q-16-1-01": "The overlap is between distractors; the source-backed Bradykardie threshold remains uniquely under 60/min. Alternative-support is a number-token false positive.",
    "q-16-1-02": "The overlap is between distractors; the source-backed Tachykardie threshold remains uniquely over 100/min. Alternative-support is a number-token false positive.",
    "q-16-1-05": "The anchored card explicitly frames documentation as sufficient under the stated normal-frequency, asymptomatic, known-arrhythmia conditions; low lexical overlap is not a semantic defect.",
    "q-61-4-03": "This is a textbook communication recommendation rather than an unconstrained bedside decision; only slow, clear, normal-volume speech matches the source.",
    "q-61-4-05": "The alternative-support detector ignored negation: the source says not to feign understanding; the keyed positive strategy remains unique.",
    "q-48-4-02": "This is conceptual ethical-principle classification, not a context-dependent clinical intervention; autonomy is uniquely correct and the currentness flag is non-actionable.",
    "q-48-4-07": "The stem explicitly describes the textbook autonomy-versus-care conflict; other pairs do not match.",
    "q-p7b-chapter-16-definition-01": "Numeric overlap was detected across definitions of different concepts; only the Bradykardie definition answers the named term.",
    "q-p12-0046": "The stem names the exact textbook threshold scenario and only the keyed physician-notification option is tied to it.",
    "q-p12-0047": "The detector compared similar ranges with different units/domains; beats/min and mg/dl are not interchangeable.",
    "q-p12-0049": "Only the option explicitly defining Tachykardie answers the named term; overlapping numbers in other definitions are irrelevant.",
    "q-p12-0052": "Only the force-on-vessel-walls statement defines blood pressure; numerical fragments in other definitions are irrelevant.",
    "q-p12-0053": "Only the systolic-under-100 mmHg statement answers the named Hypotonie concept in the source.",
    "q-p12-0072": "This is a source-identification item; one option is the complete Steckbecken guidance and all distractors concern other topics.",
    "q-p12-0130": "The exact source statement uniquely says to stop when the rectal tube cannot be advanced and notify the physician.",
    "q-p12-0131": "Only the fluid-bag height warning belongs to the named practical-procedure source fragment.",
    "q-p12-0136": "The source warning about increased pressure under cushions is uniquely keyed; distractors concern unrelated conditions.",
    "q-p12-0137": "Only the keyed option states the specific contraindication set for head-down drainage positioning.",
    "q-p12-0141": "Changing nostrils every few hours is uniquely tied to the named oxygen-therapy source concept.",
    "q-p12-0166": "Although generic and gestational hypertension share a threshold, only the keyed option explicitly defines pregnancy-induced/gestational hypertension.",
    "q-p12-0188": "The medication-preparation scope makes concealing errors uniquely relevant; other 'never' statements concern unrelated contexts.",
    "q-p12-0198": "Only the keyed option states the First-in-First-out principle; ethical-decision distractors are unrelated.",
    "q-p12-0199": "The oral-medication stem makes upright sitting uniquely correct; other options are from different contexts.",
    "q-p12-0218": "The detector compared unrelated numerical values; only the Hypothalamus/set-point statement answers fever fundamentals.",
    "q-p12-0243": "Named-step source recall: only the keyed statement describes step 1 of the ethical model.",
    "q-p12-0244": "Named-step source recall: only the keyed statement describes principles/rights analysis in step 3.",
    "q-p12-0245": "Named-step source recall: only the keyed statement describes developing/comparing/evaluating actions in step 4.",
    "q-p12-0246": "Named-step source recall: only the keyed statement describes selecting and justifying an action in step 5.",
    "q-p12-0247": "Named-step source recall: only the keyed statement describes critical review/reflection in step 6.",
    "q-p12-0317": "Influenzaviren A und B is one definitional proposition, not a hidden multiple-answer contract; only the influenza definition answers the stem.",
    "q-p12-0447": "The detector matched a 4–6 week range across unrelated topics; only the keyed option describes distal-radius-fracture therapy.",
    "q-p12-0512": "The stem names the exact source principle Sprachtherapie früh beginnen; so früh wie möglich is uniquely anchored.",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump_minified(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def apply_question_repairs() -> str:
    before = sha(QUESTIONS)
    if before not in {OLD_SHA, NEW_SHA}:
        raise AssertionError(f"Unexpected question-bank SHA before P28B: {before}")
    questions = load_json(QUESTIONS)
    by_id = {q["id"]: q for q in questions}
    assert len(questions) == len(by_id) == 1299
    if before == OLD_SHA:
        for qid, repair in REPAIRS.items():
            q = by_id[qid]
            if "prompt" in repair:
                q["prompt"] = repair["prompt"]
            if "explanation" in repair:
                q["explanation"] = repair["explanation"]
            for oid, text in repair.get("option_updates", {}).items():
                option = next((o for o in q.get("options", []) if o.get("id") == oid), None)
                assert option is not None, f"Missing option {qid}:{oid}"
                option["text"] = text
            q["repair"] = {"phase": "P28B", "method": "adversarial-semantic-adjudication", "scope": "high-critical-objective-queue"}
        dump_minified(QUESTIONS, questions)
    after = sha(QUESTIONS)
    assert after == NEW_SHA, (after, NEW_SHA)
    return after


def verify_repairs() -> None:
    by_id = {q["id"]: q for q in load_json(QUESTIONS)}
    for qid, repair in REPAIRS.items():
        q = by_id[qid]
        assert q.get("repair", {}).get("phase") == "P28B", qid
        if "prompt" in repair:
            assert q["prompt"] == repair["prompt"], qid
        if "explanation" in repair:
            assert q["explanation"] == repair["explanation"], qid
        for oid, text in repair.get("option_updates", {}).items():
            assert next(o["text"] for o in q["options"] if o["id"] == oid) == text
    assert by_id["q-p12-0138"]["correct"] == ["a"]


def adjudication_report() -> dict[str, Any]:
    baseline = load_json(P28A_JSON)
    queue = baseline["priorityQueues"]["singleChoiceAdjudicationIds"]
    decisions = set(REPAIRS) | set(RETAIN)
    assert len(queue) == 44 and set(queue) == decisions
    rows = {row["questionId"]: row for row in baseline["questions"]}
    items = []
    for qid in queue:
        row = rows[qid]
        if qid in REPAIRS:
            action, dclass, rationale = "repair", REPAIRS[qid]["class"], REPAIRS[qid]["rationale"]
        else:
            action, dclass, rationale = "retain", "adjudicated-detector-false-positive", RETAIN[qid]
        items.append({"questionId": qid, "baselineRisk": row["riskBand"], "baselineIssues": [i["code"] for i in row["issues"]], "action": action, "decisionClass": dclass, "rationale": rationale})
    currentness = [i for i in items if "CURRENT_GUIDANCE_SENSITIVE_TOPIC" in i["baselineIssues"]]
    return {
        "schemaVersion": 1,
        "phase": PHASE,
        "title": "Adversarial Question-by-Question Adjudication & Repair",
        "status": "PASS",
        "scope": {"baseline": "P28A high/critical objective single-choice adjudication queue", "questionsAdjudicated": 44, "questionsRepaired": 12, "questionsRetained": 32, "unresolved": 0},
        "questionBank": {"questions": 1299, "previousReleaseBaselineSha256": OLD_SHA, "preApplySha256": OLD_SHA, "p28bSha256": NEW_SHA, "p26gHistoricalReleaseFreezeInvalidatedForCurrentMain": True, "countsOrQuestionIdsChanged": False},
        "policy": {"sourceEdition": "I care – Pflege, 2015 edition", "evaluateEveryFlaggedOptionSemantically": True, "detectorFlagDoesNotEqualDefect": True, "currentGuidanceNotSilentlySubstituted": True, "historicalGuidanceSensitiveStatementsExplicitlyScopedWhenRepaired": True, "fsrsChanged": False, "masteryChanged": False, "remediationChanged": False, "examScoringChanged": False},
        "currentGuidanceWithinP28BQueue": {"count": len(currentness), "questionIds": [i["questionId"] for i in currentness], "note": "P28B resolves the high/critical-objective subset; the broader P28A current-guidance-sensitive queue remains P28C scope."},
        "items": items,
        "nextPhase": {"phase": "P28C", "title": "Current-Guidance Sensitivity Adjudication & Historical-Source Safety Pass", "scope": "Adjudicate the broader 75-item P28A current-guidance-sensitive review queue, crediting P28B items already resolved and adding historical-source labeling or source-only framing where needed."},
    }


def render_report(report: dict[str, Any]) -> str:
    classes: dict[str, int] = {}
    for item in report["items"]:
        if item["action"] == "repair":
            classes[item["decisionClass"]] = classes.get(item["decisionClass"], 0) + 1
    lines = [
        "# P28B — Adversarial Question-by-Question Adjudication & Repair", "", "**Status: PASS**", "",
        "P28B semantically adjudicates every one of the 44 high/critical objective questions carried forward from P28A. Detector flags are not treated as defects without question-level semantic review.", "",
        "## Outcome", "", "- Questions adjudicated: **44 / 44**", "- Confirmed defects repaired: **12**", "- Flagged items retained after semantic review: **32**", "- Unresolved objective items: **0**", f"- New exact question-bank SHA-256: `{NEW_SHA}`", "- Question count remains **1,299**; IDs and question-type counts are preserved.", "", "## Repair classes", "",
    ]
    for name, count in sorted(classes.items()):
        lines.append(f"- `{name}`: **{count}**")
    lines += ["", "## Certification meaning", "", "The P26G hash remains the immutable **v1.1.0 release baseline**, but it is no longer the hash of current main after P28B. P28B establishes the new exact development-bank hash above.", "", "P28B does not silently modernize the source. Guidance-sensitive repaired items are explicitly framed as 2015-source questions where necessary.", "", "## Next phase", "", "**P28C — Current-Guidance Sensitivity Adjudication & Historical-Source Safety Pass**", "", "P28C handles the broader P28A current-guidance-sensitive queue, reusing P28B decisions already completed.", ""]
    return "\n".join(lines)


def rewrite_release_truth(report: dict[str, Any]) -> None:
    manifest = load_json(MANIFEST)
    manifest["phase"], manifest["version"], manifest["status"] = PHASE, VERSION, STATUS
    note = f"P28B semantically adjudicates all 44 P28A high/critical objective questions: 12 confirmed defects repaired and 32 flagged items retained after review. Current development-bank SHA-256: {NEW_SHA}. The P26G SHA remains the historical v1.1.0 release baseline."
    manifest["notes"] = [n for n in manifest.get("notes", []) if not str(n).startswith("P28B semantically adjudicates")] + [note]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    app = APP_JS.read_text(encoding="utf-8")
    app, n = re.subn(r"const APP_VERSION = '[^']+';", f"const APP_VERSION = '{VERSION}';", app, count=1); assert n == 1
    APP_JS.write_text(app, encoding="utf-8")
    sw = SW.read_text(encoding="utf-8")
    sw, n = re.subn(r"const CACHE = '[^']+';", f"const CACHE = '{CACHE}';", sw, count=1); assert n == 1
    SW.write_text(sw, encoding="utf-8")
    README.write_text(f'''# PflegeLern — {VERSION}\n\n**PflegeLern** is a mobile-first, offline-capable nursing study app built from a source-faithful learning bank based on the uploaded 2015 edition of *I care – Pflege*.\n\nCurrent `main` is the **P28B development line (`{VERSION}`)**. The latest immutable published release remains **v1.1.0 / P27C**. P28B is a bounded post-release content-quality repair phase and does not rewrite the historical v1.1.0 tag or P26G certification.\n\n## Product\n\n- Heute adaptive recommended study and short rounds\n- Lernen unrestricted hierarchical learning, search and bookmarks\n- flashcards, free recall and calibrated self-assessment\n- adaptive study mix and weakness remediation\n- Prüfung quick/full/weakness/chapter/section/mock-exam workflows\n- Fortschritt mastery, weak topics, recent mistakes and history\n- FSRS-6 at 90% target retention\n- IndexedDB v2 persistence, backup/restore and recovery\n- offline PWA after first successful load\n- responsive phone-first and desktop layouts\n\n## Current study bank\n\n- **66 chapters**\n- **1,363 sections/subsections**\n- **2,089 concepts**\n- **2,094 flashcards**\n- **1,299 questions**\n- **120 cases**\n\nP28B question-bank SHA-256:\n\n`{NEW_SHA}`\n\nThe former P26G SHA `{OLD_SHA}` remains the immutable **v1.1.0 release baseline**. It is intentionally no longer the current-main bank hash after P28B's bounded repairs.\n\n## P28B adjudication\n\nP28A surfaced 44 high/critical objective questions for semantic adjudication. P28B reviews all 44 independently of the existing answer key:\n\n- **12 confirmed defects repaired**\n- **32 detector flags retained after semantic review**\n- **0 unresolved high/critical objective questions**\n\nRepairs include source-contract narrowing, explicit 2015 historical scoping, prompt precision, one misleading distractor replacement, and four single-choice symptom stems rewritten to ask for a symptom combination.\n\nThe learning bank remains source-faithful to the **2015 textbook edition**. Historical source statements are not silently modernized into current clinical guidance.\n\n## Canonical current-main validation\n\n```bash\npython3 tools/p28b_validate.py --full\n```\n\n`node tests/validate.mjs` is the compatibility alias for current main. Historical `tools/release_readiness.py` remains the v1.1.0/P27C release validator.\n\n## Release state\n\n- Latest immutable release: **v1.1.0 / P27C**\n- Current main development identity: **{VERSION} / P28B**\n- Current bank certification: **P28B bounded adjudication hash above**\n- Next phase: **P28C — Current-Guidance Sensitivity Adjudication & Historical-Source Safety Pass**\n''', encoding="utf-8")
    QA.write_text(f'''# P28B — Adversarial Question-by-Question Adjudication & Repair\n\n## Status\n\n**PASS — 44 / 44 high/critical objective questions adjudicated**\n\nP28B consumes the exact P28A objective priority queue and semantically reviews every item. Detector heuristics are not accepted as defects without adjudication.\n\n## Results\n\n- Adjudicated: **44**\n- Repaired: **12**\n- Retained after review: **32**\n- Unresolved: **0**\n- Questions after repair: **1,299**\n- New question-bank SHA-256: `{NEW_SHA}`\n\nThe v1.1.0/P26G hash `{OLD_SHA}` remains a historical release artifact and is not rewritten.\n\n## Invariants\n\nP28B changes no FSRS scheduling, mastery model, remediation logic, repetition control, answer-input implementation, or exam scoring. Question IDs and type counts remain stable.\n\nCurrent mainline identity: `{PHASE} / {VERSION} / {STATUS}`; cache `{CACHE}`.\n\n## Validation\n\n```bash\npython3 tools/p28b_validate.py --full\n```\n\nCI additionally runs real Chromium route/runtime, responsive overflow, offline-PWA and question-repair checks plus P25B/P25C/P25D browser regressions.\n\n## Next phase\n\n**P28C — Current-Guidance Sensitivity Adjudication & Historical-Source Safety Pass**\n''', encoding="utf-8")


def write_report(report: dict[str, Any]) -> None:
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    text = render_report(report)
    REPORT_MD.write_text(text, encoding="utf-8")
    PHASE_MD.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--check", action="store_true"); args = parser.parse_args()
    if args.check:
        assert sha(QUESTIONS) == NEW_SHA
        verify_repairs()
        report = adjudication_report()
        assert REPORT_JSON.read_text(encoding="utf-8") == json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        assert REPORT_MD.read_text(encoding="utf-8") == render_report(report)
        print(json.dumps({"phase": PHASE, "status": "PASS", "questionBankSha256": NEW_SHA, "mode": "check"}, indent=2)); return 0
    apply_question_repairs(); verify_repairs(); report = adjudication_report(); rewrite_release_truth(report); write_report(report)
    print(json.dumps({"phase": PHASE, "status": "PASS", "adjudicated": 44, "repaired": 12, "retained": 32, "unresolved": 0, "questionBankSha256": NEW_SHA}, ensure_ascii=False, indent=2)); return 0

if __name__ == "__main__":
    raise SystemExit(main())
