import fs from "node:fs";

// ── 세종사이렌 전후 비교 체계도 ──────────────────────────────────────────
// 근거: 재난 및 안전관리 기본법 §16(지역대책본부·실무반)·§18(상황실)·§20(보고)·
// §34의5(위기관리 매뉴얼)·§38(위기경보)·§38의2(예보·경보·재난문자)·§40(대피명령)·
// §74의5(CCTV 통합관제, ②항 AI 분석 명문) — 본 세션 DRF 원문 대조(MST 282883).
// 사례: 세종시 재난안전상황실 근무자가 바이브코딩으로 무예산 자체개발(연합뉴스 2026-07-31).

const LANES = [
  "재난안전상황실 근무자",
  "상황실장·판단",
  "시장·지역대책본부장",
  "실무반·유관기관",
  "시스템(NDMS·CBS·CCTV관제)",
];
const LANES_TOBE = [...LANES, "AI 세종사이렌"];
const GATES = [
  "G0 상시 감시·상황 접수",
  "G1 상황 판단·유형 분류",
  "G2 보고·위기경보",
  "G3 전파·재난문자",
  "G4 대책본부·임무 부여",
  "G5 대응·모니터링",
  "G6 수습·기록",
];

const N = (id, gate, lane, kind, name, sub, tag) => ({ id, gate, lane, kind, name, sub, tag });

const AS_IS = [
  N("P01", 0, 0, "statute", "상시 재난안전상황실 운영·정보 수집", "재난안전법 제18조제1항(수집·전파·상황관리·초동조치)"),
  N("P02", 0, 4, "inferred", "기상특보·NDMS·신고 다중 채널 감시", "상황실 실무 — 채널별 육안 확인"),
  N("P03", 0, 0, "statute", "위험정보 취득 즉시 통보", "재난안전법 제38조제4항·제38조의2제2항"),
  N("P04", 1, 0, "inferred", "위기관리 매뉴얼 수기 검색·대조", "방대한 표준·실무·행동매뉴얼(제34조의5)에서 해당 상황 찾기 — 실무"),
  N("P05", 1, 1, "statute", "재난 유형·심각성 판단", "재난안전법 제38조제2항(관심·주의·경계·심각)"),
  N("P06", 1, 1, "inferred", "상황판단회의 소집·협의", "상황실 관행"),
  N("P07", 2, 2, "statute", "재난상황 보고·통보", "재난안전법 제20조제1항·제4항"),
  N("P08", 2, 2, "statute", "위기경보 발령", "재난안전법 제38조제1항·제2항"),
  N("P09", 3, 0, "inferred", "전파대상 선정(기관·부서 리스트)", "수기 선별 — 실무 관행"),
  N("P10", 3, 0, "inferred", "상황 전파 문안 수기 작성·결재", "실무 관행"),
  N("P11", 3, 2, "statute", "재난 예보·경보 실시(재난문자)", "재난안전법 제38조의2제1항·제3항·제5항(전기통신사업자 조치)"),
  N("P12", 3, 2, "statute", "대피명령(필요시)", "재난안전법 제40조제1항"),
  N("P13", 4, 2, "statute", "지역재난안전대책본부 가동", "재난안전법 제16조제1항·제2항"),
  N("P14", 4, 3, "statute", "실무반 편성·임무 부여", "재난안전법 제16조제4항·제5항(구성·운영 조례 위임)"),
  N("P15", 4, 3, "inferred", "실무반별 매뉴얼 발췌·임무 전달", "행동매뉴얼 수기 발췌 — 실무 관행"),
  N("P16", 5, 4, "statute", "CCTV 통합관제센터 관제", "재난안전법 제74조의5제1항·제4항(상황실 협조·정보 공유)"),
  N("P17", 5, 4, "inferred", "침수·범람 육안 판독·수기 종합", "관제요원 실무"),
  N("P18", 5, 0, "inferred", "피해상황 수기 집계·상황일지", "보고(제20조)용 취합 실무"),
  N("P19", 6, 2, "statute", "수습·복구·상황 보고 종결", "재난안전법 제20조(계속 보고)·수습 총괄(제16조)"),
];

