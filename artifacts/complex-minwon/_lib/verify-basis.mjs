// Verify every `basis` citation in case-data.mjs against law.go.kr DRF snapshots in ./laws/*.json.
// Citation grammar handled: "<법령명> 제N조(의M)?(제N항)?(제N호(의M)?)?(X목)?" joined by "·", ranges "제A호~제B호",
// trailing qualifiers (단서·전단·후단) are ignored for existence checks.
// Includes a negative control: fabricated citations must FAIL, otherwise the checker is blind.
// 사용: 사례 폴더의 verify-basis.mjs가 verify(import.meta.url) 호출. loadLaws/checkCitation은 compare 엔진도 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circledToInt = (s) => { const i = CIRCLED.indexOf((s || '').trim()[0]); return i >= 0 ? i + 1 : null; };
const artKey = (a) => a.no + (a.branch && a.branch !== '0' ? '의' + a.branch : '');
const findArticle = (law, key) => law.articles.find((a) => artKey(a) === key);
const hoKey = (s) => (s || '').replace(/\.$/, '').trim();

export function loadLaws(lawDir) {
  const laws = new Map();
  if (!fs.existsSync(lawDir)) return laws;
  for (const f of fs.readdirSync(lawDir)) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(fs.readFileSync(path.join(lawDir, f), 'utf8'));
    laws.set(d.meta.name, d);
  }
  return laws;
}

function tokenize(rest) {
  const re = /제(\d+)조(?:의(\d+))?|제(\d+)항|제(\d+)호(?:의(\d+))?|([가-힣])목|(~)|(·)|(단서|전단|후단|각 호 외의 부분|본문)/g;
  const out = []; let m;
  while ((m = re.exec(rest))) {
    if (m[1]) out.push({ t: 'jo', v: m[1] + (m[2] ? '의' + m[2] : '') });
    else if (m[3]) out.push({ t: 'hang', v: Number(m[3]) });
    else if (m[4]) out.push({ t: 'ho', v: m[4] + (m[5] ? '의' + m[5] : '') });
    else if (m[6]) out.push({ t: 'mok', v: m[6] });
    else if (m[7]) out.push({ t: 'range' });
    else if (m[8]) out.push({ t: 'sep' });
  }
  return out;
}

export function checkCitation(laws, cit) {
  const m = cit.match(/^(.+?)\s+(제\d+조.*)$/);
  if (!m) return [{ cit, ok: false, why: '형식 불일치' }];
  const lawName = m[1].trim();
  const law = laws.get(lawName);
  if (!law) return [{ cit, ok: false, why: `법령 스냅샷 없음: ${lawName}` }];
  const toks = tokenize(m[2]);
  const results = [];
  let jo = null, hang = null, ho = null, art = null, pendingRange = false, lastHo = null;
  const rec = (label, ok, why) => results.push({ cit, label: `${lawName} ${label}`, ok, why });
  for (const tk of toks) {
    if (tk.t === 'jo') {
      jo = tk.v; hang = null; ho = null; lastHo = null;
      art = findArticle(law, jo);
      rec(`제${jo}조`, !!art, art ? art.title : '조문 없음');
    } else if (tk.t === 'hang') {
      if (!art) continue;
      hang = tk.v; ho = null; lastHo = null;
      const p = art.paras.find((q) => circledToInt(q.no) === hang);
      const ok = !!p || (hang === 1 && art.paras.length === 0 && !!art.body);
      rec(`제${jo}조제${hang}항`, ok, ok ? '' : `항 없음 (항 수 ${art.paras.length})`);
    } else if (tk.t === 'ho') {
      if (!art) continue;
      const scope = hang ? art.paras.filter((q) => circledToInt(q.no) === hang) : art.paras;
      const has = (k) => scope.some((q) => q.hos.some((h) => hoKey(h.no) === k));
      if (pendingRange && lastHo && /^\d+$/.test(lastHo) && /^\d+$/.test(tk.v)) {
        for (let i = Number(lastHo) + 1; i <= Number(tk.v); i++) rec(`제${jo}조제${hang ?? '?'}항제${i}호`, has(String(i)), has(String(i)) ? '' : '호 없음');
        pendingRange = false;
      } else {
        rec(`제${jo}조제${hang ?? '?'}항제${tk.v}호`, has(tk.v), has(tk.v) ? '' : '호 없음');
      }
      ho = tk.v; lastHo = tk.v;
    } else if (tk.t === 'mok') {
      if (!art || !ho) continue;
      const scope = hang ? art.paras.filter((q) => circledToInt(q.no) === hang) : art.paras;
      const hoObj = scope.flatMap((q) => q.hos).find((h) => hoKey(h.no) === ho);
      const ok = !!hoObj && hoObj.mok.some((mm) => mm.trim().startsWith(tk.v + '.'));
      rec(`제${jo}조제${hang ?? '?'}항제${ho}호${tk.v}목`, ok, ok ? '' : '목 없음');
    } else if (tk.t === 'range') {
      pendingRange = true;
    }
  }
  if (results.length === 0) results.push({ cit, ok: false, why: '토큰 없음' });
  return results;
}

export async function verify(caseUrl) {
  const here = path.dirname(fileURLToPath(caseUrl));
  const { nodes, meta } = await import(pathToFileURL(path.join(here, 'case-data.mjs')).href);
  const laws = loadLaws(path.join(here, 'laws'));

  const all = [];
  for (const n of nodes) for (const b of n.basis || []) all.push(...checkCitation(laws, b).map((r) => ({ node: n.id, ...r })));
  const fails = all.filter((r) => !r.ok);

  const L0 = meta.probeLaw || [...laws.keys()][0];
  const controls = [`${L0} 제9999조`, `${L0} 제1조제99항`, `${L0} 제1조제1항제99호`, '없는법 제1조', `${L0} 제2조제99항제1호`];
  const ctrlFails = controls.map((c) => checkCitation(laws, c).some((r) => !r.ok));
  const controlOk = ctrlFails.every(Boolean);

  const laws_used = [...laws.values()].map((l) => ({ name: l.meta.name, mst: l.meta.mst, effective: l.meta.eff, status: l.meta.status, pending: l.meta.pending.map((p) => p.eff) }));
  const report = { checked_at: meta.checkedAt, citations: all.length, passed: all.length - fails.length, failed: fails, negative_control: { probes: controls, all_detected: controlOk }, laws: laws_used };
  fs.writeFileSync(path.join(here, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(`citations ${all.length}, passed ${all.length - fails.length}, failed ${fails.length}, negative control ${controlOk ? 'OK' : 'BLIND!'}`);
  for (const f of fails) console.log('  FAIL', f.node, f.label ?? f.cit, '-', f.why);
  if (!controlOk) { console.error('negative control failed — checker is blind'); process.exit(2); }
  if (fails.length) process.exit(1);
}
