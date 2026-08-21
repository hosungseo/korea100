// 구조 감사: cases/*.json 의 스키마·정합성·집계 일치·법령 인용 형식 검사
// 사용: node audit-cases.mjs [--json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, "cases");
const KINDS = ["statute", "inferred", "auto", "replaced", "removed", "changed"];
const EDGE_TYPES = ["loop", "auto", "replace"];

const findings = [];
const add = (file, sev, code, msg) =>
  findings.push({ file, sev, code, msg });

function auditSheet(file, c, which) {
  const s = c[which];
  const isTobe = which === "tobe";
  const laneMax = c.lanes.length + (isTobe ? 1 : 0);
  if (!s || !Array.isArray(s.nodes) || !s.nodes.length)
    return add(file, "ERROR", "no-nodes", `${which}: 노드 없음`);

  const ids = new Set();
  for (const a of s.nodes) {
    if (!Array.isArray(a) || a.length < 6)
      { add(file, "ERROR", "node-shape", `${which}: 노드 형식 오류 ${JSON.stringify(a)}`); continue; }
    const [id, gate, lane, kind, name, sub, tag] = a;
    if (ids.has(id)) add(file, "ERROR", "dup-id", `${which}: 중복 id ${id}`);
    ids.add(id);
    if (!KINDS.includes(kind)) add(file, "ERROR", "kind", `${which}/${id}: kind '${kind}'`);
    if (!(gate >= 0 && gate < c.gates.length))
      add(file, "ERROR", "gate-range", `${which}/${id}: gate ${gate} (gates ${c.gates.length})`);
    if (!(lane >= 0 && lane < laneMax))
      add(file, "ERROR", "lane-range", `${which}/${id}: lane ${lane} (max ${laneMax - 1})`);
    if (!name || !sub) add(file, "WARN", "empty-text", `${which}/${id}: name/sub 비어 있음`);
    if (kind === "statute" && !/제\s*\d+조/.test(String(sub)))
      add(file, "ERROR", "statute-no-article", `${which}/${id}: statute인데 조문번호 없음 — "${sub}"`);
    if (!isTobe && !["statute", "inferred"].includes(kind))
      add(file, "ERROR", "asis-kind", `asis/${id}: AS-IS에 '${kind}' 사용`);
    if (isTobe && kind === "auto" && lane !== laneMax - 1)
      add(file, "ERROR", "auto-lane", `tobe/${id}: auto 노드가 AI 레인(${laneMax - 1})이 아님 (lane ${lane})`);
    if (isTobe && kind === "replaced") {
      if (!/^A\d+로 대체$/.test(String(tag || "")))
        add(file, "ERROR", "replaced-tag", `tobe/${id}: tag가 'A0n로 대체' 형식이 아님 — "${tag}"`);
    }
  }

  for (const e of s.edges || []) {
    if (!Array.isArray(e) || e.length < 2)
      { add(file, "ERROR", "edge-shape", `${which}: 엣지 형식 오류`); continue; }
    const [f, t, type] = e;
    if (!ids.has(f)) add(file, "ERROR", "edge-from", `${which}: 엣지 출발 ${f} 없음`);
    if (!ids.has(t)) add(file, "ERROR", "edge-to", `${which}: 엣지 도착 ${t} 없음`);
    if (type && !EDGE_TYPES.includes(type))
      add(file, "ERROR", "edge-type", `${which}: 엣지 타입 '${type}'`);
  }
  return ids;
}

