// 4단계(판). 엔진 결과를 사람이 보는 비교대조 판. A = 지표×법률, C = 기관×마일스톤.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readJson } from './lib/io.mjs';
import { OUT, OUT_COMPARE } from './lib/paths.mjs';
import { loadSubjects } from './lib/normalize.mjs';

const ROUNDTRIP = new Set(['consult', 'deliberate']);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');

export function buildMatrices({ procs, cards, verdicts, subjects }) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const ok = Object.values(cards).filter((c) => c.extractStatus === 'ok');
  const passedBy = new Map(); for (const v of verdicts) if (v.passed) passedBy.set(`${v.axis}|${v.key}`, v.cid);

  // A: rows subjects (taxonomy order, then other:* seen), cols laws in first-seen order
  const laws = []; for (const p of procs) for (const l of p.legal) if (!laws.includes(l.law)) laws.push(l.law);
  const subjectKeys = [...Object.keys(subjects), ...new Set(ok.flatMap((c) => c.subjects).filter((s) => s.startsWith('other:')))];
  const rowsA = subjectKeys.map((key) => {
    const cells = {}; for (const law of laws) cells[law] = { pids: [] };
    for (const c of ok) if (c.subjects.includes(key)) for (const l of byPid.get(c.pid)?.legal ?? []) if (!cells[l.law].pids.includes(c.pid)) cells[l.law].pids.push(c.pid);
    const lawsHit = laws.filter((l) => cells[l].pids.length);
    return { key, label: subjects[key] ?? key.slice(6), cells, lawsHit: lawsHit.length, candidate: lawsHit.length >= 2, passedCid: passedBy.get(`same-subject|${key}`) ?? null };
  }).filter((r) => r.lawsHit > 0);

  // C: rows real orgs, cols milestones by msOrder
  const msList = [...new Map(procs.map((p) => [p.ms, p])).values()].sort((a, b) => a.msOrder - b.msOrder)
    .map((p) => ({ ms: p.ms, name: p.msName, critical: !!p.onCritical }));
  const orgRows = new Map();
  for (const c of ok) {
    if (c.orgKind !== 'org') continue;
    if (!orgRows.has(c.org)) orgRows.set(c.org, { org: c.org, label: c.orgLabel, cells: Object.fromEntries(msList.map((m) => [m.ms, { count: 0, pids: [] }])) });
    const p = byPid.get(c.pid); if (!p) continue;
    const cell = orgRows.get(c.org).cells[p.ms]; cell.pids.push(c.pid); if (ROUNDTRIP.has(c.act)) cell.count++;
  }
  const rowsC = [...orgRows.values()].map((r) => ({ ...r, passedCids: verdicts.filter((v) => v.passed && v.axis === 'org-roundtrip' && v.key.startsWith(r.org + '@')).map((v) => v.cid) }))
    .sort((a, b) => Object.values(b.cells).reduce((s, c) => s + c.count, 0) - Object.values(a.cells).reduce((s, c) => s + c.count, 0));
  return { A: { cols: laws, rows: rowsA }, C: { cols: msList, rows: rowsC } };
}

