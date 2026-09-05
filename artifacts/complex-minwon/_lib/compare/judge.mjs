// 3단계 판정. 묶음당 AI 1회, 묶음 안 모든 쌍을 한 번에 묻는다. 보존 목록이 카드 종류를 제한한다.
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT_COMPARE } from './lib/paths.mjs';
import { callJson } from './lib/claude.mjs';
import { loadPreserve, preserveHit } from './lib/normalize.mjs';

export const DEFAULT_KINDS = ['merge', 'automate', 'shorten'];
const VERDICTS = new Set(['same', 'partial', 'different']);

export function pairsOf(pids) {
  const out = [];
  for (let i = 0; i < pids.length; i++) for (let j = i + 1; j < pids.length; j++) out.push([pids[i], pids[j]]);
  return out;
}

export function buildJudgePrompt(cluster, procs) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const desc = (id) => { const p = m.get(id); return `[${id}] ${p.name} / 주체 ${p.actorRaw} / ${p.action} / 조문 ${p.legal.map((l) => `${l.law} ${l.article}`).join('; ')}`; };
  const axisNote = cluster.axis === 'same-subject'
    ? `같은 심사 대상(${cluster.key})을 서로 다른 법이 각각 심사하는 것으로 보이는 절차들이다.`
    : `같은 기관(${cluster.key})이 인접 단계에서 협의·심의를 반복하는 절차들이다.`;
  return [
    '너는 한국 행정절차 정비 심사관이다. 아래 절차 묶음에서 쌍마다 "실체요건이 같은가 / 한 시계·한 사건으로 묶을 수 있는가"를 판정한다.',
    axisNote,
    '절차 삭제·폐지·갈음은 제안하지 않는다. 묶기·자동화·기한 부여만 다룬다. 확신 없으면 different.',
    '절차:', ...cluster.pids.map(desc),
    `판정할 쌍: ${pairsOf(cluster.pids).map(([a, b]) => `${a} × ${b}`).join(' | ')}`,
    'JSON만 출력: {"pairs":[{"a":"pid","b":"pid","verdict":"same|partial|different","mergeable":true|false,"reason":"한 줄","blockingArticle":"막는 조문 또는 null"}]}',
  ].join('\n');
}

export function applyVerdict(cluster, raw, procs, preserve) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const inCluster = new Set(cluster.pids);
  const pairs = []; const ignored = [];
  for (const r of raw?.pairs ?? []) {
    if (!inCluster.has(r?.a) || !inCluster.has(r?.b) || !VERDICTS.has(r?.verdict)) continue;
    if (r.suggest) ignored.push({ a: r.a, b: r.b, suggest: r.suggest });
    pairs.push({ a: r.a, b: r.b, verdict: r.verdict, mergeable: !!r.mergeable && r.verdict !== 'different', reason: r.reason ?? '', blockingArticle: r.blockingArticle ?? null });
  }
  const hits = cluster.pids.map((id) => preserveHit(m.get(id) ?? {}, preserve)).filter(Boolean);
  let allowedKinds = DEFAULT_KINDS;
  for (const h of hits) allowedKinds = allowedKinds.filter((k) => h.allowed.includes(k));
  const anyMergeable = pairs.some((p) => p.mergeable);
  let passed = anyMergeable && allowedKinds.length > 0;
  let reason = null;
  if (!anyMergeable) reason = 'no mergeable pair';
  else if (!allowedKinds.length) reason = `preserve:${hits.find((h) => !h.allowed.length)?.id ?? hits[0].id} allows no kind`;
  return { cid: cluster.cid, axis: cluster.axis, key: cluster.key, pids: cluster.pids, pairs, passed, reason,
    allowedKinds, preserveHits: [...new Set(hits.map((h) => h.id))], ignored, judgeStatus: 'ok' };
}

export function judgeAll(clusters, procs, preserve, { cacheDir = null, fresh = false, promptFor = (c) => buildJudgePrompt(c, procs), log = () => {} } = {}) {
  return clusters.map((c, i) => {
    const r = callJson(promptFor(c), { stage: 'judge', cacheDir, fresh });
    log(`${i + 1}/${clusters.length} ${c.cid} ${r.failed ? 'failed' : 'ok'}${r.cached ? ' (cache)' : ''}`);
    if (r.failed) return { cid: c.cid, axis: c.axis, key: c.key, pids: c.pids, pairs: [], passed: false, reason: 'claude failed', allowedKinds: [], preserveHits: [], ignored: [], judgeStatus: 'failed' };
    return applyVerdict(c, r.data, procs, preserve);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const fresh = process.argv.includes('--fresh');
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const clusters = readJson(path.join(OUT_COMPARE, 'candidates.json'));
  const res = judgeAll(clusters, procs, loadPreserve(), { fresh, log: (s) => process.stderr.write(s + '\n') });
  writeJson(path.join(OUT_COMPARE, 'verdicts.json'), res);
  console.log(`clusters ${res.length} · passed ${res.filter((v) => v.passed).length} · failed calls ${res.filter((v) => v.judgeStatus === 'failed').length} · ignored drop suggestions ${res.reduce((a, v) => a + v.ignored.length, 0)}`);
}
