"""Rigenera data/exercises-index.json dal dataset hasaneyldrm/exercises-dataset.

Uso:
  git clone --depth 1 --filter=blob:none --sparse https://github.com/hasaneyldrm/exercises-dataset /tmp/ds
  (cd /tmp/ds && git sparse-checkout set data)
  python3 scripts/build-index.py /tmp/ds/data/exercises.json
"""
import json, os, sys

src = sys.argv[1] if len(sys.argv) > 1 else 'exercises.json'
data = json.load(open(src, encoding='utf-8'))
out = []
for x in data:
    out.append({
        'id': x['id'],
        'n': x['name'],
        'm': os.path.splitext(os.path.basename(x['image']))[0],   # es. 0652-lBDjFxJ
        'it': (x.get('instructions') or {}).get('it', ''),
        'tg': x.get('target', ''),
        'mg': x.get('muscle_group', ''),
        'sec': x.get('secondary_muscles') or [],
        'eq': x.get('equipment', ''),
        'bp': x.get('body_part', ''),
    })
dst = os.path.join(os.path.dirname(__file__), '..', 'data', 'exercises-index.json')
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'esercizi scritti in', os.path.normpath(dst))