const AS_IS_EDGES = [
  ["P01","P02"],["P02","P03"],["P03","P04"],["P04","P05"],["P05","P06"],
  ["P06","P07"],["P07","P08"],["P08","P09"],["P09","P10"],["P10","P11"],
  ["P11","P12"],["P08","P13"],["P13","P14"],["P14","P15"],["P15","P16"],
  ["P16","P17"],["P17","P18"],["P18","P19"],
  ["P18","P05","loop","상황 변화 시 재판단"],
];

// TO-BE: 소멸 0 — 판단·발령·명령의 법정 관문은 전부 남고, AI가 속도를 바꾼다.
const TO_BE = [
  N("P01", 0, 0, "statute", "상시 재난안전상황실 운영·정보 수집", "재난안전법 제18조제1항"),
  N("P02", 0, 4, "inferred", "기상특보·NDMS·신고 다중 채널 감시", "상황실 실무"),
  N("P03", 0, 0, "statute", "위험정보 취득 즉시 통보", "재난안전법 제38조제4항·제38조의2제2항"),
  N("S01", 1, 5, "auto", "재난 유형 초 단위 AI 분류", "매뉴얼 지식 내장 — 즉시 유형·심각성 후보 제시"),
  N("P04", 1, 0, "replaced", "위기관리 매뉴얼 수기 검색·대조", "제34조의5 매뉴얼 검색을 AI 분류로 대체", "S01로 대체"),
  N("P05", 1, 1, "statute", "재난 유형·심각성 판단", "재난안전법 제38조제2항 — AI 분류를 참고해 사람이 판단"),
  N("P06", 1, 1, "changed", "상황판단회의", "초 단위 분류로 소집·협의 부담 축소"),
  N("P07", 2, 2, "statute", "재난상황 보고·통보", "재난안전법 제20조제1항·제4항"),
  N("P08", 2, 2, "statute", "위기경보 발령", "재난안전법 제38조제1항·제2항"),
  N("S02", 3, 5, "auto", "전파대상 자동 선정", "재난 유형별 기관·부서 매칭"),
  N("P09", 3, 0, "replaced", "전파대상 수기 선정", "자동 선정으로 대체", "S02로 대체"),
  N("S03", 3, 5, "auto", "전파 문안 자동 생성", "유형별 문구 자동 생성"),
  N("P10", 3, 0, "replaced", "전파 문안 수기 작성", "자동 생성으로 대체", "S03로 대체"),
  N("P11", 3, 2, "statute", "재난 예보·경보 실시(재난문자)", "재난안전법 제38조의2 — 실시 결정은 사람"),
  N("P12", 3, 2, "statute", "대피명령(필요시)", "재난안전법 제40조제1항"),
  N("P13", 4, 2, "statute", "지역재난안전대책본부 가동", "재난안전법 제16조제1항·제2항"),
  N("P14", 4, 3, "statute", "실무반 편성·임무 부여", "재난안전법 제16조제4항·제5항"),
  N("S04", 4, 5, "auto", "13개 실무반 임무카드 자동 배정·예측 지도", "부서별 임무카드+분석·예측 데이터 지도 제공"),
  N("P15", 4, 3, "replaced", "실무반별 매뉴얼 발췌·임무 전달", "임무카드 자동 배정으로 대체", "S04로 대체"),
  N("P16", 5, 4, "statute", "CCTV 통합관제센터 관제", "재난안전법 제74조의5제1항·제4항"),
  N("S05", 5, 5, "auto", "CCTV 침수·범람 AI 실시간 분석", "제74조의5제2항 — 법이 예정한 AI 영상분석"),
  N("P17", 5, 4, "replaced", "침수·범람 육안 판독", "AI 분석으로 대체", "S05로 대체"),
  N("P18", 5, 0, "changed", "피해상황 집계·상황일지", "피해 예측·피해지역 지도로 취합 부담 축소(집중호우 실전)"),
  N("P19", 6, 2, "statute", "수습·복구·상황 보고 종결", "재난안전법 제20조·제16조"),
];

