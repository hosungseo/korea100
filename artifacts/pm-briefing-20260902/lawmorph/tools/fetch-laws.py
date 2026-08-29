#!/usr/bin/env python3
"""law.go.kr DRF에서 몽타주 샘플 2·3의 조문 원문을 취득해 캐시로 굽는다.

빌드 전 1회 실행 → assets/laws.json 생성. 렌더 시 네트워크 접근 금지 원칙이므로
gen-assets.py 는 이 캐시만 읽는다 (없으면 몽타주 원문 화면 생성 불가로 실패).
"""
import json, os, re, sys, urllib.parse, urllib.request

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/assets/laws.json'

# (법령명, 대표 조문 번호 목록) — 몽타주 샘플의 '법령 원문' 화면에 쓸 조문
TARGETS = [
    ('소상공인 보호 및 지원에 관한 법률', ['제9조']),
    ('산업집적활성화 및 공장설립에 관한 법률', ['제13조']),
]


def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def find_law_id(name):
    q = urllib.parse.quote(name)
    d = get_json(f'https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&type=JSON&query={q}&display=20')
    rows = d.get('LawSearch', {}).get('law', [])
    if isinstance(rows, dict):
        rows = [rows]
    for row in rows:
        if row.get('법령명한글', '').strip() == name and row.get('현행연혁코드') == '현행':
            return row['법령ID'], row['법령일련번호'], row
    raise SystemExit(f'현행 법령을 찾지 못함: {name}')


def norm(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def extract_article(detail, art_no):
    """조문단위에서 art_no(예: 제9조) 본문 + 항 텍스트를 뽑는다."""
    units = detail['법령']['조문']['조문단위']
    if isinstance(units, dict):
        units = [units]
    for u in units:
        content = norm(u.get('조문내용', ''))
        if not content.startswith(art_no + '('):
            continue
        paras = u.get('항')
        texts = []
        if paras:
            if isinstance(paras, dict):
                paras = [paras]
            for p in paras:
                t = norm(p.get('항내용', ''))
                if t:
                    texts.append(t)
                hos = p.get('호')
                if hos:
                    if isinstance(hos, dict):
                        hos = [hos]
                    for h in hos:
                        ht = norm(h.get('호내용', ''))
                        if ht:
                            texts.append(ht)
        m = re.match(r'(제[0-9의조]+조(?:의\d+)?)\(([^)]+)\)\s*(.*)', content)
        head, title, rest = m.group(1), m.group(2), m.group(3)
        if rest:
            texts.insert(0, rest)
        return {'article': head, 'title': title, 'paragraphs': texts}
    raise SystemExit(f'조문을 찾지 못함: {art_no}')


def main():
    out = []
    for name, arts in TARGETS:
        law_id, mst, row = find_law_id(name)
        detail = get_json(
            f'https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&type=JSON&MST={mst}')
        basic = detail['법령']['기본정보']
        entry = {
            'name': name,
            'lawId': law_id,
            'promulgated': basic.get('공포일자'),
            'effective': basic.get('시행일자'),
            'articles': [extract_article(detail, a) for a in arts],
        }
        out.append(entry)
        print(f"{name}: 시행 {entry['effective']} / " +
              ' · '.join(f"{a['article']}({a['title']}) 문단 {len(a['paragraphs'])}" for a in entry['articles']))
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('->', OUT)


if __name__ == '__main__':
    main()
