#!/usr/bin/env node
// 온톨로지 PRD의 수치 블록을 데이터에서 다시 계산해 끼워 넣는다.
//
// PRD 원칙 3은 "구조 층은 파생물이다"라고 말하는데, 정작 PRD 자신의 수치는
// 손으로 적혀 있어 라운드마다 썩었다(R2 17·케이스 12·테스트 118·골격 112…).
// 문서도 파생물로 만든다. 세는 규칙이 코드에 있으니 무엇을 셌는지도 검사된다.
//
//   node scripts/ontology-stats.mjs           # PRD.md 갱신
//   node scripts/ontology-stats.mjs --check   # 어긋나면 exit 1 (CI·커밋 전)
//   node scripts/ontology-stats.mjs --json    # 수치만 기계용으로
//
// 세지 않는 것: 서술·판단·로드맵. 이 스크립트는 숫자만 만진다.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  allMilestoneStatuses,
  institutionReadinessFor,
  attentionView,
  isProjectCase,
} from "../../mcp/src/project-case.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(WEB, "..");
const PRD = join(REPO, "ontology", "PRD.md");
const BEGIN = "<!-- STATS:BEGIN (자동 생성 — npm run docs:ontology-stats) -->";
const END = "<!-- STATS:END -->";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const listJson = (dir) => readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));

/** 제도 653종 — 총수·R2·골격. 골격 판정은 탐지기 하나가 정본이다. */
async function institutionStats() {
  const { inspect } = await import("./detect-template-skeletons.mjs");
  const dir = join(WEB, "data", "institutions");
  let total = 0;
  let r2 = 0;
  let r2Steps = 0;
  let skeleton = 0;
  const r2Slugs = [];
  for (const path of listJson(dir)) {
    const institution = readJson(path);
    if (!institution.slug || !institution.process) continue;
    total += 1;
    if (inspect(institution).is_skeleton) skeleton += 1;
    if (institution.process.agent_readiness?.level === "R2") {
      r2 += 1;
      r2Steps += institution.process.nodes?.length ?? 0;
      r2Slugs.push(institution.slug);
    }
  }
  return { total, r2, r2Steps, skeleton, r2Slugs: r2Slugs.sort() };
}

/** 케이스 12건 — 종류별. 프로젝트 케이스는 관심층·계산가능 마일스톤까지. */
function caseStats() {
  const dir = join(REPO, "ontology", "samples");
  const byKind = { institution: 0, project: 0, milestone: 0 };
  const projects = [];
  for (const path of readdirSync(dir).filter((f) => f.endsWith(".case.json"))) {
    const caseData = readJson(join(dir, path));
    const kind = caseData.case_kind ?? "institution";
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    if (!isProjectCase(caseData)) continue;
    const view = attentionView(caseData);
    const computable = allMilestoneStatuses(caseData)
      .filter((status) => institutionReadinessFor(caseData, status.node_id).next_action_computable)
      .map((status) => status.node_id);
    projects.push({
      project_id: caseData.project_id,
      project_name: caseData.project_name,
      milestones: view.inventory.milestone_count,
      institutions: view.inventory.institution_count,
      attention: view.counts,
      // 결정 위상이 안 붙은 마일스톤은 사유 없이 working에 남은 것이므로 드러낸다.
      tier_missing: view.decision_tier_missing.length,
      computable,
    });
  }
  projects.sort((a, b) => b.milestones - a.milestones);
  return { total: Object.values(byKind).reduce((a, b) => a + b, 0), byKind, projects };
}