const TO_BE_EDGES = [
  ["P01","P02"],["P02","P03"],["P03","S01","auto"],["S01","P05","auto"],
  ["P05","P06"],["P06","P07"],["P07","P08"],
  ["P08","S02","auto"],["S02","S03","auto"],["S03","P11","auto"],
  ["P11","P12"],["P08","P13"],["P13","P14"],["P14","S04","auto"],
  ["P16","S05","auto"],["S05","P18","auto"],["P18","P19"],
  ["P04","S01","replace"],["P09","S02","replace"],["P10","S03","replace"],
  ["P15","S04","replace"],["P17","S05","replace"],
];

const KIND = {
  statute:  { bg: "#eef8f2", border: "#1f8962", tagBg: "#1f8962", tag: "규정",   text: "#17573f" },
  inferred: { bg: "#e9f0ff", border: "#2456d6", tagBg: "#2456d6", tag: "추론",   text: "#1c3d8f" },
  auto:     { bg: "#f3eefc", border: "#7c56c9", tagBg: "#6b3fc4", tag: "사이렌 자동", text: "#5230a0" },
  replaced: { bg: "#fdf6ee", border: "#e5b58a", tagBg: "#d99a5e", tag: "대체", text: "#c08a55" },
  removed:  { bg: "#fdf0f0", border: "#e0a3a3", tagBg: "#d47f7f", tag: "소멸", text: "#c47575" },
  changed:  { bg: "#fdf8e3", border: "#d9a821", tagBg: "#b8890e", tag: "간소화", text: "#8a6a0a" },
};

function stats(nodes) {
  const c = { statute: 0, inferred: 0, auto: 0, replaced: 0, removed: 0, changed: 0 };
  nodes.forEach((n) => c[n.kind]++);
  return c;
}

