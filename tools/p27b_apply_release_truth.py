#!/usr/bin/env python3
"""Apply the bounded P27B release-truth repair.

This is intentionally limited to release metadata, documentation, cache identity,
validation entrypoints and reports. It must not mutate data/questions.json.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FROZEN_SHA = "40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024"
VERSION = "1.1.0-rc.1"

README = r'''# PflegeLern — 1.1.0-rc.1

**PflegeLern** is a mobile-first, offline-capable nursing study app built from a source-faithful learning bank based on the uploaded 2015 edition of *I care – Pflege*.

The repository is currently the **P27B release candidate (`1.1.0-rc.1`)**. The frozen question bank completed P26G certification; P27B repairs release identity, documentation and the canonical validation entrypoint without changing learning content.

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

Serve locally when browser interaction is needed:

```bash
python3 -m http.server 4173
```

The single current non-browser release-readiness command is:

```bash
python3 tools/release_readiness.py --full
```

This validates P27B release truth, current production counts, PWA/static integrity, the frozen P26G question-bank hash and the semantic/question/adaptive/exam regression chain. Real-Chromium desktop/mobile interaction is rerun in the P27B CI workflow.

`node tests/validate.mjs` is retained only as a compatibility alias to the canonical command above.

## Release state

- P26G question-bank certification: **PASS**
- P27A full-product readiness audit: **completed; release-truth drift identified**
- P27B release truth & validation repair: **release candidate gate**
- next phase after P27B: **P27C — Final Release Certification & Promotion**
'''

QA = r'''# PflegeLern — Current QA & Release Readiness

## Status

**P27B — Release Truth & Validation Repair**  
Release candidate: **`1.1.0-rc.1`**

P27B replaces the obsolete P9/P10 QA summary as the current release-readiness record. Learning content remains frozen at the P26G-certified question bank.

## Production counts

| Entity | Count |
|---|---:|
| Chapters | 66 |
| Sections/subsections | 1,363 |
| Concepts | 2,089 |
| Flashcards | 2,094 |
| Questions | 1,299 |
| Cases | 120 |

## Certified learning-bank baseline

P26G is **PASS** and freezes `data/questions.json` at:

`40233f783c322c5da5e2c24adbe1ec12651ae2b2011d35a7d4adb61b172ce024`

Certified P26 closure:

- P26A/P26B: 7 confirmed semantic defects → 7 repaired
- P26C/P26D: 14 additional confirmed repair targets → 14 repaired
- P26E: 0 actionable semantic defects and 0 unadjudicated signals
- P26F: 0 residual source-alignment findings
- P26G: full 1,299-question certification **PASS**

P27B does **not** edit question prompts, options, answer keys, explanations, difficulty, FSRS scheduling, mastery, remediation, repetition control, input handling or exam logic.

## Learning-system regression surface

The current canonical release gate covers:

- P26G frozen-bank integrity
- P26F/P26E source/semantic closure
- P25A question variety
- P25B bounded repetition control
- P25C answer-input reliability
- P25D question-quality selection
- P17 adaptive study mix
- P18 mastery model
- P19 weakness remediation
- P20 mock-exam core/runtime
- current JavaScript/service-worker syntax
- production counts, release identity and PWA/static asset integrity

Run:

```bash
python3 tools/release_readiness.py --full
```

The historical `tests/validate.mjs` command is now only a compatibility alias to this current gate.

## Browser and responsive QA

P27A established a real Chromium full-product readiness workflow instead of the old P9 “browser boundary” limitation. The workflow covers:

- primary routes: Heute, Lernen, Prüfung, Fortschritt, Einstellungen
- desktop and mobile study-input interaction
- question-quality and repetition-control regressions
- offline reload and visible offline state
- responsive horizontal-overflow checks
- zero unhandled console/page errors

P27B reruns the same real Chromium coverage after changing only release/documentation/cache identity surfaces.

## PWA / offline integrity

The service-worker cache identity is advanced with the P27B release candidate. All precached paths and manifest icons are checked by the canonical validator. Navigation continues to use offline fallback after initial cache population.

## Release-truth repair

P27B closes the five actionable P27A findings by:

1. replacing the stale P10/v1.0.0 README identity;
2. correcting documented production counts;
3. replacing this obsolete P9 QA record;
4. replacing the obsolete primary validator with `tools/release_readiness.py`;
5. aligning learner-facing, manifest and service-worker version identity to `1.1.0-rc.1`.

## Next phase

**P27C — Final Release Certification & Promotion**

P27C should run the final exact-head CI/browser/deployment gate and promote the release candidate only if every required check remains green.
'''

VALIDATE_ALIAS = r'''import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.warn('tests/validate.mjs is a compatibility alias. Canonical validator: python3 tools/release_readiness.py --full');
const result = spawnSync('python3', ['tools/release_readiness.py', '--full'], {
  cwd: root,
  stdio: 'inherit'
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
'''


def question_sha() -> str:
    return hashlib.sha256((ROOT / "data" / "questions.json").read_bytes()).hexdigest()


def replace_exact(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text and new not in text:
        raise SystemExit(f"Expected marker not found in {path.relative_to(ROOT)}: {old}")
    if old in text:
        text = text.replace(old, new)
        path.write_text(text, encoding="utf-8")


def main() -> int:
    before = question_sha()
    if before != FROZEN_SHA:
        raise SystemExit(f"P26G question bank is not intact before P27B repair: {before}")

    manifest_path = ROOT / "data" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["phase"] = "P27B"
    manifest["version"] = VERSION
    manifest["status"] = "release-candidate"
    note = (
        "P27B repairs release truth after the P27A audit: README/QA counts and identity are current, "
        "the learner-facing version and service-worker cache are aligned to 1.1.0-rc.1, and "
        "tools/release_readiness.py is the canonical validation entrypoint. The frozen P26G "
        "1,299-question bank and all learning behavior remain unchanged."
    )
    notes = list(manifest.get("notes") or [])
    if note not in notes:
        notes.append(note)
    manifest["notes"] = notes
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    replace_exact(ROOT / "js" / "app.js", "const APP_VERSION = '1.0.0';", "const APP_VERSION = '1.1.0-rc.1';")
    replace_exact(
        ROOT / "service-worker.js",
        "const CACHE = 'pflegelern-p27a-v1.1.0-dev27a';",
        "const CACHE = 'pflegelern-p27b-v1.1.0-rc1';",
    )

    (ROOT / "README.md").write_text(README, encoding="utf-8")
    (ROOT / "QA.md").write_text(QA, encoding="utf-8")
    (ROOT / "tests" / "validate.mjs").write_text(VALIDATE_ALIAS, encoding="utf-8")

    after = question_sha()
    if after != before or after != FROZEN_SHA:
        raise SystemExit("P27B attempted to mutate the frozen question bank")

    result = subprocess.run(["python3", "tools/release_readiness.py", "--write-report"], cwd=ROOT)
    if result.returncode:
        return result.returncode

    print("P27B release-truth repair applied; frozen P26G bank preserved byte-for-byte.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
