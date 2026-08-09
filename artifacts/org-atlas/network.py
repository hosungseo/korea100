#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""org-network — 제도 연결망을 주인공으로 그린 대형 SVG.

전개도(atlas-wide)가 "조직이 제도를 어떻게 나눠 맡는가"를 줄 세워 보여준다면,
이 지도는 순서를 버리고 **제도끼리 어떻게 묶이는가**를 배치 자체로 보여준다.

- 노드 = 제도. 크기는 수행 단계 수, 색은 그 제도를 맡는 실·본부.
- 엣지 = 카드의 related 결합. 색은 그 결합이 조직 경계를 넘는 정도.
- 배치 = Fruchterman-Reingold 힘기반. 초기 위치를 인덱스로 정해 매 실행 동일하다.
- 군집 = 라벨 전파. 연결망이 스스로 만드는 덩어리가 직제 조직과 겹치는지 본다.

관계가 하나도 없는 제도는 본 그래프를 왜곡하므로 아래쪽 별도 구역에 눕힌다.

사용: python3 artifacts/org-atlas/network.py
출력: artifacts/org-atlas/network.svg
"""
import html, json, math, os
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(REPO, "web", "data", "org-lineage")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "network.svg")

BUREAU_COLORS = {
    "재난안전관리본부": "#e8a33d",
    "자치혁신실": "#a78bfa",
    "지방재정경제실": "#5aa9e6",
    "인공지능정부실": "#4dd0c4",
    "참여혁신조직실": "#7bc47f",
}
BUREAU_DEFAULT = "#8b95a5"

REL_LEVELS = [
    ("cross-bureau", "다른 실·본부", "#ffd166"),
    ("same-bureau", "같은 실·본부", "#7bc47f"),
    ("same-div", "같은 국", "#5aa9e6"),
    ("same-unit", "같은 과", "#54607a"),
]
REL_COLOR = {k: c for k, _, c in REL_LEVELS}

W, H = 2400, 2000          # 그래프 영역
PAD_TOP = 300
ISO_TOP = PAD_TOP + H + 90  # 고립 제도 구역


def esc(s):
    return html.escape(str(s or ""))


def layout(nodes, edges, iterations=600, w=W, h=H):
    """Fruchterman-Reingold. 난수 없이 인덱스로 초기 배치해 결과가 재현된다."""
    n = len(nodes)
    if n == 0:
        return {}
    k = math.sqrt(w * h / n) * 0.85
    pos = {}
    for idx, v in enumerate(nodes):
        # 황금각 나선 — 겹침 없이 고르게 흩어진 결정적 초기 배치
        a = idx * 2.399963229728653
        r = (w * 0.42) * math.sqrt((idx + 0.5) / n)
        pos[v] = [w / 2 + r * math.cos(a), h / 2 + r * math.sin(a) * (h / w)]

    adj = defaultdict(set)
    for a, b in edges:
        adj[a].add(b); adj[b].add(a)

    t = w * 0.06
    cool = t / (iterations + 1)
    for _ in range(iterations):
        disp = {v: [0.0, 0.0] for v in nodes}
        # 척력: 크기 k²/d, 방향은 두 점을 잇는 단위벡터
        for i in range(n):
            vi = nodes[i]
            for j in range(i + 1, n):
                vj = nodes[j]
                dx = pos[vi][0] - pos[vj][0]
                dy = pos[vi][1] - pos[vj][1]
                d = math.hypot(dx, dy)
                if d < 1e-3:
                    dx, dy, d = 0.01 * (i - j + 1), 0.01 * (j - i + 1), 1e-2
                f = k * k / d
                ux, uy = dx / d, dy / d
                disp[vi][0] += ux * f; disp[vi][1] += uy * f
                disp[vj][0] -= ux * f; disp[vj][1] -= uy * f
        # 인력: 크기 d²/k
        for a, b in edges:
            dx = pos[a][0] - pos[b][0]
            dy = pos[a][1] - pos[b][1]
            d = math.hypot(dx, dy) or 1e-3
            f = d * d / k
            ux, uy = dx / d, dy / d
            disp[a][0] -= ux * f; disp[a][1] -= uy * f
            disp[b][0] += ux * f; disp[b][1] += uy * f
        # 이동 + 냉각 + 약한 중심 인력
        for v in nodes:
            dx, dy = disp[v]
            d = math.hypot(dx, dy) or 1e-3
            pos[v][0] += dx / d * min(d, t)
            pos[v][1] += dy / d * min(d, t)
            pos[v][0] += (w / 2 - pos[v][0]) * 0.004
            pos[v][1] += (h / 2 - pos[v][1]) * 0.004
        t -= cool

    # 반복 중에는 가두지 않는다. 경계에 눌린 덩어리가 생기기 때문이다.
    # 대신 끝난 뒤 전체를 화면에 맞춰 등비 축소한다 — 상대 거리와 뭉침이 보존된다.
    pad = 90
    xs = [p[0] for p in pos.values()]
    ys = [p[1] for p in pos.values()]
    span_x = (max(xs) - min(xs)) or 1
    span_y = (max(ys) - min(ys)) or 1
    scale = min((w - 2 * pad) / span_x, (h - 2 * pad) / span_y)
    ox = (w - span_x * scale) / 2 - min(xs) * scale
    oy = (h - span_y * scale) / 2 - min(ys) * scale
    for v in pos:
        pos[v][0] = pos[v][0] * scale + ox
        pos[v][1] = pos[v][1] * scale + oy
    return pos


def label_propagation(nodes, adj, rounds=40):
    """결정적 라벨 전파. 동률이면 라벨 문자열 순으로 끊어 재현성을 지킨다."""
    label = {v: v for v in nodes}
    order = sorted(nodes)
    for _ in range(rounds):
        changed = False
        for v in order:
            if not adj[v]:
                continue
            cnt = defaultdict(int)
            for u in adj[v]:
                cnt[label[u]] += 1
            best = max(sorted(cnt), key=lambda l: (cnt[l], l))
            if label[v] != best:
                label[v] = best; changed = True
        if not changed:
            break
    return label


def main():
    xwalk = json.load(open(os.path.join(D, "mois.json"), encoding="utf-8"))
    nodesrc = json.load(open(os.path.join(D, "mois-nodes.json"), encoding="utf-8"))

    inst = {}
    for slug, info in xwalk["bySlug"].items():
        nd = nodesrc["bySlug"].get(slug)
        bureaus = {u["path"][3] for u in info["units"] if len(u["path"]) > 3}
        divs = {u["path"][4] for u in info["units"] if len(u["path"]) > 4}
        inst[slug] = {
            "slug": slug, "name": info["name"],
            "units": {u["unit"] for u in info["units"]},
            "bureau": sorted(bureaus)[0] if bureaus else "직속",
            "bureaus": bureaus, "divs": divs,
            "steps": len(nd["nodes"]) if nd else 0,
            "ratio": nd.get("internalRatio", 0) if nd else 0,
            "outside": len(info.get("relatedOutside", [])),
        }

    pairs = [(a, b) for a, b in xwalk["relations"] if a in inst and b in inst]
    adj = defaultdict(set)
    for a, b in pairs:
        adj[a].add(b); adj[b].add(a)

    connected = sorted([s for s in inst if adj[s]])
    isolated = sorted([s for s in inst if not adj[s]], key=lambda s: -inst[s]["steps"])

    pos = layout(connected, pairs)
    comm = label_propagation(connected, adj)
    comm_size = defaultdict(int)
    for v in connected:
        comm_size[comm[v]] += 1

    def level(a, b):
        ia, ib = inst[a], inst[b]
        if ia["units"] & ib["units"]:
            return "same-unit"
        if ia["divs"] & ib["divs"]:
            return "same-div"
        if ia["bureaus"] & ib["bureaus"]:
            return "same-bureau"
        return "cross-bureau"

    rel_count = defaultdict(int)
    for a, b in pairs:
        rel_count[level(a, b)] += 1

    # 군집이 조직 경계와 겹치는가: 각 군집의 대표 실·본부 점유율
    purity_num = 0
    for c in comm_size:
        members = [v for v in connected if comm[v] == c]
        bc = defaultdict(int)
        for v in members:
            bc[inst[v]["bureau"]] += 1
        purity_num += max(bc.values())
    purity = purity_num / max(len(connected), 1)

    iso_cols = 7
    iso_rows = (len(isolated) + iso_cols - 1) // iso_cols
    HEIGHT = ISO_TOP + iso_rows * 34 + 300
    WIDTH = W + 120

    out = []
    A = out.append
    A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
      f'viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">')
    A(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#0e121a"/>')

    A('<text x="60" y="78" fill="#f0f4f9" font-size="44" font-weight="800">행정안전부 제도 연결망</text>')
    A('<text x="60" y="118" fill="#5aa9e6" font-size="20" font-weight="700">'
      '줄을 세우지 않고, 제도끼리 묶이는 모양 그대로 놓았을 때의 지도</text>')
    A(f'<text x="60" y="152" fill="#8b95a5" font-size="14.5">'
      f'제도 {len(inst)}건 · 결합 {len(pairs)}쌍 · 연결된 제도 {len(connected)}건이 하나의 덩어리를 이루고, '
      f'관계가 하나도 없는 제도 {len(isolated)}건은 아래에 따로 두었다</text>')
    A(f'<text x="60" y="176" fill="#5d6779" font-size="12.5">'
      f'배치는 힘기반(Fruchterman-Reingold) — 결합이 많을수록 가까이 끌리고 아니면 밀려난다. '
      f'좌표에 의미는 없고 거리와 뭉침에만 의미가 있다. 초기 배치를 인덱스로 고정해 매번 같은 그림이 나온다.</text>')

    # 범례
    lx = 60
    A(f'<text x="{lx}" y="{PAD_TOP-104}" fill="#7f8a9a" font-size="12" font-weight="800">노드 색 = 소관 실·본부</text>')
    lx += 190
    for b, c in BUREAU_COLORS.items():
        A(f'<circle cx="{lx}" cy="{PAD_TOP-108}" r="6" fill="{c}"/>')
        A(f'<text x="{lx+12}" y="{PAD_TOP-104}" fill="#aab4c4" font-size="12">{esc(b)}</text>')
        lx += 22 + len(b) * 13
    A(f'<circle cx="{lx}" cy="{PAD_TOP-108}" r="6" fill="{BUREAU_DEFAULT}"/>')
    A(f'<text x="{lx+12}" y="{PAD_TOP-104}" fill="#aab4c4" font-size="12">그 밖</text>')

    lx = 60
    A(f'<text x="{lx}" y="{PAD_TOP-72}" fill="#7f8a9a" font-size="12" font-weight="800">선 색 = 결합이 넘는 경계</text>')
    lx += 190
    for key, label, col in REL_LEVELS:
        A(f'<line x1="{lx}" y1="{PAD_TOP-76}" x2="{lx+22}" y2="{PAD_TOP-76}" stroke="{col}" stroke-width="2"/>')
        A(f'<text x="{lx+28}" y="{PAD_TOP-72}" fill="#aab4c4" font-size="12">'
          f'{esc(label)} {rel_count[key]}</text>')
        lx += 60 + len(label) * 13
    A(f'<text x="60" y="{PAD_TOP-40}" fill="#5d6779" font-size="12">'
      f'노드 크기 = 수행 단계 수 · 테두리가 밝은 노드 = 결합 8개 이상인 허브</text>')

    A(f'<g transform="translate(60,{PAD_TOP})">')
    # 엣지 먼저
    for a, b in pairs:
        lv = level(a, b)
        col = REL_COLOR[lv]
        op = 0.8 if lv == "cross-bureau" else (0.5 if lv == "same-bureau" else 0.3)
        A(f'<line x1="{pos[a][0]:.1f}" y1="{pos[a][1]:.1f}" x2="{pos[b][0]:.1f}" y2="{pos[b][1]:.1f}" '
          f'stroke="{col}" stroke-width="{1.5 if lv=="cross-bureau" else 1.0}" opacity="{op}"/>')
    # 노드
    labels = []
    for v in connected:
        i = inst[v]
        deg = len(adj[v])
        r = 5 + math.sqrt(i["steps"]) * 1.55
        col = BUREAU_COLORS.get(i["bureau"], BUREAU_DEFAULT)
        hub = deg >= 8
        edge_attr = ' stroke="#f0f4f9" stroke-width="1.8"' if hub else ""
        tip = f'{i["name"]} — 결합 {deg} · {i["steps"]}단계 · {i["bureau"]}'
        A(f'<circle cx="{pos[v][0]:.1f}" cy="{pos[v][1]:.1f}" r="{r:.1f}" fill="{col}" '
          f'opacity="0.9"{edge_attr}><title>{esc(tip)}</title></circle>')
        labels.append((deg, hub, i, pos[v], r))
    # 라벨은 노드를 다 그린 뒤, 겹치지 않는 자리에만 놓는다.
    # 밀집 구역에서 글자가 서로를 덮으면 읽을 수 없으므로 차수가 큰 것부터 자리를 잡는다.
    placed = []

    def fits(bx, by, bw, bh):
        for px2, py2, pw2, ph2 in placed:
            if bx < px2 + pw2 and px2 < bx + bw and by < py2 + ph2 and py2 < by + bh:
                return False
        return True

    for deg, hub, i, p2, r in sorted(labels, key=lambda t: (-t[0], t[2]["name"])):
        size = 13 if hub else 11
        text = i["name"]
        tw = len(text) * size * 0.98
        th = size + 4
        for dy, anchor in ((-r - 6, "bottom"), (r + size + 3, "top")):
            bx, by = p2[0] - tw / 2, p2[1] + dy - size
            if fits(bx, by, tw, th):
                placed.append((bx, by, tw, th))
                weight = ' font-weight="700"' if hub else ""
                fill = "#e3e9f1" if hub else "#93a0b3"
                A(f'<text x="{p2[0]:.1f}" y="{p2[1] + dy:.1f}" fill="{fill}" '
                  f'font-size="{size}"{weight} text-anchor="middle">{esc(text)}</text>')
                break

    A('</g>')

    # 고립 제도 구역
    A(f'<text x="60" y="{ISO_TOP-34}" fill="#e3e9f1" font-size="18" font-weight="800">'
      f'연결망 밖의 제도 {len(isolated)}건</text>')
    A(f'<text x="60" y="{ISO_TOP-12}" fill="#8b95a5" font-size="12.5">'
      f'카드에 관련 제도가 하나도 적히지 않은 제도다. 정말 홀로 서는 제도인지, '
      f'아직 관계를 적지 않은 것인지는 구분해야 한다.</text>')
    cw = (W - 40) / iso_cols
    for k, s in enumerate(isolated):
        i = inst[s]
        cx = 60 + (k % iso_cols) * cw
        cy = ISO_TOP + 22 + (k // iso_cols) * 34
        col = BUREAU_COLORS.get(i["bureau"], BUREAU_DEFAULT)
        A(f'<rect x="{cx}" y="{cy-15}" width="{cw-16}" height="24" rx="7" fill="#141a24" '
          f'stroke="{col}" stroke-opacity="0.5"/>')
        A(f'<rect x="{cx}" y="{cy-15}" width="4" height="24" rx="2" fill="{col}"/>')
        A(f'<text x="{cx+11}" y="{cy+2}" fill="#c3cddb" font-size="11.5">{esc(i["name"])}</text>')

    # 하단 요약
    sy = ISO_TOP + iso_rows * 34 + 60
    A(f'<rect x="60" y="{sy}" width="{W-40}" height="176" rx="14" fill="#121824" stroke="#212a3a"/>')
    A(f'<text x="82" y="{sy+32}" fill="#e3e9f1" font-size="16" font-weight="800">연결망이 말하는 것</text>')
    hubs = sorted(connected, key=lambda v: (-len(adj[v]), v))[:6]
    hub_text = ", ".join("{}({})".format(inst[v]["name"], len(adj[v])) for v in hubs)
    lines = [
        ("#ffd166", f'허브 — {hub_text}'),
        ("#5aa9e6", f'연결된 {len(connected)}건이 끊기지 않은 한 덩어리다. 성분이 갈라지지 않는다는 것은 '
                    f'제도들이 서로를 참조하며 이어져 있다는 뜻이다.'),
        ("#7bc47f", f'연결망이 스스로 만든 군집 {len(comm_size)}개. 각 군집을 하나의 실·본부로 덮으면 '
                    f'{purity*100:.0f}%가 설명된다 — 연결망과 직제가 그만큼 겹친다.'),
        ("#8b95a5", f'관계가 없는 제도 {len(isolated)}건, 행안부 밖으로 뻗는 결합 '
                    f'{sum(i["outside"] for i in inst.values())}건.'),
    ]
    for k, (col, t) in enumerate(lines):
        yy = sy + 62 + k * 27
        A(f'<circle cx="{88}" cy="{yy-4}" r="4.5" fill="{col}"/>')
        A(f'<text x="104" y="{yy}" fill="#c3cddb" font-size="12.5">{esc(t)}</text>')

    A(f'<text x="60" y="{HEIGHT-40}" fill="#5d6779" font-size="12">'
      f'결합 출처: korea100 제도 카드의 related · 조직 출처: 행정안전부와 그 소속기관 직제·시행규칙 [시행 2026-07-21]</text>')
    A("</svg>")

    svg = "\n".join(out)
    open(OUT, "w", encoding="utf-8").write(svg)
    print(f"저장: {OUT} — {WIDTH}×{HEIGHT}px, {len(svg)//1024}KB · "
          f"연결 {len(connected)} · 고립 {len(isolated)} · 군집 {len(comm_size)} · 순도 {purity*100:.0f}%")


if __name__ == "__main__":
    main()
