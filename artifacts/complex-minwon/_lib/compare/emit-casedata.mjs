// 4단계(체계도 입력). 절차 레코드 + 카드 + 개선 카드 → _lib/gen.mjs가 읽는 case-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/io.mjs';
import { ROOT, OUT, OUT_COMPARE } from './lib/paths.mjs';
import { loadOrgs, normalizeOrg } from './lib/normalize.mjs';

const EDGE_KIND = { sequence: 'seq', conditional: 'opt', optional: 'opt' };
const laneWidth = (n) => (n <= 8 ? 480 : n <= 20 ? 560 : 640);

export function buildCaseData({ procs, cards, improvements, project, orgs, meta, institutionsDir = path.join(ROOT, 'web/data/institutions') }) {
  const instIndex = new Map(); for (const p of procs) if (!instIndex.has(p.institution)) instIndex.set(p.institution, instIndex.size);
  const nodeIdOf = (p) => `${p.ms}_${instIndex.get(p.institution)}_${p.nodeId}`;

  // lane key per procedure: card org if extracted, else normalize actorRaw directly
  const laneKeyOf = (p) => { const c = cards[p.pid]; if (c && c.org) return { key: c.org, label: c.orgLabel, kind: c.orgKind }; const n = normalizeOrg(p.actorRaw, orgs); return { key: n.org, label: n.label, kind: n.kind }; };
  const laneStats = new Map();
  for (const p of procs) { const k = laneKeyOf(p); if (!laneStats.has(k.key)) laneStats.set(k.key, { ...k, n: 0 }); laneStats.get(k.key).n++; }
  const rank = (l) => (l.kind === 'applicant' ? 0 : l.kind === 'role' ? 1 : l.key.startsWith('cmte-') ? 3 : 2);
  const laneList = [...laneStats.values()].sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.label.localeCompare(b.label));
  const laneId = new Map(laneList.map((l, i) => [l.key, `L${i + 1}`]));
  const lanes = laneList.map((l) => ({ id: laneId.get(l.key), name: l.label, sub: `${l.kind === 'applicant' ? '민원인' : l.kind === 'role' ? '역할' : l.kind === 'unknown' ? '미분류' : '기관'} · 절차 ${l.n}`, width: laneWidth(l.n) }));

  const msList = [...new Map(procs.map((p) => [p.ms, p])).values()].sort((a, b) => a.msOrder - b.msOrder);
  const gates = msList.map((p) => ({ id: p.ms, name: p.msName.length > 18 ? p.msName.slice(0, 18) + '…' : p.msName, sub: `절차 ${procs.filter((q) => q.ms === p.ms).length}${p.onCritical ? ' · 크리티컬' : ''}` }));

  const nodes = procs.map((p) => ({ id: nodeIdOf(p), lane: laneId.get(laneKeyOf(p).key), gate: p.ms, kind: p.legal.length ? 'rule' : 'inferred', org: p.actorRaw || '미상',
    title: p.name, desc: p.action.length > 110 ? p.action.slice(0, 110) + '…' : p.action, basis: p.legal.length ? p.legal.map((l) => `${l.law} ${l.article}`) : undefined }));
  const ids = new Set(nodes.map((n) => n.id));

  const edges = [];
  const seen = new Set(); const push = (a, b, k) => { const key = `${a}>${b}`; if (ids.has(a) && ids.has(b) && a !== b && !seen.has(key)) { seen.add(key); edges.push([a, b, k]); } };
  for (const [slug, i] of instIndex) {
    const f = path.join(institutionsDir, `${slug}.json`); if (!fs.existsSync(f)) continue;
    const t = readJson(f);
    for (const e of t.process?.edges ?? []) for (const ms of new Set(procs.filter((p) => p.institution === slug).map((p) => p.ms))) push(`${ms}_${i}_${e.source}`, `${ms}_${i}_${e.target}`, EDGE_KIND[e.type] ?? 'par');
  }
  const producers = new Map(); for (const n of project.nodes ?? []) for (const a of n.produces ?? []) { if (!producers.has(a)) producers.set(a, []); producers.get(a).push(n.id); }
  const firstOf = (ms) => procs.find((p) => p.ms === ms), lastOf = (ms) => [...procs].reverse().find((p) => p.ms === ms);
  for (const n of project.nodes ?? []) for (const q of n.requires ?? []) if (q.strength === 'hard') for (const src of producers.get(q.artifact) ?? []) {
    const a = lastOf(src), b = firstOf(n.id); if (a && b) push(nodeIdOf(a), nodeIdOf(b), 'seq');
  }

  const orgOrder = [...new Set(improvements.flatMap((i) => i.targets.map((t) => t.split(' — ')[0])))];
  const rule = nodes.filter((n) => n.kind === 'rule').length;
  const fullMeta = {
    slug: meta.slug, kick: meta.kick ?? '복합민원 체계도 4호', shortName: meta.shortName ?? '산단 지정 의제 덩어리', checkedAt: meta.checkedAt,
    probeLaw: meta.probeLaw ?? procs[0]?.legal[0]?.law ?? null,
    title: meta.title ?? '복합민원 체계도 4호 — 산단 지정 의제 덩어리 (N36→N15)',
    titleFull: meta.titleFull ?? `산단 지정 의제 덩어리 — <b>마일스톤 ${gates.length} · 절차 ${nodes.length}</b>`,
    titleImprove: meta.titleImprove ?? '산단 지정 의제 덩어리 — 비교대조 엔진이 찾은 후보',
    subtitle: meta.subtitle ?? `워룸 gwangju-semiconductor-cluster의 KIPA 덩어리 합격 구간. 규정 ${rule} · 추론 ${nodes.length - rule}. 개선 카드는 _lib/compare 엔진 산출(추출→대조→판정→카드).`,
    source: meta.source ?? 'Korea100 워룸 gwangju-semiconductor-cluster · web/data/institutions 제도 템플릿 · 법제처 DRF 현행본',
    volume: null, stats: meta.stats ?? [{ label: '마일스톤', value: gates.length, unit: '개' }, { label: '절차', value: nodes.length, unit: '개' }, { label: '기관 레인', value: lanes.length, unit: '개' }, { label: '개선 카드', value: improvements.length, unit: '건' }],
    leverNote: meta.leverNote ?? '카드의 소관은 조문 소관이지 수행 기관이 아니다(1호 문법). 삭제·갈음 카드는 엔진이 내지 않는다.',
    notes: meta.notes ?? ['<b>생성 파일.</b> 엔진(artifacts/complex-minwon/_lib/compare)이 만든다. 손으로 고치지 말고 코드표·판정을 고친 뒤 다시 생성.'],
  };
  return { meta: fullMeta, lanes, gates, nodes, edges, groups: {}, orgOrder, improvements };
}

