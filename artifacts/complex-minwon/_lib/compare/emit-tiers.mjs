// 카드 13장의 지목 조문을 법규명령 층위로 가른다. laws/ 스냅샷 원문만 근거로 쓴다.
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT, OUT_COMPARE } from './lib/paths.mjs';
import { loadLaws } from '../verify-basis.mjs';
import { classifyCard, TIERS } from './lib/tier.mjs';

export function summarize(rows) {
  const byTier = Object.fromEntries(TIERS.map((t) => [t, 0]));
  for (const r of rows) if (r.requiredTier) byTier[r.requiredTier]++;
  return { cards: rows.length, byTier, statuteNeeded: rows.filter((r) => r.needsStatute).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const laws = loadLaws(path.join(OUT, 'laws'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards-out.json'));
  const rows = cards.map((c) => classifyCard(laws, c));
  writeJson(path.join(OUT_COMPARE, 'tiers.json'), rows);
  const s = summarize(rows);
  console.log(`cards ${s.cards} · ` + TIERS.map((t) => `${t} ${s.byTier[t]}`).join(' · ') + ` · 법률개정 불가피 ${s.statuteNeeded}`);
  for (const r of rows) {
    const miss = r.targets.filter((t) => !t.snapshot).map((t) => `${t.law} ${t.article}`);
    console.log(`  ${r.id.padEnd(4)} ${String(r.requiredTier).padEnd(6)} ${r.needsStatute ? '법률필요' : '하위가능'} ${r.title}`);
    for (const t of r.targets) {
      const imp = t.implementing.map((i) => `${i.law} ${i.article}`).join(', ');
      console.log(`        ${t.tier} ${t.law} ${t.article}${t.delegates.length ? ` → 위임 ${t.delegates.join('/')}` : ''}${imp ? ` → ${imp}` : ''}${t.snapshot ? '' : ' [스냅샷 없음]'}`);
    }
    if (miss.length) console.log('        미대조:', miss.join(', '));
  }
}
