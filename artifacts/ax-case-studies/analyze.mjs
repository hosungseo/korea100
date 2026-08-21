// 귀납 분석: 사례 전수에서 "AX는 어디서 먼저 일어나는가"를 계산한다.
import { loadCases } from "./render-cases.mjs";

const cases = loadCases();
const cnt = (n, k) => n.filter((a) => a[3] === k).length;

const rows = cases.map((c) => {
  const a = c.asis.nodes, t = c.tobe.nodes;
  const steps = a.length;
  const inferred = cnt(a, "inferred");
  return {
    slug: c.slug,
    org: c.meta?.org ?? "",
    group: c.meta?.sweep ?? "",
    steps,
    statute: cnt(a, "statute"),
    inferred,
    inferredRatio: inferred / steps,
    replaced: cnt(t, "replaced"),
    changed: cnt(t, "changed"),
    removed: cnt(t, "removed"),
    auto: cnt(t, "auto"),
    replacedRatio: cnt(t, "replaced") / steps,
  };
});

const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
const mean = (f) => sum(f) / rows.length;

function pearson(fx, fy) {
  const mx = mean(fx), my = mean(fy);
  let num = 0, dx = 0, dy = 0;
  for (const r of rows) {
    const a = fx(r) - mx, b = fy(r) - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return num / Math.sqrt(dx * dy);
}

console.log(`사례 ${rows.length}건\n`);
console.log("── 전체 집계");
console.log(`분해한 업무 단계   ${sum((r) => r.steps)}`);
console.log(`  규정(초록)       ${sum((r) => r.statute)} (${(sum((r) => r.statute) / sum((r) => r.steps) * 100).toFixed(1)}%)`);
console.log(`  추론(파랑)       ${sum((r) => r.inferred)} (${(sum((r) => r.inferred) / sum((r) => r.steps) * 100).toFixed(1)}%)`);
console.log(`AI가 가져간 단계   대체 ${sum((r) => r.replaced)} · 간소화 ${sum((r) => r.changed)} · 소멸 ${sum((r) => r.removed)}`);
console.log(`절차 소멸 비율     ${(sum((r) => r.removed) / sum((r) => r.steps) * 100).toFixed(2)}%  ← 핵심 발견`);

console.log("\n── 가설 검증 (상관계수)");
console.log(`추론 비율 ↔ 대체 비율        r = ${pearson((r) => r.inferredRatio, (r) => r.replacedRatio).toFixed(3)}`);
console.log(`추론 수   ↔ 대체 수          r = ${pearson((r) => r.inferred, (r) => r.replaced).toFixed(3)}`);
console.log(`규정 수   ↔ 소멸 수          r = ${pearson((r) => r.statute, (r) => r.removed).toFixed(3)}`);
console.log(`단계 수   ↔ 대체 수          r = ${pearson((r) => r.steps, (r) => r.replaced).toFixed(3)}`);

console.log("\n── 대체가 많은 상위 10건");
[...rows].sort((a, b) => b.replaced - a.replaced).slice(0, 10)
  .forEach((r) => console.log(`  ${String(r.replaced).padStart(2)}개  ${r.org} — ${r.slug} (추론 ${r.inferred}/${r.steps})`));

console.log("\n── 소멸이 있는 사례 (절차 자체가 없어진 경우)");
rows.filter((r) => r.removed > 0).forEach((r) => console.log(`  ${r.removed}개  ${r.org} — ${r.slug}`));

console.log("\n── 추론 비율 구간별 평균 대체 수");
const bins = [[0, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]];
for (const [lo, hi] of bins) {
  const g = rows.filter((r) => r.inferredRatio >= lo && r.inferredRatio < hi);
  if (!g.length) continue;
  const avg = g.reduce((s, r) => s + r.replaced, 0) / g.length;
  console.log(`  추론 ${(lo * 100).toFixed(0)}~${(hi * 100).toFixed(0)}%  n=${String(g.length).padStart(3)}  평균 대체 ${avg.toFixed(2)}개`);
}