function auditCase(file, c) {
  for (const k of ["slug", "lanes", "gates", "basisNote", "asis", "tobe"])
    if (!c[k]) add(file, "ERROR", "missing", `필수 필드 없음: ${k}`);
  if (!c.lanes || c.lanes.length < 3 || c.lanes.length > 5)
    add(file, "WARN", "lane-count", `레인 ${c.lanes?.length}개 (권장 3~5)`);
  if (!c.gates || c.gates.length < 4 || c.gates.length > 7)
    add(file, "WARN", "gate-count", `게이트 ${c.gates?.length}개 (권장 4~7)`);
  for (const g of c.gates || [])
    if (!/^G\d+\s/.test(g)) add(file, "ERROR", "gate-format", `게이트 형식 'G0 이름' 아님 — "${g}"`);
  if (!c.meta?.sources?.length) add(file, "ERROR", "no-source", "meta.sources 없음");
  if (c.basisNote && !c.basisNote.includes("파란 칸"))
    add(file, "WARN", "basis-note", "basisNote에 파란 칸 설명 없음");

  const asisIds = auditSheet(file, c, "asis") || new Set();
  const tobeIds = auditSheet(file, c, "tobe") || new Set();

  const tobeNodes = c.tobe?.nodes || [];
  const autoIds = new Set(tobeNodes.filter((a) => a[3] === "auto").map((a) => a[0]));
  if (!autoIds.size) add(file, "ERROR", "no-auto", "TO-BE에 auto 노드 없음");
  for (const a of tobeNodes) {
    if (a[3] !== "replaced") continue;
    if (!asisIds.has(a[0]))
      add(file, "ERROR", "replaced-orphan", `tobe/${a[0]}: AS-IS에 같은 id 없음`);
    const m = /^(A\d+)로 대체$/.exec(String(a[6] || ""));
    if (m && !autoIds.has(m[1]))
      add(file, "ERROR", "replaced-target", `tobe/${a[0]}: 대체 대상 ${m[1]}이 TO-BE에 없음`);
    const orig = (c.asis?.nodes || []).find((x) => x[0] === a[0]);
    if (orig && orig[2] !== a[2])
      add(file, "WARN", "replaced-lane", `tobe/${a[0]}: 대체 노드 lane이 원래(${orig[2]})와 다름(${a[2]})`);
  }

  // 집계 일치
  const cnt = (nodes, kind) => nodes.filter((a) => a[3] === kind).length;
  const aStat = cnt(c.asis?.nodes || [], "statute");
  const aInf = cnt(c.asis?.nodes || [], "inferred");
  const hs = c.asis?.headline || "";
  const mTotal = /전 단계\s*(\d+)/.exec(hs);
  const mStat = /규정\s*(\d+)/.exec(hs);
  const mInf = /(?:추론|탐색)\s*(\d+)/.exec(hs);
  if (mTotal && +mTotal[1] !== aStat + aInf)
    add(file, "ERROR", "headline-total", `asis headline 전 단계 ${mTotal[1]} ≠ 실제 ${aStat + aInf}`);
  if (mStat && +mStat[1] !== aStat)
    add(file, "ERROR", "headline-statute", `asis headline 규정 ${mStat[1]} ≠ 실제 ${aStat}`);
  if (mInf && +mInf[1] !== aInf)
    add(file, "ERROR", "headline-inferred", `asis headline 추론 ${mInf[1]} ≠ 실제 ${aInf}`);

  const ht = c.tobe?.headline || "";
  const pairs = [
    [/대체\s*(\d+)/, "replaced"],
    [/간소화\s*(\d+)/, "changed"],
    [/소멸\s*(\d+)/, "removed"],
    [/자동\s*(\d+)/, "auto"],
  ];
  for (const [re, kind] of pairs) {
    const m = re.exec(ht);
    if (m && +m[1] !== cnt(tobeNodes, kind))
      add(file, "ERROR", `headline-${kind}`, `tobe headline ${kind} ${m[1]} ≠ 실제 ${cnt(tobeNodes, kind)}`);
  }

  // AS-IS 유지 노드가 TO-BE에서 사라졌는지(설명 없는 증발) 점검
  for (const a of c.asis?.nodes || [])
    if (!tobeIds.has(a[0]))
      add(file, "WARN", "vanished", `asis/${a[0]} '${a[4]}'가 TO-BE에 없음 — removed로 명시했는지 확인`);
}

const files = fs.existsSync(CASES)
  ? fs.readdirSync(CASES).filter((f) => f.endsWith(".json"))
  : [];
for (const f of files) {
  let c;
  try {
    c = JSON.parse(fs.readFileSync(path.join(CASES, f), "utf8"));
  } catch (e) {
    add(f, "ERROR", "json-parse", e.message);
    continue;
  }
  auditCase(f, c);
}

const errs = findings.filter((f) => f.sev === "ERROR");
const warns = findings.filter((f) => f.sev === "WARN");
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ files: files.length, errors: errs, warnings: warns }, null, 1));
} else {
  const byFile = {};
  for (const f of findings) (byFile[f.file] ||= []).push(f);
  for (const [file, list] of Object.entries(byFile)) {
    console.log(`\n── ${file}`);
    for (const f of list) console.log(`  [${f.sev}] ${f.code}: ${f.msg}`);
  }
  console.log(`\n총 ${files.length}건 · ERROR ${errs.length} · WARN ${warns.length}`);
}
process.exit(errs.length ? 1 : 0);
