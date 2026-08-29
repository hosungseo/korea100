#!/usr/bin/env python3
"""Build the video's data assets from korea100 source data.

Every number and label in the composition comes from here — nothing is authored
by hand in the HTML. Re-run after the source JSON changes.
"""
import json, glob, os, re, collections

W = os.path.expanduser('~/korea100/web/data')
AX = os.path.expanduser('~/korea100/artifacts/ax-case-studies/cases')
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/assets'

def jload(p): return json.load(open(p))

# ---------- 1. AX cases (before/after block boards) ----------
SHORT = {
 'yebimon-travel-expense': {
   'P01':'출장계획서 작성','P02':'복무시스템 등록','P03':'출장명령','P04':'개산급 확인',
   'P05':'개산급 지급','P06':'출장 수행·보고','P07':'복명(결과보고)','P08':'카드결제·증빙',
   'P09':'운임 수작업 산정','P10':'정산신청 작성','P11':'지급기준 확인','P12':'정산 대사(수기)',
   'P13':'보완·재작성 반려','P14':'지출품의 기안','P15':'부서장 결재','P16':'회계부서 검토',
   'P17':'지출원인행위','P18':'e호조 입력','P19':'지출·지급명령','P20':'사후점검·가산징수',
   'A01':'영수증 촬영·업로드','A02':'유가 자동 수집','A03':'여비 자동 산출',
   'A04':'자동 매칭·검증','A05':'결과 PDF 생성'},
 'sejong-siren-disaster': {
   'P01':'상시 상황실 운영','P02':'다중 채널 감시','P03':'위험정보 즉시 통보',
   'P04':'매뉴얼 수기 검색','P05':'유형·심각성 판단','P06':'상황판단회의',
   'P07':'재난상황 보고','P08':'위기경보 발령','P09':'전파대상 수기 선정',
   'P10':'전파 문안 수기 작성','P11':'재난문자 발송','P12':'대피명령(필요시)',
   'P13':'대책본부 가동','P14':'실무반 편성','P15':'매뉴얼 발췌·임무 전달',
   'P16':'CCTV 관제','P17':'침수 육안 판독','P18':'피해 수기 집계','P19':'수습·상황 종결',
   'A01':'재난유형 AI 분류','A02':'전파대상 자동 선정','A03':'전파 문안 자동 생성',
   'A04':'임무카드 자동 배정','A05':'침수 AI 실시간 분석'},
 'predecessor-file-handover-recovery': {
   'P01':'보직 부여·발령','P02':'폴더 더미 인계','P03':'인계·인수서 작성',
   'P13':'인계·인수 결재','P14':'기능분류 자료 유지','P04':'폴더 하나씩 열기',
   'P05':'내 업무 추측','P06':'먼저 볼 문서 고르기','P07':'반복 시점 찾기',
   'P08':'다음 기한 추정','P09':'작년 순서 재구성','P10':'근거 문서 찾기',
   'P11':'전임자에게 전화','P12':'동료·부서장 확인',
   'A01':'문서 자동 클러스터링','A02':'먼저 읽을 문서 추천','A03':'업무 주기 자동 발견',
   'A04':'처리 순서 시각화','A05':'근거 문서 1클릭 출처'},
}

def build_case(slug, title, org, note):
    d = jload(f'{AX}/{slug}.json')
    short = SHORT[slug]
    status, target = {}, {}
    for n in d['tobe']['nodes']:
        if n[3] == 'replaced':
            status[n[0]] = 'replaced'; target[n[0]] = n[6].split('로')[0].strip()
        elif n[3] in ('removed', 'changed', 'auto'):
            status[n[0]] = n[3]
    ai_lane = len(d['lanes'])
    def lay(nodes, force_lane=None):
        seen = collections.Counter(); out = []
        for n in nodes:
            nid, g, lane = n[0], n[1], n[2]
            if force_lane is not None: lane = force_lane
            slot = seen[(lane, g)]; seen[(lane, g)] += 1
            out.append({'id': nid, 'g': g, 'lane': lane, 'slot': slot,
                        'name': short.get(nid, n[4])[:16],
                        'st': status.get(nid, 'stay'), 'tg': target.get(nid)})
        return out
    asis = lay(d['asis']['nodes'])
    autos = lay([n for n in d['tobe']['nodes'] if n[0].startswith('A')], force_lane=ai_lane)
    calls = []
    for b in asis:
        if b['st'] == 'replaced':
            a = next(x for x in autos if x['id'] == b['tg'])
            calls.append(f"{b['name']} → <b>{a['name']}</b>")
    hl = d['tobe']['headline']
    return {'slug': slug, 'title': title, 'org': org, 'note': note,
            'lanes': [l.replace('/', '·')[:12] for l in d['lanes']] + [d['toolLane'][:12]],
            'gates': [g.split(' ', 1)[1] if ' ' in g else g for g in d['gates']],
            'asis': asis, 'autos': autos, 'calls': calls, 'headline': hl,
            'stats': [s.split('(')[0].strip() for s in hl.split('—')[0].split('·')],
            'result': hl.split('—')[-1].strip()}

