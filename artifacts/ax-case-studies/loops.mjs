// 루프 분해: 되돌아가는 고리는 남는가, 목적지가 바뀌는가, 사라지는가
import { loadCases } from "./render-cases.mjs";

const cases = loadCases();
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "-");
const bar = (r, w = 20) => "█".repeat(Math.max(0, Math.round(r * w)));

const KIND = {
  "보완·반려": /보완|반려|재제출|미비|누락|정정|반송/,
  "재작성·수정": /재작성|수정|재검토|다시 작성|재기안/,
  "독려·재요청": /독려|재요청|재촉|미제출|미이수|재문의|재연락/,
  "재탐색·재조회": /재검색|다시 탐색|재조회|재확인|다시 찾/,
  "이의·불복": /이의|불복|심판|재심|항고/,
};
const classify = (label, toName) => {
  const t = `${label ?? ""} ${toName ?? ""}`;
  for (const [k, re] of Object.entries(KIND)) if (re.test(t)) return k;
  return "기타";
};

const GROUP = {
  "13-sweep-central.md": "중앙부처", "13-sweep-metro.md": "광역", "13-sweep-basic.md": "기초",
  "13-sweep-special.md": "특수직역", "13-sweep-public-org.md": "공공기관", "13-sweep-awards.md": "사례집",
  "13-sweep-community.md": "자체개발", "14-master-pool.md": "깃랩",
  "11-axboard-internal-work-shortlist.md": "깃랩", "10-pax-internal-work-shortlist.md": "깃랩",
  "정밀 9건": "정밀",
};

const rows = [];          // AS-IS 루프의 운명
let tobeTotal = 0, tobeToAI = 0, tobeToHuman = 0, tobeNew = 0;

for (const c of cases) {
  const aKind = new Map(c.asis.nodes.map((n) => [n[0], n[3]]));
  const aName = new Map(c.asis.nodes.map((n) => [n[0], n[4]]));
  const tKind = new Map(c.tobe.nodes.map((n) => [n[0], n[3]]));
  const tName = new Map(c.tobe.nodes.map((n) => [n[0], n[4]]));
  const asisLoops = (c.asis.edges || []).filter((e) => e[2] === "loop");
  const tobeLoops = (c.tobe.edges || []).filter((e) => e[2] === "loop");
  const asisPairs = new Set(asisLoops.map((e) => `${e[0]}>${e[1]}`));

  tobeTotal += tobeLoops.length;
  for (const e of tobeLoops) {
    const k = tKind.get(e[1]);
    if (k === "auto") tobeToAI++;
    else tobeToHuman++;
    if (!asisPairs.has(`${e[0]}>${e[1]}`)) tobeNew++;
  }

  for (const e of asisLoops) {
    const [from, to, , label] = e;
    const same = tobeLoops.some((x) => x[0] === from && x[1] === to);
    const moved = !same && tobeLoops.some((x) => x[0] === from); // 출발점은 같은데 목적지가 바뀜
    const movedTo = moved ? tobeLoops.find((x) => x[0] === from)[1] : null;
    rows.push({
      slug: c.slug,
      group: GROUP[c.meta?.sweep] ?? "기타",
      label: label ?? "",
      kind: classify(label, aName.get(to)),
      anchorStatute: aKind.get(to) === "statute",
      toName: aName.get(to) ?? "",
      fate: same ? "유지" : moved ? "재정착" : "소멸",
      movedToAI: moved ? tKind.get(movedTo) === "auto" : false,
      movedToName: moved ? tName.get(movedTo) ?? "" : "",
    });
  }
}

const n = rows.length;
const keep = rows.filter((r) => r.fate === "유지").length;
const move = rows.filter((r) => r.fate === "재정착").length;
const gone = rows.filter((r) => r.fate === "소멸").length;
const moveAI = rows.filter((r) => r.fate === "재정착" && r.movedToAI).length;

console.log(`AS-IS 루프 ${n}개 → TO-BE 루프 ${tobeTotal}개 (개수 기준 ${pct(tobeTotal, n)})\n`);
console.log("【0】 개수는 유지돼도 '같은 루프'는 아니다 — AS-IS 루프의 운명");
console.log(`  그대로 유지   ${String(keep).padStart(3)} (${pct(keep, n)})  ${bar(keep / n)}`);
console.log(`  재정착        ${String(move).padStart(3)} (${pct(move, n)})  ${bar(move / n)}   ← 그중 AI 레인으로 ${moveAI}개`);
console.log(`  소멸          ${String(gone).padStart(3)} (${pct(gone, n)})  ${bar(gone / n)}`);
console.log(`\n  TO-BE 루프 ${tobeTotal}개의 착지점: 사람 ${tobeToHuman} · AI ${tobeToAI} (${pct(tobeToAI, tobeTotal)})`);

console.log("\n【1】 되돌아가 착지하는 단계가 법정 절차인가 — 이것이 존속을 가른다");
for (const key of [true, false]) {
  const g = rows.filter((r) => r.anchorStatute === key);
  const k = g.filter((r) => r.fate === "유지").length;
  const gg = g.filter((r) => r.fate === "소멸").length;
  const name = key ? "법정 절차(초록)에 착지" : "규정 밖 실무(파랑)에 착지";
  console.log(`  ${name.padEnd(22)} ${String(g.length).padStart(3)}개 — 유지 ${pct(k, g.length).padStart(6)} · 소멸 ${pct(gg, g.length).padStart(6)}`);
}

console.log("\n【2】 루프 성격별 운명");
const byKind = {};
for (const r of rows) (byKind[r.kind] ??= []).push(r);
console.log("  성격          개수   유지     재정착    소멸");
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  const f = (x) => pct(v.filter((r) => r.fate === x).length, v.length).padStart(6);
  console.log(`  ${k.padEnd(12)} ${String(v.length).padStart(3)}  ${f("유지")}  ${f("재정착")}  ${f("소멸")}`);
}

console.log("\n【3】 기관 유형별 루프 존속(유지+재정착)");
const byGroup = {};
for (const r of rows) (byGroup[r.group] ??= []).push(r);
for (const [k, v] of Object.entries(byGroup).sort((a, b) => b[1].length - a[1].length)) {
  const alive = v.filter((r) => r.fate !== "소멸").length;
  console.log(`  ${k.padEnd(8)} ${String(v.length).padStart(3)}개 — 존속 ${pct(alive, v.length).padStart(6)} · 소멸 ${pct(v.length - alive, v.length).padStart(6)}`);
}

console.log("\n【4】 AI 레인으로 재정착한 루프 — 사람에게 돌아가던 고리가 기계로");
rows.filter((r) => r.fate === "재정착" && r.movedToAI).slice(0, 15)
  .forEach((r) => console.log(`  ${r.slug} — "${r.label}" : ${r.toName} → ${r.movedToName}`));

console.log("\n【5】 완전히 사라진 루프");
rows.filter((r) => r.fate === "소멸")
  .forEach((r) => console.log(`  [${r.kind}] ${r.slug} — "${r.label}" → ${r.toName}${r.anchorStatute ? " (법정 착지)" : ""}`));
