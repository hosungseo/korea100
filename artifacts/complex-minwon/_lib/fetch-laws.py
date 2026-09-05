#!/opt/homebrew/bin/python3.14
# 법제처 DRF 현행본(eflaw + efYd) 조문 수집기 — laws/<법령명>.json 스냅샷 생성. OC는 ~/.openclaw/secrets/law-go-kr-oc.
"""law.go.kr DRF helper: resolve current effective version (eflaw) and dump articles.

Usage:
  drf.py search <법령명>            -> list versions with 현행연혁코드
  drf.py fetch <법령명> [asOf]      -> resolve current version, save JSON to laws/<name>.json
  drf.py art <법령명> <조문번호...>  -> print articles (e.g. 11 12 4의2)
  drf.py admrul <행정규칙ID> <이름>  -> 행정규칙(고시·훈령) 스냅샷 (평면 텍스트를 조·항·호로 재구성)
"""
import sys, re, json, os, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path

OC = Path(os.path.expanduser('~/.openclaw/secrets/law-go-kr-oc')).read_text().strip()
BASE = 'https://www.law.go.kr/DRF'
HERE = Path(__file__).parent
LAWS = Path.cwd() / 'laws'  # 사례 폴더에서 실행 → 그 폴더의 laws/
LAWS.mkdir(exist_ok=True)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode('utf-8', 'replace')

def search(name):
    q = urllib.parse.quote(name)
    x = get(f'{BASE}/lawSearch.do?OC={OC}&target=eflaw&type=XML&query={q}&display=100')
    rows = []
    for m in re.finditer(r'<law[^>]*>(.*?)</law>', x, re.S):
        b = m.group(1)
        def g(t):
            mm = re.search(r'<%s>(.*?)</%s>' % (t, t), b, re.S)
            return (mm.group(1) if mm else '').replace('<![CDATA[', '').replace(']]>', '').strip()
        rows.append(dict(name=g('법령명한글'), id=g('법령ID'), mst=g('법령일련번호'),
                         pub=g('공포일자'), eff=g('시행일자'), status=g('현행연혁코드')))
    return rows

def resolve(name, as_of='20260903'):
    rows = [r for r in search(name) if r['name'] == name]
    if not rows:
        raise SystemExit(f'no exact match for {name}')
    cur = [r for r in rows if r['status'] == '현행']
    if cur:
        return cur[0], rows
    ok = sorted([r for r in rows if r['eff'] <= as_of], key=lambda r: r['eff'])
    return ok[-1], rows

