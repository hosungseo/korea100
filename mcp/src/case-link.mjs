/**
 * Case ↔ Institution linkage check.
 *
 * 온톨로지 케이스(ontology/samples/*.case.json)는 제도 업무구조도
 * (web/data/institutions/*.json)의 투영이다. 지금까지 그 대응을 아무도 검사하지 않았다.
 * 한쪽 그래프가 바뀌면 케이스는 조용히 어긋난다.
 *
 * 이 모듈은 두 층을 대조해 어긋남을 드러내고, 제도의 준비도 등급에 따라
 * 다음 행동 계산이 허용되는지(R2)를 판정한다. 읽기 전용이다.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_INSTITUTION_DIR = fileURLToPath(
  new URL("../../web/data/institutions/", import.meta.url),
);

const STEP_PREFIX = "step:";

function stepIdOf(entityId) {
  return String(entityId).startsWith(STEP_PREFIX) ? String(entityId).slice(STEP_PREFIX.length) : null;
}

/** 준비도 등급만 읽는다. R2 게이트를 통과하지 못한 제도도 읽을 수 있어야 한다. */
export async function loadInstitutionForLinkage(slug, { institutionDir = DEFAULT_INSTITUTION_DIR } = {}) {
  if (!slug || /[^a-z0-9-]/u.test(slug)) return null;
  try {
    const raw = await readFile(path.join(institutionDir, `${slug}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function checkCaseLinkage(caseData, institution) {
  const slug = caseData.institution_slug ?? null;

  if (!institution) {
    return {
      institution_slug: slug,
      institution_found: false,
      status: "institution_not_found",
      readiness: null,
      next_action_allowed: false,
      steps: null,
      sequence: null,
      notes: ["케이스가 가리키는 제도 파일을 찾지 못했습니다. 제도 슬러그를 확인하세요."],
    };
  }

  const nodes = institution.process?.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const institutionEdges = new Set(
    (institution.process?.edges ?? []).map((edge) => `${edge.source}>${edge.target}`),
  );

  const caseStepIds = [...new Set([
    ...(caseData.entities ?? []).map((entity) => stepIdOf(entity.id)),
    ...(caseData.states ?? []).map((state) => stepIdOf(state.entity_id)),
  ].filter(Boolean))];

  const unknownStepIds = caseStepIds.filter((id) => !nodeById.has(id));
  const uncoveredNodeIds = nodes.map((node) => node.id).filter((id) => !caseStepIds.includes(id));

  const labelMismatches = [];
  for (const entity of caseData.entities ?? []) {
    const id = stepIdOf(entity.id);
    if (!id) continue;
    const node = nodeById.get(id);
    if (node && node.name !== entity.label) {
      labelMismatches.push({ step_id: id, case_label: entity.label, institution_name: node.name });
    }
  }

  const stepRelations = (caseData.relations ?? []).filter((relation) => (
    stepIdOf(relation.from) && stepIdOf(relation.to)
  ));
  const unknownEdges = stepRelations
    .filter((relation) => !institutionEdges.has(`${stepIdOf(relation.from)}>${stepIdOf(relation.to)}`))
    .map((relation) => ({ relation_id: relation.id, from: relation.from, to: relation.to, type: relation.type }));

  const readinessRaw = institution.process?.agent_readiness ?? null;
  const readiness = readinessRaw
    ? {
      level: readinessRaw.level,
      mode: readinessRaw.mode,
      assessed_at: readinessRaw.assessed_at,
      last_live_check: readinessRaw.last_live_check
        ? {
          checked_at: readinessRaw.last_live_check.checked_at,
          status: readinessRaw.last_live_check.status,
          verified_references: readinessRaw.last_live_check.verified_references,
          article_references: readinessRaw.last_live_check.article_references,
        }
        : null,
      blockers: readinessRaw.blockers ?? [],
    }
    : null;

  const drifted = unknownStepIds.length > 0 || labelMismatches.length > 0 || unknownEdges.length > 0;
  const status = drifted ? "drifted" : "aligned";

  const notes = [];
  if (drifted) {
    notes.push("케이스와 제도 업무구조도가 어긋났습니다. 케이스 판단을 신뢰하지 말고 먼저 대조를 맞추세요.");
  }
  if (!readiness) {
    notes.push("제도에 준비도 평가가 없습니다. 참고용으로만 쓰세요.");
  } else if (readiness.level !== "R2") {
    notes.push(
      `제도 준비도 ${readiness.level}(${readiness.mode})입니다. 다음 행동 자동 계산 대상이 아니며 남은 차단 사유: ${readiness.blockers.join("; ") || "없음"}`,
    );
  }
  if (uncoveredNodeIds.length > 0) {
    notes.push(`케이스가 다루지 않는 제도 단계 ${uncoveredNodeIds.length}개가 있습니다.`);
  }

  return {
    institution_slug: slug,
    institution_found: true,
    institution_name: institution.name ?? null,
    status,
    readiness,
    next_action_allowed: status === "aligned" && readiness?.level === "R2",
    steps: {
      case_step_count: caseStepIds.length,
      institution_node_count: nodes.length,
      unknown_step_ids: unknownStepIds,
      uncovered_node_ids: uncoveredNodeIds,
      label_mismatches: labelMismatches,
    },
    sequence: {
      case_relation_count: stepRelations.length,
      institution_edge_count: institutionEdges.size,
      unknown_edges: unknownEdges,
    },
    notes,
    execution_allowed: false,
  };
}

export async function checkCaseLinkageFor(caseData, options = {}) {
  const institution = await loadInstitutionForLinkage(caseData.institution_slug, options);
  return checkCaseLinkage(caseData, institution);
}
