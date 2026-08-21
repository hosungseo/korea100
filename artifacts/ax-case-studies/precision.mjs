// 정밀도 진단: 정밀 9건을 기준선으로 각 사례의 깊이를 점수화한다.
// 사용: node precision.mjs [--weak] [--csv]
import { loadCases } from "./render-cases.mjs";

const cases = loadCases();
const isPrecision = (c) => c.meta?.sweep === "정밀 9건";

// 항·호까지 인용했는가 (제8조의2제1항 / 별표 2 / 제31조제2항)
// 조와 항 사이에 조문 제목 괄호가 끼어도 인정한다 — 예) 제19조(화재 등의 통지) 제1항
const HANG =
  /제\s*\d+\s*조(?:의\s*\d+)?(?:\s*\([^)]*\))?\s*제\s*\d+\s*항|별표\s*\d+|제\s*\d+\s*호/;
// 조문에 설명(괄호)을 달았는가 — 위치는 따지지 않는다.
// 조 뒤·항 뒤·호 목록 뒤 어디에 달렸든 "그 조문이 무슨 내용인지" 밝혔으면 통과로 본다.
const TITLE = /\([^)]{2,}\)/;

function score(c) {
  const a = c.asis.nodes, t = c.tobe.nodes;
  const st = a.filter((n) => n[3] === "statute");
  const withHang = st.filter((n) => HANG.test(n[5])).length;
  const withTitle = st.filter((n) => TITLE.test(n[5])).length;
  const loops = (c.asis.edges || []).filter((e) => e[2] === "loop").length;
  const subLen = a.reduce((s, n) => s + String(n[5]).length, 0) / a.length;
  return {
    slug: c.slug,
    org: c.meta?.org ?? "",
    precision: isPrecision(c),
    steps: a.length,
    gates: c.gates.length,
    lanes: c.lanes.length,
    statute: st.length,
    statuteRatio: st.length / a.length,
    hang: withHang,
    hangRatio: st.length ? withHang / st.length : 0,
    titleRatio: st.length ? withTitle / st.length : 0,
    loops,
    subLen,
    basis: (c.basisNote || "").length,
    replaced: t.filter((n) => n[3] === "replaced").length,
  };
}

const rows = cases.map(score);
const P = rows.filter((r) => r.precision);
const E = rows.filter((r) => !r.precision);
const avg = (arr, f) => arr.reduce((s, r) => s + f(r), 0) / arr.length;

const metrics = [
  ["평균 단계 수", (r) => r.steps, 1],
  ["평균 게이트", (r) => r.gates, 1],
  ["평균 레인", (r) => r.lanes, 1],
  ["규정 비중", (r) => r.statuteRatio * 100, 1],
  ["조문에 항·호·별표 표기율", (r) => r.hangRatio * 100, 1],
  ["조문 제목 표기율", (r) => r.titleRatio * 100, 1],
  ["AS-IS 루프 수", (r) => r.loops, 2],
  ["노드 설명(sub) 평균 길이", (r) => r.subLen, 1],
  ["각주 길이", (r) => r.basis, 0],
];

console.log(`정밀 ${P.length}건 vs 확장 ${E.length}건 — 기준선 대비 격차\n`);
console.log("  지표                          정밀    확장    격차");
for (const [name, f, d] of metrics) {
  const p = avg(P, f), e = avg(E, f);
  const gap = e - p;
  const mark = gap < -0.001 ? "◀ 부족" : "";
  console.log(`  ${name.padEnd(26)} ${p.toFixed(d).padStart(6)} ${e.toFixed(d).padStart(7)} ${gap.toFixed(d).padStart(7)}  ${mark}`);
}

// 공공기관·공기업은 법령이 아니라 사규·내규로 운영되므로 규정 비중이 낮은 것이 정상이다.
// 이들에게 초록을 요구하면 오히려 억지 인용을 부른다 → 규정 비중 약점에서 면제한다.
const SAGYU = /공사|공단|공기업|진흥원|연구원|의료원|공항|철도|전력|수력|도로공사|교통공사|시설관리/;
const isSagyu = (c) =>
  c.meta?.sweep === "13-sweep-public-org.md" || SAGYU.test(c.meta?.org ?? "");
const sagyuSlugs = new Set(cases.filter(isSagyu).map((c) => c.slug));

// 개별 사례 약점 판정
const WEAK = (r) => {
  const f = [];
  if (r.steps < 11) f.push("단계<11");
  if (r.gates < 5) f.push("게이트<5");
  if (r.statuteRatio < 0.2 && !sagyuSlugs.has(r.slug)) f.push("규정<20%");
  if (r.statute && r.hangRatio < 0.25) f.push("항·호표기<25%");
  if (r.statute && r.titleRatio < 0.9) f.push("조문제목누락");
  if (r.loops < 1) f.push("루프0");
  if (r.subLen < 18) f.push("설명짧음");
  return f;
};

const weak = E.map((r) => ({ ...r, flags: WEAK(r) })).filter((r) => r.flags.length);
console.log(`\n보완 대상 ${weak.length}/${E.length}건 (약점 1개 이상)\n`);

const counts = {};
for (const r of weak) for (const f of r.flags) counts[f] = (counts[f] || 0) + 1;
console.log("  약점 유형별 빈도");
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
  console.log(`    ${k.padEnd(16)} ${v}건`);

if (process.argv.includes("--weak")) {
  console.log("\n  사례별 약점");
  for (const r of weak.sort((a, b) => b.flags.length - a.flags.length))
    console.log(`    ${r.slug.padEnd(34)} ${r.flags.join(", ")}`);
}
if (process.argv.includes("--csv")) {
  console.log("\nslug,flags");
  for (const r of weak) console.log(`${r.slug},"${r.flags.join(" ")}"`);
}