function sheet({ variant, title, subtitle, nodes, edges, headline, lanes = LANES, width = 1500 }) {
  const c = stats(nodes);
  const cards = nodes.map((n) => {
    const k = KIND[n.kind];
    return `<div class="card k-${n.kind}" id="${n.id}" data-gate="${n.gate}" data-lane="${n.lane}"
      style="background:${k.bg};border-color:${k.border};color:${k.text}">
      <div class="chead"><b>${n.id}</b><em style="background:${k.tagBg}">${n.tag ?? k.tag}</em></div>
      <p>${n.name}</p><small>${n.sub}</small></div>`;
  }).join("");

  const gateRows = GATES.map((g, gi) => `
    <div class="gate" data-g="${gi}">
      <div class="glabel"><b>${g.slice(0, 2)}</b><span>${g.slice(3)}</span></div>
      ${lanes.map((_, li) => `<div class="cell" data-g="${gi}" data-l="${li}"></div>`).join("")}
    </div>`).join("");

  const edgesJson = JSON.stringify(edges);

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:${width}px; background:#f4f7f5; color:#12241c; font-family:"Apple SD Gothic Neo","Pretendard",sans-serif; }
header { background:#0b1a13; color:#f4faf7; padding:26px 48px 22px; }
.kick { display:flex; justify-content:space-between; color:#65d7ad; font-family:ui-monospace,monospace; font-size:14px; font-weight:700; letter-spacing:.1em; margin-bottom:10px; }
.kick small { color:#7d948a; }
h1 { font-size:34px; font-weight:800; letter-spacing:-0.02em; }
h1 b { color:#65d7ad; }
.sub { margin-top:8px; color:#a8bcb2; font-size:14.5px; line-height:1.5; word-break:keep-all; max-width:1100px; }
.counts { display:flex; gap:22px; margin-top:13px; font-size:13px; color:#cfe0d8; }
.counts span { display:inline-flex; align-items:center; gap:6px; }
.counts i { width:11px; height:11px; border-radius:3px; display:inline-block; }
.counts b { font-family:ui-monospace,monospace; font-weight:800; }
.lanehead { display:grid; grid-template-columns:150px repeat(${lanes.length}, 1fr); background:#fff; border-bottom:2px solid #17573f; }
.lanehead div { padding:11px 12px 9px; font-size:13.5px; font-weight:800; color:#17573f; border-left:1px solid #e2e8e4; }
.lanehead div:first-child { color:#8a9990; font-family:ui-monospace,monospace; font-size:11px; font-weight:700; border-left:0; }
.lanehead div:nth-child(7) { color:#5230a0; background:#f3eefc; border-left:2px solid #7c56c9; }
.cell[data-l="5"] { background:rgba(124,86,201,.05); border-left:2px solid rgba(124,86,201,.35); }
.grid { position:relative; }
.gate { display:grid; grid-template-columns:150px repeat(${lanes.length}, 1fr); border-bottom:2px solid #17573f; background:#fbfcfb; }
.gate:nth-child(even) { background:#f6f9f7; }
.glabel { padding:14px 12px; border-right:1px solid #e2e8e4; }
.glabel b { display:block; color:#17573f; font-family:ui-monospace,monospace; font-size:13px; font-weight:800; }
.glabel span { color:#45635a; font-size:12px; font-weight:700; word-break:keep-all; line-height:1.35; }
.cell { min-height:64px; padding:12px 10px; border-left:1px dotted #d5ddd8; display:flex; flex-direction:column; gap:10px; }
.card { position:relative; z-index:2; border:1.6px solid; border-radius:8px; padding:8px 10px 8px; box-shadow:0 1px 3px rgba(17,38,27,.07); background:#fff; }
.card .chead { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; }
.card b { font-family:ui-monospace,monospace; font-size:10.5px; font-weight:800; opacity:.75; }
.card em { color:#fff; font-style:normal; font-size:9px; font-weight:800; padding:1px 7px 2px; border-radius:8px; }
.card p { font-size:13px; font-weight:750; line-height:1.35; word-break:keep-all; }
.card small { display:block; margin-top:3px; font-size:10px; line-height:1.35; color:inherit; opacity:.75; word-break:keep-all; }
.card.k-inferred { border-style:solid; box-shadow:0 1px 3px rgba(36,86,214,.14); }
.card.k-auto { box-shadow:0 0 0 2px rgba(13,129,96,.18), 0 1px 3px rgba(17,38,27,.08); }
.card.k-replaced p, .card.k-removed p { text-decoration:line-through; }
.card.k-replaced, .card.k-removed { border-style:dashed; opacity:.62; }
.card.k-changed { border-style:solid; }
svg.edges { position:absolute; inset:0; z-index:1; pointer-events:none; overflow:visible; }
footer { display:flex; justify-content:space-between; align-items:center; background:#0b1a13; color:#a8bcb2; padding:13px 48px; font-size:13px; }
footer b { color:#f4faf7; font-weight:800; font-size:14px; }
footer .url { font-family:ui-monospace,monospace; color:#65d7ad; }
.legend { display:flex; gap:18px; align-items:center; padding:10px 48px; background:#fff; border-bottom:1px solid #e2e8e4; font-size:12px; color:#45564d; }
.legend span { display:inline-flex; gap:6px; align-items:center; }
.legend i { width:13px; height:13px; border-radius:3px; border:1.6px solid; display:inline-block; }
.note { padding:12px 48px 16px; background:#fbfcfb; color:#7a887f; font-size:11.5px; line-height:1.6; word-break:keep-all; }
.note b { color:#45635a; }
</style></head><body>
<header>
  <div class="kick"><span>대한민국 제도 지도 / AI 행정 전후 비교 ${variant}</span><small>기준일 2026-08-21</small></div>
  <h1>${title}</h1>
  <p class="sub">${subtitle}</p>
  <p class="counts">
    <span><i style="background:#1f8962"></i>규정 근거 <b>${c.statute}</b></span>
    <span><i style="background:#2456d6"></i>추론(암묵지) <b>${c.inferred}</b></span>
    ${c.auto ? `<span><i style="background:#6b3fc4"></i>사이렌 자동 <b>${c.auto}</b></span>` : ""}
    ${c.replaced ? `<span><i style="background:#d99a5e"></i>대체 <b>${c.replaced}</b></span>` : ""}
    ${c.removed ? `<span><i style="background:#d47f7f"></i>소멸 <b>${c.removed}</b></span>` : ""}
    ${c.changed ? `<span><i style="background:#d9a821"></i>간소화 <b>${c.changed}</b></span>` : ""}
    <span style="color:#65d7ad">${headline}</span>
  </p>
</header>
<div class="legend">
  <span><i style="background:#eef8f2;border-color:#1f8962"></i>규정 근거(조문 표기)</span>
  <span><i style="background:#e9f0ff;border-color:#2456d6"></i>추론 — 규정에 없는 암묵지·실무 관행</span>
  <span><i style="background:#f3eefc;border-color:#7c56c9"></i>세종사이렌 자동 처리(보라 — AI 행위자)</span>
  <span><i style="background:#fdf6ee;border-color:#e5b58a"></i>대체(주황, 흐림·취소선) — ┄→ 승계 화살표가 사이렌 단계로</span>
  <span><i style="background:#fdf0f0;border-color:#e0a3a3"></i>소멸(빨강, 흐림)</span>
  <span><i style="background:#fdf8e3;border-color:#d9a821"></i>간소화(노랑) — 남되 부담 축소</span>
  <span>─→ 절차 순서 &nbsp; ┄→ 반려·보완 루프</span>
</div>
<div class="lanehead"><div>단계 ↓ · 행위자 →</div>${lanes.map((l) => `<div>${l}</div>`).join("")}</div>
<div id="pool" style="display:none">${cards}</div>
<div class="grid" id="grid">
  <svg class="edges" id="edgeLayer"></svg>
  ${gateRows}
</div>
<div class="note">
근거(본 세션 국가법령정보센터 DRF 원문 대조): 재난 및 안전관리 기본법 제16조(지역대책본부·실무반, 구성·운영 조례 위임)·제18조(재난안전상황실)·제20조(재난상황의 보고)·제34조의5(위기관리 매뉴얼 작성·운용)·제38조(위기경보의 발령)·제38조의2(재난 예보·경보체계·전기통신사업자 조치)·제40조(대피명령)·제74조의5(영상정보처리기기 통합관제센터 — 제2항 인공지능 분석 명문). <b>파란 칸은 규정에 명문이 없어 실무를 추론으로 재구성한 영역</b>이며, 기관에 따라 다를 수 있습니다. 세종사이렌 기능은 언론 보도(연합뉴스 2026-07-31, 시범운영·집중호우 실전 활용·AI 혁신 경진대회 최우수상) 기반입니다.
</div>
<footer><span><b>대한민국 제도 지도</b> · AI 세종사이렌 전후 비교</span><span class="url">hosungseo.github.io/korea100</span></footer>
<script>
const nodes = ${JSON.stringify(nodes.map((n) => n.id))};
nodes.forEach((id) => {
  const el = document.getElementById(id);
  const cell = document.querySelector('.cell[data-g="' + el.dataset.gate + '"][data-l="' + el.dataset.lane + '"]');
  cell.appendChild(el);
});
const edges = ${edgesJson};
const grid = document.getElementById("grid");
const svg = document.getElementById("edgeLayer");
const g = grid.getBoundingClientRect();
svg.setAttribute("width", g.width); svg.setAttribute("height", grid.scrollHeight);
svg.innerHTML = '<defs>' +
  '<marker id="a1" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#4a6157"/></marker>' +
  '<marker id="a2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#2456d6"/></marker>' +
  '<marker id="a3" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#0d8160"/></marker>' + '<marker id="a4" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#dda76f"/></marker></defs>';
const R = (el) => { const r = el.getBoundingClientRect(); return { l:r.left-g.left, r:r.right-g.left, t:r.top-g.top, b:r.bottom-g.top, cx:r.left-g.left+r.width/2, cy:r.top-g.top+r.height/2 }; };
edges.forEach(([s, t, kind, label]) => {
  const S = R(document.getElementById(s)), T = R(document.getElementById(t));
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  let d;
  const loop = kind === "loop";
  const auto = kind === "auto";
  const repl = kind === "replace";
  if (Math.abs(S.cx - T.cx) < 30 && T.t >= S.b) { d = \`M \${S.cx} \${S.b} L \${T.cx} \${T.t}\`; }
  else if (T.t >= S.b - 4) { const my = S.b + Math.max(8, (T.t - S.b) / 2); d = \`M \${S.cx} \${S.b} L \${S.cx} \${my} L \${T.cx} \${my} L \${T.cx} \${T.t}\`; }
  else if (S.t >= T.b - 4) { const my = T.b + Math.max(8, (S.t - T.b) / 2); d = \`M \${S.cx} \${S.t} L \${S.cx} \${my} L \${T.cx} \${my} L \${T.cx} \${T.b}\`; }
  else { const sx = S.cx < T.cx ? S.r : S.l, tx = S.cx < T.cx ? T.l : T.r; const mx = (sx + tx) / 2; d = \`M \${sx} \${S.cy} L \${mx} \${S.cy} L \${mx} \${T.cy} L \${tx} \${T.cy}\`; }
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", loop ? "#2456d6" : auto ? "#7c56c9" : repl ? "#dda76f" : "#4a6157");
  path.setAttribute("stroke-width", auto ? "2.2" : "1.6");
  if (loop || repl) path.setAttribute("stroke-dasharray", "5 4");
  path.setAttribute("marker-end", loop ? "url(#a2)" : auto ? "url(#a3)" : repl ? "url(#a4)" : "url(#a1)");
  svg.appendChild(path);
  if (label) {
    const pt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    pt.textContent = label;
    pt.setAttribute("x", (S.cx + T.cx) / 2); pt.setAttribute("y", Math.min(S.cy, T.cy) - 6);
    pt.setAttribute("fill", "#2456d6"); pt.setAttribute("font-size", "10"); pt.setAttribute("font-weight", "800");
    pt.setAttribute("text-anchor", "middle");
    svg.appendChild(pt);
  }
});
</script>
</body></html>`;
}

const OUT = "/private/tmp/claude-501/-Users-seohoseong/e453ea98-61a3-4e5d-97d4-ff8971c09387/scratchpad";
fs.writeFileSync(`${OUT}/siren-asis.html`, sheet({
  variant: "1/2 · AS-IS",
  title: "재난 하나에, 상황실은 <b>열아홉 단계</b>를 달린다",
  subtitle: "세종시 재난안전상황실의 재난 대응 전 과정을 규정(초록)과 추론(파랑)으로 나눠 그렸습니다. 위기경보·재난문자·대피명령 같은 법정 관문 사이에, 방대한 위기관리 매뉴얼 수기 검색·전파 문안 수기 작성·CCTV 육안 판독 같은 암묵지 수작업이 끼어 있습니다.",
  nodes: AS_IS, edges: AS_IS_EDGES,
  headline: "전 단계 19 = 규정 11 + 추론 8 · 상황 지속 루프 1",
}));
fs.writeFileSync(`${OUT}/siren-tobe.html`, sheet({
  variant: "2/2 · 세종사이렌 적용",
  title: "세종사이렌이 <b>여섯 번째 레인</b>으로 합류한다 — 5개 대체 · 2개 간소화 · <b>소멸 0</b>",
  subtitle: "재난안전상황실 근무자가 바이브코딩으로 무예산 자체개발한 '세종사이렌'을 새 행위자 레인으로 세웠습니다. 초 단위 유형 분류→전파대상 선정→문안 생성→임무카드·예측 지도→CCTV AI 분석까지. 여비몬과 달리 소멸이 없습니다 — 판단·발령·명령의 법정 관문은 전부 남고, AI는 그 사이의 속도를 바꿉니다. CCTV AI 분석은 법이 이미 예정한 활용입니다(제74조의5제2항).",
  nodes: TO_BE, edges: TO_BE_EDGES,
  headline: "대체 5 · 간소화 2 · 소멸 0 · 자동 5 — 사람 단계 19 → 14",
  lanes: LANES_TOBE,
  width: 1680,
}));
console.log("written siren asis + tobe");
