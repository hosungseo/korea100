#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""org-atlas (wide) — 조직 × 제도 × 수행단계를 가로로 펼친 대형 SVG.

열 구성 (좌→우):
  실·본부 → 국 → 과 → 제도 → 수행 단계 스트립(프로세스 노드를 순서대로, 수행주체 색)
       → 수행주체 구성 막대 → 지표

마지막 스트립이 이 지도의 핵심이다. 제도마다 G0→Gn 단계가 색 띠로 늘어서므로,
"어느 제도가 어느 지점에서 국민 손을 떠나 행정으로 넘어가는가"가 가로로 읽힌다.

사용: python3 artifacts/org-atlas/build-wide.py
출력: artifacts/org-atlas/atlas-wide.svg
"""
import html, json, os
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(REPO, "web", "data", "org-lineage")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atlas-wide.svg")

# korea100 정본 분류 14종 (web/scripts/validate-data.mjs의 CANONICAL_CATEGORIES와 같은 목록).
# 색은 RegistryCatalog의 CATEGORY_COLORS를 어두운 배경용으로 밝힌 값이다.
THEME_COLORS = {
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
CAT_DEFAULT = "#8b95a5"

PERF = [
    ("ministry", "행정안전부", "#7bc47f"),
    ("central-gov", "타 부처·행정청", "#4d8fd6"),
    ("local-gov", "지방자치단체", "#5ec8d8"),
    ("council", "의회·선관위", "#e8a33d"),
    ("committee", "위원회·심의회", "#c792ea"),
    ("public-org", "공공기관·전문기관", "#d98cc0"),
    ("system", "시스템", "#4dd0c4"),
    ("public", "국민·민간", "#ef8f8f"),
    ("other", "미분류", "#454f60"),
]
PERF_COLOR = {k: c for k, _, c in PERF}
PERF_LABEL = {k: l for k, l, _ in PERF}

# ── 레이아웃
X_BUREAU, W_BUREAU = 60, 230
X_DIV, W_DIV = 305, 250
X_UNIT, W_UNIT = 570, 205
X_INST, W_INST = 1150, 290
X_STRIP = 1470
CELL, CELL_GAP = 30, 3
MAX_CELLS = 21
X_MIX = X_STRIP + MAX_CELLS * (CELL + CELL_GAP) + 30
W_MIX = 260
X_STAT = X_MIX + W_MIX + 24
ROW, INST_ROW, PAD_TOP = 30, 30, 330


def esc(s):
    return html.escape(str(s or ""))


def main():
    xwalk = json.load(open(os.path.join(D, "mois.json"), encoding="utf-8"))
    audit = json.load(open(os.path.join(D, "mois-audit.json"), encoding="utf-8"))
    nodes = json.load(open(os.path.join(D, "mois-nodes.json"), encoding="utf-8"))

    units = []
    for unit, info in xwalk["byUnit"].items():
        spine = [p for p in info["path"] if p not in ("행정안전부", "장관", "차관")]
        bureau = spine[0] if spine else "직속"
        div = spine[1] if len(spine) > 2 else (spine[0] if len(spine) == 2 else "")
        a = audit["byUnit"].get(unit, {})
        units.append({"unit": unit, "bureau": bureau, "div": div,
                      "duty": a.get("dutyCount", 0), "perf": a.get("performedNodes", 0),
                      "insts": [i["slug"] for i in info["institutions"]]})

    by_bureau = defaultdict(lambda: defaultdict(list))
    for u in units:
        by_bureau[u["bureau"]][u["div"]].append(u)
    bureau_order = sorted(by_bureau, key=lambda b: -sum(
        len(u["insts"]) for ds in by_bureau[b].values() for u in ds))

    y = PAD_TOP
    unit_y, div_box, bureau_box = {}, [], []
    for b in bureau_order:
        b0 = y
        for dname, us in sorted(by_bureau[b].items(), key=lambda kv: -sum(len(u["insts"]) for u in kv[1])):
            d0 = y
            for u in sorted(us, key=lambda u: -len(u["insts"])):
                unit_y[u["unit"]] = y
                y += ROW
            div_box.append((dname or b, d0, y - ROW, b))
            y += 10
        bureau_box.append((b, b0, y - ROW - 10))
        y += 26
    org_bottom = y

    inst_of_unit = defaultdict(list)
    for u in units:
        for s in u["insts"]:
            inst_of_unit[s].append(u["unit"])

    insts = []
    for slug, info in xwalk["bySlug"].items():
        ys = [unit_y[u] for u in inst_of_unit.get(slug, []) if u in unit_y]
        nd = nodes["bySlug"].get(slug)
        if not ys or not nd:
            continue
        mix = defaultdict(int)
        for n in nd["nodes"]:
            mix[n["performer"]] += 1
        insts.append({
            "slug": slug, "name": info["name"], "cat": info.get("category") or "",
            "theme": info.get("category") or "기타",
            "anchor": sum(ys) / len(ys), "nodes": nd["nodes"], "mix": mix,
            "ratio": nd.get("internalRatio", 0), "cover": nd.get("ownerCoverage", 0),
        })
    insts.sort(key=lambda i: i["anchor"])
    iy = PAD_TOP
    for i in insts:
        i["y"] = iy
        iy += INST_ROW

    HEIGHT = max(org_bottom, iy) + 96
    WIDTH = X_STAT + 210
    max_perf = max((u["perf"] for u in units), default=1) or 1

    out = []
    A = out.append
    A(f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
      f'viewBox="0 0 {WIDTH} {HEIGHT}" font-family="Apple SD Gothic Neo, Pretendard, sans-serif">')
    A(f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#0e121a"/>')

    am, nm = audit["meta"], nodes["meta"]["totals"]
    A('<text x="60" y="76" fill="#f0f4f9" font-size="44" font-weight="800">행정안전부 수행체계 전개도</text>')
    A('<text x="60" y="116" fill="#5aa9e6" font-size="20" font-weight="700">'
      '조직이 맡은 법 · 제도가 흐르는 단계 · 그 단계를 실제로 누가 수행하는가 — 한 장</text>')
    A(f'<text x="60" y="150" fill="#8b95a5" font-size="14.5">'
      f'직제·시행규칙 [시행 2026-07-21] · 제도가 연결된 과 {len(units)}곳(분장사무 {am["totalDuties"]}건) · '
      f'제도 {len(insts)}건 · 수행 단계 {sum(len(i["nodes"]) for i in insts):,}개</text>')
    A(f'<text x="60" y="174" fill="#5d6779" font-size="12.5">'
      f'좌측 연결선 = 법제처 법령ID 조인(제도 인용 법령 ↔ 직제 소관 법령) · '
      f'우측 띠 = 그 제도의 프로세스 단계를 순서대로 편 것, 칸 하나가 한 단계이고 색은 그 단계의 수행 주체</text>')

    # 범례 — 분야
    lx = 60
    A(f'<text x="{lx}" y="{PAD_TOP-116}" fill="#7f8a9a" font-size="12" font-weight="800">제도 분류</text>')
    lx += 76
    present = [c for c in THEME_COLORS if any(i["theme"] == c for i in insts)]
    for cat in present:
        col = THEME_COLORS[cat]
        A(f'<rect x="{lx}" y="{PAD_TOP-126}" width="10" height="10" rx="3" fill="{col}"/>')
        A(f'<text x="{lx+15}" y="{PAD_TOP-117}" fill="#aab4c4" font-size="12">{esc(cat)}</text>')
        lx += 25 + len(cat) * 12.5
    # 범례 — 수행 주체
    lx = 60
    A(f'<text x="{lx}" y="{PAD_TOP-88}" fill="#7f8a9a" font-size="12" font-weight="800">수행 주체</text>')
    lx += 76
    for key, label, col in PERF:
        A(f'<rect x="{lx}" y="{PAD_TOP-98}" width="10" height="10" rx="2" fill="{col}"/>')
        A(f'<text x="{lx+15}" y="{PAD_TOP-89}" fill="#aab4c4" font-size="12">{esc(label)}</text>')
        lx += 25 + len(label) * 12.5

    for x, t in ((X_BUREAU, "실 · 본부"), (X_DIV, "국"), (X_UNIT, "과 — 막대는 수행 단계 수"),
                 (X_INST, "제도"), (X_STRIP, "수행 단계 전개 — 왼쪽이 착수, 오른쪽이 종결"),
                 (X_MIX, "수행 주체 구성"), (X_STAT, "지표")):
        A(f'<text x="{x}" y="{PAD_TOP-46}" fill="#7f8a9a" font-size="13" font-weight="800">{esc(t)}</text>')

    # 연결선
    ipos = {i["slug"]: i for i in insts}
    for u in units:
        uy = unit_y[u["unit"]] + ROW / 2 - 4
        for s in u["insts"]:
            i = ipos.get(s)
            if not i:
                continue
            y2 = i["y"] + 11
            x1, x2 = X_UNIT + W_UNIT, X_INST
            mid = (x1 + x2) / 2
            col = THEME_COLORS.get(i["theme"], CAT_DEFAULT)
            A(f'<path d="M{x1},{uy:.1f} C{mid},{uy:.1f} {mid},{y2:.1f} {x2},{y2:.1f}" '
              f'fill="none" stroke="{col}" stroke-width="0.9" opacity="0.26"/>')

    for name, y0, y1 in bureau_box:
        h = y1 - y0 + ROW
        A(f'<rect x="{X_BUREAU}" y="{y0-4}" width="{W_BUREAU}" height="{h}" rx="12" '
          f'fill="#182338" stroke="#33507a" stroke-width="1.2"/>')
        A(f'<text x="{X_BUREAU+16}" y="{y0+h/2+1}" fill="#dbe6f5" font-size="15.5" font-weight="800">{esc(name)}</text>')
    for name, y0, y1, b in div_box:
        if not name or name == b:
            continue
        h = y1 - y0 + ROW
        A(f'<rect x="{X_DIV}" y="{y0-3}" width="{W_DIV}" height="{h-2}" rx="10" fill="#161d2b" stroke="#2a3446"/>')
        A(f'<text x="{X_DIV+14}" y="{y0+h/2}" fill="#b7c2d2" font-size="13.5" font-weight="700">{esc(name)}</text>')
    for u in units:
        y0 = unit_y[u["unit"]]
        bar = 6 + (W_UNIT - 24) * (u["perf"] / max_perf)
        A(f'<rect x="{X_UNIT}" y="{y0}" width="{W_UNIT}" height="{ROW-6}" rx="8" fill="#121a12" stroke="#2f4a33"/>')
        A(f'<rect x="{X_UNIT}" y="{y0}" width="{bar:.1f}" height="{ROW-6}" rx="8" fill="#7bc47f" opacity="0.20"/>')
        A(f'<text x="{X_UNIT+11}" y="{y0+16}" fill="#dff0e2" font-size="12.5" font-weight="700">{esc(u["unit"])}</text>')
        A(f'<text x="{X_UNIT+W_UNIT-10}" y="{y0+16}" fill="#6f7c8c" font-size="10.5" text-anchor="end">'
          f'분장{u["duty"]}·제도{len(u["insts"])}</text>')

    # 제도 + 단계 전개 + 구성 막대 + 지표
    for i in insts:
        col = THEME_COLORS.get(i["theme"], CAT_DEFAULT)
        y0 = i["y"]
        A(f'<rect x="{X_INST}" y="{y0}" width="{W_INST}" height="22" rx="6" '
          f'fill="#141a24" stroke="{col}" stroke-opacity="0.55"/>')
        A(f'<rect x="{X_INST}" y="{y0}" width="5" height="22" rx="2" fill="{col}"/>')
        A(f'<text x="{X_INST+12}" y="{y0+15}" fill="#e3e9f1" font-size="12">{esc(i["name"])}</text>')

        shown = i["nodes"][:MAX_CELLS]
        for k, n in enumerate(shown):
            cx = X_STRIP + k * (CELL + CELL_GAP)
            pc = PERF_COLOR.get(n["performer"], "#454f60")
            owned = bool(n["ruleOwners"])
            A(f'<rect x="{cx}" y="{y0}" width="{CELL}" height="22" rx="4" fill="{pc}" '
              f'opacity="{0.85 if owned else 0.34}"/>')
            if owned:
                A(f'<rect x="{cx}" y="{y0+19}" width="{CELL}" height="3" rx="1.5" fill="#f0f4f9" opacity="0.55"/>')
            A(f'<title>{esc(n["name"])} — {esc(n.get("lane"))} · {esc(PERF_LABEL.get(n["performer"]))}</title>')
        if len(i["nodes"]) > MAX_CELLS:
            cx = X_STRIP + MAX_CELLS * (CELL + CELL_GAP)
            A(f'<text x="{cx+2}" y="{y0+15}" fill="#6f7c8c" font-size="10">+{len(i["nodes"])-MAX_CELLS}</text>')

        # 수행 주체 구성 (100% 누적 막대)
        total = max(len(i["nodes"]), 1)
        bx = X_MIX
        for key, _, pc in PERF:
            c = i["mix"].get(key, 0)
            if not c:
                continue
            w = W_MIX * c / total
            A(f'<rect x="{bx:.1f}" y="{y0+3}" width="{w:.1f}" height="16" fill="{pc}" opacity="0.8"/>')
            bx += w

        A(f'<text x="{X_STAT}" y="{y0+15}" fill="#6f7c8c" font-size="10.5">'
          f'{len(i["nodes"])}단계 · 행안부 {round(i["ratio"]*100)}%</text>')

    # ── 좌하단 분석 패널 (조직 트리 아래 빈 공간)
    px, pw = X_BUREAU, X_INST - X_BUREAU - 60
    py = org_bottom + 46

    def panel(title, sub, height):
        nonlocal py
        A(f'<rect x="{px}" y="{py}" width="{pw}" height="{height}" rx="14" fill="#121824" stroke="#212a3a"/>')
        A(f'<text x="{px+22}" y="{py+30}" fill="#e3e9f1" font-size="16" font-weight="800">{esc(title)}</text>')
        A(f'<text x="{px+22}" y="{py+51}" fill="#7f8a9a" font-size="12">{esc(sub)}</text>')
        top = py + 74
        py += height + 22
        return top

    # 1) 수행 주체 총 구성
    tot_mix = defaultdict(int)
    for i in insts:
        for k, c in i["mix"].items():
            tot_mix[k] += c
    grand = sum(tot_mix.values()) or 1
    top = panel("이 제도들을 실제로 수행하는 주체",
                f"연결 제도 {len(insts)}건의 수행 단계 {grand:,}개를 주체별로 집계", 250)
    bw = pw - 44
    bx = px + 22
    for key, label, col in PERF:
        c = tot_mix.get(key, 0)
        if not c:
            continue
        w = bw * c / grand
        A(f'<rect x="{bx:.1f}" y="{top}" width="{w:.1f}" height="30" fill="{col}" opacity="0.85"/>')
        bx += w
    ly = top + 56
    lx2 = px + 22
    for n, (key, label, col) in enumerate(PERF):
        c = tot_mix.get(key, 0)
        if not c:
            continue
        A(f'<rect x="{lx2}" y="{ly-10}" width="11" height="11" rx="3" fill="{col}"/>')
        A(f'<text x="{lx2+18}" y="{ly}" fill="#c3cddb" font-size="12.5">{esc(label)}</text>')
        A(f'<text x="{lx2+18}" y="{ly+18}" fill="#7f8a9a" font-size="12">{c}단계 · {c/grand*100:.1f}%</text>')
        lx2 += 175
        if lx2 > px + pw - 170:
            lx2 = px + 22
            ly += 46
    A(f'<text x="{px+22}" y="{top+152}" fill="#8b95a5" font-size="12.5">'
      f'행정안전부가 직접 수행하는 단계는 {tot_mix.get("ministry",0)}개({tot_mix.get("ministry",0)/grand*100:.1f}%)에 그친다. '
      f'나머지는 지자체·타 부처·국민이 움직인다 — 이 부처는 집행부처라기보다 규칙을 쓰는 부처다.</text>')

    # 2) 과별 부하 상위
    top = panel("업무 부하 상위 과", "제도 수(주황) · 수행 단계 수(초록) · 직제 분장사무 수(회색)", 470)
    rank = sorted(units, key=lambda u: -len(u["insts"]))[:14]
    mx_i = max(len(u["insts"]) for u in rank)
    mx_p = max(u["perf"] for u in rank) or 1
    mx_d = max(u["duty"] for u in rank) or 1
    rw = pw - 440
    for k, u in enumerate(rank):
        ry = top + k * 28
        A(f'<text x="{px+22}" y="{ry+11}" fill="#c3cddb" font-size="12.5">{esc(u["unit"])}</text>')
        A(f'<rect x="{px+180}" y="{ry}" width="{rw*len(u["insts"])/mx_i:.1f}" height="6" rx="3" fill="#e8a33d" opacity="0.9"/>')
        A(f'<rect x="{px+180}" y="{ry+7}" width="{rw*u["perf"]/mx_p:.1f}" height="6" rx="3" fill="#7bc47f" opacity="0.8"/>')
        A(f'<rect x="{px+180}" y="{ry+14}" width="{rw*u["duty"]/mx_d:.1f}" height="5" rx="2.5" fill="#6f7c8c" opacity="0.6"/>')
        A(f'<text x="{px+pw-22}" y="{ry+13}" fill="#7f8a9a" font-size="11" text-anchor="end">'
          f'제도{len(u["insts"])} · 단계{u["perf"]} · 분장{u["duty"]}</text>')

    # 3) 정합성 감사
    top = panel("직제가 명령한 일 ↔ 법령이 시키는 일",
                "두 지도를 겹쳐야만 드러나는 신호", 176)
    cover_tot = nm["nodesWithOwner"] / max(nm["nodes"], 1) * 100
    lines = [
        ("#7bc47f", f"분장사무가 확인된 과 {am['unitsWithDuty']}곳 / 제도가 연결된 과 {am['unitCount']}곳"),
        ("#e8b84d", f"제도는 연결됐으나 시행규칙 분장사무가 없는 과 {am['unitsWithoutDutyButLinked']}곳 "
                    f"— {', '.join(audit['unitsWithoutDutyButLinked'])} (직제령 본문에 규정되는 참모조직)"),
        ("#5aa9e6", f"제도 전체 프로세스 단계 {nm['nodes']:,}개 중 {nm['nodesWithOwner']:,}개({cover_tot:.0f}%)가 "
                    f"행정안전부 소관 법령에 근거 — 나머지는 타 부처 소관 법령이 규율하는 단계"),
    ]
    for k, (col, text) in enumerate(lines):
        ly2 = top + k * 30
        A(f'<circle cx="{px+28}" cy="{ly2+5}" r="4.5" fill="{col}"/>')
        A(f'<text x="{px+44}" y="{ly2+10}" fill="#c3cddb" font-size="12.5">{esc(text)}</text>')

    # 3.5) 분야별 분포 + 극단값
    cats = defaultdict(list)
    for i in insts:
        cats[i["theme"]].append(i)
    top = panel("분류별 제도 분포와 눈에 띄는 제도",
                f"행정안전부 소관으로 연결된 제도만 집계 · korea100 정본 분류 14종 중 {len(cats)}종이 등장",
                len(cats) * 26 + 4 * 28 + 96)
    cw = pw - 300
    mxc = max(len(v) for v in cats.values())
    for k, (cat, group) in enumerate(sorted(cats.items(), key=lambda kv: -len(kv[1]))):
        cy = top + k * 26
        col = THEME_COLORS.get(cat, CAT_DEFAULT)
        A(f'<text x="{px+22}" y="{cy+10}" fill="#c3cddb" font-size="12.5">{esc(cat)}</text>')
        A(f'<rect x="{px+230}" y="{cy+1}" width="{cw*len(group)/mxc:.1f}" height="12" rx="4" fill="{col}" opacity="0.75"/>')
        A(f'<text x="{px+236+cw*len(group)/mxc:.1f}" y="{cy+11}" fill="#7f8a9a" font-size="11">{len(group)}건</text>')

    ey = top + len(cats) * 26 + 22
    hi = max(insts, key=lambda i: i["ratio"])
    lo_pool = [i for i in insts if i["mix"].get("public", 0)]
    lo = max(lo_pool, key=lambda i: i["mix"]["public"] / max(len(i["nodes"]), 1)) if lo_pool else insts[0]
    longest = max(insts, key=lambda i: len(i["nodes"]))
    widest = max(insts, key=lambda i: len(inst_of_unit[i["slug"]]))
    facts = [
        ("#7bc47f", f'행정안전부가 가장 많이 직접 수행 — {hi["name"]} ({round(hi["ratio"]*100)}%, {len(hi["nodes"])}단계)'),
        ("#ef8f8f", f'국민·민간이 가장 많이 움직임 — {lo["name"]} '
                    f'({round(lo["mix"]["public"]/max(len(lo["nodes"]),1)*100)}%, {len(lo["nodes"])}단계)'),
        ("#5aa9e6", f'단계가 가장 긴 제도 — {longest["name"]} ({len(longest["nodes"])}단계)'),
        ("#c792ea", f'가장 많은 과가 걸린 제도 — {widest["name"]} '
                    f'({len(inst_of_unit[widest["slug"]])}개 과: {", ".join(inst_of_unit[widest["slug"]][:4])})'),
    ]
    for k, (col, t) in enumerate(facts):
        fyy = ey + k * 28
        A(f'<circle cx="{px+28}" cy="{fyy+5}" r="4.5" fill="{col}"/>')
        A(f'<text x="{px+44}" y="{fyy+10}" fill="#c3cddb" font-size="12.5">{esc(t)}</text>')

    # 4) 읽는 법
    top = panel("읽는 법", "왼쪽에서 오른쪽으로 — 조직이 법을 맡고, 법이 제도를 만들고, 제도가 단계로 흐른다", 150)
    how = [
        "① 실·본부 → 국 → 과 : 직제 시행규칙이 규정한 계선. 과의 초록 막대는 그 과가 소관하는 수행 단계 수.",
        "② 곡선 : 법제처 법령ID로 이은 소관 관계. 한 제도가 여러 과에 걸치면 선도 여러 갈래가 된다.",
        "③ 색 띠 : 그 제도의 프로세스를 착수→종결 순으로 편 것. 칸 색이 그 단계를 실제로 수행하는 주체.",
    ]
    for k, t in enumerate(how):
        A(f'<text x="{px+22}" y="{top + k*26 + 6}" fill="#aab4c4" font-size="12.5">{esc(t)}</text>')

    fy = HEIGHT - 52
    A(f'<text x="60" y="{fy}" fill="#5d6779" font-size="12.5">'
      f'칸 아래 흰 밑줄 = 그 단계의 근거 법령이 행정안전부 소관으로 확인된 단계({nm["nodesWithOwner"]:,}개). '
      f'밑줄 없는 옅은 칸 = 타 부처 소관 법령에 근거한 단계.</text>')
    A(f'<text x="60" y="{fy+21}" fill="#4d5666" font-size="12">'
      f'조직 출처: 행정안전부와 그 소속기관 직제·시행규칙(법제처) — korean-government-orgchart 파서   |   '
      f'제도 출처: 대한민국 제도 100(korea100) 업무구조도   |   '
      f'"행안부 %" = 그 제도의 단계 중 행정안전부·대책본부가 직접 수행하는 비율</text>')
    A("</svg>")

    svg = "\n".join(out)
    open(OUT, "w", encoding="utf-8").write(svg)
    print(f"저장: {OUT} — {WIDTH}×{HEIGHT}px, {len(svg)//1024}KB, 과 {len(units)} · 제도 {len(insts)} · 단계 {sum(len(i['nodes']) for i in insts)}")


if __name__ == "__main__":
    main()