export const renderCaseDataModule = (cd) => [
  '// 생성 파일 — artifacts/complex-minwon/_lib/compare/emit-casedata.mjs. 손으로 고치지 말 것.',
  `export const meta = ${JSON.stringify(cd.meta, null, 2)};`,
  `export const lanes = ${JSON.stringify(cd.lanes, null, 2)};`,
  `export const gates = ${JSON.stringify(cd.gates, null, 2)};`,
  `export const nodes = ${JSON.stringify(cd.nodes, null, 2)};`,
  `export const edges = ${JSON.stringify(cd.edges)};`,
  `export const groups = ${JSON.stringify(cd.groups)};`,
  `export const orgOrder = ${JSON.stringify(cd.orgOrder)};`,
  `export const improvements = ${JSON.stringify(cd.improvements, null, 2)};`, '',
].join('\n');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const impFile = path.join(OUT_COMPARE, 'cards-out.json');
  const improvements = fs.existsSync(impFile) ? readJson(impFile) : [];
  const project = readJson(path.join(ROOT, 'web/data/mega-projects/projects/gwangju-semiconductor-cluster.json'));
  const cd = buildCaseData({ procs, cards, improvements, project, orgs: loadOrgs(), meta: { slug: 'deemed-bundle', checkedAt: new Date().toISOString().slice(0, 10) } });
  fs.writeFileSync(path.join(OUT, 'case-data.mjs'), renderCaseDataModule(cd));
  console.log(`case-data: lanes ${cd.lanes.length} · gates ${cd.gates.length} · nodes ${cd.nodes.length} · edges ${cd.edges.length} · improvements ${cd.improvements.length}`);
}
