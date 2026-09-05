// 골든 재발견 검사. rediscovery.json의 run마다 엔진(load→extract→match)을 별도 폴더에 돌리고, 기대 묶음이 candidates에 있는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { COMPARE, OUT_COMPARE } from './lib/paths.mjs';
import { loadProcedures } from './load.mjs';
import { extractAll } from './extract.mjs';
import { matchAll } from './match.mjs';
import { loadOrgs, loadSubjects } from './lib/normalize.mjs';

export function articleHit(have, must) {
  const h = String(have ?? '').replace(/（.*?）|\([^)]*\)/g, '');
  if (h.startsWith(must) || h.includes(must)) return true;
  const m = String(must ?? '').match(/^제(\d+)조(.*)$/);
  if (!m) return h.includes(must);
  if (!h.includes(`제${m[1]}조`)) return false;
  return !m[2] || h.includes(m[2]);
}

export function isolated(ms, clusters) {
  // ms의 절차가 다른 마일스톤 절차와 한 묶음에 있으면 그 cid를 돌려준다(위반). 없으면 null.
  for (const c of clusters) {
    const mine = c.pids.filter((p) => p.startsWith(ms + ':')), others = c.pids.filter((p) => !p.startsWith(ms + ':'));
    if (mine.length && others.length) return c.cid;
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
    for (const t of (spec.negatives ?? []).filter((x) => x.run === name)) { const bad = isolated(t.isolate, clusters); results.push({ name: t.name, found: bad ? null : 'isolated', matched: 0, violation: bad }); }
  }
  writeJson(path.join(OUT_COMPARE, 'rediscovery-report.json'), results);
  for (const r of results) console.log(r.found ? 'FOUND' : 'MISS ', r.name, r.found ? `→ ${r.found}` : `(matched ${r.matched})`);
  if (results.some((r) => !r.found)) process.exit(1);
}
