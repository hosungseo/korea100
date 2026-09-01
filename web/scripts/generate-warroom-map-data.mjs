#!/usr/bin/env node
// Build trimmed graph data for the warroom dependency map (/warroom/map/).
// Reads the gwangju semiconductor project JSON and emits nodes, stages and
// typed edges resolved from requires[].artifact -> produces[] tokens.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// 골격 판정은 탐지기 하나가 정본이다. 사다리 정의를 여기 다시 쓰지 않는다.
import { inspect as inspectInstitution } from "./detect-template-skeletons.mjs";
import { milestoneTier, stepTier, TIER_RANK } from "./lib/mega-tier.mjs";
import {
  allMilestoneStatuses,
  institutionReadinessFor,
  pendingDecisions,
  attentionView,
} from "../../mcp/src/project-case.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// 기본 프로젝트는 광주 — 이 프로젝트만 /warroom/map/ 루트에 쓴다(기존 URL 유지).
// 다른 프로젝트는 /warroom/map/<id>/ 하위에 쓰고 지도 페이지가 ?p=<id>로 읽는다.
const DEFAULT_PROJECT = "gwangju-semiconductor-cluster";

// [매칭 토큰, 표기명, 슬러그]. 일반어(정부·부서·시장·위원회 단독)는 절대 넣지 않는다 —
// "재정부서"가 '정부'로, "전력시장"이 '시장'으로 잡히는 오매칭 전례가 있다.
const MINISTRY_CANON = [
  ["기후에너지환경부", "기후에너지환경부", "me"],
  ["산업통상자원부", "산업통상부", "motie"],
  ["산업통상부", "산업통상부", "motie"],
  ["과학기술정보통신부", "과기정통부", "msit"],
  ["과기정통부", "과기정통부", "msit"],
  ["농림축산식품부", "농식품부", "mafra"],
  ["농식품부", "농식품부", "mafra"],
  ["중소벤처기업부", "중기부", "mss"],
  ["문화체육관광부", "문체부", "mcst"],
  ["국토교통부", "국토교통부", "molit"],
  ["해양수산부", "해양수산부", "mof"],
  ["행정안전부", "행정안전부", "mois"],
  ["고용노동부", "고용노동부", "moel"],
  ["보건복지부", "보건복지부", "mohw"],
  ["기획예산처", "기획예산처", "mpb"],
  ["기획재정부", "기획재정부", "moef"],
  ["국가보훈부", "국가보훈부", "mpva"],
  ["여성가족부", "여성가족부", "mogef"],
  ["법무부", "법무부", "moj"],
  ["외교부", "외교부", "mofa"],
  ["통일부", "통일부", "unikorea"],
  ["국방부", "국방부", "mnd"],
  ["교육부", "교육부", "moe"],
  ["환경부", "환경부", "me"],
  ["금융위원회", "금융위", "fsc"],
  ["공정거래위원회", "공정위", "ftc"],
  ["원자력안전위원회", "원안위", "nssc"],
  ["개인정보보호위원회", "개인정보위", "pipc"],
  ["방송통신위원회", "방통위", "kcc"],
  ["국가유산청", "국가유산청", "kha"],
  ["해양경찰청", "해양경찰청", "kcg"],
  ["산림청", "산림청", "forest"],
  ["소방청", "소방청", "nfa"],
  ["경찰청", "경찰청", "npa"],
  ["조달청", "조달청", "pps"],
  ["관세청", "관세청", "customs"],
  ["국세청", "국세청", "nts"],
  ["통계청", "통계청", "kostat"],
  ["기상청", "기상청", "kma"],
  ["특허청", "특허청", "kipo"],
  ["질병관리청", "질병관리청", "kdca"],
  ["새만금개발청", "새만금개발청", "sda"],
  ["행정중심복합도시건설청", "행복청", "naacc"],
  // 부처가 아닌 결정주체 — 총리가 협조를 요청할 대상이라 같은 그리드에 둔다
  ["국무조정실", "총리·국무회의", "pm-office"],
  ["국무총리", "총리·국무회의", "pm-office"],
  ["국무회의", "총리·국무회의", "pm-office"],
  ["국회", "국회", "assembly"],
  ["지방시대위원회", "지방시대위원회", "balance-committee"],
  ["국가자치분권균형성장회의", "국가자치분권균형성장회의", "decentral-council"],
  ["국토정책위원회", "국토정책위원회", "land-policy-committee"],
  // 지방자치단체 — 원문에 실명이 적힌 것만. 역할명(종전부지 지방자치단체의 장,
  // 지방자치단체의 장 …)은 어느 지자체인지 확정 전이므로 미특정에 남긴다.
  // 「전남광주통합특별시 설치를 위한 특별법」 제7조제1항이 약칭을 광주특별시로 정한다
  ["광주특별시", "광주특별시", "gwangju-special"],
  ["전남광주통합특별시", "광주특별시", "gwangju-special"],
  ["전남도", "전남도", "jeonnam"],
  ["무안군", "무안군", "muan"],
];
const MINISTRY_SLUG = new Map(MINISTRY_CANON.map(([, label, slug]) => [label, slug]));
// --all: map-tracks/ 에 트랙 파일이 있는 프로젝트를 전부 순회한다(새 프로젝트 추가 시 스크립트 수정 불필요)
if (process.argv[2] === "--all") {
  const dir = join(root, "data/mega-projects/map-tracks");
  const ids = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  for (const id of ids) {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), id], { stdio: "inherit" });
  }
  // 교차 프로젝트 제도 재사용 인덱스 — 같은 제도가 몇 개 사업에 걸려 있는지.
  // 프로젝트가 3개 이상일 때만 의미가 있어 지도에서 배지로 노출한다.
  const shared = {};
  for (const id of ids) {
    const proj = JSON.parse(
      readFileSync(join(root, `data/mega-projects/projects/${id}.json`), "utf8"));
    for (const n of proj.nodes ?? []) {
      for (const ref of n.templateRefs ?? []) {
        (shared[ref.institution] ??= []).push({ project: id, name: proj.name, gate: n.id });
      }
    }
  }
  const index = {};
  for (const [slug, uses] of Object.entries(shared)) {
    const byProject = new Map();
    for (const u of uses) {
      if (!byProject.has(u.project)) byProject.set(u.project, { project: u.project, name: u.name, gates: [] });
      byProject.get(u.project).gates.push(u.gate);
    }
    if (byProject.size > 1) index[slug] = [...byProject.values()];
  }
  buildMinistryBoard(ids);
  writeFileSync(join(root, "public/warroom/map/shared-institutions.json"),
    `${JSON.stringify({ generatedAt: null, projects: ids, byInstitution: index }, null, 0)}\n`);
  console.log(`shared institutions: ${Object.keys(index).length}종이 2개 이상 사업에 걸림`);
  process.exit(0);
}
const projectId = process.argv[2] ?? DEFAULT_PROJECT;
const srcPath = join(root, `data/mega-projects/projects/${projectId}.json`);
const outDir =
  projectId === DEFAULT_PROJECT
    ? join(root, "public/warroom/map")
    : join(root, "public/warroom/map", projectId);
