// 사람이 라벨링한 20개 카드와 엔진 카드의 org·act·subjects 일치율.
import path from 'node:path';
import { readJson } from './lib/io.mjs';
import { COMPARE, OUT_COMPARE } from './lib/paths.mjs';

export function agreement(golden, cards) {
  let org = 0, act = 0, subj = 0, n = 0;
  for (const g of golden) {
    const c = cards[g.pid]; if (!c) continue; n++;
    if (c.org === g.org) org++;
    if (c.act === g.act) act++;
    const A = new Set(g.subjects), B = new Set(c.subjects ?? []);
    const inter = [...A].filter((x) => B.has(x)).length, union = new Set([...A, ...B]).size;
    subj += union === 0 ? 1 : inter / union;
  }
  return { n, org: org / n, act: act / n, subjects: subj / n };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const golden = readJson(path.join(COMPARE, 'golden', 'cards.golden.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const r = agreement(golden, cards);
  console.log(`golden ${r.n} · org ${(r.org * 100).toFixed(0)}% · act ${(r.act * 100).toFixed(0)}% · subjects(Jaccard) ${(r.subjects * 100).toFixed(0)}%`);
  if (r.org < 0.8 || r.act < 0.8 || r.subjects < 0.8) process.exit(1);
}