export function renderReview({ procs, cards, verdicts, improvements = [], subjects, meta }) {
  const { A, C } = buildMatrices({ procs, cards, verdicts, subjects });
  const impByCid = new Map(improvements.map((i) => [i.cid, i]));
  const cellA = (r, law) => { const c = r.cells[law]; if (!c.pids.length) return '<td></td>';
    const cls = r.passedCid ? 'pass' : r.candidate ? 'cand' : 'one';
    return `<td class="${cls} click" data-pids="${esc(c.pids.join(','))}">${c.pids.length}</td>`; };
  const tableA = `<table id="matA"><thead><tr><th>심사 지표</th>${A.cols.map((l) => `<th>${esc(l)}</th>`).join('')}<th>법률 수</th><th>묶음</th></tr></thead><tbody>${
    A.rows.map((r) => `<tr><td class="fold">${esc(r.label)}<small>${esc(r.key)}</small></td>${A.cols.map((l) => cellA(r, l)).join('')}<td>${r.lawsHit}</td><td>${r.passedCid ? `<b>${esc(r.passedCid)}</b>${impByCid.get(r.passedCid) ? ' · ' + esc(impByCid.get(r.passedCid).id) : ''}` : (r.candidate ? '후보' : '')}</td></tr>`).join('')}</tbody></table>`;
  const cellC = (r, m) => { const c = r.cells[m.ms]; if (!c.pids.length) return `<td class="${m.critical ? 'crit' : ''}"></td>`;
    const cls = c.count >= 2 ? 'cand' : c.count === 1 ? 'one' : 'zero';
    return `<td class="${cls} click ${m.critical ? 'crit' : ''}" data-pids="${esc(c.pids.join(','))}">${c.count}<small>/${c.pids.length}</small></td>`; };
  const tableC = `<table id="matB"><thead><tr><th>기관</th>${C.cols.map((m) => `<th class="${m.critical ? 'crit' : ''}">${esc(m.ms)}<small>${esc(m.name)}</small></th>`).join('')}<th>묶음</th></tr></thead><tbody>${
    C.rows.map((r) => `<tr><td class="fold">${esc(r.label)}</td>${C.cols.map((m) => cellC(r, m)).join('')}<td>${r.passedCids.map(esc).join(', ')}</td></tr>`).join('')}</tbody></table>`;
  const clusters = verdicts.map((v) => `<div class="cl ${v.passed ? 'pass' : ''}"><b>${esc(v.cid)}</b> ${v.axis === 'same-subject' ? '같은 지표' : '기관 왕복'} · ${esc(v.key)} · 절차 ${v.pids.length}${v.passed ? ` · <span class="ok">통과</span>${impByCid.get(v.cid) ? ' · ' + esc(impByCid.get(v.cid).id) + ' ' + esc(impByCid.get(v.cid).title) : ''}` : ` · <span class="no">${esc(v.reason ?? '탈락')}</span>`}
    <ul>${v.pairs.filter((p) => p.mergeable).map((p) => `<li>${esc(p.a)} × ${esc(p.b)} — ${esc(p.reason)}</li>`).join('')}</ul></div>`).join('');
  const data = { procs: Object.fromEntries(procs.map((p) => [p.pid, { name: p.name, ms: p.ms, actor: p.actorRaw, legal: p.legal.map((l) => `${l.law} ${l.article}`), card: cards[p.pid] ? { act: cards[p.pid].act, subjects: cards[p.pid].subjects, clock: cards[p.pid].clock } : null }])) };
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f4f7f5;color:#12241c;font-family:"Apple SD Gothic Neo","Pretendard",sans-serif;padding-right:380px}
header{background:#0b1a13;color:#f4faf7;padding:26px 36px 18px}
.kick{color:#65d7ad;font-family:ui-monospace,monospace;font-size:13px;font-weight:700;letter-spacing:.08em;margin-bottom:8px}
h1{font-size:26px;font-weight:800} h2{font-size:16px;margin:26px 36px 8px}
.sub{margin-top:8px;color:#a8bcb2;font-size:13px;line-height:1.5;word-break:keep-all}
.legend{display:flex;gap:16px;flex-wrap:wrap;padding:10px 36px;background:#fff;border-bottom:1px solid #e2e8e4;font-size:12px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px;border:1px solid}
table{margin:0 36px;border-collapse:collapse;background:#fff;font-size:12px}
th,td{border:1px solid #d7e0db;padding:5px 7px;vertical-align:top;text-align:center;min-width:34px}
th{background:#0b1a13;color:#e8f6ef;font-size:10.5px;font-weight:800;max-width:110px;word-break:keep-all}
th small,td small{display:block;font-weight:400;color:#9fb5aa;font-size:9.5px}
td.fold{text-align:left;font-weight:800;white-space:nowrap} td.fold small{color:#7d938a}
td.one{background:#eef8f2} td.cand{background:#fdf8e3;font-weight:800} td.pass{background:#fdf8e3;outline:2px solid #d9a821;outline-offset:-2px;font-weight:800}
td.zero{background:#f6f6f6;color:#9aa} th.crit{background:#163325} td.crit{box-shadow:inset 0 0 0 999px rgba(31,137,98,.06)}
td.click{cursor:pointer} td.click:hover{filter:brightness(.95)}
.cl{margin:8px 36px;padding:8px 12px;background:#fff;border:1px solid #d7e0db;border-radius:6px;font-size:12.5px} .cl.pass{border-color:#d9a821}
.cl ul{margin:4px 0 0 16px;color:#45564d} .ok{color:#1f8962;font-weight:800} .no{color:#a55}
#panel{position:fixed;top:0;right:0;width:370px;height:100vh;overflow:auto;background:#fff;border-left:1px solid #d7e0db;padding:16px;font-size:12.5px}
#panel h3{font-size:13px;margin-bottom:8px} #panel .p{border-bottom:1px solid #eee;padding:6px 0} #panel .p b{display:block} #panel .cite{color:#17573f;font-family:ui-monospace,monospace;font-size:11px}
</style></head><body>
<header><div class="kick">복합민원 비교대조 판 · ${esc(meta.asOf)} · 엔진 산출</div><h1>${esc(meta.title)}</h1>
<p class="sub">위 표: 행 = 심사 지표, 열 = 법률. 한 행에 서로 다른 법 칸이 2개 이상이면 통합 후보(노랑), 판정 통과는 테두리. 아래 표: 행 = 기관, 열 = 마일스톤(착수 순). 칸 = 협의·심의 횟수/절차 수. 진한 열 = 크리티컬. 칸을 누르면 오른쪽에 절차·조문.</p></header>
<div class="legend"><span><i style="background:#eef8f2;border-color:#1f8962"></i>1개 법</span><span><i style="background:#fdf8e3;border-color:#d9a821"></i>후보</span><span><i style="background:#fdf8e3;border-color:#d9a821;outline:2px solid #d9a821"></i>판정 통과</span></div>
<h2>A. 같은 지표를 다른 법이 심사한다 (${A.rows.filter((r) => r.candidate).length} 후보 / ${A.rows.filter((r) => r.passedCid).length} 통과)</h2>
<div style="overflow-x:auto">${tableA}</div>
<h2>C. 같은 기관에 몇 번 가나 (${C.rows.length} 기관)</h2>
<div style="overflow-x:auto">${tableC}</div>
<h2>묶음 ${verdicts.length} · 통과 ${verdicts.filter((v) => v.passed).length} · 카드 ${improvements.length}</h2>
${clusters}
<aside id="panel"><h3>칸을 누르면 절차가 여기 뜹니다</h3></aside>
<script>
const DATA = ${JSON.stringify(data)};
document.querySelectorAll('td.click').forEach((td) => td.addEventListener('click', () => {
  const pids = td.dataset.pids.split(',');
  document.getElementById('panel').innerHTML = '<h3>절차 ' + pids.length + '</h3>' + pids.map((id) => { const p = DATA.procs[id]; if (!p) return '';
    return '<div class="p"><b>' + id + '</b>' + p.ms + ' · ' + p.name + ' · ' + p.actor + (p.card ? ' · ' + p.card.act + ' · [' + p.card.subjects.join(', ') + ']' + (p.card.clock && p.card.clock.days ? ' · ' + p.card.clock.days + '일' : '') : '') + '<div class="cite">' + p.legal.join('<br>') + '</div></div>'; }).join('');
}));
</script></body></html>`;
}

export async function writeReview({ png = false } = {}) {
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const verdicts = readJson(path.join(OUT_COMPARE, 'verdicts.json'));
  const impFile = path.join(OUT_COMPARE, 'cards-out.json');
  const improvements = fs.existsSync(impFile) ? readJson(impFile) : [];
  const html = renderReview({ procs, cards, verdicts, improvements, subjects: loadSubjects(), meta: { title: '산단 지정 의제 덩어리 — 절차 비교대조 판', asOf: new Date().toISOString().slice(0, 10) } });
  const out = path.join(OUT, 'review.html');
  fs.writeFileSync(out, html);
  console.log('html written:', out);
  if (png) {
    const { chromium } = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'))('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 2400, height: 900 }, deviceScaleFactor: 2 });
    await page.goto('file://' + out); await page.waitForTimeout(300);
    await page.screenshot({ path: out.replace(/\.html$/, '.png'), fullPage: true });
    await browser.close();
    console.log('png written');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await writeReview({ png: process.argv.includes('--png') });
}