const outPath = join(outDir, "data.json");
const procPath = join(outDir, "procedures.json");
const configPath = join(outDir, "config.json");
const tracksPath = join(root, `data/mega-projects/map-tracks/${projectId}.json`);

const project = JSON.parse(readFileSync(srcPath, "utf8"));
const tracks = JSON.parse(readFileSync(tracksPath, "utf8"));

// ── 온톨로지 층 연결 ─────────────────────────────────────────────────────
// 프로젝트 케이스(ontology/samples/*.case.json, case_kind=project)가 있으면
// 준비도·개폐·미확정 갈림길을 지도에 싣는다. 없으면 조용히 생략한다 —
// 케이스가 아직 없는 사업(북극항로 등)의 지도는 종전과 같아야 한다.
function loadOntologyProjectCase(id) {
  const dir = join(root, "..", "ontology", "samples");
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".case.json")) continue;
      const c = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (c.case_kind === "project" && c.project_id === id) return c;
    }
  } catch { /* ontology 디렉터리가 없는 체크아웃도 있다 */ }
  return null;
}

const ontCase = loadOntologyProjectCase(projectId);
let ONT = null;
if (ontCase) {
  const statuses = allMilestoneStatuses(ontCase);
  const byId = Object.fromEntries(statuses.map((s) => [s.node_id, s]));
  const readiness = {};
  for (const s of statuses) readiness[s.node_id] = institutionReadinessFor(ontCase, s.node_id);
  const attention = attentionView(ontCase);
  const attentionById = Object.fromEntries(
    [...attention.cabinet, ...attention.agency].map((e) => [e.node_id, { tier: e.attention_tier, reasons: e.reasons, reach: e.downstream_reach }]),
  );
  ONT = { caseId: ontCase.case_id, asOf: ontCase.as_of, byId, readiness, decisions: pendingDecisions(ontCase), attention, attentionById };
  console.log(`ontology: ${ontCase.case_id} 연결 — 계산가능 관문 ${statuses.filter((s) => readiness[s.node_id]?.next_action_computable).length}개`);
}

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

// 위상 계층 — web/scripts/lib/mega-tier.mjs가 정본이다(온톨로지 파생과 같은 어휘).
const nodeLevel = milestoneTier;

