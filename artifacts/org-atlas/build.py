#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""org-atlas — 조직 × 제도 수행체계를 한 장으로 그린 대형 SVG.

좌: 직제 계층(실·본부 → 국 → 과)  우: 제도(분야색)  선: 소관 법령 연결
과 박스의 높이·색은 분장사무/수행노드 부하를, 제도 박스 폭은 프로세스 노드 수를 반영한다.

사용: python3 artifacts/org-atlas/build.py
출력: artifacts/org-atlas/atlas.svg
"""
import html, json, math, os
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(REPO, "web", "data", "org-lineage")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atlas.svg")

# korea100 정본 분류 14종 (web/scripts/validate-data.mjs의 CANONICAL_CATEGORIES와 같은 목록).
# 색은 RegistryCatalog의 CATEGORY_COLORS를 어두운 배경용으로 밝힌 값이고,
# 다른 지도(build-wide·layers·gov-wide)와 같은 팔레트를 쓴다.
CAT_COLORS = {
    "지방자치와 지역": "#a78bfa",
    "국토·환경·안전": "#34d399",
    "데이터·디지털·공공서비스": "#60a5fa",
    "민원·권리구제·참여": "#e8a33d",
    "재정과 예산": "#5aa9e6",
    "인허가·규제·산업": "#2dd4bf",
    "국가 운영과 권력 통제": "#9ca3af",
    "노동·교육·인적자원": "#fbbf24",
    "외교·국방·치안·생활 기반": "#fb7185",
    "다부처·복합사업": "#8b93c8",
    "복지와 사회보험": "#f472b6",
    "연구개발·행정": "#22d3ee",
    "금융·소비자": "#d4a017",
    "문화·체육·관광": "#e879c8",
}
DEFAULT = "#8b95a5"

# 레이아웃 상수
X_BUREAU, X_DIV, X_UNIT, X_INST = 60, 330, 620, 1180
W_BUREAU, W_DIV, W_UNIT, W_INST = 250, 270, 210, 300
ROW, PAD_TOP = 30, 300
INST_GAP = 26


def esc(s):
    return html.escape(str(s or ""))


def main():
    xwalk = json.load(open(os.path.join(D, "mois.json"), encoding="utf-8"))
    audit = json.load(open(os.path.join(D, "mois-audit.json"), encoding="utf-8"))
    nodes = json.load(open(os.path.join(D, "mois-nodes.json"), encoding="utf-8"))

    # ── 조직 계층 정리: path = [부처, 장관, 차관, 실, 국, 과] (길이 가변)
    units = []
    for unit, info in xwalk["byUnit"].items():
        spine = [p for p in info["path"] if p not in ("행정안전부", "장관", "차관")]
        bureau = spine[0] if spine else "직속"
        div = spine[1] if len(spine) > 2 else (spine[0] if len(spine) == 2 else "")
        a = audit["byUnit"].get(unit, {})
        units.append({
            "unit": unit, "bureau": bureau, "div": div,
            "duty": a.get("dutyCount", 0),
            "insts": [i["slug"] for i in info["institutions"]],
            "perf": a.get("performedNodes", 0),
        })

    # 부하 큰 실·국 순으로 정렬해 위쪽에 배치
    by_bureau = defaultdict(lambda: defaultdict(list))
    for u in units:
        by_bureau[u["bureau"]][u["div"]].append(u)
    bureau_order = sorted(by_bureau, key=lambda b: -sum(
        len(u["insts"]) for divs in [by_bureau[b]] for ds in divs.values() for u in ds))

    # ── y 배치: 과를 순서대로 쌓고, 국/실은 자식 범위의 중앙
    y = PAD_TOP
    unit_y, div_box, bureau_box = {}, [], []
    for b in bureau_order:
        b_start = y
        for dname, us in sorted(by_bureau[b].items(), key=lambda kv: -sum(len(u["insts"]) for u in kv[1])):
            d_start = y
            for u in sorted(us, key=lambda u: -len(u["insts"])):
                unit_y[u["unit"]] = y
                y += ROW
            div_box.append((dname or b, d_start, y - ROW, b))
            y += 10
        bureau_box.append((b, b_start, y - ROW - 10))
        y += 26
    org_bottom = y

    # ── 제도 배치: 연결된 과들의 평균 y 순으로 정렬(선 교차 최소화)
    inst_of_unit = defaultdict(list)
    for u in units:
        for s in u["insts"]:
            inst_of_unit[s].append(u["unit"])
    insts = []
    for slug, info in xwalk["bySlug"].items():
        ys = [unit_y[u] for u in inst_of_unit.get(slug, []) if u in unit_y]
        if not ys:
            continue
        nd = nodes["bySlug"].get(slug, {})
        insts.append({
            "slug": slug, "name": info["name"], "cat": info.get("category") or "",
            "anchor": sum(ys) / len(ys), "units": inst_of_unit[slug],
            "nodes": len(nd.get("nodes", [])),
            "ratio": nd.get("internalRatio", 0),
        })
    insts.sort(key=lambda i: i["anchor"])
    iy = PAD_TOP
    for i in insts:
        i["y"] = iy
        iy += INST_GAP
    inst_bottom = iy

    HEIGHT = max(org_bottom, inst_bottom) + 90
    WIDTH = X_INST + W_INST + 260

    max_perf = max((u["perf"] for u in units), default=1) or 1
    max_nodes = max((i["nodes"] for i in insts), default=1) or 1

    out = []
    A = out.append
    A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
      f'viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">')
    A(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#0e121a"/>')

    # ── 헤더
    m, am = xwalk["meta"], audit["meta"]
    A(f'<text x="60" y="72" fill="#f0f4f9" font-size="40" font-weight="800">행정안전부 수행체계 지도</text>')
    A(f'<text x="60" y="108" fill="#5aa9e6" font-size="19" font-weight="700">'
      f'직제가 만든 조직 × 제도100이 그린 업무 흐름 — 한 장</text>')
    sub = (f"직제·시행규칙 [시행 2026-07-21] 기준 · 제도가 연결된 과 {len(units)}곳(분장사무 {am['totalDuties']}건) · "
           f"제도 {len(insts)}건 · "
           f"제도 프로세스 노드 {nodes['meta']['totals']['nodes']:,}개 중 {nodes['meta']['totals']['nodesWithOwner']:,}개가 소관 과에 연결")
    A(f'<text x="60" y="140" fill="#8b95a5" font-size="14">{esc(sub)}</text>')
    A(f'<text x="60" y="164" fill="#5d6779" font-size="12.5">'
      f'연결 기준: 법제처 법령ID (제도 인용 법령 ↔ 직제 소관 법령) · 선 하나 = 한 제도가 그 과의 소관 법령에 근거한다는 뜻</text>')

    # 열 제목
    A(f'<text x="{X_BUREAU}" y="{PAD_TOP-40}" fill="#7f8a9a" font-size="13" font-weight="800">실 · 본부</text>')
    A(f'<text x="{X_DIV}" y="{PAD_TOP-40}" fill="#7f8a9a" font-size="13" font-weight="800">국</text>')
    A(f'<text x="{X_UNIT}" y="{PAD_TOP-40}" fill="#7f8a9a" font-size="13" font-weight="800">과 — 막대는 수행 노드 수</text>')
    A(f'<text x="{X_INST}" y="{PAD_TOP-40}" fill="#7f8a9a" font-size="13" font-weight="800">제도 — 막대는 프로세스 노드 수, 색은 분야</text>')

    # 범례
    lx = 60
    for cat, col in CAT_COLORS.items():
        A(f'<rect x="{lx}" y="{PAD_TOP-84}" width="10" height="10" rx="3" fill="{col}"/>')
        A(f'<text x="{lx+16}" y="{PAD_TOP-75}" fill="#aab4c4" font-size="12">{esc(cat)}</text>')
        lx += 26 + len(cat) * 12.5

    # ── 연결선 (뒤에 깔기)
    inst_pos = {i["slug"]: i for i in insts}
    for u in units:
        uy = unit_y[u["unit"]] + ROW / 2 - 4
        for s in u["insts"]:
            i = inst_pos.get(s)
            if not i:
                continue
            y2 = i["y"] + 9
            x1, x2 = X_UNIT + W_UNIT, X_INST
            mid = (x1 + x2) / 2
            col = CAT_COLORS.get(i["cat"], DEFAULT)
            A(f'<path d="M{x1},{uy:.1f} C{mid},{uy:.1f} {mid},{y2:.1f} {x2},{y2:.1f}" '
              f'fill="none" stroke="{col}" stroke-width="0.9" opacity="0.28"/>')

    # ── 실·본부 박스
    for name, y0, y1 in bureau_box:
        h = y1 - y0 + ROW
        A(f'<rect x="{X_BUREAU}" y="{y0-4}" width="{W_BUREAU}" height="{h}" rx="12" '
          f'fill="#182338" stroke="#33507a" stroke-width="1.2"/>')
        A(f'<text x="{X_BUREAU+16}" y="{y0 + h/2 + 1}" fill="#dbe6f5" font-size="15.5" font-weight="800">{esc(name)}</text>')

    # ── 국 박스
    for name, y0, y1, b in div_box:
        if not name or name == b:
            continue
        h = y1 - y0 + ROW
        A(f'<rect x="{X_DIV}" y="{y0-3}" width="{W_DIV}" height="{h-2}" rx="10" '
          f'fill="#161d2b" stroke="#2a3446" stroke-width="1"/>')
        A(f'<text x="{X_DIV+14}" y="{y0 + h/2}" fill="#b7c2d2" font-size="13.5" font-weight="700">{esc(name)}</text>')

    # ── 과 박스 (막대 = 수행 노드 수)
    for u in units:
        y0 = unit_y[u["unit"]]
        bar = 6 + (W_UNIT - 24) * (u["perf"] / max_perf)
        A(f'<rect x="{X_UNIT}" y="{y0}" width="{W_UNIT}" height="{ROW-6}" rx="8" fill="#121a12" stroke="#2f4a33"/>')
        A(f'<rect x="{X_UNIT}" y="{y0}" width="{bar:.1f}" height="{ROW-6}" rx="8" fill="#7bc47f" opacity="0.20"/>')
        A(f'<text x="{X_UNIT+11}" y="{y0+16}" fill="#dff0e2" font-size="12.5" font-weight="700">{esc(u["unit"])}</text>')
        A(f'<text x="{X_UNIT+W_UNIT-10}" y="{y0+16}" fill="#6f7c8c" font-size="10.5" text-anchor="end">'
          f'분장{u["duty"]}·제도{len(u["insts"])}</text>')

    # ── 제도 박스 (막대 = 노드 수, 우측에 부처 직접수행 비율)
    for i in insts:
        col = CAT_COLORS.get(i["cat"], DEFAULT)
        y0 = i["y"]
        bar = 6 + (W_INST - 20) * (i["nodes"] / max_nodes)
        A(f'<rect x="{X_INST}" y="{y0}" width="{W_INST}" height="18" rx="6" fill="#141a24" stroke="{col}" stroke-opacity="0.55"/>')
        A(f'<rect x="{X_INST}" y="{y0}" width="{bar:.1f}" height="18" rx="6" fill="{col}" opacity="0.17"/>')
        A(f'<text x="{X_INST+9}" y="{y0+13}" fill="#e3e9f1" font-size="11.5">{esc(i["name"])}</text>')
        pct = round(i["ratio"] * 100)
        A(f'<text x="{X_INST+W_INST+10}" y="{y0+13}" fill="#6f7c8c" font-size="10">'
          f'{i["nodes"]}단계 · 부처직접 {pct}%</text>')

    # ── 각주
    fy = HEIGHT - 46
    A(f'<text x="60" y="{fy}" fill="#5d6779" font-size="12">'
      f'조직도 출처: 행정안전부와 그 소속기관 직제 · 시행규칙(법제처 국가법령정보) — korean-government-orgchart 파서'
      f'   |   제도 출처: 대한민국 제도 100 (korea100) 업무구조도</text>')
    A(f'<text x="60" y="{fy+20}" fill="#4d5666" font-size="11.5">'
      f'"부처직접 %" = 그 제도의 프로세스 노드 중 행정안전부·대책본부가 직접 수행하는 비율. 낮을수록 지자체·민간이 실제 집행을 맡는 제도.</text>')
    A("</svg>")

    svg = "\n".join(out)
    open(OUT, "w", encoding="utf-8").write(svg)
    print(f"저장: {OUT} — {WIDTH}×{HEIGHT}px, {len(svg)//1024}KB, 과 {len(units)} · 제도 {len(insts)}")


if __name__ == "__main__":
    main()