cases = [
 build_case('yebimon-travel-expense', 'AI 여비몬 — 관외출장 여비 정산',
            '전남광주통합특별시 · 7급 주무관 제작', '규정상 의무의 이행을 자동화'),
 build_case('sejong-siren-disaster', 'AI 세종사이렌 — 재난 상황 판단·전파',
            '세종특별자치시 재난안전상황실', '판단과 전파를 초 단위로'),
 build_case('predecessor-file-handover-recovery', '눈치코치 — 전임자 자료 인수인계',
            '전보 후임자의 업무 파악', '전임자 머릿속에 있던 그림을 복원'),
]

# ---------- 1.5 data.js : EIA swimlane + institution registry ----------
def build_k100():
    d = jload(f'{W}/institutions/environmental-impact-assessment.json')
    p = d['process']
    lanes = [l.replace('/', '·') for l in p['lanes']]
    stages = [s.split(' ', 1) for s in p['stages']]
    nodes = []
    for n in p['nodes']:
        lb = n.get('legal_basis') or []
        nodes.append({'id': n['id'], 'lane': p['lanes'].index(n['lane']),
                      'stage': p['stages'].index(n['stage']), 'name': n['name'],
                      'basis': lb[0]['article'] if lb else ''})
    edges = [{'s': e['source'], 't': e['target'], 'type': e['type']}
             for e in p['edges']]
    files = sorted(glob.glob(f'{W}/institutions/*.json'))
    names = []
    for fp in files:
        names.append(jload(fp)['name'])
    # 타일은 장식용 배경 — 길면 옆 타일을 침범하므로 표시용으로 자른다
    tile_names = [n if len(n) <= 13 else n[:12] + '…' for n in names[:60]]
    return {'lanes': lanes, 'stages': stages, 'nodes': nodes, 'edges': edges,
            'instNames': tile_names, 'instCount': len(files)}

k100 = build_k100()

# ---------- 2. montage : two more institutions, same method ----------
def mini(slug):
    d = jload(f'{W}/institutions/{slug}.json'); p = d['process']
    lanes, stages = p['lanes'], p['stages']
    seen = collections.Counter(); nodes = []
    for n in p['nodes']:
        lane, g = lanes.index(n['lane']), stages.index(n['stage'])
        slot = seen[(lane, g)]; seen[(lane, g)] += 1
        nodes.append({'lane': lane, 'g': g, 'slot': slot, 'name': n['name'][:14]})
    clean = lambda x: re.sub(r'\(.*', '', x.replace('/', '·')).strip()[:10]
    return {'name': d['name'], 'lanes': [clean(l) for l in lanes],
            'gates': [s.split(' ', 1)[1] if ' ' in s else s for s in stages],
            'nodes': nodes, 'count': len(p['nodes'])}

# 샘플2·3: 소상공인 정책자금(중기부) · 공장설립승인(반도체 클러스터 조성 관련).
# 각 샘플은 환경영향평가처럼 '법령 원문 → 구조도' 2비트로 보여주므로 조문 원문을 붙인다.
# 원문은 tools/fetch-laws.py 가 law.go.kr DRF 에서 받아 둔 캐시(assets/laws.json)만 읽는다.
LAWS = jload(f'{OUT}/laws.json')


def strip_rev(t):
    return re.sub(r'\s*<개정[^>]*>\s*', ' ', t).strip()


def law_block(law_name, art_no, markers):
    """markers: 'main'=조문 첫 문장, 그 외에는 문단 접두어(①, 2. 등) 일치."""
    law = next(l for l in LAWS if l['name'] == law_name)
    art = next(a for a in law['articles'] if a['article'] == art_no)
    paras = []
    for mk in markers:
        if mk == 'main':
            paras.append(strip_rev(art['paragraphs'][0]))
        else:
            paras.append(strip_rev(next(
                p for p in art['paragraphs'] if p.startswith(mk))))
    return {'law': law_name, 'article': art['article'], 'title': art['title'],
            'effective': law['effective'], 'paras': paras}