// 결정주체 문자열에서 소관 부처를 뽑는다(지도 노드용) — 사전은 파일 상단 MINISTRY_CANON
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
      out.push({
        slug: ref.institution, name: inst.name, procs,
        mapping: ref.mappingStatus ?? "linked",
        readiness: inst.process?.agent_readiness?.level ?? "unassessed",
        // 제네릭 12단 사다리에 제도명만 갈아 끼운 골격. 절차 수를 세면 있는 것처럼
        // 보이지만 그 절차가 이 제도의 절차라는 보장이 없다.
        skeleton: inspectInstitution(inst).is_skeleton,
      });
    } catch {
      out.push({ slug: ref.institution, name: ref.institution, procs: 0, mapping: "missing", readiness: "unassessed", skeleton: false });
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
  ...(ONT ? (() => {
    const ont = ONT.byId[n.id];
    const rd = ONT.readiness[n.id];
    return {
      openness: ont?.openness ?? null,
      computable: rd?.next_action_computable ?? false,
      r2Count: rd ? rd.referenced.filter((x) => x.readiness_level === "R2").length : 0,
      refCount: rd ? rd.referenced.length : 0,
      notReady: rd?.not_ready_slugs ?? [],
      blockedBy: (ont?.blocked_by ?? []).map((b) => ({
        artifact: b.artifact_label,
        by: (b.produced_by ?? []).map((m) => String(m).replace("milestone:", "")),
      })),
      conflict: ont?.overlay_status_conflict ?? null,
      // 관심층 — 총리·국무위원(cabinet)/기관장(agency). 없으면 실무·완료.
      attention: ONT.attentionById[n.id] ?? null,
    };
  })() : {}),
  };
});

