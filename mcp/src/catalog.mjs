import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_READY_SLUGS = Object.freeze([
  "administrative-fine-pre-notice-opinion",
  "administrative-fine-objection-court",
  "national-rd-fund-use-settlement",
  "information-disclosure",
  // 광주 반도체 클러스터의 열린 전선이 끌어 쓰는 제도 (2026-09-01 승격)
  "semiconductor-cluster-designation-coordination",
  "semiconductor-infrastructure-support-fast-track",
  "national-strategic-industry-complex",
  "one-stop-permit-consultation",
  // N02 재정심사 경로 (2026-09-01 승격). 예비타당성조사 본체는 지자체 건의 노드가
  // 법정 절차가 아니어서 R1로 남았다.
  "pfs-exemption-fast-track",
  "local-finance-investment-review-feasibility",
  // N20 전력계통 경로 (2026-09-01 승격)
  "distributed-energy-special",
  // P16(지자체 건의)은 법정 절차가 아니라 참고용으로 격리했다. 나머지 16개 단계는 실행 대상이다.
  "preliminary-feasibility-study",
]);

export const DEFAULT_INSTITUTION_DIR = fileURLToPath(
  new URL("../../web/data/institutions/", import.meta.url),
);

export class CatalogInvariantError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CatalogInvariantError";
    this.code = "catalog_invariant_failed";
    this.details = details;
  }
}

function requireCondition(condition, message, details) {
  if (!condition) throw new CatalogInvariantError(message, details);
}

function validateAgentReadyInstitution(institution, expectedSlug) {
  const scope = { slug: expectedSlug };
  requireCondition(institution?.slug === expectedSlug, "제도 slug가 파일명과 일치하지 않습니다.", scope);
  requireCondition(typeof institution.name === "string" && institution.name.length > 0, "제도명이 없습니다.", scope);

  const process = institution.process;
  requireCondition(process && Array.isArray(process.nodes) && Array.isArray(process.edges), "프로세스 그래프가 없습니다.", scope);

  const readiness = process.agent_readiness;
  requireCondition(readiness?.level === "R2", "MCP 공개 대상은 R2 제도여야 합니다.", scope);
  requireCondition(readiness?.mode === "next-action", "MCP 공개 대상은 next-action 모드여야 합니다.", scope);
  requireCondition(readiness?.last_live_check?.status === "passed", "법제처 현행 조문 대조를 통과하지 않았습니다.", scope);

  const nodeIds = new Set();
  for (const node of process.nodes) {
    requireCondition(typeof node.id === "string" && node.id.length > 0, "노드 ID가 없습니다.", scope);
    requireCondition(!nodeIds.has(node.id), "노드 ID가 중복되었습니다.", { ...scope, nodeId: node.id });
    requireCondition(node.agent, "R2 노드에 에이전트 계약이 없습니다.", { ...scope, nodeId: node.id });
    requireCondition(node.agent.human_confirmation_required === true, "사람 확인 강제가 누락되었습니다.", {
      ...scope,
      nodeId: node.id,
    });
    nodeIds.add(node.id);
  }

  for (const edge of process.edges) {
    requireCondition(nodeIds.has(edge.source) && nodeIds.has(edge.target), "연결선이 존재하지 않는 노드를 가리킵니다.", {
      ...scope,
      edgeId: edge.id,
    });
    requireCondition(edge.agent_transition, "R2 연결선에 전이 계약이 없습니다.", {
      ...scope,
      edgeId: edge.id,
    });
    requireCondition(edge.agent_transition.human_confirmation_required === true, "전이의 사람 확인 강제가 누락되었습니다.", {
      ...scope,
      edgeId: edge.id,
    });
  }

  return institution;
}

export async function loadAgentReadyInstitutions({
  institutionDir = DEFAULT_INSTITUTION_DIR,
  slugs = AGENT_READY_SLUGS,
} = {}) {
  const institutions = await Promise.all(
    slugs.map(async (slug) => {
      const filePath = path.join(institutionDir, `${slug}.json`);
      const raw = await readFile(filePath, "utf8");
      return validateAgentReadyInstitution(JSON.parse(raw), slug);
    }),
  );

  return institutions;
}
