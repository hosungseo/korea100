// 층위 좁히기. "위임이 있다"에서 "그 위임이 이 개선안을 담는다"로 좁힌다.
// AI는 후보 조문 중에서 고르기만 하고, 조문을 새로 만들 수 없다(후보 밖 답은 버린다).
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT, OUT_COMPARE } from './lib/paths.mjs';
import { callJson } from './lib/claude.mjs';
import { loadLaws } from '../verify-basis.mjs';
import { classifyCard, TIERS, TIER_RANK, findArticle, articleKeyOf, articleText, scopedText, tierOf } from './lib/tier.mjs';

const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

// 위임 문장(인용 항 본문)과 하위 후보 조문(제목 + 첫 항 앞부분)을 프롬프트 재료로 만든다.
export function candidatesFor(laws, t) {
  const parent = findArticle(laws.get(t.law), articleKeyOf(t.article));
  const clause = cut(scopedText(parent, t.article), 300);
  const items = t.implementing.map((i) => {
    const a = findArticle(laws.get(i.law), articleKeyOf(i.article));
    return { ref: `${i.law} ${i.article}`, tier: i.tier, title: a?.title ?? i.title ?? '', text: cut(articleText(a), 220) };
  });
  return { target: t.target, law: t.law, article: t.article, clause, delegates: t.delegates, items };
}

export function buildNarrowPrompt(card, cands) {
  const blocks = cands.map((c, i) => [
    `[대상 ${i + 1}] ${c.law} ${c.article}${c.delegates.length ? ` (위임: ${c.delegates.join('/')})` : ' (위임 문구 없음)'}`,
    `  위임 조문 본문: ${c.clause}`,
    ...(c.items.length ? c.items.map((x, j) => `  후보 ${i + 1}-${j + 1}: ${x.ref} (${x.tier}) 「${x.title}」 ${x.text}`) : ['  후보 없음']),
  ].join('\n')).join('\n\n');
  return [
    '너는 한국 법제 실무자다. 아래 개선안을 실행하려면 어느 법령을 고쳐야 하는지 판정한다.',
    `개선안: ${card.title}`,
    `이유: ${card.why}`,
    `조치: ${card.lever}`,
    '',
    '대상 조문과 그 위임을 받은 하위법령 후보:',
    blocks,
    '',
    '판정 규칙:',
    '1. 개선안의 조치가 위임 조문 본문이 위임한 범위(무엇을 하위법령에 맡겼는지) 안에 들어가는지만 본다.',
    '2. 들어간다면 그 조치를 실제로 규정하는 후보 조문 하나를 고른다. 후보 목록에 없는 조문은 절대 쓰지 않는다.',
    '3. 위임 범위 밖이거나(법률이 직접 정한 의무·요건·대상 목록 등) 맞는 후보가 없으면 inScope=false, article=null.',
    '4. 확신이 없으면 false. 근거는 위임 조문 본문의 표현을 인용해 한 줄로.',
    'JSON만 출력: {"targets":[{"index":1,"inScope":true,"article":"후보에 적힌 그대로","reason":"한 줄"}]}',
  ].join('\n');
}

// 모델이 후보 줄을 통째로 옮겨 적는 일이 잦다("… 제47조 (대통령령) 「제목」").
// 조문 참조 부분만 떼어 후보와 맞춘다. 후보에 없는 조문은 그래도 버린다.
export function normalizeRef(s) {
  const t = String(s ?? '').replace(/[「」『』]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?제\d+조(?:의\d+)?)/);
  return (m ? m[1] : t).trim();
}

export function applyNarrow(card, cands, raw) {
  const allowed = new Map();
  cands.forEach((c, i) => c.items.forEach((x) => { allowed.set(`${i + 1}|${x.ref}`, x); allowed.set(`${i + 1}|${normalizeRef(x.ref)}`, x); }));
  const out = [];
  for (const r of raw?.targets ?? []) {
    const i = Number(r?.index);
    if (!Number.isInteger(i) || i < 1 || i > cands.length) continue;
    const c = cands[i - 1];
    if (!r.inScope) { out.push({ target: c.target, inScope: false, article: null, tier: tierOf(c.law), reason: String(r.reason ?? '') }); continue; }
    const hit = allowed.get(`${i}|${r.article}`) ?? allowed.get(`${i}|${normalizeRef(r.article)}`);
    if (!hit) { out.push({ target: c.target, inScope: false, article: null, tier: tierOf(c.law), reason: `후보 밖 조문 지목(${r.article ?? '없음'}) — 버림` }); continue; }
    out.push({ target: c.target, inScope: true, article: hit.ref, title: hit.title, tier: hit.tier, reason: String(r.reason ?? '') });
  }
  // 판정 못 받은 대상은 위임 없음으로 본다(보수적).
  for (const c of cands) if (!out.some((o) => o.target === c.target)) out.push({ target: c.target, inScope: false, article: null, tier: tierOf(c.law), reason: '판정 없음' });
  // 범위 안이면 그 하위 조문 층위, 밖이면 원래 법령의 층위. 카드의 구속 층위는 그중 가장 높은 것.
  const tiers = out.map((o) => (o.inScope ? o.tier : tierOf(String(o.target).split(' — ')[1]?.replace(/\s+제\d+조.*$/, '') ?? '')));
  const requiredTier = tiers.length ? tiers.slice().sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0] : null;
  return { id: card.id, kind: card.kind, title: card.title, requiredTier, needsStatute: requiredTier === '법률', targets: out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const fresh = process.argv.includes('--fresh');
  const laws = loadLaws(path.join(OUT, 'laws'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards-out.json'));
  const rows = [];
  for (const card of cards) {
    const base = classifyCard(laws, card);
    const cands = base.targets.map((t) => candidatesFor(laws, t));
    const r = callJson(buildNarrowPrompt(card, cands), { stage: 'narrow', fresh });
    if (r.failed) { rows.push({ ...base, narrowStatus: 'failed' }); process.stderr.write(`${card.id} failed\n`); continue; }
    rows.push({ ...applyNarrow(card, cands, r.data), narrowStatus: 'ok', before: base.requiredTier });
    process.stderr.write(`${card.id} ok${r.cached ? ' (cache)' : ''}\n`);
  }
  writeJson(path.join(OUT_COMPARE, 'tiers.json'), rows);
  const cnt = Object.fromEntries(TIERS.map((t) => [t, rows.filter((r) => r.requiredTier === t).length]));
  console.log('cards ' + rows.length + ' · ' + TIERS.map((t) => `${t} ${cnt[t]}`).join(' · ') + ` · 법률 불가피 ${rows.filter((r) => r.needsStatute).length}`);
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(4)} ${String(r.requiredTier).padEnd(6)}${r.before && r.before !== r.requiredTier ? ` (좁히기 전 ${r.before})` : ''} ${r.title}`);
    for (const t of r.targets) console.log(`        ${t.inScope ? '→ ' + t.article + ` 「${t.title}」` : '✗ 법률 사항'} — ${t.reason}`);
  }
}
