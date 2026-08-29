#!/usr/bin/env python3
"""Deterministically promote the certified P27B release candidate to PflegeLern v1.1.0.

This phase is release-only. It must not modify data/questions.json or learning behavior.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.1.0"
PHASE = "P27C"
STATUS = "released"
CACHE_ID = "pflegelern-v1.1.0"
FROZEN_SHA = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new)
    if new in text:
        return text
    raise RuntimeError(f"{label}: neither expected old nor final value found")


def promote_manifest() -> None:
    path = ROOT / "data/manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("phase") not in {"P27B", PHASE}:
        raise RuntimeError(f"Unexpected manifest phase: {manifest.get('phase')}")
    if manifest.get("version") not in {"1.1.0-rc.1", VERSION}:
        raise RuntimeError(f"Unexpected manifest version: {manifest.get('version')}")
    manifest["phase"] = PHASE
    manifest["version"] = VERSION
    manifest["status"] = STATUS
    note = (
        "P27C certifies and promotes the P27B release candidate to final PflegeLern v1.1.0. "
        "The final gate preserves the frozen P26G 1,299-question bank, reruns deterministic and real-Chromium regression coverage, "
        "requires the exact merged main payload to deploy successfully to GitHub Pages, and publishes tag/release v1.1.0 only after the live final identity is observable."
    )
    notes = manifest.setdefault("notes", [])
    if note not in notes:
        notes.append(note)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def promote_runtime_identity() -> None:
    app_path = ROOT / "js/app.js"
    app = app_path.read_text(encoding="utf-8")
    app = replace_required(app, "const APP_VERSION = '1.1.0-rc.1';", "const APP_VERSION = '1.1.0';", "APP_VERSION")
    app_path.write_text(app, encoding="utf-8")

    sw_path = ROOT / "service-worker.js"
    sw = sw_path.read_text(encoding="utf-8")
    sw = replace_required(sw, "const CACHE = 'pflegelern-p27b-v1.1.0-rc1';", "const CACHE = 'pflegelern-v1.1.0';", "service-worker cache")
    sw_path.write_text(sw, encoding="utf-8")


def promote_validator() -> None:
    path = ROOT / "tools/release_readiness.py"
    text = path.read_text(encoding="utf-8")
    # Phase-wide naming is intentional: the canonical validator becomes the stable final-release validator.
    text = text.replace("P27B", "P27C")
    text = text.replace("1.1.0-rc.1", "1.1.0")
    text = text.replace("release-candidate", "released")
    text = text.replace("pflegelern-p27b-v1.1.0-rc1", "pflegelern-v1.1.0")
    text = text.replace("P27C_RELEASE_TRUTH_VALIDATION", "P27C_FINAL_RELEASE_CERTIFICATION")
    text = text.replace("Release Truth & Validation Repair", "Final Release Certification & Promotion")
    text = text.replace('"releaseTruthReady": not failed,', '"finalReleaseReady": not failed,')
    text = text.replace("current released QA record", "current final-release QA record")

    old_next = '''        "nextPhase": {\n            "phase": "P27C",\n            "name": "Final Release Certification & Promotion",\n            "purpose": "Run the final exact-head CI/browser/deployment gate and promote the release candidate only if all checks pass.",\n        },'''
    new_state = '''        "releaseState": {\n            "state": "FINAL",\n            "version": VERSION,\n            "maintenancePolicy": "Any future mutation of data/questions.json invalidates P26G and requires re-certification.",\n        },'''
    text = replace_required(text, old_next, new_state, "final releaseState")

    old_md = '''        "## Next phase",\n        "",\n        "**P27C — Final Release Certification & Promotion**",\n        "",\n        "Run the final exact-head CI/browser/deployment gate and promote the release candidate only if all checks pass.",\n        "",'''
    new_md = '''        "## Release state",\n        "",\n        "**FINAL — PflegeLern v1.1.0**",\n        "",\n        "The exact merged main payload is deployed to GitHub Pages and tag/release `v1.1.0` is published only after live final-identity verification.",\n        "",'''
    text = replace_required(text, old_md, new_md, "final markdown release state")

    marker = '    check("readme-no-obsolete-primary-release", "P10 final release" not in readme and "85 practice/exam questions" not in readme, "no stale P10/85-question identity")\n\n    qa_tokens'
    insertion = '''    check("readme-no-obsolete-primary-release", "P10 final release" not in readme and "85 practice/exam questions" not in readme, "no stale P10/85-question identity")\n    final_surfaces = "\\n".join([readme, qa, app_js, sw, json.dumps(manifest, ensure_ascii=False)])\n    check("final-release-no-rc-identity", "1.1.0-rc.1" not in final_surfaces and "p27b-v1.1.0-rc1" not in final_surfaces, "no RC identity on current release surfaces")\n\n    qa_tokens'''
    if marker in text:
        text = text.replace(marker, insertion)
    elif "final-release-no-rc-identity" not in text:
        raise RuntimeError("Could not insert final RC-identity closure check")

    path.write_text(text, encoding="utf-8")


def write_readme() -> None:
    text = '''# PflegeLern — 1.1.0

**PflegeLern** is a mobile-first, offline-capable nursing study app built from a source-faithful learning bank based on the uploaded 2015 edition of *I care – Pflege*.

This repository is the **P27C final release (`1.1.0`)**. The complete question bank is frozen under the P26G certification, and the P27 release chain closes product readiness, release truth, exact-head browser certification, deployment verification and final release promotion without changing the certified learning bank.

## Product

- **Heute** — adaptive recommended study and short study rounds
- **Lernen** — unrestricted learning, hierarchical textbook navigation, search and bookmarks
- **Flashcards** — calibrated recall with `Nicht gewusst · Unsicher · Gewusst`
- **Free recall and self-assessment** — active retrieval beyond recognition-only study
- **Adaptive study mix** — bounded selection across cards and question types
- **Weakness remediation** — mastery-aware targeted recovery
- **Prüfung** — quick, full, weakness, chapter/section and mock-exam workflows with recovery
- **Fortschritt** — mastery, weak topics, recent mistakes and study history
- **FSRS-6** scheduling with a 90% target retention
- **IndexedDB v2** local persistence, backup/restore and session/exam recovery
- **Offline PWA** after the first successful load
- responsive phone-first and desktop layouts with real-Chromium regression coverage

Recommended study is never a gate. `Lernen` remains unrestricted and has no artificial daily cap.

## Certified study bank

- **66 chapters**
- **1,363 textbook section/subsection records**
- **2,089 concepts**
- **2,094 flashcards**
- **1,299 practice/exam questions**
- **120 clinical/application cases**

P26G freezes the complete 1,299-question bank at SHA-256:

`40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`

Any mutation of `data/questions.json` invalidates that certification and requires re-certification.

The learning content follows the **2015 textbook edition**. PflegeLern does not silently replace the source with current clinical guidance.

## Canonical validation

The stable non-browser release-certification command is:

```bash
python3 tools/release_readiness.py --full
```

It validates final release identity, production counts, PWA/static integrity, the frozen P26G bank hash and the semantic/question/adaptive/exam regression chain. Real-Chromium desktop/mobile interaction is enforced by the P27C CI workflow.

`node tests/validate.mjs` remains only as a compatibility alias to the canonical command above.

## Release certification

- P26G question-bank certification: **PASS**
- P27A full-product release-readiness audit: **completed**
- P27B release truth & validation repair: **PASS**
- P27C final release certification & promotion: **FINAL — v1.1.0**

The final tag/release `v1.1.0` is created from the exact merged `main` commit only after the live GitHub Pages deployment exposes the final P27C / 1.1.0 identity.

## Maintenance policy

PflegeLern 1.1.0 is the certified release baseline. Maintenance may fix release infrastructure or non-learning defects, but any future mutation of `data/questions.json` invalidates P26G and requires a new question-bank certification before another release.
'''
    write("README.md", text)


def write_qa() -> None:
    text = '''# P27C — Final Release Certification & Promotion

## Release status

**FINAL — PflegeLern 1.1.0**

P27C promotes the P27B release candidate only after the exact-head deterministic and browser gates pass. After merge, the final publication workflow waits until the corresponding GitHub Pages payload exposes the P27C / 1.1.0 identity before creating tag and GitHub release `v1.1.0`.

## Frozen production bank

| Entity | Count |
|---|---:|
| Chapters | 66 |
| Sections/subsections | 1,363 |
| Concepts | 2,089 |
| Flashcards | 2,094 |
| Questions | 1,299 |
| Cases | 120 |

Frozen P26G question-bank SHA-256:

`40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`

P27C does **not** modify `data/questions.json`, FSRS, mastery, remediation, repetition control, answer-input handling, question grading, exam selection/scoring or textbook-derived learning content.

## Deterministic release gate

Canonical command:

```bash
python3 tools/release_readiness.py --full
```

The final validator requires:

- exact production counts
- P26G hash/certification integrity
- final manifest identity `P27C / 1.1.0 / released`
- learner-facing version `1.1.0`
- service-worker cache `pflegelern-v1.1.0`
- no remaining RC identity on release surfaces
- complete PWA precache and manifest icons
- primary route and viewport contracts
- current README/QA release truth
- P26 semantic/source closure regressions
- P25 question variety/repetition/input/quality regressions
- P17–P20 adaptive learning, mastery, remediation and exam regressions

## Real Chromium certification

P27C reruns the full browser surface against the final payload:

- Heute, Lernen, Prüfung, Fortschritt and Einstellungen
- desktop/mobile runtime and console/page-error checks
- 320, 375, 768, 1024 and 1440 px horizontal-overflow gates
- offline navigation reload after service-worker installation
- all six question types present in the 1,299-question runtime
- P25C desktop/mobile answer-input reliability
- P25D question-quality selection behavior
- P25B repetition-control behavior

## Promotion contract

The final publication workflow runs from the merged `main` commit and:

1. reruns the canonical final validator;
2. proves the frozen P26G bank hash;
3. waits for GitHub Pages to expose `P27C / 1.1.0 / released`;
4. creates tag `v1.1.0` at that exact `main` commit;
5. publishes the GitHub release only after the live deployment check passes.

No post-tag source mutation is required for P27C closeout.
'''
    write("QA.md", text)


def write_release_notes() -> None:
    text = '''# PflegeLern v1.1.0

PflegeLern 1.1.0 is the certified final release of the source-faithful, offline-capable nursing study app based on the uploaded 2015 edition of *I care – Pflege*.

## Certified learning bank

- 66 chapters
- 1,363 sections/subsections
- 2,089 concepts
- 2,094 flashcards
- 1,299 questions
- 120 clinical/application cases

The P26G question bank remains frozen at SHA-256 `40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`.

## Release certification

P27C closes the release chain with deterministic regression validation, real-Chromium desktop/mobile coverage, offline/PWA verification and live GitHub Pages identity verification. The `v1.1.0` tag is created from the exact merged `main` commit only after the final deployed payload is observable.

Learning content remains tied to the 2015 textbook source and is not silently modernized to current clinical guidance.
'''
    write("P27C_RELEASE.md", text)


def main() -> int:
    promote_manifest()
    promote_runtime_identity()
    promote_validator()
    write_readme()
    write_qa()
    write_release_notes()
    print("P27C deterministic final-release promotion materialized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
