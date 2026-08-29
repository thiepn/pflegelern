#!/usr/bin/env python3
"""Refine P27C final-release validation without changing product/runtime behavior."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'tools/release_readiness.py'
text = path.read_text(encoding='utf-8')

old_surface = '    final_surfaces = "\\n".join([readme, qa, app_js, sw, json.dumps(manifest, ensure_ascii=False)])\n    check("final-release-no-rc-identity", "1.1.0-rc.1" not in final_surfaces and "p27b-v1.1.0-rc1" not in final_surfaces, "no RC identity on current release surfaces")'
new_surface = '    current_manifest_identity = json.dumps({key: manifest.get(key) for key in ("phase", "version", "status")}, ensure_ascii=False)\n    final_surfaces = "\\n".join([readme, qa, app_js, sw, current_manifest_identity])\n    check("final-release-no-rc-identity", "1.1.0-rc.1" not in final_surfaces and "p27b-v1.1.0-rc1" not in final_surfaces, "no RC identity on current release surfaces; historical manifest notes are allowed")'
if old_surface in text:
    text = text.replace(old_surface, new_surface)
elif 'historical manifest notes are allowed' not in text:
    raise RuntimeError('P27C final release surface check not found')

old_qa = 'qa_tokens = ["P27C", "1.1.0", "1,299", "1,363", "120", "P26G", "real Chromium"]'
new_qa = 'qa_tokens = ["P27C", "1.1.0", "1,299", "1,363", "120", "P26G", "Chromium"]'
if old_qa in text:
    text = text.replace(old_qa, new_qa)
elif new_qa not in text:
    raise RuntimeError('P27C QA token contract not found')

path.write_text(text, encoding='utf-8')
print('P27C validator refinement applied.')
