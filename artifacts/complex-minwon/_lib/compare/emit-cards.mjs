// 4단계(카드). 통과한 묶음 → 1호 문법 개선 카드. targets 조문은 절차 legal 또는 laws/ 스냅샷에 있어야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT, OUT_COMPARE } from './lib/paths.mjs';
import { callJson } from './lib/claude.mjs';
import { loadLaws, checkCitation } from '../verify-basis.mjs';

const KINDS = new Set(['merge', 'automate', 'shorten']);

export function buildCardPrompt(v, procs) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const lines = v.pids.map((id) => { const p = m.get(id); return `[${id}] ${p.name} / 수행 ${p.actorRaw} / ${p.action} / 조문 ${p.legal.map((l) => `${l.law} ${l.article}`).join('; ')}`; });
  const reasons = v.pairs.filter((p) => p.mergeable).map((p) => `${p.a} × ${p.b}: ${p.reason}`);
  return [
    '너는 행정안전부 혁신기획과의 복합민원 정비 담당자다. 아래 절차 묶음에 대해 개선 카드 1장을 JSON으로만 쓴다.',
    `허용 종류: ${v.allowedKinds.join('|')} (merge=통합·한 시계, automate=법이 방법까지 정한 구간의 자동화, shorten=기한 부여·후제출). 삭제·폐지는 없다.`,
    '절차:', ...lines,
    '판정에서 묶을 수 있다고 본 이유:', ...reasons,
    '규칙: title 20자 내. why는 왜 지금 두 번인지(조문 근거). lever는 바꿀 조문 1개와 바꾸는 방식 한 줄.',
    'targets는 "소관부처 — 법령명 제N조제N항" 형식으로 1~3개. 소관은 조문의 주무부처이지 수행 기관이 아니다. 위 조문 목록에 있는 조문만 쓴다.',
    `JSON만 출력: {"kind":"${v.allowedKinds[0]}","title":"","why":"","lever":"","targets":["부처 — 법령명 제N조"]}`,
  ].join('\n');
}

export function validateTargets(targets, procs, laws) {
  const legal = new Set(procs.flatMap((p) => p.legal.map((l) => `${l.law} ${l.article}`)));
  const ok = [], rejected = [];
  for (const t of Array.isArray(targets) ? targets : []) {
    const m = String(t).match(/^(.+?)\s+—\s+(.+)$/);
    if (!m) { rejected.push({ target: t, why: '형식 불일치 (부처 — 조문)' }); continue; }
    const cit = m[2].trim();
    if (legal.has(cit)) { ok.push(t); continue; }
    const res = checkCitation(laws, cit);
    if (res.every((r) => r.ok)) ok.push(t); else rejected.push({ target: t, why: res.filter((r) => !r.ok).map((r) => r.why).join('; ') });
  }
  return { ok, rejected };
}

export function emitCards(verdicts, procs, laws, { cacheDir = null, fresh = false, nodeIdOf, promptFor = (v) => buildCardPrompt(v, procs), log = () => {} } = {}) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const improvements = [], rejected = [];
  let n = 0;
  for (const v of verdicts.filter((x) => x.passed)) {
    const r = callJson(promptFor(v), { stage: 'cards', cacheDir, fresh });
    if (r.failed) { rejected.push({ cid: v.cid, why: 'claude failed' }); continue; }
    const c = r.data;
    if (!KINDS.has(c.kind) || !v.allowedKinds.includes(c.kind)) { rejected.push({ cid: v.cid, why: `kind ${c.kind} not allowed (${v.allowedKinds.join('|')})`, raw: c }); continue; }
    const clusterProcs = v.pids.map((id) => m.get(id)).filter(Boolean);
    const t = validateTargets(c.targets, clusterProcs, laws);
    if (!t.ok.length) { rejected.push({ cid: v.cid, why: 'no valid target', rejectedTargets: t.rejected, raw: c }); continue; }
    n++;
    improvements.push({ id: `I${n}`, cid: v.cid, kind: c.kind, nodes: v.pids.map(nodeIdOf), pids: v.pids,
      title: String(c.title ?? '').trim(), why: String(c.why ?? '').trim(), lever: String(c.lever ?? '').trim(), targets: t.ok, droppedTargets: t.rejected });
    log(`${v.cid} → I${n} ${c.kind}`);
  }
  return { improvements, rejected };
}

export const renderImprovementsModule = (improvements) =>
  `// 생성 파일 — compare 엔진 emit-cards.mjs. 손으로 고치지 말고 verdicts를 고친 뒤 다시 생성.\nexport const improvements = ${JSON.stringify(improvements, null, 2)};\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const fresh = process.argv.includes('--fresh');
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const verdicts = readJson(path.join(OUT_COMPARE, 'verdicts.json'));
  const laws = loadLaws(path.join(OUT, 'laws'));
  const instIndex = new Map(); for (const p of procs) if (!instIndex.has(p.institution)) instIndex.set(p.institution, instIndex.size);
  const nodeIdOf = (pid) => { const p = procs.find((x) => x.pid === pid); return `${p.ms}_${instIndex.get(p.institution)}_${p.nodeId}`; };
  const res = emitCards(verdicts, procs, laws, { fresh, nodeIdOf, log: (s) => process.stderr.write(s + '\n') });
  writeJson(path.join(OUT_COMPARE, 'cards-out.json'), res.improvements);
  writeJson(path.join(OUT_COMPARE, 'rejected.json'), res.rejected);
  fs.writeFileSync(path.join(OUT, 'improvements.mjs'), renderImprovementsModule(res.improvements));
  console.log(`improvements ${res.improvements.length} · rejected ${res.rejected.length}`);
}
