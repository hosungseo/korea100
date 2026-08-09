#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""layers — 정부를 다섯 층으로 쌓아 올린 등각 투영 지도.

가로로 펼친 지도(atlas-wide, gov-wide)는 "무엇이 무엇 옆에 있는가"를 말한다.
이 지도는 층을 쌓아 "무엇이 무엇 위에 얹혀 있는가"를 말한다.

  1층 정부        하나
  2층 부처        47
  3층 실·국       191
  4층 제도        532
  5층 수행 주체    실제로 그 단계를 움직이는 쪽

위의 세 층은 조직이고 아래 두 층은 일이다. 제도는 조직에 매달려 있지만,
그 일을 실제로 하는 것은 대개 조직 바깥이라는 사실이 층 사이 선의 색으로 드러난다.

사용: python3 artifacts/org-atlas/layers.py
출력: artifacts/org-atlas/layers.svg
"""
import html, json, math, os
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(REPO, "web", "data", "org-lineage")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "layers.svg")

CAT_COLORS = {
    "국토·환경·안전": "#34d399", "복지와 사회보험": "#f472b6",
    "인허가·규제·산업": "#2dd4bf", "노동·교육·인적자원": "#fbbf24",
    "지방자치와 지역": "#a78bfa", "재정과 예산": "#5aa9e6",
    "다부처·복합사업": "#8b93c8", "연구개발·행정": "#22d3ee",
    "데이터·디지털·공공서비스": "#60a5fa", "민원·권리구제·참여": "#7bc47f",
    "외교·국방·치안·생활 기반": "#fb7185", "금융·소비자": "#d4a017",
    "문화·체육·관광": "#e879c8", "국가 운영과 권력 통제": "#9ca3af",
}
PERF = [
    ("public", "국민·민간", "#ef8f8f"),
    ("local-gov", "지방자치단체", "#5ec8d8"),
    ("central-gov", "중앙행정기관", "#4d8fd6"),
    ("committee", "위원회·심의회", "#c792ea"),
    ("public-org", "공공기관·전문기관", "#d98cc0"),
    ("court", "법원·검찰", "#f0a868"),
    ("council", "의회·선관위", "#e8a33d"),
    ("system", "시스템", "#4dd0c4"),
    ("ministry", "행정안전부", "#7bc47f"),
    ("other", "미분류", "#4a5464"),
]
PERF_COLOR = {k: c for k, _, c in PERF}
PERF_LABEL = {k: l for k, l, _ in PERF}
DEFAULT = "#8b95a5"

# 등각 투영: 평면 위 (u, v)를 화면 (x, y)로 옮긴다. v가 깊이(뒤쪽)다.
PLANE_W = 2120
PLANE_D = 470
SKEW_X, SKEW_Y = 0.60, 0.33
X0 = 330   # 왼쪽에 층 이름을 놓을 여백
LAYER_GAP = 640
TOP = 400


def proj(u, v, layer_y):
    return X0 + u * PLANE_W + v * SKEW_X, layer_y + v * SKEW_Y


def esc(s):
    return html.escape(str(s or ""))


def spread(items, rows):
    """u는 순서를 따르고 v는 여러 줄로 접어 한 평면에 눕힌다."""
    n = max(len(items), 1)
    per = math.ceil(n / rows)
    out = {}
    for i, key in enumerate(items):
        r = i // per
        c = i % per
        out[key] = (c / max(per - 1, 1), r / max(rows - 1, 1) * PLANE_D)
    return out


def main():
    gw = json.load(open(os.path.join(D, "gov-wide.json"), encoding="utf-8"))
    by_slug = gw["bySlug"]

    # 층 구성
    min_order = list(gw["ministryInstitutionCounts"])          # 제도 수 순
    unit_of_min = defaultdict(list)
    for key, v in gw["byUnit"].items():
        unit_of_min[v["ministry"]].append(key)
    units_order = [u for m in min_order for u in sorted(unit_of_min.get(m, []),
                                                        key=lambda k: -len(gw["byUnit"][k]["institutions"]))]
    unit_index = {u: i for i, u in enumerate(units_order)}

    inst_order = sorted(
        by_slug,
        key=lambda s: (min(unit_index.get(f'{u["ministry"]} › {u["unit"]}', 10 ** 6)
                           for u in by_slug[s]["units"]), by_slug[s]["name"]))

    perf_totals = defaultdict(int)
    for v in by_slug.values():
        for k, c in v["performerMix"].items():
            perf_totals[k] += c
    perf_order = [k for k, _, _ in PERF if perf_totals.get(k)]

    LY = {name: TOP + i * LAYER_GAP for i, name in
          enumerate(["gov", "ministry", "unit", "inst", "perf"])}

    pos_min = {m: proj(*spread(min_order, 3)[m], LY["ministry"]) for m in min_order}
    pos_unit = {u: proj(*spread(units_order, 5)[u], LY["unit"]) for u in units_order}
    pos_inst = {s: proj(*spread(inst_order, 9)[s], LY["inst"]) for s in inst_order}
    pos_perf = {}
    sp = spread(perf_order, 1)
    for k in perf_order:
        pos_perf[k] = proj(sp[k][0], PLANE_D * 0.5, LY["perf"])
    pos_gov = proj(0.5, PLANE_D * 0.5, LY["gov"])

    HEIGHT = round(LY["perf"] + PLANE_D * SKEW_Y + 420)
    WIDTH = round(X0 + PLANE_W + PLANE_D * SKEW_X + 160)

    out = []
    A = out.append
    A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
      f'viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">')
    A(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#0e121a"/>')

    m0 = gw["meta"]
    A('<text x="80" y="92" fill="#f0f4f9" font-size="48" font-weight="800">정부의 다섯 층</text>')
    A('<text x="80" y="136" fill="#5aa9e6" font-size="21" font-weight="700">'
      '조직 위에 제도가 얹히고, 제도 아래에서 실제로 일하는 쪽은 대개 조직 바깥이다</text>')
    A(f'<text x="80" y="172" fill="#8b95a5" font-size="15">'
      f'부처 {m0["ministryCount"]} · 실·국 등 단위 {m0["unitCount"]} · 제도 {m0["institutionCount"]} · '
      f'수행 단계 {sum(perf_totals.values()):,}</text>')
    A(f'<text x="80" y="198" fill="#5d6779" font-size="13">'
      f'위 세 층은 직제가 정한 조직이고, 아래 두 층은 법령이 정한 일이다. '
      f'층과 층을 잇는 선은 소속이 아니라 근거다 — 제도가 인용한 법령의 소관을 따라 이었다.</text>')

    LAYER_META = [
        ("gov", "1층 · 정부", f"{m0['ministryCount']}개 부처를 합쳐 하나"),
        ("ministry", "2층 · 부처", f"{m0['ministryCount']}곳"),
        ("unit", "3층 · 실·국", f"{m0['unitCount']}개 단위"),
        ("inst", "4층 · 제도", f"{m0['institutionCount']}건 — 색은 분류"),
        ("perf", "5층 · 수행 주체", f"{sum(perf_totals.values()):,}개 단계를 누가 움직이나"),
    ]

    # 층 바닥면
    for key, title, sub in LAYER_META:
        y = LY[key]
        p1 = proj(0, 0, y); p2 = proj(1, 0, y)
        p3 = proj(1, PLANE_D, y); p4 = proj(0, PLANE_D, y)
        A(f'<path d="M{p1[0]:.0f},{p1[1]:.0f} L{p2[0]:.0f},{p2[1]:.0f} '
          f'L{p3[0]:.0f},{p3[1]:.0f} L{p4[0]:.0f},{p4[1]:.0f} Z" '
          f'fill="#141b28" fill-opacity="0.55" stroke="#26314a" stroke-width="1.2"/>')
        lx = X0 - 46
        ly = y + PLANE_D * SKEW_Y * 0.5
        A(f'<text x="{lx:.0f}" y="{ly:.0f}" fill="#dbe6f5" font-size="20" '
          f'font-weight="800" text-anchor="end">{esc(title)}</text>')
        A(f'<text x="{lx:.0f}" y="{ly+22:.0f}" fill="#6f7c8c" font-size="12.5" '
          f'text-anchor="end">{esc(sub)}</text>')

    def link(a, b, col, op, w=0.8):
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        A(f'<path d="M{a[0]:.1f},{a[1]:.1f} C{a[0]:.1f},{my:.1f} {b[0]:.1f},{my:.1f} '
          f'{b[0]:.1f},{b[1]:.1f}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}"/>')

    # 1→2, 2→3
    for m in min_order:
        link(pos_gov, pos_min[m], "#3d4c68", 0.5, 1.0)
    for u in units_order:
        m = gw["byUnit"][u]["ministry"]
        if m in pos_min:
            link(pos_min[m], pos_unit[u], "#33425e", 0.45)

    # 3→4 : 제도가 여러 단위에 걸리면 선도 여러 갈래
    for s in inst_order:
        v = by_slug[s]
        col = CAT_COLORS.get(v.get("category"), DEFAULT)
        multi = len({u["ministry"] for u in v["units"]}) > 1
        for u in v["units"]:
            key = f'{u["ministry"]} › {u["unit"]}'
            if key in pos_unit:
                link(pos_unit[key], pos_inst[s], "#ffd166" if multi else col,
                     0.32 if multi else 0.18, 0.75 if multi else 0.55)

    # 4→5 : 그 제도에서 가장 많은 단계를 움직이는 쪽으로 잇는다
    for s in inst_order:
        mix = by_slug[s]["performerMix"]
        if not mix:
            continue
        dom = max(mix, key=lambda k: (mix[k], k))
        if dom in pos_perf:
            link(pos_inst[s], pos_perf[dom], PERF_COLOR.get(dom, DEFAULT), 0.3, 0.7)

    # 노드
    A(f'<rect x="{pos_gov[0]-120:.0f}" y="{pos_gov[1]-26:.0f}" width="240" height="52" rx="16" '
      f'fill="#1d2b44" stroke="#4a6da3" stroke-width="1.6"/>')
    A(f'<text x="{pos_gov[0]:.0f}" y="{pos_gov[1]+7:.0f}" fill="#e9f0fb" font-size="21" '
      f'font-weight="800" text-anchor="middle">대한민국 정부</text>')

    counts = gw["ministryInstitutionCounts"]
    for m in min_order:
        x, y = pos_min[m]
        n = counts[m]
        fs = 11.5 if n >= 9 else 10
        w = max(26 + math.sqrt(n) * 12, len(m) * fs * 1.02 + 16)
        A(f'<rect x="{x-w/2:.1f}" y="{y-11:.1f}" width="{w:.1f}" height="22" rx="7" '
          f'fill="#22304a" stroke="#4a6da3" stroke-opacity="{0.85 if n >= 9 else 0.5}"/>')
        A(f'<text x="{x:.1f}" y="{y+4:.1f}" fill="{"#dbe6f5" if n >= 9 else "#a9b6cc"}" '
          f'font-size="{fs}" font-weight="{700 if n >= 9 else 500}" text-anchor="middle">'
          f'{esc(m)}</text>')

    for u in units_order:
        x, y = pos_unit[u]
        n = len(gw["byUnit"][u]["institutions"])
        r = 2.6 + math.sqrt(n) * 1.5
        A(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="#7f96c4" opacity="0.85">'
          f'<title>{esc(u)} — 제도 {n}</title></circle>')
        if n >= 20:
            A(f'<text x="{x:.1f}" y="{y-r-5:.1f}" fill="#aab4c4" font-size="10" '
              f'text-anchor="middle">{esc(u.split(" › ")[-1])}</text>')

    for s in inst_order:
        x, y = pos_inst[s]
        v = by_slug[s]
        col = CAT_COLORS.get(v.get("category"), DEFAULT)
        multi = len({u["ministry"] for u in v["units"]}) > 1
        r = 2.2 + math.sqrt(max(v.get("steps", 0), 1)) * 0.5
        A(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{col}" opacity="0.9"'
          + (' stroke="#ffd166" stroke-width="1.1"' if multi else '') + '>'
          f'<title>{esc(v["name"])} — {esc(", ".join(v["ministries"]))} · {v.get("steps",0)}단계</title></circle>')

    for k in perf_order:
        x, y = pos_perf[k]
        c = perf_totals[k]
        w = 34 + math.sqrt(c) * 3.4
        col = PERF_COLOR[k]
        A(f'<rect x="{x-w/2:.1f}" y="{y-17:.1f}" width="{w:.1f}" height="34" rx="10" '
          f'fill="{col}" fill-opacity="0.22" stroke="{col}" stroke-opacity="0.9" stroke-width="1.4"/>')
        A(f'<text x="{x:.1f}" y="{y-1:.1f}" fill="#e9f0fb" font-size="12.5" '
          f'font-weight="700" text-anchor="middle">{esc(PERF_LABEL[k])}</text>')
        A(f'<text x="{x:.1f}" y="{y+13:.1f}" fill="#aab4c4" font-size="11" '
          f'text-anchor="middle">{c:,}단계 · {c/sum(perf_totals.values())*100:.0f}%</text>')

    # 하단 요약
    sy = LY["perf"] + PLANE_D * SKEW_Y + 90
    A(f'<rect x="80" y="{sy}" width="{PLANE_W + 240}" height="180" rx="14" fill="#121824" stroke="#212a3a"/>')
    A(f'<text x="106" y="{sy+34}" fill="#e3e9f1" font-size="17" font-weight="800">층을 내려가며 읽기</text>')
    multi_n = sum(1 for v in by_slug.values() if len({u["ministry"] for u in v["units"]}) > 1)
    gov_side = sum(perf_totals.get(k, 0) for k in ("ministry", "central-gov", "local-gov", "council"))
    tot = sum(perf_totals.values())
    lines = [
        ("#7f96c4", f'2→3층 : 부처 {m0["ministryCount"]}곳이 실·국 {m0["unitCount"]}개로 갈라진다. '
                    f'제도가 가장 많이 걸린 단위는 행정안전부 자치분권국이다.'),
        ("#ffd166", f'3→4층 : 제도 {multi_n}건은 한 부처에 매달리지 않고 여러 부처로 뻗는다(노란 선). '
                    f'조직도만 봐서는 보이지 않는 연결이다.'),
        ("#ef8f8f", f'4→5층 : 단계 {tot:,}개 가운데 행정이 직접 쥔 것은 {gov_side:,}개({gov_side/tot*100:.0f}%)뿐이다. '
                    f'나머지는 국민·민간, 위원회, 공공기관이 움직인다.'),
    ]
    for k, (col, t) in enumerate(lines):
        yy = sy + 72 + k * 32
        A(f'<circle cx="112" cy="{yy-4}" r="4.5" fill="{col}"/>')
        A(f'<text x="130" y="{yy}" fill="#c3cddb" font-size="13">{esc(t)}</text>')

    A(f'<text x="80" y="{HEIGHT-36}" fill="#5d6779" font-size="12">'
      f'조직 출처: 부처별 직제·시행규칙(법제처) · 제도 출처: 대한민국 제도 100(korea100) · '
      f'연결 기준: 제도가 인용한 법령의 소관부처·연락부서</text>')
    A("</svg>")

    svg = "\n".join(out)
    open(OUT, "w", encoding="utf-8").write(svg)
    print(f"저장: {OUT} — {WIDTH}×{HEIGHT}px, {len(svg)//1024}KB · 5층")


if __name__ == "__main__":
    main()
