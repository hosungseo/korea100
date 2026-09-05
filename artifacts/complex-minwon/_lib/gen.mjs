// 복합민원 체계도 공용 렌더러. 사례 폴더의 case-data.mjs를 읽어 두 장을 만든다.
//   1) <slug>-full.html/.png    : 전체 체계도 (기관 레인 × 관문, 규정/추론 색 문법, 수행 기관 딱지)
//   2) <slug>-improve.html/.png : 같은 판 위에 간소화·효율화 후보를 색·번호로 표시 + 개선 카드 + 소관별 요청표
// 색 문법은 artifacts/ax-case-studies/sheet-template.js와 동일(규정 초록·추론 파랑·자동 보라·대체 주황·소멸 빨강·간소화 노랑).
// 사용: 사례 폴더의 gen.mjs가 build(import.meta.url, {png}) 호출.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const KIND = {
  rule:     { bg: '#eef8f2', border: '#1f8962', tagBg: '#1f8962', tag: '규정', text: '#17573f' },
  inferred: { bg: '#e9f0ff', border: '#2456d6', tagBg: '#2456d6', tag: '추론', text: '#1c3d8f' },
};
const IMP = {
  merge:    { color: '#d9a821', bg: '#fdf8e3', label: '통합' },
  automate: { color: '#7c56c9', bg: '#f3eefc', label: '자동화' },
  shorten:  { color: '#d99a5e', bg: '#fdf6ee', label: '축소·후제출' },
  drop:     { color: '#d47f7f', bg: '#fdf0f0', label: '갈음·폐지 검토' },
};

