// 골든 재발견 검사. rediscovery.json의 run마다 엔진(load→extract→match)을 별도 폴더에 돌리고, 기대 묶음이 candidates에 있는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { COMPARE, OUT_COMPARE } from './lib/paths.mjs';
import { loadProcedures } from './load.mjs';
import { extractAll } from './extract.mjs';
import { matchAll } from './match.mjs';
import { judgeAll } from './judge.mjs';
import { loadPreserve } from './lib/normalize.mjs';
import { loadOrgs, loadSubjects } from './lib/normalize.mjs';

export function articleHit(have, must) {
  const h = String(have ?? '').replace(/（.*?）|\([^)]*\)/g, '');
  if (h.startsWith(must) || h.includes(must)) return true;
  const m = String(must ?? '').match(/^제(\d+)조(.*)$/);
  if (!m) return h.includes(must);
  if (!h.includes(`제${m[1]}조`)) return false;
  return !m[2] || h.includes(m[2]);
}

export function isolated(ms, clusters, verdicts = null) {
  // 위반 = ms의 절차와 다른 마일스톤 절차가 한 묶음에 있고, 판정이 그 둘을 "묶을 수 있다"고 한 쌍이 있을 때.
  // verdicts가 없으면(판정 전) 묶음 공유만으로 위반으로 본다 — 지표가 같으면 군공항도 묶이므로 판정을 넣어야 의미가 있다.
  const mine = (p) => p.startsWith(ms + ':');
  for (const c of clusters) {
    if (!c.pids.some(mine) || !c.pids.some((p) => !mine(p))) continue;
    if (!verdicts) return c.cid;
    const v = verdicts.find((x) => x.cid === c.cid);
    if (v && v.pairs.some((p) => p.mergeable && mine(p.a) !== mine(p.b))) return c.cid;
  }
  return null;
}

export function rediscovered(target, clusters, procs) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const hit = (pid, must) => (m.get(pid)?.legal ?? []).some((l) => l.law === must.law && articleHit(l.article, must.article));
  for (const c of clusters) {
    const matched = target.must.filter((must) => c.pids.some((pid) => hit(pid, must))).length;
    if (matched >= target.minMatch) return { found: c.cid, matched };
  }
  return { found: null, matched: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const spec = readJson(path.join(COMPARE, 'golden', 'rediscovery.json'));
  const subjects = loadSubjects(), orgs = loadOrgs();
  const results = [];
  for (const [name, run] of Object.entries(spec.runs)) {
    const dir = path.join(OUT_COMPARE, `rediscovery-${name}`);
    const procs = loadProcedures(run.institutions ? { institutions: run.institutions } : { milestones: run.milestones });
    const { cards } = extractAll(procs, { subjects, orgs, log: (s) => process.stderr.write(s + '\n') });
    const clusters = matchAll(cards, procs);
    writeJson(path.join(dir, 'procedures.json'), procs); writeJson(path.join(dir, 'cards.json'), cards); writeJson(path.join(dir, 'candidates.json'), clusters);
    for (const t of spec.targets.filter((x) => x.run === name)) results.push({ name: t.name, ...rediscovered(t, clusters, procs) });
    for (const t of (spec.negatives ?? []).filter((x) => x.run === name)) {
      const mine = (p) => p.startsWith(t.isolate + ':');
      const mixed = clusters.filter((c) => c.pids.some(mine) && c.pids.some((p) => !mine(p)));
      const verdicts = judgeAll(mixed, procs, loadPreserve(), { log: (m) => process.stderr.write(m + '\n') });
      writeJson(path.join(dir, 'verdicts-mixed.json'), verdicts);
      const bad = isolated(t.isolate, clusters, verdicts);
      results.push({ name: t.name, found: bad ? null : 'isolated', matched: 0, violation: bad, mixedClusters: mixed.map((c) => c.cid) });
    }
  }
  writeJson(path.join(OUT_COMPARE, 'rediscovery-report.json'), results);
  for (const r of results) console.log(r.found ? 'FOUND' : 'MISS ', r.name, r.found ? `→ ${r.found}` : `(matched ${r.matched})`);
  if (results.some((r) => !r.found)) process.exit(1);
}
