// 2단계 결정적 대조. AI 없음. cards.json + procedures.json → candidates.json
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT_COMPARE } from './lib/paths.mjs';

const ROUNDTRIP_ACTS = new Set(['consult', 'deliberate']);
const byPid = (procs) => new Map(procs.map((p) => [p.pid, p]));
const okCards = (cards) => Object.values(cards).filter((c) => c.extractStatus === 'ok');

export function scoreCluster(pids, procs) {
  const m = byPid(procs);
  const ps = pids.map((id) => m.get(id)).filter(Boolean);
  return {
    procs: ps.length,
    laws: new Set(ps.flatMap((p) => p.legal.map((l) => l.law))).size,
    milestones: new Set(ps.map((p) => p.ms)).size,
    critical: ps.filter((p) => p.onCritical).length,
  };
}

export function matchSameSubject(cards, procs) {
  const m = byPid(procs);
  const bySubject = new Map();
  for (const c of okCards(cards)) for (const s of c.subjects ?? []) {
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push(c.pid);
  }
  const out = [];
  for (const [key, pids] of bySubject) {
    const laws = new Set(pids.flatMap((id) => (m.get(id)?.legal ?? []).map((l) => l.law)));
    if (laws.size < 2 || pids.length < 2) continue;
    out.push({ axis: 'same-subject', key, pids: [...new Set(pids)] });
  }
  return out;
}

export function matchOrgRoundtrip(cards, procs) {
  const m = byPid(procs);
  const byOrg = new Map();
  for (const c of okCards(cards)) {
    if (c.orgKind !== 'org' || !ROUNDTRIP_ACTS.has(c.act)) continue;
    if (!byOrg.has(c.org)) byOrg.set(c.org, []);
    byOrg.get(c.org).push(c.pid);
  }
  const out = [];
  for (const [org, pids] of byOrg) {
    // msOrder로 정렬해 인접(차 ≤ 1)한 것끼리 사슬로 묶는다
    const sorted = pids.map((id) => ({ id, o: m.get(id)?.msOrder ?? 0, ms: m.get(id)?.ms })).sort((a, b) => a.o - b.o);
    let chain = [];
    const flush = () => { if (chain.length >= 2) out.push({ axis: 'org-roundtrip', key: `${org}@${chain[0].ms}`, pids: chain.map((x) => x.id) }); chain = []; };
    for (const x of sorted) {
      if (chain.length && x.o - chain[chain.length - 1].o > 1) flush();
      chain.push(x);
    }
    flush();
  }
  return out;
}


// 같은 절차를 절반 이상 공유하는 A축 묶음은 하나로 합친다. 환평 절차 하나가 대기·수질·소음·생태 지표를
// 모두 갖고 있어 지표마다 같은 카드가 반복되는 것을 막는다. 임계 0.5는 실데이터(4호)에서
// 환평 계열(0.50~0.92)은 합쳐지고 경관·소음(0.40)은 분리되는 값.
export function mergeOverlapping(clusters, threshold = 0.5) {
  const A = clusters.filter((c) => c.axis === 'same-subject');
  const rest = clusters.filter((c) => c.axis !== 'same-subject');
  const sets = A.map((c) => new Set(c.pids));
  const parent = A.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    let inter = 0; for (const p of sets[i]) if (sets[j].has(p)) inter++;
    const union = sets[i].size + sets[j].size - inter;
    if (union && inter / union >= threshold) parent[find(i)] = find(j);
  }
  const groups = new Map();
  A.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
  const merged = [...groups.values()].map((g) => {
    if (g.length === 1) return g[0];
    const keys = g.map((c) => c.key).sort();
    const pids = [...new Set(g.flatMap((c) => c.pids))];
    return { axis: 'same-subject', key: keys.join('+'), pids, mergedFrom: keys };
  });
  return [...merged, ...rest];
}

export function matchAll(cards, procs) {
  const raw = mergeOverlapping([...matchSameSubject(cards, procs), ...matchOrgRoundtrip(cards, procs)]);
  const counters = new Map();
  const out = raw.map((c) => {
    const base = `${c.axis === 'same-subject' ? 'A' : 'C'}-${c.key.replace(/[^\w가-힣]+/g, '-')}`;
    const n = (counters.get(base) ?? 0) + 1; counters.set(base, n);
    return { cid: `${base}-${String(n).padStart(2, '0')}`, ...c, score: scoreCluster(c.pids, procs) };
  });
  out.sort((a, b) => b.score.critical - a.score.critical || b.score.laws - a.score.laws || b.score.procs - a.score.procs || a.cid.localeCompare(b.cid));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const all = matchAll(cards, procs);
  writeJson(path.join(OUT_COMPARE, 'candidates.json'), all);
  const a = all.filter((c) => c.axis === 'same-subject').length;
  console.log(`candidates ${all.length} · same-subject ${a} · org-roundtrip ${all.length - a} · on critical ${all.filter((c) => c.score.critical > 0).length}`);
}
