#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""coordination — 부처를 가로지르는 제도만 따로 뽑아 그린 조정 지도.

5층 지도(layers.svg)에서 3층과 4층 사이를 크게 가로지르던 노란 다발의 정체를
해부한다. 제도 532건 가운데 둘 이상의 부처에 걸친 126건만 남기고,
그 제도들이 어느 부처와 어느 부처를 묶는지를 원 위의 현(弦)으로 그린다.

현이 굵을수록 두 부처가 함께 걸린 제도가 많다는 뜻이다. 조직도에는 선이 없지만
법령에는 이미 이어져 있는 관계이므로, 여기가 부처 간 조정이 실제로 필요한 자리다.

사용: python3 artifacts/org-atlas/coordination.py
출력: artifacts/org-atlas/coordination.svg
"""
import html, itertools, json, math, os
from collections import Counter, defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(REPO, "web", "data", "org-lineage")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "coordination.svg")

CAT_COLORS = {
    "국토·환경·안전": "#34d399", "복지와 사회보험": "#f472b6",
    "인허가·규제·산업": "#2dd4bf", "노동·교육·인적자원": "#fbbf24",
    "지방자치와 지역": "#a78bfa", "재정과 예산": "#5aa9e6",
    "다부처·복합사업": "#8b93c8", "연구개발·행정": "#22d3ee",
    "데이터·디지털·공공서비스": "#60a5fa", "민원·권리구제·참여": "#7bc47f",
    "외교·국방·치안·생활 기반": "#fb7185", "금융·소비자": "#d4a017",
    "문화·체육·관광": "#e879c8", "국가 운영과 권력 통제": "#9ca3af",
}
DEFAULT = "#8b95a5"

CX, CY, R = 1180, 1290, 830
PANEL_X = 2180
PANEL_W = 980


def esc(s):
    return html.escape(str(s or ""))


def seriate(ministries, pair):
    """세게 얽힌 부처끼리 원 위에서 이웃하도록 순서를 잡는다.
    가장 많이 등장하는 부처에서 출발해, 아직 안 놓인 것 중 지금까지 놓인 것들과
    가장 강하게 이어진 부처를 차례로 붙인다. 현의 교차가 줄어 읽기 쉬워진다."""
    strength = defaultdict(int)
    for (a, b), c in pair.items():
        strength[a] += c
        strength[b] += c
    remaining = set(ministries)
    order = [max(remaining, key=lambda m: (strength[m], m))]
    remaining.discard(order[0])
    while remaining:
        nxt = max(remaining, key=lambda m: (
            sum(pair.get(tuple(sorted((m, o))), 0) for o in order[-3:]),
            sum(pair.get(tuple(sorted((m, o))), 0) for o in order),
            strength[m], m))
        order.append(nxt)
        remaining.discard(nxt)
    return order


def main():
    gw = json.load(open(os.path.join(D, "gov-wide.json"), encoding="utf-8"))
    multi = {s: v for s, v in gw["bySlug"].items()
             if len({u["ministry"] for u in v["units"]}) > 1}

    pair, appear = Counter(), Counter()
    for v in multi.values():
        ms = sorted({u["ministry"] for u in v["units"]})
        for m in ms:
            appear[m] += 1
        for a, b in itertools.combinations(ms, 2):
            pair[(a, b)] += 1

    order = seriate(list(appear), pair)
    n = len(order)
    ang = {m: -math.pi / 2 + 2 * math.pi * i / n for i, m in enumerate(order)}

    def pt(m, rad=R):
        a = ang[m]
        return CX + rad * math.cos(a), CY + rad * math.sin(a)

    span = Counter(len({u["ministry"] for u in v["units"]}) for v in multi.values())
    wide = sorted(multi.items(),
                  key=lambda kv: (-len({u["ministry"] for u in kv[1]["units"]}), kv[1]["name"]))

    HEIGHT = 2620
    WIDTH = PANEL_X + PANEL_W + 80

    out = []
    A = out.append
    A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
      f'viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">')
    A(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#0e121a"/>')

    A('<text x="80" y="92" fill="#f0f4f9" font-size="46" font-weight="800">부처를 가로지르는 제도</text>')
    A('<text x="80" y="134" fill="#ffd166" font-size="21" font-weight="700">'
      '조직도에는 선이 없지만 법령에는 이미 이어져 있는 자리</text>')
    A(f'<text x="80" y="170" fill="#8b95a5" font-size="15">'
      f'제도 {len(gw["bySlug"])}건 가운데 둘 이상의 부처에 걸친 {len(multi)}건만 남겼다 · '
      f'부처 {n}곳이 {len(pair)}가지 쌍으로 묶인다</text>')
    A(f'<text x="80" y="196" fill="#5d6779" font-size="13">'
      f'현이 굵을수록 두 부처가 함께 걸린 제도가 많다. 원 위의 자리는 세게 얽힌 부처끼리 '
      f'이웃하도록 배열했으므로, 짧은 현은 가까운 관계이고 원을 가로지르는 긴 현은 먼 부처끼리의 결합이다.</text>')

    mx_pair = max(pair.values())

    # 현 — 약한 것부터 그려 강한 것이 위에 오게 한다
    for (a, b), c in sorted(pair.items(), key=lambda kv: kv[1]):
        pa, pb = pt(a), pt(b)
        # 중심 쪽으로 당긴 제어점. 두 점이 멀수록 더 깊게 휘어 원 안을 지난다.
        d = math.dist(pa, pb) / (2 * R)
        k = 0.12 + 0.55 * (1 - d)
        ctrl = (CX + ((pa[0] + pb[0]) / 2 - CX) * k, CY + (((pa[1] + pb[1]) / 2) - CY) * k)
        w = 0.7 + 5.0 * (c / mx_pair)
        op = 0.20 + 0.62 * (c / mx_pair)
        col = "#ffd166" if c >= 9 else ("#7bc47f" if c >= 5 else "#4d6a94")
        A(f'<path d="M{pa[0]:.1f},{pa[1]:.1f} Q{ctrl[0]:.1f},{ctrl[1]:.1f} {pb[0]:.1f},{pb[1]:.1f}" '
          f'fill="none" stroke="{col}" stroke-width="{w:.2f}" opacity="{op:.2f}"/>')

    # 부처 노드와 라벨
    mx_app = max(appear.values())
    for m in order:
        x, y = pt(m)
        c = appear[m]
        r = 4 + math.sqrt(c) * 2.6
        A(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="#e9f0fb" opacity="0.92">'
          f'<title>{esc(m)} — 다부처 제도 {c}건</title></circle>')
        a = ang[m]
        lx, ly = CX + (R + 22) * math.cos(a), CY + (R + 22) * math.sin(a)
        deg = math.degrees(a)
        flip = 90 < (deg % 360) < 270
        anchor = "end" if flip else "start"
        rot = deg + 180 if flip else deg
        size = 15 if c >= 10 else (13 if c >= 5 else 11.5)
        fill = "#f0f4f9" if c >= 10 else ("#c3cddb" if c >= 5 else "#8b95a5")
        A(f'<text x="{lx:.1f}" y="{ly:.1f}" fill="{fill}" font-size="{size}" '
          f'font-weight="{700 if c >= 10 else 500}" text-anchor="{anchor}" '
          f'transform="rotate({rot:.1f} {lx:.1f} {ly:.1f})">{esc(m)} {c}</text>')

    # 중앙 요약
    A(f'<text x="{CX}" y="{CY-16}" fill="#e9f0fb" font-size="34" font-weight="800" '
      f'text-anchor="middle">{len(multi)}건</text>')
    A(f'<text x="{CX}" y="{CY+12}" fill="#8b95a5" font-size="14" text-anchor="middle">'
      f'부처를 가로지르는 제도</text>')

    # 원 안쪽 빈 곳에 현 읽는 법을 둔다
    lx, ly = CX - R * 0.62, CY + R * 0.42
    A(f'<text x="{lx:.0f}" y="{ly:.0f}" fill="#7f8a9a" font-size="13" font-weight="800">현 읽는 법</text>')
    for k, (col, label) in enumerate([("#ffd166", "함께 걸린 제도 9건 이상"),
                                      ("#7bc47f", "5~8건"),
                                      ("#4d6a94", "4건 이하")]):
        yy = ly + 24 + k * 22
        A(f'<line x1="{lx:.0f}" y1="{yy-4:.0f}" x2="{lx+34:.0f}" y2="{yy-4:.0f}" '
          f'stroke="{col}" stroke-width="{4.5 - k*1.4:.1f}"/>')
        A(f'<text x="{lx+44:.0f}" y="{yy:.0f}" fill="#aab4c4" font-size="12">{esc(label)}</text>')
    A(f'<text x="{lx:.0f}" y="{ly+100:.0f}" fill="#5d6779" font-size="12">'
      f'원의 아래쪽이 성긴 것은 우연이 아니다.</text>')
    A(f'<text x="{lx:.0f}" y="{ly+118:.0f}" fill="#5d6779" font-size="12">'
      f'부처 대부분은 다른 부처와 한두 건만 얽히고,</text>')
    A(f'<text x="{lx:.0f}" y="{ly+136:.0f}" fill="#5d6779" font-size="12">'
      f'가로지르기는 위쪽 소수 부처에 몰려 있다.</text>')

    # 가장 두꺼운 삼각형에 이름을 붙인다
    tri = ["소방청", "해양경찰청", "행정안전부"]
    if all(m in ang for m in tri):
        tx = sum(pt(m)[0] for m in tri) / 3
        ty = sum(pt(m)[1] for m in tri) / 3
        # 주석은 현이 성긴 왼쪽 안쪽에 두고 지시선으로 삼각형을 가리킨다
        ax, ay = CX - R * 0.66, CY - R * 0.24
        A(f'<circle cx="{tx:.0f}" cy="{ty:.0f}" r="7" fill="none" stroke="#ffd166" '
          f'stroke-width="1.5" opacity="0.9"/>')
        A(f'<path d="M{tx-7:.0f},{ty:.0f} Q{(tx+ax)/2:.0f},{ty+40:.0f} {ax+250:.0f},{ay-18:.0f}" '
          f'fill="none" stroke="#ffd166" stroke-width="1" opacity="0.5"/>')
        A(f'<text x="{ax:.0f}" y="{ay:.0f}" fill="#ffd166" font-size="15" font-weight="700">'
          f'재난 삼각형</text>')
        A(f'<text x="{ax:.0f}" y="{ay+21:.0f}" fill="#aab4c4" font-size="12.5">'
          f'소방청 · 해양경찰청 · 행정안전부가 서로 19건씩 물렸다.</text>')
        A(f'<text x="{ax:.0f}" y="{ay+39:.0f}" fill="#aab4c4" font-size="12.5">'
          f'세 기관 모두와 굵게 이어진 유일한 삼각 구조이고,</text>')
        A(f'<text x="{ax:.0f}" y="{ay+57:.0f}" fill="#aab4c4" font-size="12.5">'
          f'재난 대응이 셋으로 나뉘어 있다는 사실이 제도 단위에서 드러난다.</text>')

    # ── 오른쪽 패널
    py = 300

    def panel(title, sub, h):
        nonlocal py
        A(f'<rect x="{PANEL_X}" y="{py}" width="{PANEL_W}" height="{h}" rx="14" '
          f'fill="#121824" stroke="#212a3a"/>')
        A(f'<text x="{PANEL_X+22}" y="{py+30}" fill="#e3e9f1" font-size="16" '
          f'font-weight="800">{esc(title)}</text>')
        A(f'<text x="{PANEL_X+22}" y="{py+51}" fill="#7f8a9a" font-size="12">{esc(sub)}</text>')
        top = py + 74
        py += h + 20
        return top

    # 1) 몇 개 부처에 걸치나
    top = panel("몇 개 부처에 걸치나", f"다부처 제도 {len(multi)}건의 분포", 150)
    bw = (PANEL_W - 60) / max(len(span), 1)
    mxs = max(span.values())
    for k, (sz, c) in enumerate(sorted(span.items())):
        h = 52 * c / mxs
        bx = PANEL_X + 30 + k * bw
        A(f'<rect x="{bx:.0f}" y="{top+56-h:.0f}" width="{bw-16:.0f}" height="{h:.0f}" rx="4" '
          f'fill="#ffd166" opacity="{0.35 + 0.5*sz/7:.2f}"/>')
        A(f'<text x="{bx+(bw-16)/2:.0f}" y="{top+50-h:.0f}" fill="#c3cddb" font-size="11.5" '
          f'text-anchor="middle">{c}</text>')
        A(f'<text x="{bx+(bw-16)/2:.0f}" y="{top+72:.0f}" fill="#7f8a9a" font-size="11" '
          f'text-anchor="middle">{sz}개 부처</text>')

    # 2) 가장 자주 얽히는 쌍
    rows = pair.most_common(12)
    top = panel("가장 자주 얽히는 부처 쌍", "함께 걸린 제도 수", 26 * len(rows) + 96)
    for k, ((a, b), c) in enumerate(rows):
        yy = top + k * 26
        A(f'<text x="{PANEL_X+22}" y="{yy+10}" fill="#c3cddb" font-size="12.5">'
          f'{esc(a)} ↔ {esc(b)}</text>')
        w = (PANEL_W - 420) * c / mx_pair
        A(f'<rect x="{PANEL_X+PANEL_W-160-(PANEL_W-420):.0f}" y="{yy+1}" width="{w:.0f}" '
          f'height="10" rx="5" fill="#ffd166" opacity="0.75"/>')
        A(f'<text x="{PANEL_X+PANEL_W-22}" y="{yy+10}" fill="#8b95a5" font-size="11.5" '
          f'text-anchor="end">{c}건</text>')
    A(f'<text x="{PANEL_X+22}" y="{top + 26*len(rows) + 4}" fill="#8b95a5" font-size="12">'
      f'소방청·해양경찰청·행정안전부가 서로 19건씩 물려 하나의 삼각형을 이룬다. 재난 대응이 '
      f'세 기관에 나뉘어 있다는 사실이 제도 단위에서 그대로 드러난다.</text>')

    # 3) 가장 널리 걸친 제도
    show = [kv for kv in wide if len({u["ministry"] for u in kv[1]["units"]}) >= 4]
    top = panel("가장 널리 걸친 제도", f"4개 부처 이상에 걸린 {len(show)}건", 42 * len(show) + 74)
    for k, (slug, v) in enumerate(show):
        yy = top + k * 42
        ms = sorted({u["ministry"] for u in v["units"]})
        col = CAT_COLORS.get(v.get("category"), DEFAULT)
        A(f'<rect x="{PANEL_X+22}" y="{yy-9}" width="4" height="30" rx="2" fill="{col}"/>')
        A(f'<text x="{PANEL_X+34}" y="{yy+3}" fill="#e3e9f1" font-size="13" '
          f'font-weight="700">{esc(v["name"])}</text>')
        A(f'<text x="{PANEL_X+PANEL_W-22}" y="{yy+3}" fill="#ffd166" font-size="12" '
          f'font-weight="700" text-anchor="end">{len(ms)}개 부처</text>')
        A(f'<text x="{PANEL_X+34}" y="{yy+21}" fill="#8b95a5" font-size="11.5">'
          f'{esc(" · ".join(ms))}</text>')

    A(f'<text x="80" y="{HEIGHT-40}" fill="#5d6779" font-size="12">'
      f'연결 기준: 제도가 인용한 법령의 법제처 소관부처. 공동소관 법령과, 한 제도가 여러 부처의 '
      f'법령을 함께 인용하는 경우가 모두 포함된다 · 조직 출처: 부처별 직제·시행규칙</text>')
    A("</svg>")

    svg = "\n".join(out)
    open(OUT, "w", encoding="utf-8").write(svg)
    print(f"저장: {OUT} — {WIDTH}×{HEIGHT}px, {len(svg)//1024}KB · "
          f"제도 {len(multi)} · 부처 {n} · 쌍 {len(pair)}")


if __name__ == "__main__":
    main()