export async function build(caseUrl, { png = false } = {}) {
  const here = path.dirname(fileURLToPath(caseUrl));
  const data = await import(pathToFileURL(path.join(here, 'case-data.mjs')).href);
  const { meta, lanes, gates, nodes, edges, improvements } = data;
  const GROUPS = data.groups || {};
  const ORDER = data.orgOrder || [];
  const CHECKED = meta.checkedAt;
  const memberOf = new Map();
  for (const [gid, g] of Object.entries(GROUPS)) for (const m of g.members) memberOf.set(m, gid);
  const verification = JSON.parse(fs.readFileSync(path.join(here, 'verification.json'), 'utf8'));

  const fmtBasis = (b) => b.map((s) => `<span class="cite">§ ${s}</span>`).join('');

  function card(n, impMarks) {
    const k = KIND[n.kind];
    const marks = impMarks?.get(n.id) || [];
    const badges = marks.map((m) => `<i class="ib" style="background:${IMP[m.kind].color}">${m.id}</i>`).join('');
    const outline = marks.length ? `outline:3px solid ${IMP[marks[0].kind].color};outline-offset:2px;` : '';
    const dim = impMarks && !marks.length ? 'opacity:.42;' : '';
    return `<div class="card k-${n.kind}" id="${n.id}" data-gate="${n.gate}" data-lane="${n.lane}" data-group="${memberOf.get(n.id) || ''}"
      style="background:${k.bg};border-color:${k.border};color:${k.text};${outline}${dim}">
      <div class="chead"><b>${n.id}</b><span class="badges">${badges}</span><em style="background:${k.tagBg}">${k.tag}</em></div>
      <div class="org">${n.lane === lanes[0].id ? '👤' : '🏛'} ${n.org}</div>
      <p>${n.title}</p>
      ${n.desc ? `<small>${n.desc}</small>` : ''}
      ${n.basis ? `<div class="cites">${fmtBasis(n.basis)}</div>` : '<div class="cites"><span class="cite inf">규정 없음 — 실무 관행(기관별 상이)</span></div>'}
    </div>`;
  }

  function sheet({ variant, impMarks = null }) {
    const rule = nodes.filter((n) => n.kind === 'rule').length;
    const inf = nodes.filter((n) => n.kind === 'inferred').length;
    const cards = nodes.map((n) => card(n, impMarks)).join('');
    const groups = Object.entries(GROUPS).map(([gid, g]) =>
      `<div class="group" id="grp-${gid}" data-gate="${g.gate}" data-lane="${g.lane}"><div class="gtitle">${g.title}</div><div class="gbody"></div></div>`).join('');
    const gateRows = gates.map((g, gi) => `
      <div class="gate" data-g="${gi}">
        <div class="glabel"><b>${g.id}</b><span>${g.name}</span>${g.sub ? `<small>${g.sub}</small>` : ''}</div>
        ${lanes.map((_, li) => `<div class="cell" data-g="${gi}" data-l="${li}"></div>`).join('')}
      </div>`).join('');

    const impCount = impMarks ? Object.fromEntries(Object.keys(IMP).map((k) => [k, improvements.filter((i) => i.kind === k).length])) : null;
    const touched = impMarks ? impMarks.size : 0;
    const headline = impMarks
      ? `개선 후보 ${improvements.length}건 · 걸린 단계 ${touched}/${nodes.length}`
      : `전 단계 ${nodes.length} = 규정 ${rule} + 추론 ${inf}${meta.headlineExtra ? ' · ' + meta.headlineExtra(nodes) : ''}`;

    const width = 150 + lanes.reduce((a, l) => a + l.width, 0);
    const cols = '150px ' + lanes.map((l) => l.width + 'px').join(' ');
    const laneHead = lanes.map((l) => `<div><b>${l.name}</b><small>${l.sub}</small></div>`).join('');

    // 소관별 요청 묶음
    const orgMap = new Map();
    for (const i of improvements) for (const t of i.targets) {
      const [org, item] = t.split(' — ');
      if (!orgMap.has(org)) orgMap.set(org, { org, ids: [], items: [], nodes: new Set() });
      const r = orgMap.get(org);
      if (!r.ids.includes(i.id)) r.ids.push(i.id);
      r.items.push(`${i.id} ${item}`);
      i.nodes.forEach((n) => r.nodes.add(n));
    }
    const idx = (o) => { const i = ORDER.indexOf(o); return i < 0 ? 99 : i; };
    const orgRows = [...orgMap.values()].sort((a, b) => idx(a.org) - idx(b.org)).map((r) => ({ ...r, nodes: [...r.nodes].sort() }));

    const impPanel = impMarks ? `
    <section class="imp">
      <h2>간소화 · 효율화 후보 ${improvements.length}건 — 어느 조문을 고치면 되는가</h2>
      <p class="imphead">색은 개선 유형, 번호는 위 체계도의 배지와 같다. 근거 조문은 전부 현행본 원문 대조. ${meta.leverNote || ''}</p>
      <div class="impgrid">
        ${improvements.map((i) => `<div class="impcard" style="border-color:${IMP[i.kind].color};background:${IMP[i.kind].bg}">
          <div class="imptop"><i class="ib" style="background:${IMP[i.kind].color}">${i.id}</i><span class="impkind" style="color:${IMP[i.kind].color}">${IMP[i.kind].label}</span>${i.tier ? `<span class="tier t-${i.tier === '법률' ? 'act' : 'sub'}">${i.tier} 개정</span>` : ''}<span class="impnodes">${i.nodes.join(' · ')}</span></div>
          <h3>${i.title}</h3>
          <p>${i.why}</p>
          <div class="lever"><b>고칠 곳</b> ${i.lever}</div>
          <div class="targets">${i.targets.map((t) => `<span class="tg">→ ${t}</span>`).join('')}</div>
          ${i.tierNote ? `<div class="tiernote">${i.tierNote}</div>` : ''}
        </div>`).join('')}
      </div>
      <div class="orgtab">
        <h2>어느 기관에 무엇을 요청하나 — 소관별 묶음</h2>
        <table><thead><tr><th>요청 대상 기관</th><th>개선 건</th><th>손볼 조문 · 시스템</th><th>걸린 단계</th></tr></thead><tbody>
        ${orgRows.map((r) => `<tr><td class="org">${r.org}</td><td class="ids">${r.ids.join(' · ')}</td><td>${r.items.join('<br>')}</td><td>${r.nodes.join(' · ')}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </section>` : '';

    const lawList = verification.laws.map((l) => `${l.name} ${l.mst}(시행 ${l.effective.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')})`).join(' · ');
    const basisNote = [
      `<b>근거 대조.</b> 초록 칸의 조문 ${verification.citations}건을 법제처 DRF 현행본(eflaw, 시행일 지정) 원문과 항·호·목 단위로 기계 대조 — ${verification.passed}/${verification.citations} 일치, 조작 인용 ${verification.negative_control.probes.length}건 주입 시 전부 적발(검사기 정상). 대조일 ${CHECKED}.`,
      `<b>현행본:</b> ${lawList}.`,
      ...(meta.notes || []),
      `<b>추론(파랑) ${inf}칸</b>은 규정에 없는 실무 관행으로, 지자체·규모·용도에 따라 다르며 담당자 확인으로만 교정된다.`,
    ].map((s) => `<div>${s}</div>`).join('');

    return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${meta.title} ${variant}</title><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:${width}px; background:#f4f7f5; color:#12241c; font-family:"Apple SD Gothic Neo","Pretendard",sans-serif; }
header { background:#0b1a13; color:#f4faf7; padding:28px 48px 22px; }
.kick { display:flex; justify-content:space-between; color:#65d7ad; font-family:ui-monospace,monospace; font-size:14px; font-weight:700; letter-spacing:.1em; margin-bottom:10px; }
.kick small { color:#7d948a; }
h1 { font-size:36px; font-weight:800; letter-spacing:-0.02em; }
h1 b { color:#65d7ad; }
.sub { margin-top:8px; color:#a8bcb2; font-size:15px; line-height:1.5; word-break:keep-all; max-width:1500px; }
.src { margin-top:6px; color:#7d948a; font-size:12.5px; }
.counts { display:flex; flex-wrap:wrap; gap:22px; margin-top:14px; font-size:13.5px; color:#cfe0d8; }
.counts span { display:inline-flex; align-items:center; gap:6px; }
.counts i { width:11px; height:11px; border-radius:3px; display:inline-block; }
.counts b { font-family:ui-monospace,monospace; font-weight:800; }
.legend { display:flex; flex-wrap:wrap; gap:18px; align-items:center; padding:10px 48px; background:#fff; border-bottom:1px solid #e2e8e4; font-size:12.5px; color:#45564d; }
.legend span { display:inline-flex; gap:6px; align-items:center; }
.legend i { width:13px; height:13px; border-radius:3px; border:1.6px solid; display:inline-block; }
.legend .ln { width:26px; height:0; border-top:2px solid #4a6157; }
.lanehead { display:grid; grid-template-columns:${cols}; background:#fff; border-bottom:2px solid #17573f; }
.lanehead div { padding:11px 12px 9px; border-left:1px solid #e2e8e4; }
.lanehead div b { display:block; font-size:14.5px; font-weight:800; color:#17573f; }
.lanehead div small { display:block; margin-top:2px; font-size:11px; color:#6d7f76; line-height:1.35; word-break:keep-all; }
.lanehead div:first-child { color:#8a9990; font-family:ui-monospace,monospace; font-size:11px; font-weight:700; border-left:0; }
.grid { position:relative; }
.gate { display:grid; grid-template-columns:${cols}; border-bottom:2px solid #17573f; background:#fbfcfb; }
.gate:nth-child(even) { background:#f6f9f7; }
.glabel { padding:14px 12px 54px; border-right:1px solid #e2e8e4; }
.glabel b { display:block; color:#17573f; font-family:ui-monospace,monospace; font-size:13px; font-weight:800; }
.glabel span { display:block; color:#45635a; font-size:12.5px; font-weight:800; word-break:keep-all; line-height:1.35; }
.glabel small { display:block; margin-top:4px; color:#8a9990; font-size:10.5px; line-height:1.35; word-break:keep-all; }
.cell { min-height:64px; padding:14px 24px 54px; border-left:1px dotted #d5ddd8; display:grid; grid-template-columns:repeat(auto-fill, minmax(172px, 1fr)); gap:20px 32px; align-content:start; }
.card { position:relative; z-index:2; border:1.6px solid; border-radius:8px; padding:8px 10px 8px; box-shadow:0 1px 3px rgba(17,38,27,.07); background:#fff; }
.card .chead { display:flex; align-items:center; gap:5px; margin-bottom:3px; }
.card .chead .badges { flex:1; display:flex; gap:3px; }
.card b { font-family:ui-monospace,monospace; font-size:10.5px; font-weight:800; opacity:.75; }
.card em { color:#fff; font-style:normal; font-size:9px; font-weight:800; padding:1px 7px 2px; border-radius:8px; }
.card .org { display:inline-block; margin:1px 0 4px; font-size:9.5px; font-weight:800; color:#fff; background:#2f3f39; border-radius:4px; padding:1px 6px 2px; letter-spacing:-0.01em; }
.card p { font-size:12.5px; font-weight:750; line-height:1.35; word-break:keep-all; }
.card small { display:block; margin-top:3px; font-size:10px; line-height:1.4; color:inherit; opacity:.78; word-break:keep-all; }
.cites { margin-top:4px; display:flex; flex-wrap:wrap; gap:3px; }
.cite { font-family:ui-monospace,monospace; font-size:9px; font-weight:700; padding:1px 5px; border-radius:4px; background:rgba(23,87,63,.09); color:inherit; opacity:.85; }
.cite.inf { background:rgba(36,86,214,.10); }
.card.k-inferred { box-shadow:0 1px 3px rgba(36,86,214,.14); }
.ib { display:inline-block; color:#fff; font-style:normal; font-family:ui-monospace,monospace; font-size:9px; font-weight:800; padding:1px 5px; border-radius:4px; }
.group { position:relative; z-index:2; grid-column:1 / -1; border:1.5px dashed #6f8c80; border-radius:10px; padding:8px 14px 16px; background:rgba(31,137,98,.04); }
.group .gtitle { font-size:11px; font-weight:800; color:#17573f; margin-bottom:6px; }
.group .gbody { display:grid; grid-template-columns:repeat(2, 1fr); gap:20px 32px; }
svg.edges { position:absolute; inset:0; z-index:1; pointer-events:none; overflow:visible; }
.note { padding:14px 48px 18px; background:#fbfcfb; color:#7a887f; font-size:11.5px; line-height:1.65; word-break:keep-all; border-top:2px solid #17573f; }
.note b { color:#45635a; }
.note div { margin-top:3px; }
footer { display:flex; justify-content:space-between; align-items:center; background:#0b1a13; color:#a8bcb2; padding:13px 48px; font-size:13px; }
footer b { color:#f4faf7; font-weight:800; font-size:14px; }
footer .url { font-family:ui-monospace,monospace; color:#65d7ad; }
.imp { padding:22px 48px 26px; background:#fff; border-top:2px solid #17573f; }
.imp h2 { font-size:20px; font-weight:800; color:#17573f; letter-spacing:-0.01em; }
.imphead { margin-top:6px; color:#45635a; font-size:12.5px; line-height:1.5; word-break:keep-all; max-width:1500px; }
.impgrid { margin-top:14px; display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; }
.impcard { border:1.8px solid; border-radius:10px; padding:10px 12px; }
.imptop { display:flex; align-items:center; gap:8px; }
.impkind { font-size:11px; font-weight:800; }
.tier { font-size:10px; font-weight:800; padding:1.5px 6px; border-radius:9px; }
.tier.t-act { background:#f6e2e2; color:#8f3d3d; }
.tier.t-sub { background:#e2eef6; color:#1f5f89; }
.tiernote { margin-top:6px; font-size:11px; line-height:1.5; color:#4a6157; word-break:keep-all; }
.impnodes { margin-left:auto; font-family:ui-monospace,monospace; font-size:10px; color:#6d7f76; }
.impcard h3 { margin-top:5px; font-size:14px; font-weight:800; color:#12241c; word-break:keep-all; }
.impcard p { margin-top:5px; font-size:11.5px; line-height:1.5; color:#2e4038; word-break:keep-all; }
.lever { margin-top:6px; font-size:11px; line-height:1.45; color:#17573f; background:rgba(255,255,255,.7); border-radius:6px; padding:5px 8px; word-break:keep-all; }
.lever b { margin-right:4px; }
.targets { margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; }
.tg { font-size:10.5px; font-weight:800; color:#fff; background:#2f3f39; border-radius:4px; padding:2px 7px 3px; }
.orgtab { margin-top:22px; }
.orgtab h2 { font-size:18px; font-weight:800; color:#17573f; }
.orgtab table { margin-top:10px; width:100%; border-collapse:collapse; font-size:12px; }
.orgtab th { text-align:left; background:#eef8f2; color:#17573f; padding:7px 10px; border-bottom:2px solid #17573f; }
.orgtab td { padding:7px 10px; border-bottom:1px solid #e2e8e4; vertical-align:top; word-break:keep-all; line-height:1.45; }
.orgtab td.org { font-weight:800; white-space:nowrap; }
.orgtab td.ids { font-family:ui-monospace,monospace; font-weight:800; white-space:nowrap; }
</style></head><body>
<header>
  <div class="kick"><span>대한민국 제도 지도 / ${meta.kick} ${variant}</span><small>기준일 ${CHECKED} · 법제처 현행본 대조</small></div>
  <h1>${impMarks ? meta.titleImprove : meta.titleFull}</h1>
  <p class="sub">${meta.subtitle}</p>
  <p class="src">${meta.source}</p>
  <p class="counts">
    <span><i style="background:#1f8962"></i>규정 근거 <b>${rule}</b></span>
    <span><i style="background:#2456d6"></i>추론(암묵지) <b>${inf}</b></span>
    ${(meta.stats || []).map((s) => `<span>${s.label} <b>${s.value}</b>${s.unit || ''}</span>`).join('')}
    ${impCount ? Object.entries(impCount).map(([k, v]) => `<span><i style="background:${IMP[k].color}"></i>${IMP[k].label} <b>${v}</b></span>`).join('') : ''}
    <span style="color:#65d7ad">${headline}</span>
  </p>
</header>
<div class="legend">
  <span><i style="background:#eef8f2;border-color:#1f8962"></i>규정 근거(조문 표기 · 항·호까지)</span>
  <span><i style="background:#e9f0ff;border-color:#2456d6"></i>추론 — 규정에 없는 실무 관행</span>
  ${impMarks ? Object.values(IMP).map((v) => `<span><i style="background:${v.bg};border-color:${v.color};outline:2px solid ${v.color};outline-offset:1px"></i>${v.label}</span>`).join('') + '<span>흐린 칸 = 이번 개선 후보에 안 걸린 단계</span>' : ''}
  <span><i style="background:#2f3f39;border-color:#2f3f39"></i> 딱지 = 그 단계를 실제로 수행하는 기관·부서</span>
  <span><i class="ln"></i> 절차 순서</span>
  <span><i class="ln" style="border-top:1.4px solid #8aa39a"></i> 병렬 협의</span>
  <span><i class="ln" style="border-top:1.6px dashed #2456d6"></i> 보완·부동의·재심의 루프</span>
  <span><i class="ln" style="border-top:1.6px dashed #9aa8a1"></i> 선택·대상 한정 경로</span>
  ${Object.keys(GROUPS).length ? '<span><i style="border:1.5px dashed #6f8c80;background:rgba(31,137,98,.04)"></i> 묶음 = 해당 사항이 있을 때만 걸리는 검토</span>' : ''}
</div>
<div class="lanehead"><div>관문 ↓ · 기관 →</div>${laneHead}</div>
<div id="pool" style="display:none">${cards}${groups}</div>
<div class="grid" id="grid">
  <svg class="edges" id="edgeLayer"></svg>
  ${gateRows}
</div>
${impPanel}
<div class="note">${basisNote}</div>
<footer><span><b>대한민국 제도 지도</b> · ${meta.kick} ${meta.shortName} ${impMarks ? '— 간소화·효율화 표시판' : '— 전체 체계도'}</span><span class="url">hosungseo.github.io/korea100</span></footer>
<script>
const gateIdx = ${JSON.stringify(Object.fromEntries(gates.map((g, i) => [g.id, i])))};
const laneIdx = ${JSON.stringify(Object.fromEntries(lanes.map((l, i) => [l.id, i])))};
// place cards in data order; a group box is inserted into its cell when its first member appears
${JSON.stringify(nodes.map((n) => n.id))}.forEach((id) => {
  const el = document.getElementById(id);
  if (el.dataset.group) {
    const grp = document.getElementById('grp-' + el.dataset.group);
    if (grp.parentElement.id === 'pool') {
      const gcell = document.querySelector('.cell[data-g="' + gateIdx[grp.dataset.gate] + '"][data-l="' + laneIdx[grp.dataset.lane] + '"]');
      gcell.appendChild(grp);
    }
    grp.querySelector('.gbody').appendChild(el); return;
  }
  const cell = document.querySelector('.cell[data-g="' + gateIdx[el.dataset.gate] + '"][data-l="' + laneIdx[el.dataset.lane] + '"]');
  cell.appendChild(el);
});
const edges = ${JSON.stringify(edges)};
const grid = document.getElementById('grid');
const svg = document.getElementById('edgeLayer');
const g = grid.getBoundingClientRect();
svg.setAttribute('width', g.width); svg.setAttribute('height', grid.scrollHeight);
const mk = (id, c) => '<marker id="' + id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="' + c + '"/></marker>';
svg.innerHTML = '<defs>' + mk('a-seq', '#4a6157') + mk('a-loop', '#2456d6') + mk('a-par', '#8aa39a') + mk('a-opt', '#9aa8a1') + '</defs>';
const R = (el) => { const r = el.getBoundingClientRect(); return { l:r.left-g.left, r:r.right-g.left, t:r.top-g.top, b:r.bottom-g.top, cx:r.left-g.left+r.width/2, cy:r.top-g.top+r.height/2 }; };
const STYLE = { seq: ['#4a6157', 1.6, ''], loop: ['#2456d6', 1.5, '5 4'], par: ['#8aa39a', 1.2, ''], opt: ['#9aa8a1', 1.4, '4 4'] };
// ── 배선 원칙 ──────────────────────────────────────────────────────────
// 선은 카드가 없는 곳(관문 행 하단의 빈 띠 · 카드 좌우 여백 · 같은 칸 카드 사이 틈)만 지난다.
// 한 선마다 후보 경로를 여러 개 만들어 ①카드 관통 ②이미 놓인 선과 나란히 겹침이 없는 것을 고른다.
// 고른 경로의 모든 구간을 등록해 다음 선이 그 자리를 피한다. 카드에 붙는 선이 여럿이면 변을 나눠 쓴다.
const GUT = 52, LANE = 6, TOL = 3;
const rowRects = [...grid.querySelectorAll('.gate')].map((el) => { const r = el.getBoundingClientRect(); return { t: r.top - g.top, b: r.bottom - g.top }; });
const rowIdx = (y) => { const i = rowRects.findIndex((r) => y >= r.t - 1 && y <= r.b + 1); return i < 0 ? (y < rowRects[0].t ? 0 : rowRects.length - 1) : i; };
const boxes = [...grid.querySelectorAll('.card, .group')].map((el) => ({ el, r: R(el) }));
const hSegs = [], vSegs = [];
const iv = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1);
// 카드 관통 검사 (선분 하나). 끝점 카드도 예외로 두지 않는다 — 변에 닿는 것은 내부 겹침 0 이라 통과하고,
// 카드 속을 지나 들어가는 경로는 여기서 걸린다. 예외는 끝점을 감싸고 있는 묶음 상자뿐.
const crosses = (x1, y1, x2, y2, skip) => boxes.some(({ el, r }) => {
  if (skip.includes(el)) return false;
  const ix = iv(Math.min(x1, x2), Math.max(x1, x2), r.l, r.r), iy = iv(Math.min(y1, y2), Math.max(y1, y2), r.t, r.b);
  const vert = Math.abs(x1 - x2) < 0.5, horz = Math.abs(y1 - y2) < 0.5;
  return (vert ? ix > -TOL : ix > TOL) && (horz ? iy > -TOL : iy > TOL);
});
const dupH = (y, x1, x2) => hSegs.some((s2) => Math.abs(s2.y - y) < LANE - 1 && iv(s2.a, s2.b, Math.min(x1, x2), Math.max(x1, x2)) > 4);
const dupV = (x, y1, y2) => vSegs.some((s2) => Math.abs(s2.x - x) < LANE - 1 && iv(s2.a, s2.b, Math.min(y1, y2), Math.max(y1, y2)) > 4);
// 경로(점 목록) 하나를 평가: [카드 관통 수, 겹침 수, 길이]
const score = (pts, skip) => {
  let cross = 0, dup = 0, len = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) < 0.5) continue;
    len += Math.abs(x1 - x2) + Math.abs(y1 - y2);
    if (crosses(x1, y1, x2, y2, skip)) cross++;
    if (Math.abs(y1 - y2) < 0.5 ? dupH(y1, x1, x2) : dupV(x1, y1, y2)) dup++;
  }
  return [cross, dup, len];
};
const register = (pts) => {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    if (Math.abs(y1 - y2) < 0.5) hSegs.push({ y: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) });
    else vSegs.push({ x: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) });
  }
};
// 카드에 붙는 선이 여럿이면 변을 나눠 쓴다 — 기본 방향으로 먼저 배분한다
const port = {};
const baseSide = (S, T) => (T.t >= S.b - 4 ? ['b', 't'] : (S.t >= T.b - 4 ? ['t', 'b'] : (S.cx < T.cx ? ['r', 'l'] : ['l', 'r'])));
edges.forEach(([s, t]) => {
  const Se = document.getElementById(s), Te = document.getElementById(t);
  if (!Se || !Te) return;
  const [a, b] = baseSide(R(Se), R(Te)), key = s + '>' + t;
  (port[s + a] = port[s + a] || []).push(key); (port[t + b] = port[t + b] || []).push(key);
  (port[s + '*'] = port[s + '*'] || []).push(key); (port[t + '*'] = port[t + '*'] || []).push(key);
});
const anchor = (rect, id, sd, key) => {
  const list = port[id + sd] || port[id + '*'] || [], i = Math.max(0, list.indexOf(key)), n = Math.max(1, list.length);
  if (sd === 'b' || sd === 't') {
    const w = rect.r - rect.l, m = Math.min(24, w / 3), span = w - 2 * m;
    return { x: n <= 1 ? rect.l + w / 2 : rect.l + m + (span * (i + 0.5)) / n, y: sd === 'b' ? rect.b : rect.t };
  }
  const h = rect.b - rect.t, m = Math.min(12, h / 3), span = h - 2 * m;
  return { x: sd === 'r' ? rect.r : rect.l, y: n <= 1 ? rect.t + h / 2 : rect.t + m + (span * (i + 0.5)) / n };
};
// 가로 통로(행 하단 빈 띠) 후보 · 세로 통로(카드 옆 여백) 후보
const bands = (S, T) => {
  const i0 = Math.min(rowIdx(S.cy), rowIdx(T.cy)), i1 = Math.max(rowIdx(S.cy), rowIdx(T.cy));
  const out = [];
  for (let i = i0; i <= i1; i++) for (let k = 0; k < 7; k++) out.push(rowRects[i].b - GUT + 6 + k * LANE);
  const gap = (rect, up) => (up ? rect.t - 9 : rect.b + 9);
  out.push(gap(T, true), gap(T, false), gap(S, true), gap(S, false));
  for (let k = 1; k <= 4; k++) { out.push(T.t - 9 - k * LANE, T.b + 9 + k * LANE, S.b + 9 + k * LANE, S.t - 9 - k * LANE); }
  return out;
};
const chans = (rect, sd) => { const b = sd === 'l' ? rect.l - 11 : rect.r + 11, out = []; for (let k = 0; k < 26; k++) out.push(sd === 'l' ? b - k * LANE : b + k * LANE); return out; };
// 마지막 수단 통로: 관문 이름 칸(맨 왼쪽)과 판 오른쪽 끝은 카드가 없다
const EDGE_CH = [128, 134, 140, 146, g.width - 10, g.width - 16, g.width - 22];
edges.forEach(([s, t, kind]) => {
  const Se = document.getElementById(s), Te = document.getElementById(t);
  if (!Se || !Te) { console.warn('missing', s, t); return; }
  const S = R(Se), T = R(Te), key = s + '>' + t;
  const skip = [Se, Te].map((el) => el.parentElement && el.parentElement.closest('.group')).filter(Boolean);
  const A = {}; for (const sd of ['b', 't', 'l', 'r']) A[sd] = { S: anchor(S, s, sd, key), T: anchor(T, t, sd, key) };
  const cand = [];
  const push = (pts) => { if (pts.every((p2) => Number.isFinite(p2[0]) && Number.isFinite(p2[1]))) cand.push(pts); };
  const [bs, bt] = baseSide(S, T);
  // ① 곧장 세로 (같은 열 위아래)
  if (bs === 'b' || bs === 't') {
    const P = A[bs].S, Q = A[bt].T;
    if (Math.abs(P.x - Q.x) < 16) push([[P.x, P.y], [P.x, Q.y]]);
    for (const y of bands(S, T)) push([[P.x, P.y], [P.x, y], [Q.x, y], [Q.x, Q.y]]);   // ② 거터 경유
  }
  // ③ 같은 행 좌우 직선
  if (bs === 'r' || bs === 'l') {
    const P = A[bs].S, Q = A[bt].T;
    for (const x of chans(S, bs).slice(0, 12)) push([[P.x, P.y], [x, P.y], [x, Q.y], [Q.x, Q.y]]);
  }
  // ④ 통로 우회: 옆으로 나가 통로·거터를 거쳐 옆으로 들어간다
  for (const sd of ['r', 'l']) for (const td of ['l', 'r']) {
    const P = A[sd].S, Q = A[td].T;
    for (const y of bands(S, T)) for (const cs of chans(S, sd).slice(0, 12)) for (const ct of chans(T, td).slice(0, 12))
      push([[P.x, P.y], [cs, P.y], [cs, y], [ct, y], [ct, Q.y], [Q.x, Q.y]]);
  }
  // ⑤ 아래로 나가 아래 띠를 거쳐 밑으로 들어간다 / 위로 나가 위 띠를 거쳐 위로 들어간다
  for (const [sdx, tdx] of [['b', 'b'], ['t', 't'], ['b', 't'], ['t', 'b']]) {
    const P = A[sdx].S, Q = A[tdx].T;
    for (const y of bands(S, T)) push([[P.x, P.y], [P.x, y], [Q.x, y], [Q.x, Q.y]]);
  }
  // ⑥ 판 가장자리 통로로 크게 우회
  for (const sd of ['r', 'l']) for (const td of ['l', 'r']) {
    const P = A[sd].S, Q = A[td].T;
    for (const y of bands(S, T)) for (const cs of EDGE_CH) for (const ct of chans(T, td).slice(0, 6)) push([[P.x, P.y], [cs, P.y], [cs, y], [ct, y], [ct, Q.y], [Q.x, Q.y]]);
  }
  // ⑦ 아래로 나가 통로로 들어간다 / 옆으로 나가 위로 들어간다
  for (const td of ['l', 'r']) { const P = A['b'].S, Q = A[td].T;
    for (const y of bands(S, T)) for (const ct of chans(T, td).slice(0, 12)) push([[P.x, P.y], [P.x, y], [ct, y], [ct, Q.y], [Q.x, Q.y]]); }
  for (const sd of ['r', 'l']) { const P = A[sd].S, Q = A['t'].T;
    for (const y of bands(S, T)) for (const cs of chans(S, sd).slice(0, 12)) push([[P.x, P.y], [cs, P.y], [cs, y], [Q.x, y], [Q.x, Q.y]]); }
  let best = null, bestScore = null;
  for (const pts of cand) {
    const sc = score(pts, skip);
    if (!bestScore || sc[0] < bestScore[0] || (sc[0] === bestScore[0] && (sc[1] < bestScore[1] || (sc[1] === bestScore[1] && sc[2] < bestScore[2])))) { best = pts; bestScore = sc; }
    if (bestScore[0] === 0 && bestScore[1] === 0) break;
  }
  register(best);
  if (bestScore[0] || bestScore[1]) console.warn('route', key, '관통', bestScore[0], '겹침', bestScore[1]);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M ' + best.map((p2) => p2[0] + ' ' + p2[1]).join(' L '));
  const [c, w, dash] = STYLE[kind] || STYLE.seq;
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', c); path.setAttribute('stroke-width', w);
  if (dash) path.setAttribute('stroke-dasharray', dash);
  path.setAttribute('data-edge', key);
  path.setAttribute('marker-end', 'url(#a-' + (STYLE[kind] ? kind : 'seq') + ')');
  svg.appendChild(path);
});
</script>
</body></html>`;
  }

  // ── sanity ──
  const impMarks = new Map();
  for (const i of improvements) for (const nid of i.nodes) {
    if (!nodes.find((n) => n.id === nid)) throw new Error(`improvement ${i.id} references unknown node ${nid}`);
    if (!impMarks.has(nid)) impMarks.set(nid, []);
    impMarks.get(nid).push({ id: i.id, kind: i.kind });
  }
  for (const [s, t] of edges) for (const id of [s, t]) if (!nodes.find((n) => n.id === id) && !(id.startsWith('grp-') && GROUPS[id.slice(4)])) throw new Error(`edge references unknown node ${id}`);
  for (const n of nodes) { if (!n.org) throw new Error(`node ${n.id} has no org`); if (!lanes.find((l) => l.id === n.lane)) throw new Error(`node ${n.id} lane ${n.lane} unknown`); if (!gates.find((g) => g.id === n.gate)) throw new Error(`node ${n.id} gate ${n.gate} unknown`); }

  const outputs = [
    [`${meta.slug}-full.html`, sheet({ variant: '전체 체계도' })],
    [`${meta.slug}-improve.html`, sheet({ variant: '간소화·효율화 표시판', impMarks })],
  ];
  for (const [f, html] of outputs) fs.writeFileSync(path.join(here, f), html);
  console.log('html written:', outputs.map(([f]) => f).join(', '));

  if (png) {
    // playwright is installed globally; ESM import ignores NODE_PATH, so resolve from `npm root -g`
    const { createRequire } = await import('node:module');
    const { execSync } = await import('node:child_process');
    const globalRoot = execSync('npm root -g').toString().trim();
    const { chromium } = createRequire(path.join(globalRoot, 'x.js'))('playwright');
    const browser = await chromium.launch();
    const width = 150 + lanes.reduce((a, l) => a + l.width, 0);
    for (const [f] of outputs) {
      // meta.pngScale: 아주 긴 판(4호 19행)은 @2x가 Chromium 캡처 한계를 넘는다. 기본 2, 사례가 낮출 수 있다.
      const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: meta.pngScale ?? 2 });
      await page.goto('file://' + path.join(here, f));
      await page.waitForTimeout(400);
      const pngName = f.replace(/\.html$/, '.png');
      await page.screenshot({ path: path.join(here, pngName), fullPage: true });
      const h = await page.evaluate(() => document.body.scrollHeight);
      console.log('png', pngName, 'height', h, 'cards', nodes.length);
      await page.close();
    }
    await browser.close();
  }
}
