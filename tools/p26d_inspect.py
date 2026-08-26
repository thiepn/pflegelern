#!/usr/bin/env python3
import json
from pathlib import Path
from collections import defaultdict

ROOT=Path(__file__).resolve().parents[1]
report=json.loads((ROOT/'reports/P26C_MANUAL_REVIEW_ADJUDICATION.json').read_text(encoding='utf-8'))
questions=json.loads((ROOT/'data/questions.json').read_text(encoding='utf-8'))
concepts=json.loads((ROOT/'data/concepts.json').read_text(encoding='utf-8'))
cards=json.loads((ROOT/'data/cards.json').read_text(encoding='utf-8'))
q_by={q['id']:q for q in questions}
c_by={c['id']:c for c in concepts}
cards_by_concept=defaultdict(list)
for card in cards:
    ids=list(card.get('conceptIds') or [])
    if card.get('conceptId'): ids.append(card['conceptId'])
    for cid in ids:
        cards_by_concept[cid].append(card)

for qid in report['confirmedForRepairIds']:
    q=q_by[qid]
    target_concepts=[c_by[cid] for cid in q.get('conceptIds',[]) if cid in c_by]
    print('\n===',qid,'===')
    print(json.dumps(q,ensure_ascii=False,indent=2))
    print('TARGET_CONCEPTS')
    for c in target_concepts:
        print(json.dumps(c,ensure_ascii=False,indent=2))
    section_ids={c.get('sectionId') for c in target_concepts if c.get('sectionId')}
    chapter_ids={c.get('chapterId') for c in target_concepts if c.get('chapterId')}
    target_ids=set(q.get('conceptIds',[]))
    pool=[]
    for c in concepts:
        if c['id'] in target_ids: continue
        scope=0
        if c.get('sectionId') in section_ids: scope=2
        elif c.get('chapterId') in chapter_ids: scope=1
        if not scope: continue
        for card in cards_by_concept.get(c['id'],[]):
            back=card.get('back') or card.get('answer') or card.get('text')
            front=card.get('front') or card.get('prompt') or card.get('question')
            if back and front:
                pool.append((scope,c.get('type',''),c['id'],c.get('title',''),card['id'],front,back))
    pool=sorted(pool,key=lambda x:(-x[0],x[2],x[4]))[:24]
    print('CANDIDATES')
    for item in pool:
        print(json.dumps({'scope':'same-section' if item[0]==2 else 'same-chapter','conceptType':item[1],'conceptId':item[2],'title':item[3],'cardId':item[4],'front':item[5],'back':item[6]},ensure_ascii=False))
