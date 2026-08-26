#!/usr/bin/env python3
"""Precision refinement for the P26F source-alignment audit.

The base audit intentionally over-detects lexical misalignment. This layer
recognizes multi-concept questions whose target concepts are represented in any
answer option, includes clinical-case correctText, and normalizes common German
-ieren/-iert verb forms. Structural source findings are unchanged.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import p26f_source_alignment as base

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'


def refined_tokens(text):
    value = str(text or '').lower().replace('ß', 'ss')
    value = unicodedata.normalize('NFKD', value)
    value = ''.join(ch for ch in value if not unicodedata.combining(ch))
    value = value.replace('–', '-').replace('—', '-')
    value = re.sub(r'[^a-z0-9äöü+/%<>\-. ]+', ' ', value)
    out = set()
    for token in re.findall(r'[a-z0-9äöü]+', value):
        if len(token) < 3 or token in base.STOP or token.isdigit():
            continue
        stem = token
        for suffix in ('ierungen','ierung','ieren','iert','ischen','ische','ischer','isches','keiten','keit','ungen','ung','ern','en','er','es','e','n'):
            if len(stem) >= len(suffix) + 4 and stem.endswith(suffix):
                stem = stem[:-len(suffix)]
                break
        out.add(stem)
    return out


def refined_question_learning_text(q):
    option_text = ' '.join(str(o.get('text', '')) for o in q.get('options', []))
    parts = [
        q.get('prompt', ''),
        q.get('explanation', ''),
        q.get('correctText', ''),
        option_text,
    ]
    for key in ('answer', 'expectedAnswer', 'acceptedAnswers'):
        if q.get(key):
            parts.append(base.recursive_text(q[key]))
    return ' '.join(map(str, parts))


base.tokens = refined_tokens
base.question_learning_text = refined_question_learning_text


def audit():
    report = base.audit()
    report['refinement'] = {
        'version': 1,
        'policy': [
            'include all displayed answer options for multi-concept source alignment',
            'include clinical-case correctText',
            'normalize common German -ieren/-iert verb forms',
        ],
    }
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report = audit()
    if args.write:
        REPORTS.mkdir(exist_ok=True)
        (REPORTS / 'P26F_SOURCE_ALIGNMENT_AUDIT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (REPORTS / 'P26F_SOURCE_ALIGNMENT_AUDIT.md').write_text(base.write_md(report), encoding='utf-8')
    print(json.dumps({
        'phase': report['phase'],
        'scope': report['scope'],
        'summary': report['summary'],
        'actionableQuestionIds': report['actionableQuestionIds'],
        'reviewQuestionIds': report['reviewQuestionIds'],
        'findings': report['findings'] if len(report['findings']) <= 30 else [],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
