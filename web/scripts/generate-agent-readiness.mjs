#!/usr/bin/env node
// 제도의 에이전트 계약층(node.agent · edge.agent_transition)과 준비도 블록을 만든다.
//
// 왜 만들었나: 파생 함수(deriveNodeAgentContract·deriveEdgeAgentTransition)는
// 라이브러리에 있는데 **부르는 곳이 없었다.** 그래서 기존 R2 제도의 계약층은 손으로
// 채워졌고, 새 제도를 올리려면 매번 사람이 같은 모양을 다시 써야 했다.
// 준비도가 "계약이 완전하지 않음"으로 막히는 것은 판단이 부족해서가 아니라
// 파생을 안 돌려서였다.
//
//   node scripts/generate-agent-readiness.mjs <slug>…                 # 계약층만
//   node scripts/generate-agent-readiness.mjs <slug> --live-check      # 법제처 대조까지
//   node scripts/generate-agent-readiness.mjs <slug> --transition-reviewed --live-check
//
// `--transition-reviewed`는 **사람이 대는 근거다.** 전이 조건과 인계를 조문과 수동으로
// 대조했다는 선언이며, 스크립트가 스스로 참으로 만들 수 없다. 근거는 `--review-note`로
// 남긴다(누가 무엇을 대조했는지). 이 플래그 없이는 R2가 나오지 않는다.
//
// 신뢰도는 건드리지 않는다. 저신뢰 노드 때문에 실행 경로가 끊겨 R2가 막히면
// 그것이 맞는 결과다 — 숫자를 올려 통과시키는 것은 등급을 세탁하는 일이다.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessAgentReadiness,
  deriveNodeAgentContract,
  deriveEdgeAgentTransition,
  agentCitationFingerprint,
  referenceOnlyReasons,
} from "./lib/agent-readiness.mjs";
import { verify } from "./restore-basis-text.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSESSED_AT = "2026-09-02";
const OFFICIAL_METHOD = "law.go.kr-DRF-direct";

/** 계약층을 파생해 노드·엣지에 붙인다. 이미 있으면 덮어쓴다 — 파생물이므로. */
export function attachContracts(institution) {
  const nodes = institution.process?.nodes ?? [];
  const edges = institution.process?.edges ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingCount = new Map();
  for (const edge of edges) outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);

  for (const node of nodes) {
    node.agent = deriveNodeAgentContract(node, {
      institution,
      incomingEdges: edges.filter((edge) => edge.target === node.id),
      outgoingEdges: edges.filter((edge) => edge.source === node.id),
      nodeById,
    });
  }
  for (const edge of edges) {
    edge.agent_transition = deriveEdgeAgentTransition(edge, nodeById, {
      sourceOutgoingCount: outgoingCount.get(edge.source) ?? 1,
    });
  }
  return { nodes: nodes.length, edges: edges.length };
}

/**
 * 법제처 현행 시행본과 인용문을 실제로 대조해 last_live_check 기록을 만든다.
 *
 * 여기서 status=passed를 적으려면 restore-basis-text의 되대조가 오류 0이어야 한다.
 * 그 대조는 "인용문이 원문 안에 그대로 있는가"를 본다 — 조문 번호 존재가 아니라
 * 문언 일치다(원칙 9).
 */
export async function buildLiveCheck(institution) {
  const result = await verify(institution);
  const nodes = institution.process?.nodes ?? [];
  const actionable = nodes.filter((node) => referenceOnlyReasons(node).length === 0);
  const referenceOnly = nodes.filter((node) => referenceOnlyReasons(node).length > 0);
  const references = nodes.reduce((sum, node) => sum + (node.legal_basis?.length ?? 0), 0);
  const failedNodes = new Set(result.errors.map((error) => error.node));

  return {
    check: {
      checked_at: ASSESSED_AT,
      method: OFFICIAL_METHOD,
      status: result.errors.length === 0 ? "passed" : "failed",
      citation_fingerprint: agentCitationFingerprint(institution),
      sources_checked: (institution.verification?.sources ?? []).length,
      source_failures: result.problems.length,
      article_references: references,
      verified_references: references - result.errors.length,
      missing_references: result.errors.map((error) => `${error.node} ${error.article}`),
      uncheckable_references: [],
      source_results: result.sources,
      reference_only_references: referenceOnly.map((node) => node.id),
      verified_node_ids: actionable.filter((node) => !failedNodes.has(node.id)).map((node) => node.id),
      unverified_node_ids: [...failedNodes],
      note: "인용문이 법제처 현행 시행본 조문 문언 안에 그대로 있는지 대조(scripts/restore-basis-text.mjs --verify).",
    },
    errors: result.errors,
    problems: result.problems,
  };
}

function detectIndent(text) {
  const match = text.match(/\n(\s+)"/);
  return match ? match[1].length : 2;
}

async function main() {
  const args = process.argv.slice(2);
  const slugs = args.filter((arg) => !arg.startsWith("--"));
  const withLive = args.includes("--live-check");
  const transitionReviewed = args.includes("--transition-reviewed");
  const reviewNote = (args.find((arg) => arg.startsWith("--review-note=")) ?? "").slice("--review-note=".length);
  const dryRun = args.includes("--dry-run");

  if (!slugs.length) {
    console.error("사용법: node scripts/generate-agent-readiness.mjs <slug>… [--live-check] [--transition-reviewed] [--review-note=…] [--dry-run]");
    process.exit(1);
  }
  if (transitionReviewed && !reviewNote) {
    console.error("--transition-reviewed 를 쓰려면 --review-note= 로 무엇을 대조했는지 남겨야 합니다.");
    process.exit(1);
  }

  for (const slug of slugs) {
    const path = join(WEB, "data", "institutions", `${slug}.json`);
    const raw = readFileSync(path, "utf8");
    const indent = detectIndent(raw);
    const institution = JSON.parse(raw);

    const counts = attachContracts(institution);
    let liveLegalCheck = null;
    if (withLive) {
      const built = await buildLiveCheck(institution);
      liveLegalCheck = built.check;
      for (const problem of built.problems) console.error(`   ✖ ${problem}`);
      for (const error of built.errors) console.error(`   ✖ [${error.node}] ${error.article}: ${error.reason}`);
    }

    const readiness = assessAgentReadiness(institution, { transitionReviewed, assessedAt: ASSESSED_AT, liveLegalCheck });
    if (transitionReviewed) readiness.transition_review_note = reviewNote;
    institution.process.agent_readiness = readiness;

    console.log(`\n## ${slug} → ${readiness.level} (${readiness.mode})`);
    console.log(`   계약 파생: 노드 ${counts.nodes} · 엣지 ${counts.edges}`);
    if (liveLegalCheck) {
      console.log(`   법제처 대조: ${liveLegalCheck.status} · 인용 ${liveLegalCheck.verified_references}/${liveLegalCheck.article_references}`);
    }
    for (const blocker of readiness.blockers ?? []) console.log(`   ✖ ${blocker}`);
    if (!(readiness.blockers ?? []).length) console.log("   차단 사유 없음");

    if (!dryRun) writeFileSync(path, `${JSON.stringify(institution, null, indent)}\n`);
  }
  if (dryRun) console.log("\n(dry-run — 저장하지 않았습니다)");
}

if (process.argv[1] && process.argv[1].endsWith("generate-agent-readiness.mjs")) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