/** MCP 도구·테스트 — 서버 등록과 테스트 파일에서 직접 센다. */
function mcpStats() {
  const src = readFileSync(join(REPO, "mcp", "src", "server.mjs"), "utf8");
  const tools = [...src.matchAll(/registerReadOnlyTool\(\s*\n\s*server,\s*\n\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const testDir = join(REPO, "mcp", "test");
  let tests = 0;
  for (const file of readdirSync(testDir).filter((f) => f.endsWith(".test.mjs"))) {
    tests += (readFileSync(join(testDir, file), "utf8").match(/^test\(/gm) ?? []).length;
  }
  return { tools: tools.length, toolNames: tools.sort(), tests };
}

/** 사업 오버레이가 참조하는 제도 중 골격 — 0이어야 한다(PRD 성공 지표). */
function projectSkeletonStats() {
  const path = join(REPO, "docs", "template-skeletons.json");
  if (!existsSync(path)) return null;
  const report = readJson(path);
  return (report.project_impact ?? []).map((row) => ({
    project: row.project,
    referenced: row.referenced,
    skeleton: row.skeleton,
  }));
}

export async function collect() {
  const institutions = await institutionStats();
  return {
    institutions,
    cases: caseStats(),
    mcp: mcpStats(),
    projectSkeletons: projectSkeletonStats(),
  };
}

const PROJECT_KO = {
  "gwangju-semiconductor-cluster": "광주 반도체",
  "five-poles-three-special": "5극3특",
  "arctic-route": "북극항로",
  "daegu-gyeongbuk-airport": "대구경북신공항",
};

export function render(stats) {
  const { institutions: inst, cases, mcp, projectSkeletons } = stats;
  const attention = cases.projects
    .map((p) => `${PROJECT_KO[p.project_id] ?? p.project_id} ${p.attention.cabinet}/${p.attention.agency}/${p.attention.working}`)
    .join(" · ");
  const computable = cases.projects
    .filter((p) => p.computable.length)
    .map((p) => `${PROJECT_KO[p.project_id] ?? p.project_id} ${p.computable.join("·")} (${p.milestones}개 중 ${p.computable.length})`)
    .join(" · ");
  const zeroComputable = cases.projects.filter((p) => !p.computable.length).length;
  const refSkeleton = (projectSkeletons ?? []).reduce((sum, row) => sum + row.skeleton, 0);
  const refTotal = (projectSkeletons ?? [])
    .map((row) => `${PROJECT_KO[row.project] ?? row.project} ${row.referenced}`)
    .join("·");
  const tierMissing = cases.projects.reduce((sum, p) => sum + p.tier_missing, 0);

  return [
    BEGIN,
    "",
    `- 케이스 ${cases.total}건 (institution ${cases.byKind.institution} · project ${cases.byKind.project} · milestone ${cases.byKind.milestone})`,
    `- R2 제도 ${inst.r2}종 / ${inst.total}종, 그 안의 단계 ${inst.r2Steps}개`,
    `- 계산 가능 마일스톤: ${computable}. 나머지 사업 ${zeroComputable}종은 0 —`,
    "  참조 제도가 R2가 아니라 다음 행동은 못 내고, 개폐·차단 원인·갈림길·관심층은 답한다.",
    `- 관심층 (cabinet/agency/working): ${attention}. 결정 위상 미부착 마일스톤 ${tierMissing}.`,
    `- 템플릿 골격 ${inst.skeleton}종. 사업이 참조하는 제도(${refTotal})에는 골격 ${refSkeleton}종.`,
    `- MCP 도구 ${mcp.tools}종, 테스트 ${mcp.tests}건`,
    "",
    END,
  ].join("\n");
}

function main() {
  const check = process.argv.includes("--check");
  const asJson = process.argv.includes("--json");
  return collect().then((stats) => {
    if (asJson) {
      process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
      return;
    }
    const block = render(stats);
    const prd = readFileSync(PRD, "utf8");
    const start = prd.indexOf(BEGIN);
    const stop = prd.indexOf(END);
    if (start === -1 || stop === -1) {
      console.error(`PRD에 수치 블록 표지가 없습니다. 다음 두 줄을 '현재 상태' 절에 넣으세요:\n${BEGIN}\n${END}`);
      process.exit(1);
    }
    const next = prd.slice(0, start) + block + prd.slice(stop + END.length);
    if (next === prd) {
      console.log("온톨로지 수치: PRD와 일치합니다.");
      return;
    }
    if (check) {
      console.error("온톨로지 수치가 PRD와 어긋납니다. `npm run docs:ontology-stats`로 갱신하세요.\n");
      console.error(block);
      process.exit(1);
    }
    writeFileSync(PRD, next);
    console.log(`PRD 수치 블록 갱신: 제도 ${stats.institutions.total}·R2 ${stats.institutions.r2}·케이스 ${stats.cases.total}·도구 ${stats.mcp.tools}·테스트 ${stats.mcp.tests}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith("ontology-stats.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