const data = {
  meta: {
    projectId: project.id,
    projectName: project.name,
    asOfDate: project.asOfDate,
    generatedFrom: `data/mega-projects/projects/${projectId}.json`,
    // 관심층 집계 — 지도 브리핑 헤더의 깔때기(관문→절차→총리 책상)에 쓴다.
    ...(ONT ? { attention: { ...ONT.attention.counts, threshold: ONT.attention.leverage_threshold } } : {}),
  },
  stages: project.stages,
  nodes,
  edges,
  ontology: ONT ? {
    caseId: ONT.caseId,
    asOf: ONT.asOf,
    decisions: ONT.decisions.undetermined_parameters.map((entry) => ({
      parameter: entry.parameter,
      reason: entry.reason,
      gates: entry.gates.map((g) => ({ id: g.node_id, when: g.activates_when, label: g.label })),
      // 관문을 여닫지 않고 마일스톤 안쪽 제도 적용 여부만 정하는 파라미터.
      affects: entry.affects ?? null,
      classification: entry.classification ?? null,
      equivalent_to: entry.equivalent_to ?? null,
    })),
    exclusive: ONT.decisions.exclusive_branches.map((b) => ({
      parameter: b.parameter,
      options: b.options.map((o) => ({ value: o.value, gate: o.milestone })),
    })),
  } : null,
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
      const stepIds = new Set(pnodes.map((p) => p.id));
      insts.push({
        slug: ref.institution,
        name: inst.name,
        mapping: ref.mappingStatus ?? "linked",
        edges: (inst.process?.edges ?? [])
          .filter((e) => stepIds.has(e.source) && stepIds.has(e.target))
          .map((e) => ({ s: e.source, t: e.target, type: e.type ?? "sequence", label: e.label ?? "" })),
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

// ---- 지도 페이지 구성(config.json) ----------------------------------------
// 제목·내비·트랙 칩은 map-tracks/<id>.json 이 원본. 레이아웃은 명시값이 있으면
// 그대로 쓰고(광주는 손으로 맞춘 값 유지), 없으면 columns 배치 + 관문 이름 길이로
// 그룹 높이를 추정해 자동 계산한다.
const GROUP_W = 278, GROUP_CHROME = 43, NODE_GAP = 8, COL_GAP = 340;
const CHARS_PER_LINE = 20, LINE_H = 15.2, NODE_CHROME = 40;

function stageHeight(stageId) {
  const ns = project.nodes.filter((n) => n.stage === stageId);
  if (!ns.length) return GROUP_CHROME;
  const body = ns.reduce((sum, n) => {
    const lines = Math.max(1, Math.ceil((n.name ?? "").length / CHARS_PER_LINE));
    return sum + NODE_CHROME + lines * LINE_H;
  }, 0);
  return GROUP_CHROME + body + NODE_GAP * (ns.length - 1);
}

function autoLayout(columns) {
  const layout = {};
  let maxX = 0, maxY = 0;
  columns.forEach((stageIds, col) => {
    const x = 40 + col * COL_GAP;
    let y = 20;
    for (const id of stageIds) {
      layout[id] = { x, y: Math.round(y) };
      y += stageHeight(id) + 40;
    }
    maxX = Math.max(maxX, x + GROUP_W);
    maxY = Math.max(maxY, y);
  });
  return { layout, canvas: { w: Math.round(maxX + 40), h: Math.round(maxY + 20) } };
}

const auto = tracks.layout ? null : autoLayout(tracks.columns ?? [project.stages.map((s) => s.id)]);
const statusCount = {};
for (const n of nodes) statusCount[n.status] = (statusCount[n.status] ?? 0) + 1;
const blurbVars = {
  stages: project.stages.length,
  gates: nodes.length,
  deps: edges.length,
  completed: statusCount.completed ?? 0,
  active: statusCount.active ?? 0,
  unknown: statusCount.unknown ?? 0,
  remaining: nodes.length - (statusCount.completed ?? 0),
};
const allBlurb = (tracks.allBlurb ?? "").replace(
  /\{(\w+)\}/g,
  (m, k) => (k in blurbVars ? String(blurbVars[k]) : m),
);

const DEFAULT_LEVELS = [
  { id: "cabinet", label: "총리·국무회의" },
  { id: "legislature", label: "국회·입법" },
  { id: "presidential_committee", label: "대통령 소속 위원회" },
  { id: "minister", label: "부처 장관" },
  { id: "local", label: "지자체장" },
  { id: "committee", label: "위원회·전문기관" },
  { id: "field", label: "실무·사업자·기타" },
];
// 해당 프로젝트에 실제로 존재하는 계층만 칩으로 남긴다(빈 칩 방지)
const presentLevels = new Set(nodes.map((n) => n.level));
const levels = (tracks.levels ?? DEFAULT_LEVELS).filter((l) => presentLevels.has(l.id));

const config = {
  projectId: project.id,
  levels,
  title: tracks.title ?? "관문 의존 지도",
  subtitle: tracks.subtitle ?? project.name,
  nav: (() => {
    const nav = [...(tracks.nav ?? [])];
    const four = `../../mega-projects/${projectId}/`;
    if (!nav.some((l) => l.href === four)) nav.unshift({ label: "프로젝트 4뷰", href: four });
    return nav;
  })(),
  layout: tracks.layout ?? auto.layout,
  canvas: tracks.canvas ?? auto.canvas,
  scenarios: [
    { id: "all", label: "전체", html: `<div class="free">${allBlurb}</div>` },
    ...tracks.tracks,
    // 온톨로지 층이 있으면 트랙 칩 두 개를 주입한다. nodes 모드 + html 내레이션.
    ...(ONT ? (() => {
      const out = [];
      const computable = nodes.filter((n) => n.computable).map((n) => n.id);
      if (computable.length) {
        out.push({
          id: "ont-ready",
          label: "🧭 답 되는 관문",
          nodes: computable,
          html: `<p>참조 제도가 전부 <b>R2</b>(법제처 현행 원문 대조·전이 수동 대조 통과)로 검증되어
온톨로지가 <b>다음 행동을 계산할 수 있는</b> 관문입니다. 여기를 클릭하면 실제 절차 단계·기한·근거 조문이 나옵니다.</p>
<ol>${computable.map((id) => {
            const n = nodes.find((x) => x.id === id);
            return `<li data-nodes="${id}">${n.name} <span class="mono" style="color:var(--muted);font-size:9px">${id} · 제도 ${n.r2Count}/${n.refCount} R2</span></li>`;
          }).join("")}</ol>
<p style="color:var(--muted);font-size:10px">계산은 제안까지다 — 결재·접수·발송 권한 없음(execution_allowed=false).</p>`,
        });
      }
      // 관문을 여닫는 파라미터 + 관문 안쪽 제도 적용을 정하는 파라미터. 후자를 빼면
      // 오버레이가 "미확정"이라고 적어 둔 것이 지도에서 사라진다.
      const byKind = (kind) => ONT.decisions.undetermined_parameters.filter((e) => e.classification === kind);
      const insideOnly = byKind("inside_gate");
      // 값을 모를 뿐 결정거리인 것. 배선이 안 된 게 아니라 값이 아직 없는 것이다.
      const unbound = byKind("information_gap");
      // 의존 그래프가 이미 같은 말을 하는 것. 결정으로 내밀면 없는 결정을 찾게 된다.
      const redundant = byKind("graph_redundant");
      const gated = byKind("gate");
      const pendingGates = [...new Set([
        ...ONT.decisions.undetermined_parameters.flatMap((e) => e.gates.map((g) => g.node_id)),
        ...insideOnly.map((e) => e.affects.milestone),
      ])].filter((id) => nodes.some((n) => n.id === id));
      if (pendingGates.length || unbound.length || redundant.length) {
        out.push({
          id: "ont-pending",
          label: "⚖ 미확정 갈림길",
          nodes: pendingGates,
          html: `<p>미확정 ${ONT.decisions.undetermined_parameters.length}건 중 <b>사업이 정할 것 ${ONT.decisions.undetermined_parameters.length - redundant.length}건</b>입니다. 제도 준비도와 별개의 축입니다.</p>
${gated.length ? `<p><b>관문을 여닫는 것:</b> 값이 정해지기 전까지 어느 쪽도 활성화되지 않습니다.</p>
<ol>${gated.map((e) =>
            `<li data-nodes="${e.gates.map((g) => g.node_id).join(",")}">${e.parameter} — ${e.reason ?? ""} <span class="mono" style="color:var(--muted);font-size:9px">${e.gates.map((g) => `${g.when === true ? "true" : g.when}→${g.node_id}`).join(" · ")}</span></li>`,
          ).join("")}</ol>` : ""}
${insideOnly.length ? `<p><b>관문 안쪽 미확정:</b> 아래는 관문을 여닫지는 않지만 그 안에서 <b>어느 제도가 적용되는지</b>를 정합니다.</p>
<ol>${insideOnly.map((e) =>
            `<li data-nodes="${e.affects.milestone}">${e.parameter} — ${e.reason ?? ""} <span class="mono" style="color:var(--muted);font-size:9px">${e.affects.milestone} 제도 적용범위</span></li>`,
          ).join("")}</ol>` : ""}
${ONT.decisions.exclusive_branches.length ? `<p><b>배타 분기:</b> ${ONT.decisions.exclusive_branches.map((b) =>
            `${b.parameter} → ${b.options.map((o) => `${o.value}:${o.milestone}`).join(" | ")}`).join(" · ")} — 둘 중 하나만 활성화됩니다.</p>` : ""}
${unbound.length ? `<p><b>값이 아직 없는 것:</b> 미확정이지만 어느 관문에도 걸려 있지 않습니다. 정해지면 어디에 걸리는지를 오버레이에 적어야 지도가 켜집니다.</p>
<ul>${unbound.map((e) => `<li>${e.parameter} — ${e.reason ?? ""}</li>`).join("")}</ul>` : ""}
${redundant.length ? `<p><b>결정거리가 아닌 것:</b> 미확정으로 선언돼 있지만 <b>의존 그래프가 이미 같은 말</b>을 하고 있습니다. 고를 것이 아니라 선행 관문이 끝나면 풀립니다 — 지도에서 그 관문을 보세요.</p>
<ul>${redundant.map((e) => `<li>${e.parameter} ≡ <b>${e.equivalent_to.produced_by}</b>의 <span class="mono" style="font-size:9px">${e.equivalent_to.artifact}</span>${e.equivalent_to.coupling === "soft" ? " (soft 결합)" : ""}</li>`).join("")}</ul>` : ""}
<p style="color:var(--muted);font-size:10px">무엇을 고를지는 말하지 않는다. 고를 것이 무엇인지만 보여준다.</p>`,
        });
      }
      // 관심층 칩 — 절차 1,200여 개 중 총리·국무위원 책상에 올라가는 것만.
      // 마일스톤 층은 온톨로지 계산(attentionView), 단계 수는 그 마일스톤이
      // 참조하는 제도 단계 중 결정 단계(승인·지정·의결…)이면서 결정주체가
      // 부처 장관 이상인 것만 센다. 나머지 단계는 장부에 남고 화면에서 접힌다.
      const A = ONT.attention;
      if (A.cabinet.length) {
        const REASON_KO = {
          policy_or_governance: "정책·거버넌스",
          central_decision: "중앙 결정선",
          cross_ministry_wait: "다부처 물림",
          exclusive_branch_gate: "배타 분기",
          high_leverage_open: "고지렛대 개방",
          central_open: "중앙부처 관문",
          government_open: "지자체 관문",
          pending_parameter: "미확정 파라미터",
        };
        // 결정 단계 수 — 조문을 읽고 붙인 위상(article-reviewed)이 있으면 그것을,
        // 없으면 담당 표기 추정을 쓴다. 둘을 갈라 세어 화면이 어느 쪽인지 말하게 한다.
        const sigStepsOf = (n) => {
          let total = 0; let signature = 0; let reviewed = 0; let reviewedSig = 0; let unresolved = 0;
          for (const ref of n.templateRefs ?? []) {
            let inst;
            try { inst = JSON.parse(readFileSync(join(root, `data/institutions/${ref.institution}.json`), "utf8")); } catch { continue; }
            const steps = (inst.process?.nodes ?? []).filter((x) => !Array.isArray(ref.nodeIds) || ref.nodeIds.includes(x.id));
            total += steps.length;
            for (const step of steps) {
              const t = stepTier(step);
              // 판정을 거친 단계와, 그 결과 위상이 확정된 단계는 다른 수다.
              // "조문이 권한자를 안 정했다"도 판정 결과이므로 뭉뚱그리면 안 된다.
              if (t.source !== "heuristic") reviewed += 1;
              if (t.source === "unresolved") unresolved += 1;
              if (!t.is_decision || !(TIER_RANK[t.tier] >= TIER_RANK.minister)) continue;
              signature += 1;
              if (t.source === "article-reviewed") reviewedSig += 1;
            }
          }
          return { total, signature, reviewed, reviewedSig, unresolved };
        };
        const rows = A.cabinet.map((e) => {
          const src = project.nodes.find((x) => x.id === e.node_id);
          const steps = sigStepsOf(src ?? {});
          return { ...e, steps };
        });
        const totalSteps = nodes.reduce((s, n) => s + n.procs, 0);
        const cabinetSteps = rows.reduce((s, r) => s + r.steps.total, 0);
        const cabinetSig = rows.reduce((s, r) => s + r.steps.signature, 0);
        const cabinetReviewed = rows.reduce((s, r) => s + r.steps.reviewed, 0);
        const cabinetReviewedSig = rows.reduce((s, r) => s + r.steps.reviewedSig, 0);
        const cabinetUnresolved = rows.reduce((s, r) => s + r.steps.unresolved, 0);
        out.push({
          id: "ont-attention",
          label: "🏛 총리·국무위원 관심",
          nodes: rows.map((r) => r.node_id),
          html: `<p>관문 ${nodes.length}개·참조 절차 ${totalSteps.toLocaleString()}단계 전부가 의제일 수는 없습니다. 총리·국무위원 층은 <b>${A.counts.cabinet}개 관문</b>, 그 안의 절차 ${cabinetSteps}단계 중 <b>장관급 이상 결정 단계 ${cabinetSig}개</b>입니다. 기관장 층 ${A.counts.agency}, 실무·완료 ${A.counts.working}.</p>
<ol>${rows.map((r) =>
            `<li data-nodes="${r.node_id}">${r.label} <span class="mono" style="color:var(--muted);font-size:9px">${r.node_id} · ${r.openness} · 하류 ${r.downstream_reach} · 결정단계 ${r.steps.signature}/${r.steps.total}</span><br><span style="font-size:10px">${r.reasons.filter((x) => x.tier === "cabinet").map((x) => `${REASON_KO[x.code] ?? x.code}${x.code === "cross_ministry_wait" ? `(${x.evidence.replace("artifact:", "")})` : ""}`).join(" · ")}</span></li>`,
          ).join("")}</ol>
<p style="color:var(--muted);font-size:10px">층은 손으로 고른 목록이 아니라 결정 위상×개폐×의존 그래프에서 매번 다시 계산됩니다. 상태가 바뀌면 목록도 바뀝니다. 단계 위상은 ${cabinetReviewed}/${cabinetSteps}단계를 조문으로 판정했고, 그중 <b>${cabinetReviewed - cabinetUnresolved}개만 권한자가 조문에 있습니다</b>(결정 단계 ${cabinetReviewedSig}개). ${cabinetUnresolved}개는 인용문이 조문 원문이 아니라 제목·스텁이어서 권한자를 읽을 수 없었고, 판정 안 한 ${cabinetSteps - cabinetReviewed}개는 담당 표기 휴리스틱입니다.</p>`,
        });
      }
      return out;
    })() : []),
  ],
};

mkdirSync(outDir, { recursive: true });
writeFileSync(configPath, `${JSON.stringify(config, null, 1)}\n`);
// 하위 폴더를 직접 열어도 지도로 가도록 리다이렉트 한 장을 둔다
if (projectId !== DEFAULT_PROJECT) {
  writeFileSync(
    join(outDir, "index.html"),
    `<!doctype html><html lang="ko"><meta charset="utf-8">\n` +
      `<title>${config.title} — ${config.subtitle}</title>\n` +
      `<meta http-equiv="refresh" content="0; url=../?p=${projectId}">\n` +
      `<link rel="canonical" href="../?p=${projectId}">\n` +
      `<p><a href="../?p=${projectId}">${config.title} — ${config.subtitle}</a></p>\n`,
  );
}
writeFileSync(outPath, `${JSON.stringify(data, null, 1)}\n`);
writeFileSync(procPath, `${JSON.stringify({ generatedAt: data.meta.asOfDate, byGate }, null, 0)}\n`);
const levelCount = {};
for (const n of nodes) levelCount[n.level] = (levelCount[n.level] ?? 0) + 1;
console.log(
  `warroom map data [${projectId}]: ${nodes.length} nodes, ${edges.length} edges -> ${outPath}`,
);
console.log("levels:", JSON.stringify(levelCount));
console.log(
  `config: ${config.scenarios.length} chips, layout ${tracks.layout ? "explicit" : "auto"}, canvas ${config.canvas.w}x${config.canvas.h}`,
);


// ── 부처 상황판 집계 (PRD docs/ministry-board-prd.md §6) ─────────────────────
// 사업 축으로 만든 지도 데이터를 부처 축으로 접는다. 자식 프로세스가 방금 쓴
// data.json을 다시 읽으므로 의존 해석을 되풀이하지 않는다.
function buildMinistryBoard(ids) {
  const outPath = join(root, "public/warroom/map/ministry-board.json");
  // frontierSince 승계: 직전 산출물이 유일한 상태 저장소다(별도 히스토리 파일 없음)
  let prevSince = new Map();
  try {
    const prev = JSON.parse(readFileSync(outPath, "utf8"));
    for (const m of prev.ministries ?? []) {
      for (const h of m.holding ?? []) prevSince.set(`${h.project}/${h.gate}`, h.since);
    }
  } catch {
    /* 최초 실행 */
  }

  const dataPath = (id) =>
    id === DEFAULT_PROJECT
      ? join(root, "public/warroom/map/data.json")
      : join(root, "public/warroom/map", id, "data.json");

  // 사업 약칭은 워룸 인덱스(p/index.json)가 원본 — 행마다 긴 정식명을 자르지 않는다
  let shortById = new Map();
  try {
    const idx = JSON.parse(readFileSync(join(root, "public/warroom/p/index.json"), "utf8"));
    shortById = new Map((idx.projects ?? []).map((x) => [x.id, x.short ?? x.name]));
  } catch { /* 인덱스가 없으면 정식명을 쓴다 */ }

  const projects = [];
  const byMinistry = new Map();
  const unassigned = new Map();
  let asOf = "";

  // 라벨이 다른데 슬러그가 겹치면 #m= 해시가 한쪽만 열어 다른 카드가 죽는다.
  // 사전 실수를 화면까지 옮기지 않도록 여기서 막고 경고한다.
  const usedSlug = new Map();
  const slugFor = (label) => {
    let slug = MINISTRY_SLUG.get(label) ?? label;
    const owner = usedSlug.get(slug);
    if (owner && owner !== label) {
      const alt = `${slug}-${usedSlug.size}`;
      console.warn(`  ! 슬러그 충돌: "${label}"과 "${owner}"가 '${slug}' 공유 → "${label}"에 '${alt}' 배정`);
      slug = alt;
    }
    usedSlug.set(slug, label);
    return slug;
  };
  // "국방부·광주특별시"처럼 ·로 묶인 복합 표기는 나눠서 각각 찾는다.
  // 나누지 않으면 앞의 하나만 잡히고 뒤 주체가 통째로 사라진다.
  const labelsOf = (actors) => {
    const out = [];
    for (const a of actors) {
      for (const part of a.split("·")) {
        for (const [token, label] of MINISTRY_CANON) {
          if (part.includes(token)) { if (!out.includes(label)) out.push(label); break; }
        }
      }
    }
    return out;
  };

  const bucket = (label) => {
    if (!byMinistry.has(label)) {
      byMinistry.set(label, {
        id: slugFor(label), label,
        projects: [], counts: { own: 0, completed: 0, active: 0, frontier: 0, planned: 0, unknown: 0 },
        byProject: {},
        maxLeverage: null, holding: [], awaited: [], active: [], legislative: [],
      });
    }
    return byMinistry.get(label);
  };

  for (const id of ids) {
    const d = JSON.parse(readFileSync(dataPath(id), "utf8"));
    const pname = d.meta.projectName;
    projects.push({ id, name: pname, short: shortById.get(id) ?? pname, asOfDate: d.meta.asOfDate });
    if (d.meta.asOfDate > asOf) asOf = d.meta.asOfDate;

    const nodeById = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
    const hardUp = {}, hardDown = {};
    for (const e of d.edges) {
      if (e.strength !== "hard") continue;
      (hardUp[e.to] ??= []).push(e.from);
      (hardDown[e.from] ??= []).push(e.to);
    }
    // 하류 도달 집합 — 사이클이 있어도 방문 체크로 멈춘다
    const leverage = (start) => {
      const seen = new Set(); const stack = [...(hardDown[start] ?? [])];
      while (stack.length) {
        const v = stack.pop();
        if (seen.has(v)) continue;
        seen.add(v);
        for (const w of hardDown[v] ?? []) if (!seen.has(w)) stack.push(w);
      }
      return seen.size;
    };
    const done = (gid) => nodeById[gid]?.status === "completed";

    for (const n of d.nodes) {
      // 결정주체 우선, 없으면 주도 — 지도와 같은 폴백
      const actors = (n.decision?.length ? n.decision : n.lead) ?? [];
      const labels = labelsOf(actors);
      if (!labels.length) {
        // 역할명은 부처로 추정 배정하지 않는다(HR-2) — 확정 필요 목록으로 보낸다
        const role = actors[0] ?? "(주체 미기재)";
        if (!unassigned.has(role)) unassigned.set(role, { role, gates: [] });
        unassigned.get(role).gates.push({ project: id, projectName: pname, gate: n.id, name: n.name, status: n.status });
        continue;
      }
      const isFrontier = !["completed", "active"].includes(n.status)
        && (hardUp[n.id] ?? []).every(done);
      const lev = n.status === "completed" ? 0 : leverage(n.id);

      for (const label of labels) {
        const m = bucket(label);
        if (!m.projects.includes(id)) m.projects.push(id);
        const bp = (m.byProject[id] ??= { own: 0, completed: 0, active: 0, frontier: 0, planned: 0, unknown: 0 });
        m.counts.own += 1; bp.own += 1;
        if (n.status === "completed") { m.counts.completed += 1; bp.completed += 1; }
        else if (n.status === "active") { m.counts.active += 1; bp.active += 1; }
        else if (n.status === "unknown") { m.counts.unknown += 1; bp.unknown += 1; }
        else { m.counts.planned += 1; bp.planned += 1; }

        const co = labels.filter((x) => x !== label);
        if (isFrontier) {
          m.counts.frontier += 1; bp.frontier += 1;
          const key = `${id}/${n.id}`;
          m.holding.push({
            project: id, projectName: pname, gate: n.id, name: n.name,
            since: prevSince.get(key) ?? asOf, leverage: lev,
            level: n.level, status: n.status, co,
          });
        }
        if (n.status === "active") m.active.push({ project: id, projectName: pname, gate: n.id, name: n.name, co });
        if (n.status !== "completed" && (!m.maxLeverage || lev > m.maxLeverage.blocked)) {
          m.maxLeverage = { gate: n.id, project: id, projectName: pname, name: n.name, blocked: lev };
        }
        // 이 부처를 기다리는 곳 — 미완료 관문의 hard 하류
        if (n.status !== "completed") {
          for (const v of hardDown[n.id] ?? []) {
            const dn = nodeById[v];
            if (!dn) continue;
            const dLabels = labelsOf((dn.decision?.length ? dn.decision : dn.lead) ?? []);
            m.awaited.push({
              project: id, projectName: pname, upGate: n.id, upName: n.name,
              downGate: v, downName: dn.name, downMinistries: dLabels, downStatus: dn.status,
            });
          }
          // 입법 의존 — hard 상류에 미완료 국회급 관문이 있는가
          for (const u of hardUp[n.id] ?? []) {
            const un = nodeById[u];
            if (un && un.level === "legislature" && un.status !== "completed") {
              m.legislative.push({ project: id, projectName: pname, gate: n.id, name: n.name, blockedByGate: u, blockedByName: un.name });
            }
          }
        }
      }
    }
  }

  const ministries = [...byMinistry.values()];
  for (const m of ministries) {
    m.holding.sort((a, b) => b.leverage - a.leverage);
    m.awaited.sort((a, b) => (a.upGate < b.upGate ? -1 : 1));
  }
  ministries.sort((a, b) => b.counts.frontier - a.counts.frontier
    || (b.maxLeverage?.blocked ?? 0) - (a.maxLeverage?.blocked ?? 0)
    || b.counts.own - a.counts.own);
  const unassignedList = [...unassigned.values()].sort((a, b) => b.gates.length - a.gates.length);

  const board = {
    generatedAt: asOf,
    sinceBaseline: prevSince.size ? undefined : asOf, // 집계 시작일 — 첫 실행에만 기록
    projects, ministries, unassigned: unassignedList,
    totals: {
      gates: projects.length ? ministries.reduce((a, m) => a + m.counts.own, 0) : 0,
      unassignedGates: unassignedList.reduce((a, u) => a + u.gates.length, 0),
      ministries: ministries.length,
    },
  };
  if (board.sinceBaseline === undefined) {
    try { board.sinceBaseline = JSON.parse(readFileSync(outPath, "utf8")).sinceBaseline; } catch { /* noop */ }
  }
  writeFileSync(outPath, `${JSON.stringify(board, null, 1)}\n`);
  console.log(`ministry board: 부처·주체 ${ministries.length}곳 · 미특정 ${unassignedList.length}역할 ${board.totals.unassignedGates}관문`);
}