def fetch(name, as_of='20260903'):
    ver, rows = resolve(name, as_of)
    x = get(f"{BASE}/lawService.do?OC={OC}&target=eflaw&type=XML&MST={ver['mst']}&efYd={ver['eff']}")
    root = ET.fromstring(x)
    arts = []
    for u in root.iter('조문단위'):
        def t(tag):
            e = u.find(tag)
            return (e.text or '').strip() if e is not None else ''
        if t('조문여부') != '조문':
            continue
        item = dict(no=t('조문번호'), branch=t('조문가지번호'), title=t('조문제목'),
                    body=t('조문내용'), eff=t('조문시행일자'), paras=[])
        for h in u.findall('항'):
            hn = (h.findtext('항번호') or '').strip()
            hb = (h.findtext('항내용') or '').strip()
            hos = []
            for ho in h.findall('호'):
                hos.append(dict(no=(ho.findtext('호번호') or '').strip(),
                                body=(ho.findtext('호내용') or '').strip(),
                                mok=[(m.findtext('목내용') or '').strip() for m in ho.findall('목')]))
            item['paras'].append(dict(no=hn, body=hb, hos=hos))
        arts.append(item)
    meta = dict(name=name, mst=ver['mst'], eff=ver['eff'], pub=ver['pub'], status=ver['status'],
                pending=[r for r in rows if r['status'] == '시행예정'])
    out = dict(meta=meta, articles=arts)
    (LAWS / f'{name}.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"saved {name}: MST {ver['mst']} eff {ver['eff']} ({ver['status']}), {len(arts)} articles, pending {len(meta['pending'])}")
    return out


CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

def fetch_admrul(rule_id, name):
    """행정규칙(고시·훈령)은 조문내용이 평면 문자열이라 조·항·호 경계를 직접 긋는다. 법령과 같은 JSON 스키마로 저장."""
    x = get(f'{BASE}/lawService.do?OC={OC}&target=admrul&type=XML&ID={rule_id}')
    t = re.sub(r'<!\[CDATA\[|\]\]>', '', x)
    items = [re.sub(r'<[^>]+>', '', i).strip() for i in re.findall(r'<조문내용>(.*?)</조문내용>', t, re.S)]
    eff = (re.search(r'<시행일자>(\d+)</시행일자>', t) or [None, ''])[1]
    arts = []
    cur = None
    for it in items:
        for line in it.split('\n'):
            line = line.rstrip()
            if not line.strip() or re.match(r'\s*제\d+[장절]\s', line):
                continue
            m = re.match(r'\s*제(\d+)조(?:의(\d+))?\((.+?)\)\s*(.*)$', line)
            if m:
                cur = dict(no=m.group(1), branch=m.group(2) or '0', title=m.group(3), body='', eff=eff, paras=[])
                arts.append(cur)
                line = m.group(4)
                if not line.strip():
                    continue
            if cur is None:
                continue  # 장·절 제목 줄은 어느 조문에도 넣지 않는다
            s2 = re.sub(r'\s*제\d+[장절]\s.*$', '', line.strip())
            if s2 and s2[0] in CIRC:
                cur['paras'].append(dict(no=s2[0], body=s2, hos=[]))
            elif re.match(r'^\d+(의\d+)?\.\s', s2):
                ho = dict(no=re.match(r'^(\d+(?:의\d+)?)\.', s2).group(1) + '.', body=s2, mok=[])
                if cur['paras']:
                    cur['paras'][-1]['hos'].append(ho)
                else:  # 항 없는 조문의 호: 가상의 단일 항으로 묶지 않고 body 뒤 호로 둔다
                    cur.setdefault('_hos', []).append(ho)
            else:
                if cur['paras']:
                    cur['paras'][-1]['body'] += ' ' + s2
                else:
                    cur['body'] = (cur['body'] + ' ' + s2).strip()
    for a in arts:
        if a.get('_hos'):
            a['paras'].append(dict(no='①', body=a['body'], hos=a.pop('_hos')))
    meta = dict(name=name, mst=rule_id, eff=eff, pub='', status='현행(행정규칙)', pending=[])
    (LAWS / f'{name}.json').write_text(json.dumps(dict(meta=meta, articles=arts), ensure_ascii=False, indent=1))
    print(f'saved admrul {name}: ID {rule_id} eff {eff}, {len(arts)} articles')

def key(no, branch):
    return no + ('의' + branch if branch and branch != '0' else '')

def show(name, nos):
    d = json.loads((LAWS / f'{name}.json').read_text())
    want = set(nos)
    for a in d['articles']:
        k = key(a['no'], a['branch'])
        if k in want:
            print(f"\n### {name} 제{k}조 {a['title']}  [시행 {a['eff']}]")
            if a['body']:
                print(a['body'])
            for p in a['paras']:
                print(p['no'], p['body'])
                for ho in p['hos']:
                    print('   ', ho['no'], ho['body'])
                    for m in ho['mok']:
                        print('       ', m)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'search':
        for r in search(sys.argv[2]):
            print(r)
    elif cmd == 'fetch':
        fetch(sys.argv[2], *(sys.argv[3:4]))
    elif cmd == 'admrul':
        fetch_admrul(sys.argv[2], sys.argv[3])
    elif cmd == 'art':
        show(sys.argv[2], sys.argv[3:])
