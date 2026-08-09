#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gov-wide — 전 부처 실·국 × 제도 지도.

행안부 한 부처를 펼친 atlas-wide와 달리, 정부 전체를 부처 → 실·국 → 제도로 묶어
한 장에 담는다. 제도 하나가 여러 부처에 걸리는 경우를 숨기지 않고 그대로 그린다.

열: 부처(제도 수 순) → 실·국 → 제도.
여러 부처에 걸친 제도는 첫 등장 자리에 본체를 두고, 나머지 자리에는 얇은 표시만
남긴 뒤 부처 사이를 잇는 호로 연결한다. 그 호가 이 지도의 요점이다.

사용: python3 artifacts/org-atlas/gov-wide.py
출력: artifacts/org-atlas/gov-wide.svg
"""
import html, json, os
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(REPO, "web", "data", "org-lineage")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gov-wide.svg")

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

COL_W = 470          # 부처 한 칸 너비
COL_GAP = 26
ROW = 21             # 제도 한 줄
PAD_TOP = 300
MIN_LEFT = 60


def esc(s):
    return html.escape(str(s or ""))


def main():
    gw = json.load(open(os.path.join(D, "gov-wide.json"), encoding="utf-8"))
    by_slug, by_unit = gw["bySlug"], gw["byUnit"]

    # 부처 → 실·국 → 제도
    tree = defaultdict(lambda: defaultdict(list))
    for slug, v in by_slug.items():
        for u in v["units"]:
            tree[u["ministry"]][u["unit"]].append(slug)

    ministries = sorted(tree, key=lambda m: (-sum(len(x) for x in tree[m].values()), m))
    multi = {s: v for s, v in by_slug.items() if len({u["ministry"] for u in v["units"]}) > 1}

    # 배치: 부처를 열로 쌓되, 열이 너무 길어지면 다음 열로 넘긴다
    placements = {}   # (ministry, unit, slug) -> (x, y)
    slug_spots = defaultdict(list)
    col_x, col_y, col_i = MIN_LEFT, PAD_TOP, 0
    max_y = PAD_TOP
    blocks = []
    for m in ministries:
        units = sorted(tree[m], key=lambda u: (-len(tree[m][u]), u))
        height = 40 + sum(24 + len(tree[m][u]) * ROW for u in units)
        if col_y + height > 6400 and col_y > PAD_TOP:
            col_i += 1
            col_x += COL_W + COL_GAP
            col_y = PAD_TOP
        blocks.append((m, units, col_x, col_y, height))
        y = col_y + 34
        for u in units:
            y += 22
            for slug in sorted(tree[m][u], key=lambda s: by_slug[s]["name"]):
                placements[(m, u, slug)] = (col_x, y)
                slug_spots[slug].append((col_x, y, m))
                y += ROW
        col_y += height + 22
        max_y = max(max_y, col_y)

    WIDTH = col_x + COL_W + 80
    HEIGHT = max_y + 260

    out = []
    A = out.append
    A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
      f'viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">')
    A(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#0e121a"/>')

    m0 = gw["meta"]
    A('<text x="60" y="80" fill="#f0f4f9" font-size="46" font-weight="800">대한민국 제도 수행체계 지도</text>')
    A('<text x="60" y="122" fill="#5aa9e6" font-size="21" font-weight="700">'
      '제도 하나하나를 그 일을 맡은 부처의 실·국에 붙여 정부 전체를 한 장에</text>')
    A(f'<text x="60" y="158" fill="#8b95a5" font-size="15">'
      f'제도 {m0["institutionCount"]}건 · 부처 {m0["ministryCount"]}곳 · 실·국 등 단위 {m0["unitCount"]}개 · '
      f'둘 이상의 부처에 걸친 제도 {len(multi)}건</text>')
    A(f'<text x="60" y="184" fill="#5d6779" font-size="13">'
      f'연결 기준: 제도가 인용한 법령의 법제처 소관부처·연락부서 → 부처별 직제 기구도의 실·국. '
      f'부서를 기구도에서 찾지 못하면 부처 직속으로 남겼다.</text>')

    lx = 60
    A(f'<text x="{lx}" y="{PAD_TOP-90}" fill="#7f8a9a" font-size="12.5" font-weight="800">제도 분류</text>')
    lx += 80
    present = [c for c in CAT_COLORS if any(v.get("category") == c for v in by_slug.values())]
    for c in present:
        A(f'<rect x="{lx}" y="{PAD_TOP-100}" width="10" height="10" rx="3" fill="{CAT_COLORS[c]}"/>')
        A(f'<text x="{lx+15}" y="{PAD_TOP-91}" fill="#aab4c4" font-size="12">{esc(c)}</text>')
        lx += 25 + len(c) * 12.5
        if lx > WIDTH - 400:
            lx = 140
            A('')
    A(f'<text x="60" y="{PAD_TOP-58}" fill="#5d6779" font-size="12.5">'
      f'노란 호 = 둘 이상의 부처에 걸친 제도. 같은 제도가 부처마다 다시 나타나며, '
      f'그 자리들을 이어 준 선이다.</text>')

    # 부처 블록
    for m, units, x, y0, h in blocks:
        n_inst = sum(len(tree[m][u]) for u in units)
        A(f'<rect x="{x}" y="{y0}" width="{COL_W}" height="{h}" rx="14" fill="#131a26" stroke="#26314a"/>')
        A(f'<text x="{x+16}" y="{y0+26}" fill="#dbe6f5" font-size="17" font-weight="800">{esc(m)}</text>')
        A(f'<text x="{x+COL_W-16}" y="{y0+26}" fill="#6f7c8c" font-size="12" text-anchor="end">'
          f'제도 {n_inst} · 단위 {len(units)}</text>')
        yy = y0 + 34
        for u in units:
            yy += 22
            label = u if u != m else f"{m} 직속·미매칭"
            A(f'<text x="{x+16}" y="{yy-7}" fill="#93a0b3" font-size="12.5" font-weight="700">'
              f'{esc(label)}</text>')
            A(f'<line x1="{x+16}" y1="{yy-3}" x2="{x+COL_W-16}" y2="{yy-3}" stroke="#242e42"/>')
            for slug in sorted(tree[m][u], key=lambda s: by_slug[s]["name"]):
                v = by_slug[slug]
                col = CAT_COLORS.get(v.get("category"), DEFAULT)
                is_multi = slug in multi
                A(f'<rect x="{x+22}" y="{yy+3}" width="4" height="13" rx="2" fill="{col}"/>')
                A(f'<text x="{x+32}" y="{yy+14}" fill="#c3cddb" font-size="11.5">{esc(v["name"])}</text>')
                if is_multi:
                    A(f'<circle cx="{x+COL_W-22}" cy="{yy+10}" r="3" fill="#ffd166" opacity="0.9"/>')
                yy += ROW

    # 부처를 가로지르는 제도 연결
    for slug in sorted(multi):
        spots = slug_spots[slug]
        if len(spots) < 2:
            continue
        pts = sorted(spots, key=lambda t: (t[0], t[1]))
        for (x1, y1, _), (x2, y2, _) in zip(pts, pts[1:]):
            sx, sy = x1 + COL_W - 22, y1 + 10
            ex, ey = x2 + 22, y2 + 10
            mid = (sx + ex) / 2
            A(f'<path d="M{sx},{sy} C{mid},{sy} {mid},{ey} {ex},{ey}" fill="none" '
              f'stroke="#ffd166" stroke-width="0.9" opacity="0.4"/>')

    # 하단 요약
    sy = max_y + 40
    A(f'<rect x="60" y="{sy}" width="{WIDTH-120}" height="150" rx="14" fill="#121824" stroke="#212a3a"/>')
    A(f'<text x="82" y="{sy+32}" fill="#e3e9f1" font-size="16" font-weight="800">이 지도가 말하는 것</text>')
    top = list(gw["ministryInstitutionCounts"].items())[:6]
    top_txt = ", ".join(f"{k} {v}" for k, v in top)
    unresolved = sum(1 for v in by_slug.values() for u in v["units"] if u["level"] == "ministry")
    lines = [
        ("#5aa9e6", f'제도가 가장 많이 걸린 부처 — {top_txt}'),
        ("#ffd166", f'둘 이상의 부처에 걸친 제도 {len(multi)}건. 한 제도를 한 부처가 온전히 갖지 않는다는 뜻이고, '
                    f'부처 간 조정이 실제로 필요한 지점이다.'),
        ("#8b95a5", f'기구도에서 부서를 찾지 못해 부처 직속으로 남긴 연결 {unresolved}건 — '
                    f'한시조직·소속기관·개편 시차가 섞여 있다.'),
    ]
    for k, (col, t) in enumerate(lines):
        yy = sy + 62 + k * 27
        A(f'<circle cx="88" cy="{yy-4}" r="4.5" fill="{col}"/>')
        A(f'<text x="104" y="{yy}" fill="#c3cddb" font-size="12.5">{esc(t)}</text>')

    A(f'<text x="60" y="{HEIGHT-30}" fill="#5d6779" font-size="12">'
      f'조직 출처: 부처별 직제·시행규칙(법제처, 2026-08-09 기준일) — korean-government-orgchart 파서 · '
      f'제도 출처: 대한민국 제도 100(korea100)</text>')
    A("</svg>")

    svg = "\n".join(out)
    open(OUT, "w", encoding="utf-8").write(svg)
    print(f"저장: {OUT} — {WIDTH}×{HEIGHT}px, {len(svg)//1024}KB · "
          f"부처 {len(ministries)} · 제도 {len(by_slug)} · 다부처 제도 {len(multi)}")


if __name__ == "__main__":
    main()
