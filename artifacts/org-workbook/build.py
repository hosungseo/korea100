#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""과별 자동 업무편람 페이지 생성 (L2/L3 고도화 데모).

web/data/org-lineage/mois-audit.json(과별 분장사무+소관법령+제도)과
mois-nodes.json(제도별 수행노드 주석)을 결합해, 과를 선택하면
① 직제 분장사무 조문 ② 담당 제도와 그 과가 수행하는 노드
를 한 화면에 보여주는 정적 인터랙티브 HTML을 만든다.

사용: python3 artifacts/org-workbook/build.py
"""
import html, json, os

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AUDIT = os.path.join(REPO, "web", "data", "org-lineage", "mois-audit.json")
NODES = os.path.join(REPO, "web", "data", "org-lineage", "mois-nodes.json")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
SITE = "https://hosungseo.github.io/korea100/model"


def main():
    audit = json.load(open(AUDIT, encoding="utf-8"))
    nodes = json.load(open(NODES, encoding="utf-8"))

    # 과별 수행노드: unit -> [{slug, inst, node, performer}]
    import re
    def norm(s):
        return re.sub(r"\s+", "", s or "").replace("ㆍ", "·").replace("・", "·")
    unit_perf = {}
    for slug, inst in nodes["bySlug"].items():
        for nd in inst["nodes"]:
            for o in nd["ruleOwners"]:
                unit_perf.setdefault(norm(o["unit"]), []).append({
                    "slug": slug, "inst": inst["name"], "node": nd["name"],
                    "perf": nd["performer"], "lane": nd.get("lane") or "",
                })

    # 클라이언트로 넘길 축약 데이터
    payload = {"units": [], "meta": audit["meta"]}
    for unit, r in audit["byUnit"].items():
        payload["units"].append({
            "unit": unit,
            "path": r["path"],
            "article": r["article"],
            "articleTitle": r["articleTitle"],
            "duties": r["duties"],
            "dutyCount": r["dutyCount"],
            "institutions": r["institutions"],
            "instCount": r["institutionCount"],
            "perfNodes": r["performedNodes"],
            "hasDuty": r["hasDutyText"],
            "perf": unit_perf.get(norm(unit), []),
        })

    m = audit["meta"]
    data_json = json.dumps(payload, ensure_ascii=False)
    page = f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>행정안전부 자동 업무편람 — 직제 × 제도100</title>
<style>
:root {{ color-scheme: dark; }}
* {{ box-sizing: border-box; margin: 0; }}
body {{ background:#0f131b; color:#dbe2ec; font-family:"Apple SD Gothic Neo","Pretendard",sans-serif; }}
a {{ color:inherit; }}
header {{ padding:26px 28px 18px; border-bottom:1px solid #202836; }}
h1 {{ font-size:21px; font-weight:800; letter-spacing:-.02em; }}
h1 b {{ color:#5aa9e6; }}
.sub {{ color:#8b95a5; font-size:13px; margin-top:8px; line-height:1.7; max-width:900px; }}
.wrap {{ display:grid; grid-template-columns:300px 1fr; min-height:calc(100vh - 96px); }}
aside {{ border-right:1px solid #202836; overflow-y:auto; max-height:calc(100vh - 96px); padding:12px; }}
.q {{ width:100%; padding:9px 12px; border-radius:9px; border:1px solid #2a3242; background:#161c28; color:#dbe2ec; font-size:13px; margin-bottom:10px; }}
.uitem {{ padding:9px 11px; border-radius:9px; cursor:pointer; border:1px solid transparent; }}
.uitem:hover {{ background:#161c28; }}
.uitem.on {{ background:#18263a; border-color:#33507a; }}
.uitem .n {{ font-size:13px; font-weight:700; }}
.uitem .p {{ font-size:11px; color:#7f8a9a; margin-top:2px; }}
.uitem .b {{ margin-top:5px; display:flex; gap:6px; font-size:10px; }}
.uitem .b span {{ padding:1px 6px; border-radius:99px; background:#222c3c; color:#aab4c4; }}
.warn {{ color:#e8b84d; }}
main {{ padding:22px 28px; overflow-y:auto; max-height:calc(100vh - 96px); }}
.mhead .path {{ font-size:12px; color:#7f8a9a; }}
.mhead h2 {{ font-size:22px; font-weight:800; margin-top:4px; }}
.mhead .art {{ font-size:12px; color:#5aa9e6; margin-top:4px; }}
.axis {{ display:flex; gap:10px; margin:16px 0 22px; flex-wrap:wrap; }}
.axis .card {{ background:#151b27; border:1px solid #232c3c; border-radius:11px; padding:12px 16px; min-width:118px; }}
.axis .num {{ font-size:24px; font-weight:800; }}
.axis .lbl {{ font-size:11px; color:#8b95a5; margin-top:2px; }}
.axis .duty .num {{ color:#7bc47f; }} .axis .law .num {{ color:#5aa9e6; }}
.axis .inst .num {{ color:#e8a33d; }} .axis .node .num {{ color:#c792ea; }}
section h3 {{ font-size:13px; font-weight:800; color:#aab4c4; margin:22px 0 10px; padding-bottom:6px; border-bottom:1px solid #202836; }}
.src {{ font-size:11px; color:#5d6779; font-weight:500; }}
ol.duties {{ padding-left:22px; }} ol.duties li {{ font-size:13px; line-height:1.7; margin-bottom:3px; color:#cbd4e0; }}
.empty {{ font-size:12px; color:#e8b84d; padding:8px 12px; background:#231d10; border-radius:8px; }}
.inst {{ border:1px solid #232c3c; border-radius:11px; padding:12px 14px; margin-bottom:10px; }}
.inst .top {{ display:flex; justify-content:space-between; align-items:center; gap:10px; }}
.inst .name {{ font-size:14px; font-weight:700; }}
.inst .name a {{ text-decoration:none; }} .inst .name a:hover {{ color:#5aa9e6; }}
.inst .laws {{ font-size:11px; color:#8b95a5; margin-top:3px; }}
.pf {{ margin-top:8px; display:flex; flex-wrap:wrap; gap:5px; }}
.pf .chip {{ font-size:11px; padding:2px 8px; border-radius:6px; background:#1a2233; border:1px solid #2a3446; color:#cbd4e0; }}
.pf .chip.ministry {{ border-color:#3a5a3d; background:#18251a; }}
.legend {{ font-size:11px; color:#7f8a9a; margin-top:4px; }}
.placeholder {{ color:#5d6779; font-size:14px; padding:60px 0; text-align:center; }}
</style></head><body>
<header>
<h1>행정안전부 <b>자동 업무편람</b> — 직제가 명령한 일 × 제도100이 수행하는 일</h1>
<div class="sub">직제 시행규칙의 <b>분장사무 조문</b>과, korea100 제도의 <b>소관 법령·수행 노드</b>를 과 단위로 결합했습니다.
과를 고르면 "이 과가 법으로 맡은 일"과 "그 일이 어느 제도의 어느 단계로 수행되는가"가 한 화면에 나옵니다.
직제 기준일 {html.escape(str(m.get('orgAsOf')))} · 분장사무 {m['totalDuties']}건 · 결합 과 {m['unitCount']}곳</div>
</header>
<div class="wrap">
<aside>
<input class="q" id="q" placeholder="과 이름 검색…">
<div id="list"></div>
</aside>
<main id="main"><div class="placeholder">왼쪽에서 과를 선택하세요.</div></main>
</div>
<script>
const DATA = {data_json};
const SITE = {json.dumps(SITE)};
const esc = s => (s||"").replace(/[&<>]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;'}}[c]));
const PERF_KO = {{ministry:"부처", "local-gov":"지자체", committee:"위원회", council:"의회", system:"시스템", public:"국민·민간", other:"기타"}};
const list = document.getElementById('list'), main = document.getElementById('main');
let cur = null;

function renderList(filter="") {{
  const f = filter.trim();
  list.innerHTML = DATA.units
    .filter(u => !f || u.unit.includes(f))
    .map((u, i) => `<div class="uitem" data-i="${{DATA.units.indexOf(u)}}">
      <div class="n">${{esc(u.unit)}}</div>
      <div class="p">${{esc(u.path[u.path.length-2]||"")}}</div>
      <div class="b">
        <span class="${{u.hasDuty?'':'warn'}}">분장 ${{u.dutyCount}}</span>
        <span>제도 ${{u.instCount}}</span>
        <span>수행 ${{u.perfNodes}}</span>
      </div></div>`).join('');
  [...list.querySelectorAll('.uitem')].forEach(el =>
    el.onclick = () => select(+el.dataset.i));
}}

function select(i) {{
  cur = i;
  [...list.querySelectorAll('.uitem')].forEach(el =>
    el.classList.toggle('on', +el.dataset.i === i));
  const u = DATA.units[i];
  const perfByInst = {{}};
  u.perf.forEach(p => (perfByInst[p.slug] = perfByInst[p.slug] || []).push(p));

  const dutiesHtml = u.hasDuty
    ? `<ol class="duties">${{u.duties.map(d => `<li>${{esc(d)}}</li>`).join('')}}</ol>`
    : `<div class="empty">이 과의 분장사무는 직제 시행규칙이 아닌 직제령 본문에 규정되어 있어 이 파싱 범위 밖입니다(감사·의정 등 참모조직).</div>`;

  const instHtml = u.institutions.map(inst => {{
    const pf = perfByInst[inst.slug] || [];
    const chips = pf.map(p =>
      `<span class="chip ${{p.perf==='ministry'?'ministry':''}}" title="${{esc(p.lane)}} · 수행:${{PERF_KO[p.perf]||p.perf}}">${{esc(p.node)}}</span>`).join('');
    return `<div class="inst">
      <div class="top"><div>
        <div class="name"><a href="${{SITE}}/${{inst.slug}}/" target="_blank">${{esc(inst.name)}} ↗</a></div>
        <div class="laws">소관 근거: ${{esc(inst.laws.join(' · '))}}</div>
      </div></div>
      ${{chips ? `<div class="pf">${{chips}}</div>` : ''}}
    </div>`;
  }}).join('');

  main.innerHTML = `<div class="mhead">
    <div class="path">${{u.path.map(esc).join(' › ')}}</div>
    <h2>${{esc(u.unit)}}</h2>
    ${{u.article ? `<div class="art">직제 시행규칙 ${{esc(u.article)}}${{u.articleTitle?' ('+esc(u.articleTitle)+')':''}}</div>` : ''}}
  </div>
  <div class="axis">
    <div class="card duty"><div class="num">${{u.dutyCount}}</div><div class="lbl">분장사무 조문</div></div>
    <div class="card inst"><div class="num">${{u.instCount}}</div><div class="lbl">담당 제도</div></div>
    <div class="card node"><div class="num">${{u.perfNodes}}</div><div class="lbl">수행 노드</div></div>
  </div>
  <section><h3>직제가 명령한 일 <span class="src">— 시행규칙 분장사무</span></h3>${{dutiesHtml}}</section>
  <section><h3>제도100이 수행하는 일 <span class="src">— 소관 법령으로 역산한 담당 제도·단계</span></h3>
    <div class="legend">칩 = 이 과가 소관 법령 근거로 수행하는 프로세스 노드 (초록 테두리 = 부처 직접수행)</div>
    ${{instHtml || '<div class="empty">연결된 제도 없음</div>'}}
  </section>`;
  main.scrollTop = 0;
}}

document.getElementById('q').oninput = e => renderList(e.target.value);
renderList();
select(0);
</script>
</body></html>"""
    open(OUT, "w", encoding="utf-8").write(page)
    print(f"저장: {OUT} ({len(page)//1024}KB)")


if __name__ == "__main__":
    main()
