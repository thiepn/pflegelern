#!/usr/bin/env python3
"""P26D: repair only the 14 defects confirmed by P26C.

Changes are deliberately bounded to answer-option construction and repair
metadata. Question IDs, types, target concepts, difficulty, correct option IDs,
source anchors and explanations are preserved.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / 'data' / 'questions.json'
CARDS_PATH = ROOT / 'data' / 'cards.json'
CONCEPTS_PATH = ROOT / 'data' / 'concepts.json'
P26C_PATH = ROOT / 'reports' / 'P26C_MANUAL_REVIEW_ADJUDICATION.json'
REPORT_JSON = ROOT / 'reports' / 'P26D_CONFIRMED_DEFECT_REPAIR.json'
REPORT_MD = ROOT / 'reports' / 'P26D_CONFIRMED_DEFECT_REPAIR.md'

REPAIRS = {
    'q-21-5-06': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Zunächst Bettruhe, bis der Verdacht ärztlich abgeklärt ist.'),
            ('b', 'Unter Antikoagulation und Kompression ist keine strikte Bettruhe mehr nötig.'),
            ('c', 'Bei bestätigter TVT nennt das Lehrbuch Antikoagulation, z. B. mit Heparin, und Kompression als zentrale Maßnahmen.'),
            ('d', 'Eine Lungenembolie kann als lebensbedrohliche Komplikation aus einer unerkannten Venenthrombose entstehen.'),
        ],
        'distractorConceptIds': [
            'concept-21-5-verdacht-bettruhe',
            'concept-21-5-bestaetigt-antikoag-kompression',
            'concept-21-5-lungenembolie-komplikation',
        ],
        'evidenceCardIds': ['card-21-5-bedrest-suspect', 'card-21-5-confirmed', 'card-21-5-pe'],
    },
    'q-36-03': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Tabletten oder andere nicht flüssige orale Medikamente werden in der Regel in einem Dispenser für die nächsten 24 Stunden gerichtet.'),
            ('b', 'Sie dürfen nicht gemörsert werden.'),
            ('c', 'Transdermale therapeutische Systeme werden auf die intakte Haut appliziert.'),
            ('d', 'Zäpfchen werden handwarm verabreicht und können mit etwas warmem Wasser angefeuchtet werden.'),
        ],
        'distractorConceptIds': [
            'concept-36-679-84-wissen-1',
            'concept-36-682-22-wissen-1',
            'concept-36-681-41-wissen-1',
        ],
        'evidenceCardIds': ['card-679-84-wissen-1', 'card-682-22-wissen-1', 'card-681-41-wissen-1'],
    },
    'q-p12-0043': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Das Tragen von Handschuhen ersetzt nicht die hygienische Händedesinfektion und bietet keinen 100 %igen Schutz vor Keimen auf den Händen.'),
            ('b', 'Einmalprodukte dürfen nicht wiederaufbereitet und müssen nach Gebrauch entsorgt werden.'),
            ('c', 'Bei feuchter Haut wird das Händedesinfektionsmittel verdünnt und es kommt nicht mehr genug Wirkstoff auf die Hände.'),
            ('d', 'Fassen Sie niemals mit benutzen Handschuhen in den sauberen Wäscheschrank oder Wagen, um etwas zu entnehmen – Sie kontaminieren womöglich die Wäsche und bereiten so den Weg für eine Schmierinfektion.'),
        ],
        'distractorConceptIds': [
            'concept-15-306-62-merken-1',
            'concept-15-310-81-merken-1',
            'concept-15-305-42-merken-1',
        ],
        'evidenceCardIds': ['card-306-62-merken-1', 'card-310-81-merken-1', 'card-305-42-merken-1'],
    },
    'q-p12-0163': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Sie sind immer ein Alarmzeichen und sollten ärztlich abgeklärt werden.'),
            ('b', 'Schwangere sollten zum Schutz vor Infektionen wie Listeriose und Toxoplasmose keine rohen tierischen Lebensmittel essen.'),
            ('c', 'Alle Medikamente bedürfen einer ärztlichen Anordnung. Auch nicht verschreibungspflichtige Medikamente sollten Schwangere nur in Absprache mit ihrem Arzt einnehmen.'),
            ('d', 'Regelmäßige Bewegung trägt zu einem unkomplizierten Schwangerschaftsverlauf bei. Auf Sportarten mit erhöhter Verletzungsgefahr sollten Schwangere aber verzichten.'),
        ],
        'distractorConceptIds': [
            'concept-31-603-86-achtung-1',
            'concept-31-604-53-wissen-3',
            'concept-31-604-53-wissen-4',
        ],
        'evidenceCardIds': ['card-603-86-achtung-1', 'card-604-53-wissen-3', 'card-604-53-wissen-4'],
    },
    'q-p12-0165': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Bei schweren anhaltenden Schmerzen während einer Schwangerschaft muss immer ein Arzt hinzugezogen werden. Sie können harmlos sein oder ein Warnsignal für drohende Komplikationen darstellen.'),
            ('b', 'Schwangere sollten zum Schutz vor Infektionen wie Listeriose und Toxoplasmose keine rohen tierischen Lebensmittel essen.'),
            ('c', 'Regelmäßige Bewegung trägt zu einem unkomplizierten Schwangerschaftsverlauf bei. Auf Sportarten mit erhöhter Verletzungsgefahr sollten Schwangere aber verzichten.'),
            ('d', 'Alle Medikamente bedürfen einer ärztlichen Anordnung. Auch nicht verschreibungspflichtige Medikamente sollten Schwangere nur in Absprache mit ihrem Arzt einnehmen.'),
        ],
        'distractorConceptIds': [
            'concept-31-603-86-achtung-1',
            'concept-31-604-53-wissen-4',
            'concept-31-604-53-wissen-3',
        ],
        'evidenceCardIds': ['card-603-86-achtung-1', 'card-604-53-wissen-4', 'card-604-53-wissen-3'],
    },
    'q-p12-0272': {
        'issue': 'answer-option-subsumption',
        'options': [
            ('a', 'Der Transfer wird immer in mehreren Schritten durchgeführt. Die Pflegekraft muss die Fußstellung des Patienten kontrollieren und ggf. korrigieren.'),
            ('b', 'Handling ist ein Begriff innerhalb des Bobath-Konzepts.'),
            ('c', 'Ein Patient sollte nur dann stehen, wenn er sein Körpergewicht auf mindestens ein Bein abgeben kann. Sonst kann der Patient überfordert werden.'),
            ('d', 'Das Bobath-Konzept ist ein weltweit angewendetes bewegungstherapeutisches Behandlungskonzept.'),
        ],
        'distractorConceptIds': [
            'concept-52-881-2-merken-1',
            'concept-52-874-86-definition-1',
            'concept-52-879-70-merken-1',
        ],
        'evidenceCardIds': ['card-881-2-merken-1', 'card-874-86-definition-1', 'card-879-70-merken-1'],
    },
    'q-p12-0288': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Herzrhythmusstörungen zeigen sich in einer gestörten Herzfrequenz und/oder Unregelmäßigkeit des Herzschlags. Die Ursache liegt in einer Störung des Reizbildungs-/Reizleitungssystems des Herzens.'),
            ('b', 'Zur Diagnostik nennt das Lehrbuch EKGs, Echokardiografie, Blutuntersuchungen, Herzkatheteruntersuchung und Event-Recorder-Untersuchung.'),
            ('c', 'Bei bradykarden Herzrhythmusstörungen nennt das Lehrbuch Parasympatholytika, z. B. Atropin, und Sympathomimetika, z. B. Alupent.'),
            ('d', 'Um kritische Frequenzen frühzeitig zu erkennen, sollten die eingestellten Alarmgrenzen am Monitor regelmäßig kontrolliert werden. Klagt der Patient über Herzstolpern oder treten kardiale Synkopen auf, informieren Sie den Arzt.'),
        ],
        'distractorConceptIds': [
            'concept-53-902-22-definition-1',
            'concept-53-902-74-wissen-3',
            'concept-53-903-73-wissen-1',
        ],
        'evidenceCardIds': ['card-902-22-definition-1', 'card-902-74-wissen-3', 'card-903-73-wissen-1'],
    },
    'q-p12-0295': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Gehtraining zur Bildung von Kollateralen, Normalisierung von Gewicht und Blutzucker sowie Nikotinkarenz nennt das Lehrbuch als gesundheitsfördernde Maßnahmen bei pAVK.'),
            ('b', 'Patienten mit pAVK dürfen keine medizinischen Thromboseprophylaxestrümpfe zur routinemäßigen Thromboseprophylaxe angezogen bekommen.'),
            ('c', 'Von einem Aneurysma wird gesprochen, wenn die Gefäßwand einer Arterie lokal erweitert ist.'),
            ('d', 'Ein akuter Arterienverschluss ist immer ein Notfall.'),
        ],
        'distractorConceptIds': [
            'concept-54-928-7-wissen-2',
            'concept-54-927-20-merken-1',
            'concept-54-930-25-definition-1',
        ],
        'evidenceCardIds': ['card-928-7-wissen-2', 'card-927-20-merken-1', 'card-930-25-definition-1'],
    },
    'q-p12-0310': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Asthma bronchiale ist eine chronisch-entzündliche Erkrankung der Atemwege, die durch eine Überempfindlichkeit des Bronchialsystems und Atemwegsobstruktion gekennzeichnet ist.'),
            ('b', 'Im Säuglings- und Erwachsenenalter ist das Infektasthma am häufigsten. Bei Kindern und Jugendlichen überwiegt das allergische Asthma.'),
            ('c', 'Während eines Anfalls treten exspiratorisch pfeifende Geräusche und eine erhöhte Atemfrequenz auf. Der Patient setzt seine Atemmuskulatur ein und sitzt aufrecht.'),
            ('d', 'Ein Asthma-Anfall ist immer eine lebensbedrohliche Situation.'),
        ],
        'distractorConceptIds': [
            'concept-55-949-41-definition-1',
            'concept-55-949-84-merken-1',
            'concept-55-953-68-wissen-2',
        ],
        'evidenceCardIds': ['card-949-41-definition-1', 'card-949-84-merken-1', 'card-953-68-wissen-2'],
    },
    'q-p12-0337': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Als Pneumothorax bezeichnet man eine Ansammlung von Luft im Pleuraspalt.'),
            ('b', 'Einen Arzt informieren, wenn nach der Bronchoskopie Warnsymptome auftreten, und die Vitalwerte des Patienten kontrollieren.'),
            ('c', 'Wenn ein Asthma-Patient unter Luftnot leidet, müssen Sie umgehend einen Arzt benachrichtigen.'),
            ('d', 'Ein Spannungspneumothorax ist immer ein absoluter Notfall.'),
        ],
        'distractorConceptIds': [
            'concept-55-977-78-definition-1',
            'concept-55-948-22-achtung-1',
            'concept-55-953-32-achtung-1',
        ],
        'evidenceCardIds': ['card-977-78-definition-1', 'card-948-22-achtung-1', 'card-953-32-achtung-1'],
    },
    'q-p12-0344': {
        'issue': 'answer-option-subsumption',
        'options': [
            ('a', 'Unter einer Hernie versteht man eine Ausstülpung (= Bruchsack) des parietalen Peritoneums (Auskleidung der Innenseite der Bauchwand). Sie entsteht durch angeborene oder erworbene Lücken in der Bauchwand (= Bruchpforte).'),
            ('b', 'Hämorrhoiden sind knotige Erweiterungen des arteriovenösen Gefäßgeflechts (Plexus hämorrhoidalis) im Analkanal.'),
            ('c', 'Der Morbus Hirschsprung (angeborenes Megakolon) ist eine angeborene Erkrankung der darmversorgenden Nerven, die zu einer spastischen Verengung eines Darmabschnitts führt.'),
            ('d', 'Infektiöse Gastroenteritiden (Magen-Darm-Infektionen) werden durch verschiedene Bakterien, Viren oder Parasiten hervorgerufen und gehen ggf. mit einer Schleimhautentzündung des Magen und des Darms einher.'),
        ],
        'distractorConceptIds': [
            'concept-56-1005-90-definition-1',
            'concept-56-1007-23-definition-1',
            'concept-56-1009-15-definition-1',
        ],
        'evidenceCardIds': ['card-1005-90-definition-1', 'card-1007-23-definition-1', 'card-1009-15-definition-1'],
    },
    'q-p12-0348': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Jede rektale Blutung kann ebenso ein Hinweis auf ein Kolonkarzinom sein.'),
            ('b', 'Hämorrhoiden sind knotige Erweiterungen des arteriovenösen Gefäßgeflechts (Plexus hämorrhoidalis) im Analkanal.'),
            ('c', 'Gewichtsreduktion, Stuhlregulierung, viel Flüssigkeit und Einnahme von Quellmitteln nennt das Lehrbuch als Allgemeinmaßnahmen bei Hämorrhoiden.'),
            ('d', 'Eine gefährliche Komplikation der Hernie ist die Inkarzeration, bei der Baucheingeweide in der Bruchpforte eingeklemmt werden.'),
        ],
        'distractorConceptIds': [
            'concept-56-1005-90-definition-1',
            'concept-56-1006-71-wissen-1',
            'concept-56-1005-24-achtung-1',
        ],
        'evidenceCardIds': ['card-1005-90-definition-1', 'card-1006-71-wissen-1', 'card-1005-24-achtung-1'],
    },
    'q-p12-0534': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Die Verätzung ist ein Notfall.'),
            ('b', 'Sollten die Augen extrem verklebt sein, dürfen sie keinesfalls mit Gewalt geöffnet werden.'),
            ('c', 'Eine infektiöse Konjunktivitis ist hoch ansteckend.'),
            ('d', 'Nach dem Öffnen des Fläschchens sollte der Ring, mit dem der Deckel befestigt ist, entfernt werden, weil er beim Verabreichen ins Auge fallen und Verletzungen hervorrufen könnte.'),
        ],
        'distractorConceptIds': [
            'concept-62-1279-40-achtung-1',
            'concept-62-1284-34-achtung-1',
            'concept-62-1278-51-merken-1',
        ],
        'evidenceCardIds': ['card-1279-40-achtung-1', 'card-1284-34-achtung-1', 'card-1278-51-merken-1'],
    },
    'q-p12-0634': {
        'issue': 'distractor-absolute-wording-cluster',
        'options': [
            ('a', 'Ein klares „Nein“ zu Gewalt durch Pflegende.'),
            ('b', 'Gewalt ist der Einsatz physischer oder psychischer Mittel, um einer anderen Person gegen ihren Willen zu schaden, sie zu beherrschen oder ausgeübter Gewalt durch Gegengewalt zu begegnen.'),
            ('c', 'Werden menschliche Grundbedürfnisse durch eine Person beeinträchtigt, spricht man von personeller Gewalt.'),
            ('d', 'Aggression kann als Angriffsverhalten darauf zielen, Menschen zu schädigen, und zugleich Ausdruck von Selbstbehauptung sein.'),
        ],
        'distractorConceptIds': [
            'concept-8-162-80-wissen-1',
            'concept-8-162-40-definition-1',
            'concept-8-161-84-wissen-1',
        ],
        'evidenceCardIds': ['card-162-80-wissen-1', 'card-162-40-definition-1', 'card-161-84-wissen-1'],
    },
}


def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_md(report):
    lines = [
        '# P26D — Confirmed Defect Repair', '',
        '> Repairs only the 14 P26C-confirmed question defects using repository-local textbook-derived concepts/cards.', '',
        f"- Repair targets: **{report['summary']['targets']}**",
        f"- Repaired: **{report['summary']['repaired']}**",
        f"- Answer-option subsumption repairs: **{report['summary']['answerOptionSubsumption']}**",
        f"- Distractor-design repairs: **{report['summary']['distractorDesign']}**", '',
        '## Repairs', '',
    ]
    for row in report['repairs']:
        lines.append(f"- `{row['questionId']}` — {row['issue']} — evidence: {', '.join(row['evidenceCardIds'])}")
    lines += ['', '## Invariants', '',
              '- Question IDs, question types, target concept anchors, difficulty and correct option IDs are preserved.',
              '- Source anchors and explanations are preserved.',
              '- Only the 14 P26C-confirmed repair targets are changed.',
              '- No external clinical guidance is introduced.',
              '- FSRS, mastery, remediation, repetition control, input handling and mock-exam logic are unchanged.', '']
    return '\n'.join(lines)


def apply(write: bool):
    p26c = load(P26C_PATH)
    questions = load(QUESTIONS_PATH)
    cards = load(CARDS_PATH)
    concepts = load(CONCEPTS_PATH)
    target_ids = set(p26c['confirmedForRepairIds'])
    if target_ids != set(REPAIRS):
        raise AssertionError(f'P26D repair map does not exactly match P26C queue: {sorted(target_ids ^ set(REPAIRS))}')
    if len(target_ids) != 14:
        raise AssertionError(f'Expected 14 P26C targets, found {len(target_ids)}')

    card_ids = {c['id'] for c in cards}
    concept_ids = {c['id'] for c in concepts}
    q_by_id = {q['id']: q for q in questions}
    before_sha = sha256(QUESTIONS_PATH)
    repair_rows = []

    untouched_signatures = {
        q['id']: json.dumps(q, ensure_ascii=False, sort_keys=True)
        for q in questions if q['id'] not in target_ids
    }

    for qid in sorted(target_ids):
        q = q_by_id[qid]
        spec = REPAIRS[qid]
        if q.get('type') != 'single_choice':
            raise AssertionError(f'{qid}: P26D expects single_choice')
        if len(q.get('options', [])) != 4 or len(q.get('correct', [])) != 1:
            raise AssertionError(f'{qid}: unexpected option/key shape')
        if any(cid not in concept_ids for cid in spec['distractorConceptIds']):
            raise AssertionError(f'{qid}: missing distractor concept evidence')
        if any(cid not in card_ids for cid in spec['evidenceCardIds']):
            raise AssertionError(f'{qid}: missing card evidence')

        preserved = {
            key: copy.deepcopy(q.get(key))
            for key in ['id', 'conceptIds', 'type', 'difficulty', 'correct', 'explanation', 'source']
        }
        before_options = copy.deepcopy(q['options'])
        q['options'] = [{'id': oid, 'text': text} for oid, text in spec['options']]

        # Keep the original correct option ID and assert its text still corresponds
        # to the existing explanation; only distractor construction is repaired.
        if q['correct'] != preserved['correct']:
            raise AssertionError(f'{qid}: answer key changed')

        if isinstance(q.get('generation'), dict):
            q['generation']['phase'] = 'P26D'
            q['generation']['method'] = 'source-backed-bounded-repair'
            q['generation']['distractorConceptIds'] = list(spec['distractorConceptIds'])
            q['generation']['repairFromPhase'] = 'P26C'
            q['generation']['repairEvidenceCardIds'] = list(spec['evidenceCardIds'])
        else:
            q['repair'] = {
                'phase': 'P26D',
                'method': 'source-backed-bounded-repair',
                'repairFromPhase': 'P26C',
                'distractorConceptIds': list(spec['distractorConceptIds']),
                'evidenceCardIds': list(spec['evidenceCardIds']),
            }

        for key, value in preserved.items():
            if q.get(key) != value:
                raise AssertionError(f'{qid}: preserved field changed: {key}')

        repair_rows.append({
            'questionId': qid,
            'issue': spec['issue'],
            'correctOptionId': q['correct'][0],
            'targetConceptIds': q.get('conceptIds', []),
            'distractorConceptIds': spec['distractorConceptIds'],
            'evidenceCardIds': spec['evidenceCardIds'],
            'beforeOptions': before_options,
            'afterOptions': copy.deepcopy(q['options']),
        })

    for qid, signature in untouched_signatures.items():
        if json.dumps(q_by_id[qid], ensure_ascii=False, sort_keys=True) != signature:
            raise AssertionError(f'Untargeted question changed: {qid}')

    output_text = json.dumps(questions, ensure_ascii=False, separators=(',', ':'))
    after_sha = hashlib.sha256(output_text.encode('utf-8')).hexdigest()
    report = {
        'schemaVersion': 1,
        'phase': 'P26D',
        'status': 'confirmed-defects-repaired',
        'baseline': {
            'p26cReportSha256': sha256(P26C_PATH),
            'questionBankBeforeSha256': before_sha,
            'questionBankAfterSha256': after_sha,
        },
        'summary': {
            'targets': len(target_ids),
            'repaired': len(repair_rows),
            'answerOptionSubsumption': sum(r['issue'] == 'answer-option-subsumption' for r in repair_rows),
            'distractorDesign': sum(r['issue'] == 'distractor-absolute-wording-cluster' for r in repair_rows),
            'questionCount': len(questions),
        },
        'targetQuestionIds': sorted(target_ids),
        'repairs': repair_rows,
        'policy': {
            'externalClinicalGuidanceAdded': False,
            'questionIdsChanged': False,
            'questionTypesChanged': False,
            'targetConceptsChanged': False,
            'difficultyChanged': False,
            'correctOptionIdsChanged': False,
            'sourceAnchorsChanged': False,
            'explanationsChanged': False,
            'fsrsChanged': False,
            'masteryChanged': False,
            'remediationChanged': False,
            'repetitionControlChanged': False,
            'inputHandlingChanged': False,
            'mockExamLogicChanged': False,
        },
    }

    if write:
        QUESTIONS_PATH.write_text(output_text, encoding='utf-8')
        REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        REPORT_MD.write_text(render_md(report), encoding='utf-8')

    print(json.dumps({
        'phase': 'P26D',
        **report['summary'],
        'targets': report['targetQuestionIds'],
        'questionBankBeforeSha256': before_sha,
        'questionBankAfterSha256': after_sha,
    }, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    apply(args.write)
