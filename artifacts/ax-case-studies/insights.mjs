// 심층 귀납 분석: AX는 행정업무의 '무엇을' 바꾸는가
import { loadCases } from "./render-cases.mjs";

const cases = loadCases();
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "-");
const bar = (n, max, w = 28) => "█".repeat(Math.max(1, Math.round((n / max) * w)));

// ── 1. 대체된 단계는 원래 '규정'이었나 '추론'이었나 ──────────────────
let repFromStatute = 0, repFromInferred = 0;
let chgFromStatute = 0, chgFromInferred = 0;
let rmFromStatute = 0, rmFromInferred = 0;
let keptStatute = 0, keptInferred = 0;

for (const c of cases) {
  const asisKind = new Map(c.asis.nodes.map((n) => [n[0], n[3]]));
  for (const n of c.tobe.nodes) {
    const orig = asisKind.get(n[0]);
    if (!orig) continue;
    if (n[3] === "replaced") orig === "statute" ? repFromStatute++ : repFromInferred++;
    else if (n[3] === "changed") orig === "statute" ? chgFromStatute++ : chgFromInferred++;
    else if (n[3] === "removed") orig === "statute" ? rmFromStatute++ : rmFromInferred++;
    else orig === "statute" ? keptStatute++ : keptInferred++;
  }
}
const totStatute = repFromStatute + chgFromStatute + rmFromStatute + keptStatute;
const totInferred = repFromInferred + chgFromInferred + rmFromInferred + keptInferred;

console.log(`사례 ${cases.length}건 · 심층 분석\n`);
console.log("【1】 AI는 '규정에 적힌 단계'를 가져가는가, '규정 밖 실무'를 가져가는가");
console.log(`  규정(초록) 단계 ${totStatute}개 중  대체 ${repFromStatute} (${pct(repFromStatute, totStatute)}) · 간소화 ${chgFromStatute} · 소멸 ${rmFromStatute} · 그대로 ${keptStatute}`);
console.log(`  추론(파랑) 단계 ${totInferred}개 중  대체 ${repFromInferred} (${pct(repFromInferred, totInferred)}) · 간소화 ${chgFromInferred} · 소멸 ${rmFromInferred} · 그대로 ${keptInferred}`);
console.log(`  → 대체 ${repFromStatute + repFromInferred}건 중 ${pct(repFromInferred, repFromStatute + repFromInferred)}가 규정 밖 실무에서 나왔다`);

// ── 2. 절차의 어느 구간이 바뀌나 (게이트 상대 위치) ──────────────────
console.log("\n【2】 절차의 어느 구간이 바뀌나 (게이트를 앞·중·뒤 3구간으로 정규화)");
const seg = { 앞: { rep: 0, all: 0 }, 중: { rep: 0, all: 0 }, 뒤: { rep: 0, all: 0 } };
for (const c of cases) {
  const G = c.gates.length;
  for (const n of c.tobe.nodes) {
    const r = n[1] / Math.max(1, G - 1);
    const k = r < 0.34 ? "앞" : r < 0.67 ? "중" : "뒤";
    seg[k].all++;
    if (n[3] === "replaced" || n[3] === "auto") seg[k].rep++;
  }
}
for (const [k, v] of Object.entries(seg))
  console.log(`  ${k} 구간  전체 ${String(v.all).padStart(4)}  AI 개입 ${String(v.rep).padStart(3)} (${pct(v.rep, v.all)})  ${bar(v.rep / v.all, 0.5)}`);

// ── 3. 어떤 '동작'이 대체되나 (노드 이름의 서술어) ───────────────────
console.log("\n【3】 무슨 동작이 넘어가나 (대체된 단계 이름의 키워드)");
const VERBS = {
  "검색·조회": /검색|조회|찾|열람|탐색/,
  "대조·확인": /대조|확인|검토|점검|비교|판독|검수/,
  "작성·기안": /작성|기안|초안|입력|기재|정리/,
  "취합·수합": /취합|수합|모으|집계|합본|병합/,
  "분류·배부": /분류|배부|배정|선별|판별|라우팅/,
  "요약·번역": /요약|번역|변환|추출/,
  "연락·안내": /연락|안내|응대|통보|독려|전화/,
};
const hit = Object.fromEntries(Object.keys(VERBS).map((k) => [k, { rep: 0, kept: 0 }]));
for (const c of cases)
  for (const n of c.tobe.nodes) {
    for (const [k, re] of Object.entries(VERBS)) {
      if (!re.test(n[4])) continue;
      if (n[3] === "replaced") hit[k].rep++;
      else if (n[3] === "statute" || n[3] === "inferred") hit[k].kept++;
    }
  }
