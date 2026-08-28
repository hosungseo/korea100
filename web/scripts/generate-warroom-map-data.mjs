#!/usr/bin/env node
// Build trimmed graph data for the warroom dependency map (/warroom/map/).
// Reads the gwangju semiconductor project JSON and emits nodes, stages and
// typed edges resolved from requires[].artifact -> produces[] tokens.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(
  root,
  "data/mega-projects/projects/gwangju-semiconductor-cluster.json",
);
const outDir = join(root, "public/warroom/map");
const outPath = join(outDir, "data.json");
const procPath = join(outDir, "procedures.json");

const project = JSON.parse(readFileSync(srcPath, "utf8"));

const producers = new Map();
for (const node of project.nodes) {
  for (const token of node.produces ?? []) {
    if (!producers.has(token)) producers.set(token, []);
    producers.get(token).push(node.id);
  }
}

const edges = [];
const seen = new Set();
for (const node of project.nodes) {
  for (const req of node.requires ?? []) {
    const token = req.artifact;
    const sources = producers.get(token);
    if (!sources) continue;
    for (const from of sources) {
      if (from === node.id) continue;
      const key = `${from}>${node.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from,
        to: node.id,
        kind: req.kind ?? "legal",
        strength: req.strength ?? "hard",
        relation: req.relation ?? "finish_to_start",
      });
    }
  }
}

// 위상 계층 — src/lib/mega-tier.ts와 같은 어휘·규칙을 쓴다.
// cabinet 총리·국무회의 / minister 부처 장관 / local 지자체장 /
// committee 위원회·전문기관 / field 실무·사업자·기타.
// 워룸 정직성 규칙: "산업단지 지정권자"·"승인기관" 같은 역할명은 지정 경로
// 확정 전까지 특정 기관·계층으로 치환하지 않는다 → 어느 패턴에도 안 걸려
// field로 남는다. 예외로 위원장이 국무총리로 법정된 위원회만 cabinet에 둔다.
const TIER_RANK = { cabinet: 4, minister: 3, local: 2, committee: 1, field: 0 };
// 위원장=국무총리 법정 위원회(국가첨단전략산업법 §9, 전력망확충특별법 §6,
// 반도체특별법 위원회 규정) — 총리 테이블에 올라가는 의결이라 cabinet.
const PM_CHAIRED_COMMITTEE_PATTERN =
  /국가첨단전략산업위원회|국가기간전력망확충위원회|반도체산업경쟁력강화특별위원회/;
const CABINET_PATTERN = /국무회의|국무총리|대통령|청와대|범정부/;
const APPLICANT_ACTOR_PATTERN =
  /^(신청인|제안자|사업시행자|사업자|사업주|기업|입주기업|외국인투자가|영업자|할당대상업체|건설사업자|소유자|토지소유자|주민)/;
const MINISTER_PATTERN =
  /장관|산업통상부|산업통상자원부|기획재정부|기후에너지환경부|행정안전부|국토교통부|고용노동부|과학기술정보통신부|문화체육관광부|농림축산식품부|해양수산부|중소벤처기업부|보건복지부|기획예산처|환경부|국방부|국가유산청|소방청|산림청|경찰청|조달청|기상청|중앙행정기관|중앙관서|중앙부처|주무부처|주관부처/;
const LOCAL_PATTERN =
  /시·도지사|도지사|시장·군수|시장등|군수|구청장|관할 구청|광주시|전라남도|전남광주시|지자체|지방자치단체|시·도|시·군·구|지적소관청|공공하수도관리청/;
const COMMITTEE_PATTERN = /위원회|심의|전문기관|심사|검토기관|의회|정책심의회/;

function classifyTier(actor) {
  // 결정주체가 정확히 "정부"인 경우만 — mega-tier가 부분 문자열(재정부서의
  // '정부')을 피하려고 안 넣은 토큰이라 여기선 완전 일치로만 잡는다.
  if (actor === "정부") return "cabinet";
  if (PM_CHAIRED_COMMITTEE_PATTERN.test(actor)) return "cabinet";
  if (CABINET_PATTERN.test(actor)) return "cabinet";
  if (APPLICANT_ACTOR_PATTERN.test(actor)) return "field";
  if (MINISTER_PATTERN.test(actor)) return "minister";
  if (LOCAL_PATTERN.test(actor)) return "local";
  if (COMMITTEE_PATTERN.test(actor)) return "committee";
  return "field";
}

function nodeLevel(n) {
  const decision = n.actorRoles?.decision ?? [];
  const actors = decision.length ? decision : n.actorRoles?.lead ?? [];
  let best = "field";
  for (const a of actors) {
    const tier = classifyTier(a);
    if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}

// 결정주체 문자열에서 소관 부처를 뽑는다 — "기후에너지환경부"가 "환경부"보다
// 먼저 오도록 부분 문자열 포함 순서를 지킨다
const MINISTRY_CANON = [
  ["기후에너지환경부", "기후에너지환경부"],
  ["국방부", "국방부"],
  ["행정안전부", "행정안전부"],
  ["산업통상자원부", "산업통상부"],
  ["산업통상부", "산업통상부"],
  ["고용노동부", "고용노동부"],
  ["환경부", "환경부"],
  ["국가유산청", "국가유산청"],
];
function nodeMinistries(n) {
  const decision = n.actorRoles?.decision ?? [];
  const actors = decision.length ? decision : n.actorRoles?.lead ?? [];
  const out = [];
  for (const a of actors) {
    for (const [token, canon] of MINISTRY_CANON) {
      if (a.includes(token)) {
        if (!out.includes(canon)) out.push(canon);
        break;
      }
    }
  }
  return out;
}

// 역연결: 관문 templateRefs → 본판 제도(이름·절차 수)를 지도에 노출
function templateInfo(refs) {
  const out = [];
  for (const ref of refs ?? []) {
    try {
      const inst = JSON.parse(
        readFileSync(join(root, `data/institutions/${ref.institution}.json`), "utf8"),
      );
      const procs = Array.isArray(ref.nodeIds)
        ? ref.nodeIds.length
        : inst.process?.nodes?.length ?? 0;
      out.push({ slug: ref.institution, name: inst.name, procs, mapping: ref.mappingStatus ?? "linked" });
    } catch {
      out.push({ slug: ref.institution, name: ref.institution, procs: 0, mapping: "missing" });
    }
  }
  return out;
}

const nodes = project.nodes.map((n) => {
  const templates = templateInfo(n.templateRefs);
  return {
  id: n.id,
  name: n.name,
  stage: n.stage,
  authority: n.authority ?? "",
  lead: n.actorRoles?.lead ?? [],
  decision: n.actorRoles?.decision ?? [],
  level: nodeLevel(n),
  ministries: nodeMinistries(n),
  templates,
  procs: Math.max(1, templates.reduce((s, t) => s + t.procs, 0)),
  classification: n.classification ?? "",
  status: n.status ?? "planned",
  confidence: n.confidence ?? "",
  note: n.note ?? "",
  completedOn: n.actual?.completedOn ?? "",
  };
});

const data = {
  meta: {
    projectId: project.id,
    projectName: project.name,
    asOfDate: project.asOfDate,
    generatedFrom: "data/mega-projects/projects/gwangju-semiconductor-cluster.json",
  },
  stages: project.stages,
  nodes,
  edges,
};

// 관문별 내부 절차 체인 — templateRefs가 가리키는 제도 프로세스 노드를
// (nodeIds 부분매핑 존중) 지도 우측 패널용으로 펼친다. 지연 로드용 별도 파일.
const byGate = {};
for (const n of project.nodes) {
  const insts = [];
  for (const ref of n.templateRefs ?? []) {
    try {
      const inst = JSON.parse(
        readFileSync(join(root, `data/institutions/${ref.institution}.json`), "utf8"),
      );
      let pnodes = inst.process?.nodes ?? [];
      if (Array.isArray(ref.nodeIds)) {
        const want = new Set(ref.nodeIds);
        pnodes = pnodes.filter((p) => want.has(p.id));
      }
      insts.push({
        slug: ref.institution,
        name: inst.name,
        mapping: ref.mappingStatus ?? "linked",
        steps: pnodes.map((p) => ({
          id: p.id,
          name: p.name,
          actor: p.actor ?? "",
          stage: p.stage ?? "",
          type: p.type ?? "task",
          basis: p.legal_basis?.[0]
            ? `${p.legal_basis[0].law} ${p.legal_basis[0].article ?? ""}`.trim()
            : "",
          deadline: p.deadline ?? null,
        })),
      });
    } catch { /* validator가 실재를 보장 — 여기선 조용히 건너뜀 */ }
  }
  if (insts.length) byGate[n.id] = insts;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(data, null, 1)}\n`);
writeFileSync(procPath, `${JSON.stringify({ generatedAt: data.meta.asOfDate, byGate }, null, 0)}\n`);
const levelCount = {};
for (const n of nodes) levelCount[n.level] = (levelCount[n.level] ?? 0) + 1;
console.log(
  `warroom map data: ${nodes.length} nodes, ${edges.length} edges -> ${outPath}`,
);
console.log("levels:", JSON.stringify(levelCount));
