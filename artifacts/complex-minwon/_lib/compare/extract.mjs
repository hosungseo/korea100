// 1단계 추출. 절차 하나 → 구조화 카드 하나. AI는 분류만 하고 조문은 절차 레코드에서 복사만 한다.
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT_COMPARE } from './lib/paths.mjs';
import { callJson } from './lib/claude.mjs';
import { normalizeOrg, loadOrgs, loadSubjects } from './lib/normalize.mjs';

export const ORG_ROLES = ['applicant', 'authority', 'consultee', 'committee'];
export const ACTS = ['apply', 'receive', 'review', 'consult', 'deliberate', 'resolve', 'notice', 'notify', 'supplement'];

export function buildExtractPrompt(proc, subjects) {
  const tax = Object.entries(subjects).map(([k, v]) => `${k}=${v}`).join(', ');
  const legal = proc.legal.map((l) => `- ${l.law} ${l.article}: ${l.text}`).join('\n');
  return [
    '너는 한국 행정절차 분석가다. 아래 절차 하나를 읽고 구조화 카드를 JSON으로만 출력한다. 설명 문장 금지.',
    `절차명: ${proc.name}`, `행위 주체(원문): ${proc.actorRaw}`, `행위: ${proc.action}`,
    `산출물: ${(proc.outputs ?? []).join(', ') || '없음'}`, `기한(원문): ${proc.deadlineRaw ?? '없음'}`,
    '근거 조문:', legal,
    '',
    '규칙:',
    `1. orgRole은 ${ORG_ROLES.join('|')} 중 하나. act는 ${ACTS.join('|')} 중 하나.`,
    `2. subjects는 이 절차가 실제로 심사·검토하는 실체 대상. 분류표 코드만 쓴다: ${tax}. 분류표에 없으면 "other:<짧은 라벨>"로.`,
    '   신청·접수·통지처럼 실체 심사가 없는 절차는 빈 배열.',
    '3. deemed.is는 이 절차가 다른 인허가를 의제하거나 의제되는지. basis는 그 조문(위 근거 조문 문자열 그대로).',
    '4. clock.days는 근거 조문에 적힌 처리·협의 기한 일수(없으면 null). silentEffect는 기한 내 미회신 시 협의·동의로 간주하는 규정이 있으면 true.',
    '5. evidence는 위 근거 조문 목록에서 law·article을 그대로 복사한다. 목록에 없는 조문을 새로 만들지 않는다.',
    '출력 JSON만: {"orgRole":"","act":"","subjects":[],"deemed":{"is":false,"basis":null},"clock":{"days":null,"basis":null,"silentEffect":false},"evidence":[{"law":"","article":""}]}',
  ].join('\n');
}

export function validateCard(raw, proc, subjects, orgs) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { card: null, errors: ['no object'] };
  if (!ORG_ROLES.includes(raw.orgRole)) errors.push(`orgRole ${raw.orgRole}`);
  if (!ACTS.includes(raw.act)) errors.push(`act ${raw.act}`);
  const subs = Array.isArray(raw.subjects) ? raw.subjects : [];
  const otherSubjects = [];
  for (const s of subs) {
    if (typeof s !== 'string') { errors.push(`subject ${s}`); continue; }
    if (s.startsWith('other:')) { if (s.length > 6) otherSubjects.push(s.slice(6)); else errors.push('empty other'); }
    else if (!subjects[s]) errors.push(`subject ${s}`);
  }
  const strip = (a) => String(a ?? '').replace(/（.*?）|\([^)]*\)/g, '').trim();
  const legalKeys = new Set(proc.legal.flatMap((l) => [`${l.law}|${l.article}`, `${l.law}|${strip(l.article)}`]));
  const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  for (const e of evidence) {
    const key = `${e?.law}|${e?.article}`, key2 = `${e?.law}|${strip(e?.article)}`;
    if (!legalKeys.has(key) && !legalKeys.has(key2)) errors.push(`evidence not in procedure: ${e?.law} ${e?.article}`);
  }
  const n = normalizeOrg(proc.actorRaw, orgs);
  const card = {
    pid: proc.pid, org: n.org, orgLabel: n.label, orgKind: n.kind, orgAlso: n.also, orgUnknown: n.unknown,
    orgRole: raw.orgRole, act: raw.act, subjects: subs, otherSubjects,
    deemed: { is: !!raw.deemed?.is, basis: raw.deemed?.basis ?? null },
    clock: { days: Number.isFinite(raw.clock?.days) ? raw.clock.days : null, basis: raw.clock?.basis ?? null, silentEffect: !!raw.clock?.silentEffect },
    evidence: evidence.map((e) => ({ law: e.law, article: e.article })),
    extractStatus: errors.length ? 'failed' : 'ok', errors,
  };
  return { card, errors };
}

export function extractAll(procs, { subjects, orgs, cacheDir = null, fresh = false, promptFor = (p) => buildExtractPrompt(p, subjects), log = () => {} } = {}) {
  const cards = {}; const unknown = new Set(); const other = new Map();
  let i = 0;
  for (const p of procs) {
    i++;
    const r = callJson(promptFor(p), { stage: 'extract', cacheDir, fresh });
    const { card, errors } = r.failed ? { card: null, errors: ['claude failed'] } : validateCard(r.data, p, subjects, orgs);
    const n = normalizeOrg(p.actorRaw, orgs);
    if (n.unknown) unknown.add(p.actorRaw);
    cards[p.pid] = card ?? { pid: p.pid, org: n.org, orgLabel: n.label, orgKind: n.kind, orgAlso: n.also, orgUnknown: n.unknown, extractStatus: 'failed', errors, subjects: [], evidence: [] };
    for (const o of card?.otherSubjects ?? []) { if (!other.has(o)) other.set(o, []); other.get(o).push(p.pid); }
    log(`${i}/${procs.length} ${p.pid} ${cards[p.pid].extractStatus}${r.cached ? ' (cache)' : ''}`);
  }
  return { cards, unknownOrgs: [...unknown], otherSubjects: [...other].map(([label, pids]) => ({ label, pids })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const fresh = process.argv.includes('--fresh');
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const res = extractAll(procs, { subjects: loadSubjects(), orgs: loadOrgs(), fresh, log: (s) => process.stderr.write(s + '\n') });
  writeJson(path.join(OUT_COMPARE, 'cards.json'), res.cards);
  writeJson(path.join(OUT_COMPARE, 'unknown-orgs.json'), res.unknownOrgs);
  writeJson(path.join(OUT_COMPARE, 'other-subjects.json'), res.otherSubjects);
  const ok = Object.values(res.cards).filter((c) => c.extractStatus === 'ok').length;
  console.log(`cards ${Object.keys(res.cards).length} · ok ${ok} · failed ${Object.keys(res.cards).length - ok} · unknown orgs ${res.unknownOrgs.length} · other subjects ${res.otherSubjects.length}`);
}