const maxRep = Math.max(...Object.values(hit).map((h) => h.rep));
for (const [k, v] of Object.entries(hit).sort((a, b) => b[1].rep - a[1].rep))
  console.log(`  ${k.padEnd(7)} 대체 ${String(v.rep).padStart(3)} · 사람에 남음 ${String(v.kept).padStart(3)}  (대체율 ${pct(v.rep, v.rep + v.kept)})  ${bar(v.rep, maxRep)}`);

// ── 4. 사람에게 남는 것 ──────────────────────────────────────────────
console.log("\n【4】 사람에게 남는 단계의 성격 (TO-BE에서 statute/inferred로 유지된 것)");
const KEEP = {
  "결정·승인·결재": /결정|승인|결재|의결|확정|발령|처분/,
  "심사·판단": /심사|판단|심의|평가|검증/,
  "현장·대면": /현장|출동|방문|면담|조사|검사/,
  "통지·교부": /통지|교부|송달|회신|공표/,
  "접수·신청": /접수|신청|신고|제출/,
};
const keep = Object.fromEntries(Object.keys(KEEP).map((k) => [k, 0]));
let keptTotal = 0;
for (const c of cases)
  for (const n of c.tobe.nodes) {
    if (!["statute", "inferred"].includes(n[3])) continue;
    keptTotal++;
    for (const [k, re] of Object.entries(KEEP)) if (re.test(n[4])) keep[k]++;
  }
const maxKeep = Math.max(...Object.values(keep));
for (const [k, v] of Object.entries(keep).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(9)} ${String(v).padStart(3)}건  ${bar(v, maxKeep)}`);
console.log(`  (사람에게 남은 단계 총 ${keptTotal}개)`);

// ── 5. 되돌아가는 루프(반려·재작업)는 줄어드나 ───────────────────────
console.log("\n【5】 반려·재작업 루프");
let loopA = 0, loopB = 0, casesWithLoop = 0, loopGone = 0;
for (const c of cases) {
  const a = (c.asis.edges || []).filter((e) => e[2] === "loop").length;
  const b = (c.tobe.edges || []).filter((e) => e[2] === "loop").length;
  loopA += a; loopB += b;
  if (a > 0) { casesWithLoop++; if (b < a) loopGone++; }
}
console.log(`  AS-IS 루프 ${loopA}개 → TO-BE ${loopB}개 (${pct(loopB, loopA)} 잔존)`);
console.log(`  루프가 있던 ${casesWithLoop}건 중 줄어든 사례 ${loopGone}건`);

// ── 6. 기관 유형별 차이 ─────────────────────────────────────────────
console.log("\n【6】 기관 유형별 — 규정 비중과 대체 강도");
const GROUP = {
  "13-sweep-central.md": "중앙부처", "13-sweep-metro.md": "광역", "13-sweep-basic.md": "기초",
  "13-sweep-special.md": "특수직역", "13-sweep-public-org.md": "공공기관", "13-sweep-awards.md": "사례집",
  "13-sweep-community.md": "자체개발", "14-master-pool.md": "깃랩",
  "11-axboard-internal-work-shortlist.md": "깃랩", "10-pax-internal-work-shortlist.md": "깃랩",
};
const g = {};
for (const c of cases) {
  const k = GROUP[c.meta?.sweep] || "기타";
  g[k] ??= { n: 0, steps: 0, st: 0, rep: 0, rm: 0 };
  g[k].n++;
  g[k].steps += c.asis.nodes.length;
  g[k].st += c.asis.nodes.filter((n) => n[3] === "statute").length;
  g[k].rep += c.tobe.nodes.filter((n) => n[3] === "replaced").length;
  g[k].rm += c.tobe.nodes.filter((n) => n[3] === "removed").length;
}
console.log("  유형        건수  평균단계  규정비중  건당대체  소멸");
for (const [k, v] of Object.entries(g).sort((a, b) => b[1].n - a[1].n))
  console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(3)}   ${(v.steps / v.n).toFixed(1).padStart(5)}   ${pct(v.st, v.steps).padStart(6)}   ${(v.rep / v.n).toFixed(2).padStart(6)}   ${v.rm}`);