montage = [mini('small-business-policy-fund'), mini('factory-establishment')]
montage[0]['law'] = law_block('소상공인 보호 및 지원에 관한 법률', '제9조', ['main', '2.', '6.'])
montage[1]['law'] = law_block('산업집적활성화 및 공장설립에 관한 법률', '제13조', ['①', '④'])

# ---------- 3. mega detail : how 1,281 was counted ----------
mp = jload(f'{W}/mega-projects/projects/gwangju-semiconductor-cluster.json')
node = next(n for n in mp['nodes'] if n['id'] == 'N37')
detail = []
for ref in node['templateRefs']:
    inst = jload(f"{W}/institutions/{ref['institution']}.json")
    want = set(ref.get('nodeIds') or [])
    for pn in inst['process']['nodes']:
        if not want or pn['id'] in want:
            detail.append({'name': pn['name'][:22], 'actor': pn['actor'][:14],
                           'inst': inst['name'][:20]})
mega_detail = {'milestone': node['name'], 'authority': node['authority'],
               'stage': next(s['label'] for s in mp['stages'] if s['id'] == node['stage']),
               'procs': detail[:12], 'instCount': len(node['templateRefs'])}

# ---------- 3.5 mega stats : 한 판 전체 수치 (전부 소스에서 계산) ----------
mega_insts, mega_procs = set(), 0
for n in mp['nodes']:
    for ref in n.get('templateRefs') or []:
        mega_insts.add(ref['institution'])
        inst = jload(f"{W}/institutions/{ref['institution']}.json")
        want = set(ref.get('nodeIds') or [])
        mega_procs += sum(1 for pn in inst['process']['nodes']
                          if not want or pn['id'] in want)
wm = jload(os.path.expanduser('~/korea100/web/public/warroom/map/data.json'))
rev_hard = collections.defaultdict(list)
for e in wm['edges']:
    if e.get('strength') == 'hard':
        rev_hard[e['to']].append(e['from'])
wst = {n['id']: n['status'] for n in wm['nodes']}
n_done = sum(1 for n in wm['nodes'] if n['status'] == 'completed')
n_live = sum(1 for n in wm['nodes'] if n['status'] == 'active')
n_unk = sum(1 for n in wm['nodes'] if n['status'] == 'unknown')
frontier = sum(1 for n in wm['nodes'] if n['status'] == 'planned'
               and all(wst.get(u) == 'completed' for u in rev_hard[n['id']]))
n_wait = sum(1 for n in wm['nodes'] if n['status'] == 'planned') - frontier
mega_stats = {
    'gates': len(mp['stages']), 'milestones': len(mp['nodes']),
    'institutions': len(mega_insts), 'procs': mega_procs,
    'done': n_done, 'live': n_live, 'frontier': frontier, 'unknown': n_unk,
    'waiting': n_wait,
    # 루프 성장 전/후 (2026-08-26 영상 초판 시점 값은 당시 소스 스냅샷 실측)
    'loopBefore': {'milestones': 49, 'institutions': 586, 'procs': 1281},
}

# ---------- write ----------
os.makedirs(OUT, exist_ok=True)
with open(f'{OUT}/data.js', 'w') as f:
    f.write('window.K100 = ' + json.dumps(k100, ensure_ascii=False) + ';\n')
with open(f'{OUT}/cases.js', 'w') as f:
    f.write('window.CASES = ' + json.dumps(cases, ensure_ascii=False) + ';\n')
with open(f'{OUT}/montage.js', 'w') as f:
    f.write('window.MONTAGE = ' + json.dumps(montage, ensure_ascii=False) + ';\n')
with open(f'{OUT}/megadetail.js', 'w') as f:
    f.write('window.MEGADETAIL = ' + json.dumps(mega_detail, ensure_ascii=False) + ';\n')
with open(f'{OUT}/megastats.js', 'w') as f:
    f.write('window.MEGASTATS = ' + json.dumps(mega_stats, ensure_ascii=False) + ';\n')

for c in cases:
    print(f"{c['slug']}: lanes {len(c['lanes'])} gates {len(c['gates'])} asis {len(c['asis'])} autos {len(c['autos'])} calls {len(c['calls'])} | {c['result']}")
print(f"k100: {len(k100['nodes'])} EIA nodes, {len(k100['edges'])} edges, instCount {k100['instCount']}, instNames {len(k100['instNames'])}")
for m in montage: print(f"montage {m['name']}: {m['count']} nodes, {len(m['lanes'])} lanes x {len(m['gates'])} gates | {m['law']['law']} {m['law']['article']}({m['law']['title']}) paras {len(m['law']['paras'])}")
print('megadetail:', mega_detail['milestone'], '|', len(mega_detail['procs']), 'procs |', mega_detail['stage'])
